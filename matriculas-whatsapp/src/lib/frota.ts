import * as XLSX from 'xlsx'
import type { FrotaDisponibilidade, FrotaPlaca } from '../types'

export type FrotaDisponibilidadeInsert = Omit<FrotaDisponibilidade, 'id' | 'created_at'>

// Placas sem registro em frota_placas são consideradas ativas por padrão
// (registro só existe a partir da primeira importação que viu a placa).
export function placasAtivasFiltro(rows: FrotaDisponibilidade[], placas: FrotaPlaca[]): FrotaDisponibilidade[] {
  const inativas = new Set(placas.filter(p => !p.ativo).map(p => p.placa))
  if (inativas.size === 0) return rows
  return rows.filter(r => !inativas.has(r.placa))
}

export interface ResumoPerfilFrota {
  perfil: string
  contratada: number
  disponivel: number
  indisponivel: number
  percentual: number
}

// Quebra do resumo de um dia por perfil de veículo (VUC/Toco/Truck/Carreta),
// usando o cadastro manual de frota_placas — perfis não classificados caem
// em "Sem perfil".
export function resumoPorPerfil(rows: FrotaDisponibilidade[], placas: FrotaPlaca[]): ResumoPerfilFrota[] {
  const perfilPorPlaca = new Map(placas.map(p => [p.placa, p.perfil?.trim() || 'Sem perfil']))
  const contratadas = rows.filter(r => normalizar(r.status) !== 'NAO CONTRATADA' && normalizar(r.status) !== '')

  const porPerfil = new Map<string, FrotaDisponibilidade[]>()
  for (const r of contratadas) {
    const perfil = perfilPorPlaca.get(r.placa) ?? 'Sem perfil'
    if (!porPerfil.has(perfil)) porPerfil.set(perfil, [])
    porPerfil.get(perfil)!.push(r)
  }

  return Array.from(porPerfil.entries())
    .map(([perfil, linhas]) => {
      const disponiveis = linhas.filter(l => normalizar(l.status) === 'DISPONIVEL')
      return {
        perfil,
        contratada: linhas.length,
        disponivel: disponiveis.length,
        indisponivel: linhas.length - disponiveis.length,
        percentual: linhas.length > 0 ? Math.round((disponiveis.length / linhas.length) * 100) : 0,
      }
    })
    .sort((a, b) => b.contratada - a.contratada)
}

// Remove acentos e normaliza para comparação de status/justificativa, já que
// a mesma palavra aparece grafada de formas diferentes conforme a origem do
// arquivo (CSV diário decodificado em ISO-8859-1 mantém o acento; o Histórico
// em xlsx às vezes já vem sem acento, ex.: "Nao Contratada").
function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

function parseNumeroBR(s: string | undefined | null): number | null {
  const v = (s ?? '').trim()
  if (!v) return null
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function dataBrParaIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function excelSerialParaIso(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
}

// ─── Parser do CSV diário (relatório "Frota Disponibilizada", ex.: 03114903.csv) ──
// Layout: algumas linhas de metadados (filial, transportadora, data, totais),
// seguidas de uma tabela com cabeçalho "Frota;Placa;...;Status;Justificativa;...".
// O arquivo deve ser lido como ISO-8859-1 (acentuação quebra em UTF-8).
export function parseDisponibilidadeDiariaCsv(texto: string, filial: string): FrotaDisponibilidadeInsert[] {
  const linhas = texto.split(/\r?\n/)

  const linhaData = linhas.find(l => l.startsWith('Data;'))
  const dataMatch = linhaData?.match(/^Data;(\d{1,2}\/\d{1,2}\/\d{4})/)
  const dataIso = dataMatch ? dataBrParaIso(dataMatch[1]) : null
  if (!dataIso) return []

  const headerIdx = linhas.findIndex(l => l.startsWith('Frota;Placa'))
  if (headerIdx === -1) return []

  const headers = linhas[headerIdx].split(';').map(h => h.trim())
  const idx = (nome: string) => headers.indexOf(nome)
  const iFrota = idx('Frota'), iPlaca = idx('Placa'), iCaixas = idx('Capacidade Caixas'),
    iPeso = idx('Capacidade Peso'), iTerritorio = idx('Território'), iRegiao = idx('Região'),
    iStatus = idx('Status'), iJustificativa = idx('Justificativa'), iObservacao = idx('Observação'),
    iSegmento = idx('Segmento')

  const rows: FrotaDisponibilidadeInsert[] = []
  for (const linha of linhas.slice(headerIdx + 1)) {
    if (!linha.trim()) continue
    const cols = linha.split(';')
    const placa = (cols[iPlaca] ?? '').trim()
    const status = (cols[iStatus] ?? '').trim()
    if (!placa || !status) continue
    rows.push({
      filial,
      data: dataIso,
      placa,
      frota: (cols[iFrota] ?? '').trim() || null,
      territorio: (cols[iTerritorio] ?? '').trim() || null,
      regiao: (cols[iRegiao] ?? '').trim() || null,
      status,
      justificativa: (cols[iJustificativa] ?? '').trim() || null,
      observacao: (cols[iObservacao] ?? '').trim() || null,
      segmento: (cols[iSegmento] ?? '').trim() || null,
      capacidade_caixas: parseNumeroBR(cols[iCaixas]),
      capacidade_peso: parseNumeroBR(cols[iPeso]),
    })
  }
  return rows
}

// ─── Parser do Histórico (xlsx, uma ou mais abas, uma linha por placa/dia) ───
// Usado para popular dias passados de uma vez. Cada linha já traz a filial na
// coluna "Descrição" (ex.: "CRBS S/A – CDD Petropolis") — filtramos pelas
// linhas cuja descrição contém o nome da filial logada.
export function parseHistoricoXlsx(buffer: ArrayBuffer, filial: string): FrotaDisponibilidadeInsert[] {
  const wb = XLSX.read(buffer)
  const filialNorm = normalizar(filial)
  const rows: FrotaDisponibilidadeInsert[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' })
    for (const r of json) {
      const descricao = String(r['Descrição'] ?? '')
      if (filialNorm && !normalizar(descricao).includes(filialNorm)) continue

      const placa = String(r['Placa'] ?? '').trim()
      const status = String(r['Status'] ?? '').trim()
      if (!placa || !status) continue

      const dataRaw = r['Data']
      const dataIso = typeof dataRaw === 'number'
        ? excelSerialParaIso(dataRaw)
        : dataBrParaIso(String(dataRaw ?? ''))
      if (!dataIso) continue

      rows.push({
        filial,
        data: dataIso,
        placa,
        frota: String(r['Frota'] ?? '').trim() || null,
        territorio: String(r['Território'] ?? '').trim() || null,
        regiao: String(r['Região'] ?? '').trim() || null,
        status,
        justificativa: String(r['Justificativa'] ?? '').trim() || null,
        observacao: String(r['Observação'] ?? '').trim() || null,
        segmento: String(r['Segmento'] ?? '').trim() || null,
        capacidade_caixas: parseNumeroBR(String(r['Capacidade Caixas'] ?? '')),
        capacidade_peso: parseNumeroBR(String(r['Capacidade Peso'] ?? '')),
      })
    }
  }
  return rows
}

export interface ResumoDiaFrota {
  data: string
  contratada: number
  disponivel: number
  indisponivel: number
  percentual: number
  motivos: { motivo: string; quantidade: number }[]
}

// Frota contratada do dia = toda placa que não está "Não Contratada" (a
// contratação muda a cada quinzena — 1 e 16 — e é derivada dos próprios
// dados, não de um cadastro separado).
export function resumoPorDia(rows: FrotaDisponibilidade[]): ResumoDiaFrota[] {
  const porDia = new Map<string, FrotaDisponibilidade[]>()
  for (const r of rows) {
    if (!porDia.has(r.data)) porDia.set(r.data, [])
    porDia.get(r.data)!.push(r)
  }

  return Array.from(porDia.entries())
    .map(([data, linhas]) => {
      const contratadas = linhas.filter(l => normalizar(l.status) !== 'NAO CONTRATADA' && normalizar(l.status) !== '')
      const disponiveis = contratadas.filter(l => normalizar(l.status) === 'DISPONIVEL')
      const indisponiveis = contratadas.filter(l => normalizar(l.status) !== 'DISPONIVEL')

      const motivosMap = new Map<string, number>()
      for (const l of indisponiveis) {
        const motivo = l.justificativa?.trim() || (normalizar(l.status) === 'PARADO' ? 'Parado' : 'Sem justificativa')
        motivosMap.set(motivo, (motivosMap.get(motivo) ?? 0) + 1)
      }

      return {
        data,
        contratada: contratadas.length,
        disponivel: disponiveis.length,
        indisponivel: indisponiveis.length,
        percentual: contratadas.length > 0 ? Math.round((disponiveis.length / contratadas.length) * 100) : 0,
        motivos: Array.from(motivosMap.entries())
          .map(([motivo, quantidade]) => ({ motivo, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
      }
    })
    .sort((a, b) => a.data.localeCompare(b.data))
}

export function disponiveisNoDia(rows: FrotaDisponibilidade[], data: string): FrotaDisponibilidade[] {
  return rows.filter(r => r.data === data && normalizar(r.status) === 'DISPONIVEL')
}

export interface RankingPlacaFrota {
  placa: string
  frota: string | null
  diasComDado: number
  diasDisponivel: number
  diasIndisponivel: number
  percentualIndisponibilidade: number
  motivos: { motivo: string; quantidade: number }[]
}

// Ranking de placas por tempo indisponível no período — só considera dias em
// que a placa estava contratada (ignora "Não Contratada", que não é
// indisponibilidade operacional).
export function rankingIndisponibilidadePorPlaca(rows: FrotaDisponibilidade[]): RankingPlacaFrota[] {
  const porPlaca = new Map<string, FrotaDisponibilidade[]>()
  for (const r of rows) {
    if (normalizar(r.status) === 'NAO CONTRATADA' || normalizar(r.status) === '') continue
    if (!porPlaca.has(r.placa)) porPlaca.set(r.placa, [])
    porPlaca.get(r.placa)!.push(r)
  }

  return Array.from(porPlaca.entries())
    .map(([placa, linhas]) => {
      const disponiveis = linhas.filter(l => normalizar(l.status) === 'DISPONIVEL')
      const indisponiveis = linhas.filter(l => normalizar(l.status) !== 'DISPONIVEL')

      const motivosMap = new Map<string, number>()
      for (const l of indisponiveis) {
        const motivo = l.justificativa?.trim() || (normalizar(l.status) === 'PARADO' ? 'Parado' : 'Sem justificativa')
        motivosMap.set(motivo, (motivosMap.get(motivo) ?? 0) + 1)
      }

      return {
        placa,
        frota: linhas[0]?.frota ?? null,
        diasComDado: linhas.length,
        diasDisponivel: disponiveis.length,
        diasIndisponivel: indisponiveis.length,
        percentualIndisponibilidade: linhas.length > 0 ? Math.round((indisponiveis.length / linhas.length) * 100) : 0,
        motivos: Array.from(motivosMap.entries())
          .map(([motivo, quantidade]) => ({ motivo, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
      }
    })
    .sort((a, b) => b.diasIndisponivel - a.diasIndisponivel)
}

// ─── Fixação de Território: território disponibilizado (Frota) x região
// realmente executada (Carta de Controle TML, via "Região +Entregas" trazida
// junto da escala do dia) ──────────────────────────────────────────────────

// "120 - Monte Castelo" -> "Monte Castelo"
function extrairBairroTerritorio(territorio: string | null): string | null {
  if (!territorio) return null
  const m = territorio.match(/^[\d/]+\s*-\s*(.+)$/)
  return (m ? m[1] : territorio).trim() || null
}

// Comparação aproximada: tolera pequenas variações de grafia entre as duas
// origens (ex.: "Quissamé" no território x "QUISSAMA" na roteirização),
// comparando também o radical sem a última letra.
function bairroBateNaRegiao(territorio: string | null, regioesEntregas: string[]): boolean | null {
  const bairro = extrairBairroTerritorio(territorio)
  if (!bairro || regioesEntregas.length === 0) return null
  const bairroNorm = normalizar(bairro)
  const textoNorm = normalizar(regioesEntregas.join(' / '))
  if (textoNorm.includes(bairroNorm)) return true
  const radical = bairroNorm.length > 4 ? bairroNorm.slice(0, -1) : bairroNorm
  return textoNorm.includes(radical)
}

export interface HistoricoTmlRegiao {
  placa: string | null
  data_saida: string | null
  regiao_entregas: string | null
}

export interface CruzamentoTerritorioItem {
  placa: string
  data: string
  territorio: string
  regiaoEntregas: string | null
  bate: boolean | null
}

// Cruza, por placa+dia, o território disponibilizado com a(s) região(ões)
// realmente entregue(s) naquele dia (pode haver mais de um mapa/viagem por
// placa no mesmo dia). `bate: null` quando não há dado do TML para comparar.
// Usa a coluna "Região" (ex.: "910 - Correas") — no relatório/histórico de
// Frota a coluna "Território" vem sempre zerada ("0000"); quem traz o
// código + nome do bairro disponibilizado é a "Região".
export function cruzarTerritorio(
  frotaRows: FrotaDisponibilidade[],
  historicoTml: HistoricoTmlRegiao[],
): CruzamentoTerritorioItem[] {
  const regioesPorPlacaData = new Map<string, string[]>()
  for (const h of historicoTml) {
    if (!h.placa || !h.data_saida || !h.regiao_entregas) continue
    const key = `${h.placa}|${h.data_saida}`
    if (!regioesPorPlacaData.has(key)) regioesPorPlacaData.set(key, [])
    regioesPorPlacaData.get(key)!.push(h.regiao_entregas)
  }

  return frotaRows
    .filter(r => normalizar(r.status) === 'DISPONIVEL' && r.regiao)
    .map(r => {
      const regioes = regioesPorPlacaData.get(`${r.placa}|${r.data}`) ?? []
      return {
        placa: r.placa,
        data: r.data,
        territorio: r.regiao as string,
        regiaoEntregas: regioes.length > 0 ? regioes.join(' / ') : null,
        bate: bairroBateNaRegiao(r.regiao, regioes),
      }
    })
    .sort((a, b) => b.data.localeCompare(a.data) || a.placa.localeCompare(b.placa))
}
