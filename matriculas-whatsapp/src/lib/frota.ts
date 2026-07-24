import * as XLSX from 'xlsx'
import type { FrotaDisponibilidade, FrotaPlaca, FrotaIVTratativa } from '../types'
import { supabase } from './supabase'
import { enviarListaOpcoesWhatsApp } from './zapi'
import { formatarDataBR } from './utils'
import { buscarStatusColaboradoresPorNome, podeEnviarPara } from './statusAtivo'

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
  ativo: number
  disponivel: number
  indisponivel: number
  percentual: number
}

// Quebra do resumo de um dia por perfil de veículo (VUC/Toco/Truck/Carreta),
// usando o cadastro manual de frota_placas — perfis não classificados caem
// em "Sem perfil". % é sobre o total de placas ativas do perfil no cadastro
// (não só as contratadas no dia), para refletir a frota total disponível.
export function resumoPorPerfil(rows: FrotaDisponibilidade[], placas: FrotaPlaca[]): ResumoPerfilFrota[] {
  const rowsPorPlaca = new Map(rows.map(r => [r.placa, r]))

  const porPerfil = new Map<string, string[]>()
  for (const p of placas.filter(p => p.ativo)) {
    const perfil = p.perfil?.trim() || 'Sem perfil'
    if (!porPerfil.has(perfil)) porPerfil.set(perfil, [])
    porPerfil.get(perfil)!.push(p.placa)
  }

  return Array.from(porPerfil.entries())
    .map(([perfil, placasDoPerfil]) => {
      const disponiveis = placasDoPerfil.filter(placa => {
        const r = rowsPorPlaca.get(placa)
        return !!r && normalizar(r.status) === 'DISPONIVEL'
      })
      return {
        perfil,
        ativo: placasDoPerfil.length,
        disponivel: disponiveis.length,
        indisponivel: placasDoPerfil.length - disponiveis.length,
        percentual: placasDoPerfil.length > 0 ? Math.round((disponiveis.length / placasDoPerfil.length) * 100) : 0,
      }
    })
    .sort((a, b) => b.ativo - a.ativo)
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

export type TipoCelulaMatriz = 'disponivel' | 'indisponivel' | 'parado' | 'nao_contratada' | 'sem_dado'

export interface MatrizDia {
  data: string
  tipo: TipoCelulaMatriz
}

export interface MatrizPlaca {
  placa: string
  perfil: string
  dias: MatrizDia[]
  percentual: number
  diasDisponivel: number
  diasContratadaComDado: number
}

export interface MatrizFrota {
  diasDoMes: string[]
  placas: MatrizPlaca[]
  percentualPorDia: { data: string; percentual: number }[]
}

// Gera a matriz de disponibilidade diária: todas as placas ativas (eixo Y)
// x todos os dias do mês (eixo X), excluindo domingos. % final por placa
// usa como denominador só os dias contratados com dado (ignora "Não
// Contratada" e "Sem dado"). Linha de rodapé traz % disponível por dia.
export function matrizDisponibilidade(
  rows: FrotaDisponibilidade[],
  placas: FrotaPlaca[],
  ano: number,
  mes: number,
): MatrizFrota {
  const daysInMonth = new Date(ano, mes, 0).getDate()
  const diasDoMes: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(ano, mes - 1, d).getDay() !== 0) {
      diasDoMes.push(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }

  const rowsMap = new Map<string, FrotaDisponibilidade>()
  for (const r of rows) rowsMap.set(`${r.placa}|${r.data}`, r)

  const ativas = placas
    .filter(p => p.ativo)
    .sort((a, b) => {
      const pA = a.perfil?.trim() || 'Sem perfil'
      const pB = b.perfil?.trim() || 'Sem perfil'
      return pA !== pB ? pA.localeCompare(pB) : a.placa.localeCompare(b.placa)
    })

  const inativas = new Set(placas.filter(p => !p.ativo).map(p => p.placa))

  const matricePlacas: MatrizPlaca[] = ativas.map(p => {
    let diasDisponivel = 0
    let diasContratadaComDado = 0
    const dias: MatrizDia[] = diasDoMes.map(data => {
      const r = rowsMap.get(`${p.placa}|${data}`)
      if (!r) return { data, tipo: 'sem_dado' }
      const n = normalizar(r.status)
      if (n === 'NAO CONTRATADA' || n === '') return { data, tipo: 'nao_contratada' }
      diasContratadaComDado++
      if (n === 'DISPONIVEL') { diasDisponivel++; return { data, tipo: 'disponivel' } }
      if (n === 'PARADO') return { data, tipo: 'parado' }
      return { data, tipo: 'indisponivel' }
    })
    return {
      placa: p.placa,
      perfil: p.perfil?.trim() || 'Sem perfil',
      dias,
      percentual: diasContratadaComDado > 0 ? Math.round((diasDisponivel / diasContratadaComDado) * 100) : 0,
      diasDisponivel,
      diasContratadaComDado,
    }
  })

  const percentualPorDia = diasDoMes.map(data => {
    let disp = 0, contratada = 0
    for (const r of rows) {
      if (r.data !== data || inativas.has(r.placa)) continue
      const n = normalizar(r.status)
      if (n === 'NAO CONTRATADA' || n === '') continue
      contratada++
      if (n === 'DISPONIVEL') disp++
    }
    return { data, percentual: contratada > 0 ? Math.round((disp / contratada) * 100) : 0 }
  })

  return { diasDoMes, placas: matricePlacas, percentualPorDia }
}

export interface StatusPlacaFrota {
  placa: string
  frota: string | null
  perfil: string
  status: string
  disponivel: boolean
  motivo: string | null
  rota: string | null
}

// Lista de TODAS as placas ativas do cadastro (frota_placas), com perfil,
// status e motivo de indisponibilidade do dia — usada no resumo enviado
// para o grupo de WhatsApp. Parte do cadastro (não da contratação do dia),
// para incluir também placas não contratadas naquele dia e placas sem
// registro de disponibilidade ainda. Ordenada por disponível primeiro,
// depois perfil, depois placa.
export function statusPlacasNoDia(rows: FrotaDisponibilidade[], data: string, placas: FrotaPlaca[]): StatusPlacaFrota[] {
  const rowsDoDia = new Map(rows.filter(r => r.data === data).map(r => [r.placa, r]))

  return placas
    .filter(p => p.ativo)
    .map(p => {
      const r = rowsDoDia.get(p.placa)
      const disponivel = !!r && normalizar(r.status) === 'DISPONIVEL'
      return {
        placa: p.placa,
        frota: r?.frota ?? null,
        perfil: p.perfil?.trim() || 'Sem perfil',
        status: r?.status ?? 'Sem dado',
        disponivel,
        motivo: r ? (r.justificativa?.trim() || null) : 'Sem registro no relatório do dia',
        rota: r?.observacao ?? null,
      }
    })
    .sort((a, b) => {
      if (a.disponivel !== b.disponivel) return a.disponivel ? -1 : 1
      const perfilCmp = a.perfil.localeCompare(b.perfil)
      return perfilCmp !== 0 ? perfilCmp : a.placa.localeCompare(b.placa)
    })
}

// ── Detalhe dia a dia por placa ──────────────────────────────────────────
export interface DiaPlacaFrota {
  data: string
  status: string
  tipo: TipoCelulaMatriz
  motivo: string | null
}

// Histórico dia a dia de UMA placa, do primeiro ao último dia com dado —
// preenchendo os buracos do calendário como "sem_dado" (em vez de pular),
// pra distinguir "não importado" de "disponível". Mais recente primeiro.
export function detalhePorPlaca(rows: FrotaDisponibilidade[], placa: string): DiaPlacaFrota[] {
  const doPlaca = rows.filter(r => r.placa === placa)
  if (doPlaca.length === 0) return []
  const porData = new Map(doPlaca.map(r => [r.data, r]))
  const datas = [...porData.keys()].sort()
  const min = datas[0]
  const max = datas[datas.length - 1]

  const out: DiaPlacaFrota[] = []
  const cursor = new Date(`${min}T00:00:00`)
  const fim = new Date(`${max}T00:00:00`)
  while (cursor <= fim) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const r = porData.get(iso)
    if (!r) {
      out.push({ data: iso, status: '', tipo: 'sem_dado', motivo: null })
    } else {
      const n = normalizar(r.status)
      const tipo: TipoCelulaMatriz = n === 'NAO CONTRATADA' || n === '' ? 'nao_contratada' : n === 'DISPONIVEL' ? 'disponivel' : n === 'PARADO' ? 'parado' : 'indisponivel'
      const motivo = tipo === 'indisponivel' || tipo === 'parado' ? (r.justificativa?.trim() || (tipo === 'parado' ? 'Parado' : 'Sem justificativa')) : null
      out.push({ data: iso, status: r.status, tipo, motivo })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out.reverse()
}

export interface StreakIndisponibilidade {
  diasConsecutivos: number
  desde: string | null
}

// Sequência atual de dias indisponível/parado terminando no dia mais recente
// com dado — pra sinalizar indisponibilidade prolongada (ex.: manutenção
// travada). Quebra a sequência em "disponível", "não contratada" ou "sem
// dado" (não sabemos o status desse dia, não assume indisponibilidade).
export function sequenciaAtualIndisponivel(diasMaisRecentePrimeiro: DiaPlacaFrota[]): StreakIndisponibilidade {
  let dias = 0
  let desde: string | null = null
  for (const d of diasMaisRecentePrimeiro) {
    if (d.tipo !== 'indisponivel' && d.tipo !== 'parado') break
    dias++
    desde = d.data
  }
  return { diasConsecutivos: dias, desde }
}

export interface MotivoPeriodoFrota {
  motivo: string
  quantidade: number
  placasAfetadas: number
}

// Ranking de motivos de indisponibilidade no PERÍODO INTEIRO (não só do
// último dia, como o card "Motivos de Indisponibilidade" da tela mostra) —
// pra enxergar tendência (ex.: "manutenção" crescendo mês a mês).
export function rankingMotivosPeriodo(rows: FrotaDisponibilidade[]): MotivoPeriodoFrota[] {
  const porMotivo = new Map<string, { qtd: number; placas: Set<string> }>()
  for (const r of rows) {
    const n = normalizar(r.status)
    if (n === 'DISPONIVEL' || n === 'NAO CONTRATADA' || n === '') continue
    const motivo = r.justificativa?.trim() || (n === 'PARADO' ? 'Parado' : 'Sem justificativa')
    const acc = porMotivo.get(motivo) ?? { qtd: 0, placas: new Set<string>() }
    acc.qtd++
    acc.placas.add(r.placa)
    porMotivo.set(motivo, acc)
  }
  return [...porMotivo.entries()]
    .map(([motivo, v]) => ({ motivo, quantidade: v.qtd, placasAfetadas: v.placas.size }))
    .sort((a, b) => b.quantidade - a.quantidade)
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

const STOPWORDS_TERRITORIO = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS', 'E'])

// "Cidades +Entregas" agrupa por cidade usando um código entre colchetes
// (ex.: "[PAR]: CENTRO (7) / ..." para Paraíba do Sul, "[TRE]: ..." para
// Três Rios) — não repete o nome completo da cidade. Extrai esses códigos.
function extrairCodigosCidade(texto: string): string[] {
  const codigos: string[] = []
  const regex = /\[([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(texto)) !== null) {
    codigos.push(normalizar(m[1]))
  }
  return codigos
}

// Comparação aproximada: tolera pequenas variações de grafia entre as duas
// origens (ex.: "Quissamé" no território x "QUISSAMA" na roteirização),
// comparando também o radical sem a última letra. Quando o território é uma
// cidade (ex.: "240 - Paraíba do Sul", "900 - Centro de Três Rios") e a
// roteirização só traz o código entre colchetes (ex.: "[PAR]", "[TRE]"),
// compara também os 3 primeiros caracteres de cada palavra significativa do
// território com os códigos de cidade encontrados no texto.
function bairroBateNaRegiao(territorio: string | null, regioesEntregas: string[]): boolean | null {
  const bairro = extrairBairroTerritorio(territorio)
  if (!bairro || regioesEntregas.length === 0) return null
  const bairroNorm = normalizar(bairro)
  const textoCompleto = regioesEntregas.join(' / ')
  const textoNorm = normalizar(textoCompleto)
  if (textoNorm.includes(bairroNorm)) return true
  const radical = bairroNorm.length > 4 ? bairroNorm.slice(0, -1) : bairroNorm
  if (textoNorm.includes(radical)) return true

  const codigos = extrairCodigosCidade(textoCompleto)
  if (codigos.length === 0) return false
  const palavras = bairroNorm.split(/\s+/).filter(p => p.length >= 3 && !STOPWORDS_TERRITORIO.has(p))
  return palavras.some(p => codigos.includes(p.slice(0, 3)))
}

export interface HistoricoTmlRegiao {
  placa: string | null
  data_saida: string | null
  regiao_entregas: string | null
  cidades_entregas: string | null
}

// ─── Território executado a partir da aba "Base" da planilha diária ──────────
// (catálogo/vendas do financeiro). Layout da aba "Base": cabeçalho na linha
// cuja coluna M (índice 12) é "Mapa". Colunas usadas:
//   K(10)=Placa · M(12)=Mapa · N(13)=Rota (região principal, ex.: "MIGUEL
//   PEREIRA (13)") · O(14)=REGIÃO (detalhe de bairros). A rota casa direto com
//   a "Região" disponibilizada no CSV da Frota (ex.: "174 - Miguel Pereira");
//   o detalhe de bairros entra junto para aumentar o acerto do cruzamento.
export interface BaseMapaTerritorioRow {
  mapa: number
  placa: string
  regiao_entregas: string | null
}

export function parseBaseMapaTerritorio(buffer: ArrayBuffer): BaseMapaTerritorioRow[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets['Base']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null }) as unknown[][]
  const headerIdx = rows.findIndex(r => String(r?.[12] ?? '').trim().toLowerCase() === 'mapa')
  if (headerIdx < 0) return []

  const out: BaseMapaTerritorioRow[] = []
  for (const r of rows.slice(headerIdx + 1)) {
    const placa = String(r[10] ?? '').trim()
    const mapa = Number(String(r[12] ?? '').trim())
    if (!placa || !mapa || isNaN(mapa)) continue
    const rota = String(r[13] ?? '').trim()
    const detalhe = String(r[14] ?? '').trim()
    const regiao = [rota, detalhe].filter(Boolean).join(' / ') || null
    out.push({ mapa, placa, regiao_entregas: regiao })
  }
  return out
}

export interface CruzamentoTerritorioItem {
  placa: string
  data: string
  territorio: string
  regiaoEntregas: string | null
  bate: boolean | null
}

// Agrupa "Região +Entregas" e "Cidades +Entregas" por placa+dia — usado
// tanto por cruzarTerritorio (território x placa disponibilizada) quanto
// por avaliarTerritorioMotorista (território x motorista fixado).
export function agruparRegioesPorPlacaData(historicoTml: HistoricoTmlRegiao[]): Map<string, string[]> {
  const regioesPorPlacaData = new Map<string, string[]>()
  for (const h of historicoTml) {
    if (!h.placa || !h.data_saida) continue
    if (!h.regiao_entregas && !h.cidades_entregas) continue
    const key = `${h.placa}|${h.data_saida}`
    if (!regioesPorPlacaData.has(key)) regioesPorPlacaData.set(key, [])
    const lista = regioesPorPlacaData.get(key)!
    // Mescla "Região +Entregas" com "Cidades +Entregas": algumas rotas só têm
    // o bairro do território identificável no texto de cidades, e comparar
    // apenas a região fazia o cruzamento marcar NOK indevidamente. O mesmo
    // texto pode vir tanto do historico_tml quanto do frota_territorio_
    // historico pra placa+data — sem esse dedupe o texto aparecia repetido.
    if (h.regiao_entregas && !lista.includes(h.regiao_entregas)) lista.push(h.regiao_entregas)
    if (h.cidades_entregas && !lista.includes(h.cidades_entregas)) lista.push(h.cidades_entregas)
  }
  return regioesPorPlacaData
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
  const regioesPorPlacaData = agruparRegioesPorPlacaData(historicoTml)

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

export interface TrocaTerritorioItem {
  data: string
  placaA: string
  territorioA: string
  executadoA: string | null
  placaB: string
  territorioB: string
  executadoB: string | null
}

// Identifica possíveis trocas de roteirização: duas placas NOK no mesmo dia
// em que o território de A bate com o que B executou e vice-versa (ex.: A
// foi disponibilizada para Itaipava mas rodou em Corrêas, e B foi
// disponibilizada para Corrêas mas rodou em Itaipava). Isso aponta um erro
// do roteirizador (trocou os mapas entre as duas placas), não uma falha real
// de fixação de território — serve de causa-raiz para o indicador.
export function detectarTrocasTerritorio(cruzamento: CruzamentoTerritorioItem[]): TrocaTerritorioItem[] {
  const nok = cruzamento.filter(c => c.bate === false && c.regiaoEntregas)
  const porDia = new Map<string, CruzamentoTerritorioItem[]>()
  for (const c of nok) {
    if (!porDia.has(c.data)) porDia.set(c.data, [])
    porDia.get(c.data)!.push(c)
  }

  const resultado: TrocaTerritorioItem[] = []
  for (const [data, itens] of porDia) {
    const usadas = new Set<string>()
    for (let i = 0; i < itens.length; i++) {
      if (usadas.has(itens[i].placa)) continue
      for (let j = i + 1; j < itens.length; j++) {
        const a = itens[i]
        const b = itens[j]
        if (a.placa === b.placa || usadas.has(b.placa)) continue
        const aBateComB = bairroBateNaRegiao(a.territorio, [b.regiaoEntregas ?? ''])
        const bBateComA = bairroBateNaRegiao(b.territorio, [a.regiaoEntregas ?? ''])
        if (aBateComB && bBateComA) {
          resultado.push({
            data,
            placaA: a.placa, territorioA: a.territorio, executadoA: a.regiaoEntregas,
            placaB: b.placa, territorioB: b.territorio, executadoB: b.regiaoEntregas,
          })
          usadas.add(a.placa)
          usadas.add(b.placa)
          break
        }
      }
    }
  }

  return resultado.sort((a, b) => b.data.localeCompare(a.data))
}

// ─── IV da Frota — DU (Disponibilidade de Unidades) ────────────────────────
// Meta: 80% dos VUCs ativos disponíveis para rota. Diferente do resumo geral
// (resumoPorDia), aqui o denominador é SEMPRE o total de VUCs ativos do
// cadastro que aparecem no relatório do dia — inclui "Não Contratada" como
// indisponível, pois para o indicador de DU o que importa é se o VUC está
// rodando ou não, independente do motivo.

export const META_DU = 84

// O "percentual" de DU usado em todo o painel de IV é o % de ATINGIMENTO da
// meta (disponibilidade real ÷ META_DU), não a disponibilidade bruta —
// bater exatamente a meta de 80% de VUCs disponíveis já mostra 100%. Pode
// passar de 100% quando a disponibilidade supera a meta.
function atingimentoDu(percentualBruto: number): number {
  return Math.round((percentualBruto / META_DU) * 100)
}

export function farolDu(percentualAtingimento: number): 'verde' | 'amarelo' | 'vermelho' {
  return percentualAtingimento >= 100 ? 'verde' : percentualAtingimento >= 75 ? 'amarelo' : 'vermelho'
}

// Placas ativas classificadas como VUC no cadastro.
export function vucAtivos(placas: FrotaPlaca[]): Set<string> {
  return new Set(placas.filter(p => p.ativo && (p.perfil?.trim() || '') === 'VUC').map(p => p.placa))
}

export interface DuDia {
  data: string
  totalVuc: number
  disponiveis: number
  percentual: number
}

// DU por dia: para cada data com algum registro de VUC ativo, conta quantos
// desses VUCs estavam com status "Disponível".
export function calcularDuPorDia(rows: FrotaDisponibilidade[], placas: FrotaPlaca[]): DuDia[] {
  const vucs = vucAtivos(placas)
  if (vucs.size === 0) return []

  const porDia = new Map<string, FrotaDisponibilidade[]>()
  for (const r of rows) {
    if (!vucs.has(r.placa)) continue
    if (!porDia.has(r.data)) porDia.set(r.data, [])
    porDia.get(r.data)!.push(r)
  }

  return Array.from(porDia.entries())
    .map(([data, linhas]) => {
      const disponiveis = linhas.filter(l => normalizar(l.status) === 'DISPONIVEL').length
      const percentualBruto = linhas.length > 0 ? (disponiveis / linhas.length) * 100 : 0
      return {
        data,
        totalVuc: linhas.length,
        disponiveis,
        percentual: atingimentoDu(percentualBruto),
      }
    })
    .sort((a, b) => a.data.localeCompare(b.data))
}

export interface DuAcumulado {
  ano: number
  mes: number
  diasComDado: number
  mediaPercentual: number
  totalDisponivelDias: number
  totalVucDias: number
}

// Acumulado do mês: média ponderada dos dias (soma de disponíveis / soma do
// total de VUC-dia), não média simples dos percentuais diários.
export function calcularDuAcumulado(duPorDia: DuDia[], ano: number, mes: number): DuAcumulado {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`
  const doMes = duPorDia.filter(d => d.data.startsWith(prefixo))
  const totalDisponivelDias = doMes.reduce((acc, d) => acc + d.disponiveis, 0)
  const totalVucDias = doMes.reduce((acc, d) => acc + d.totalVuc, 0)
  const percentualBruto = totalVucDias > 0 ? (totalDisponivelDias / totalVucDias) * 100 : 0
  return {
    ano,
    mes,
    diasComDado: doMes.length,
    mediaPercentual: atingimentoDu(percentualBruto),
    totalDisponivelDias,
    totalVucDias,
  }
}

export interface DuMes {
  ano: number
  mes: number
  acumulado: DuAcumulado
}

// Evolução mês x mês dos últimos `n` meses com dado, mais recente por último
// (pronto para alimentar gráfico de barras/linha).
export function calcularDuMeses(duPorDia: DuDia[], n = 6): DuMes[] {
  const chaves = Array.from(new Set(duPorDia.map(d => d.data.slice(0, 7)))).sort()
  const ultimas = chaves.slice(-n)
  return ultimas.map(chave => {
    const [ano, mes] = chave.split('-').map(Number)
    return { ano, mes, acumulado: calcularDuAcumulado(duPorDia, ano, mes) }
  })
}

export interface VucStatusDia {
  placa: string
  frota: string | null
  status: string
  disponivel: boolean
  motivo: string | null
  tratativa: FrotaIVTratativa | null
}

// Lista de todos os VUCs ativos no dia, com status do relatório e tratativa
// já registrada (se houver) — base da aba "Tratativa do Dia".
export function vucStatusNoDia(
  rows: FrotaDisponibilidade[],
  placas: FrotaPlaca[],
  data: string,
  tratativas: FrotaIVTratativa[] = [],
): VucStatusDia[] {
  const vucs = vucAtivos(placas)
  const rowsDoDia = new Map(rows.filter(r => r.data === data && vucs.has(r.placa)).map(r => [r.placa, r]))
  const tratativasPorPlaca = new Map(tratativas.filter(t => t.data === data).map(t => [t.placa, t]))

  return Array.from(vucs)
    .map(placa => {
      const r = rowsDoDia.get(placa)
      const disponivel = !!r && normalizar(r.status) === 'DISPONIVEL'
      return {
        placa,
        frota: r?.frota ?? null,
        status: r?.status ?? 'Sem dado',
        disponivel,
        motivo: r ? (r.justificativa?.trim() || null) : 'Sem registro no relatório do dia',
        tratativa: tratativasPorPlaca.get(placa) ?? null,
      }
    })
    .sort((a, b) => {
      if (a.disponivel !== b.disponivel) return a.disponivel ? 1 : -1
      return a.placa.localeCompare(b.placa)
    })
}

export interface MotivoRanking {
  motivo: string
  quantidade: number
}

// Ranking de motivos de indisponibilidade dos VUCs no mês, priorizando o
// motivo registrado na tratativa (mais confiável) e caindo para a
// justificativa do relatório quando não houver tratativa.
export function rankingMotivosVucMes(
  rows: FrotaDisponibilidade[],
  placas: FrotaPlaca[],
  ano: number,
  mes: number,
  tratativas: FrotaIVTratativa[] = [],
): MotivoRanking[] {
  const vucs = vucAtivos(placas)
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`
  const tratativasPorChave = new Map(tratativas.map(t => [`${t.placa}|${t.data}`, t]))

  const contagem = new Map<string, number>()
  for (const r of rows) {
    if (!vucs.has(r.placa) || !r.data.startsWith(prefixo)) continue
    if (normalizar(r.status) === 'DISPONIVEL') continue
    const t = tratativasPorChave.get(`${r.placa}|${r.data}`)
    const motivo = t?.motivo_tratativa?.trim() || r.justificativa?.trim() || (normalizar(r.status) === 'PARADO' ? 'Parado' : 'Sem justificativa')
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1)
  }

  return Array.from(contagem.entries())
    .map(([motivo, quantidade]) => ({ motivo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
}

export interface VucRankingAusencia {
  placa: string
  frota: string | null
  diasIndisponivel: number
  percentualIndisponibilidade: number
}

// Ranking dos VUCs que mais ficaram indisponíveis no mês.
export function rankingVucAusenciaMes(
  rows: FrotaDisponibilidade[],
  placas: FrotaPlaca[],
  ano: number,
  mes: number,
): VucRankingAusencia[] {
  const vucs = vucAtivos(placas)
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`

  const porPlaca = new Map<string, FrotaDisponibilidade[]>()
  for (const r of rows) {
    if (!vucs.has(r.placa) || !r.data.startsWith(prefixo)) continue
    if (!porPlaca.has(r.placa)) porPlaca.set(r.placa, [])
    porPlaca.get(r.placa)!.push(r)
  }

  return Array.from(porPlaca.entries())
    .map(([placa, linhas]) => {
      const indisponiveis = linhas.filter(l => normalizar(l.status) !== 'DISPONIVEL')
      return {
        placa,
        frota: linhas[0]?.frota ?? null,
        diasIndisponivel: indisponiveis.length,
        percentualIndisponibilidade: linhas.length > 0 ? Math.round((indisponiveis.length / linhas.length) * 100) : 0,
      }
    })
    .filter(p => p.diasIndisponivel > 0)
    .sort((a, b) => b.diasIndisponivel - a.diasIndisponivel)
}

export interface DuProjecaoDia {
  data: string
  retornamPrevistos: number
  totalVuc: number
  disponiveisProjetado: number
  percentualProjetado: number
}

// Projeta a evolução do DU para os próximos dias com base nas previsões de
// retorno registradas na tratativa: a cada dia em que uma placa indisponível
// tem previsão de retorno, soma-se ela aos disponíveis projetados a partir
// daquela data (assume que, uma vez retornada, ela permanece disponível).
export function calcularProjecaoDu(
  ultimoDuDia: DuDia | null,
  vucStatusUltimoDia: VucStatusDia[],
  tratativas: FrotaIVTratativa[],
): DuProjecaoDia[] {
  if (!ultimoDuDia) return []

  const indisponiveis = vucStatusUltimoDia.filter(v => !v.disponivel)
  const tratativasPorPlaca = new Map(tratativas.map(t => [t.placa, t]))

  const previsoes = indisponiveis
    .map(v => tratativasPorPlaca.get(v.placa)?.previsao_retorno)
    .filter((d): d is string => !!d && d > ultimoDuDia.data)

  if (previsoes.length === 0) return []

  const datasOrdenadas = Array.from(new Set(previsoes)).sort()
  let disponiveisAcumulado = ultimoDuDia.disponiveis
  const totalVuc = ultimoDuDia.totalVuc

  return datasOrdenadas.map(data => {
    const retornamPrevistos = previsoes.filter(d => d === data).length
    disponiveisAcumulado += retornamPrevistos
    const disponiveisProjetado = Math.min(disponiveisAcumulado, totalVuc)
    const percentualBruto = totalVuc > 0 ? (disponiveisProjetado / totalVuc) * 100 : 0
    return {
      data,
      retornamPrevistos,
      totalVuc,
      disponiveisProjetado,
      percentualProjetado: atingimentoDu(percentualBruto),
    }
  })
}

// ─── Fixação de Motorista: motorista fixado na placa (frota_placas) x
// motorista que realmente rodou no dia (historico_tml) ──────────────────────

export interface HistoricoTmlMotorista {
  placa: string | null
  data_saida: string | null
  matricula: number | null
  nome: string | null
  sala: 'COLORADO' | 'SUB-FURIA' | null
}

export interface CruzamentoMotoristaItem {
  placa: string
  data: string
  sala: 'COLORADO' | 'SUB-FURIA' | null
  matriculaExecutou: number
  nomeExecutou: string | null
  matriculaEsperada1: string | null
  matriculaEsperada2: string | null
  bate: boolean
}

// Cruza, por placa+dia, a matrícula que realmente rodou com a(s) matrícula(s)
// fixada(s) no cadastro de placas (frota_placas). Só placas ativas e com
// pelo menos uma matrícula cadastrada entram na comparação — sem cadastro
// não há o que comparar.
export function cruzarMotorista(
  historicoTml: HistoricoTmlMotorista[],
  placas: FrotaPlaca[],
): CruzamentoMotoristaItem[] {
  const porPlaca = new Map(placas.filter(p => p.ativo).map(p => [p.placa, p]))

  const resultado: CruzamentoMotoristaItem[] = []
  for (const h of historicoTml) {
    if (!h.placa || !h.data_saida || h.matricula == null) continue
    const cad = porPlaca.get(h.placa)
    if (!cad) continue
    const m1 = cad.matricula_motorista?.trim() || null
    const m2 = cad.matricula_motorista_2?.trim() || null
    if (!m1 && !m2) continue

    const executou = String(h.matricula)
    resultado.push({
      placa: h.placa,
      data: h.data_saida,
      sala: h.sala,
      matriculaExecutou: h.matricula,
      nomeExecutou: h.nome,
      matriculaEsperada1: m1,
      matriculaEsperada2: m2,
      bate: executou === m1 || executou === m2,
    })
  }

  return resultado.sort((a, b) => b.data.localeCompare(a.data) || a.placa.localeCompare(b.placa))
}

// ─── Fixação de Motorista × Território: a placa também rodou no território
// programado pra ela naquele dia? ────────────────────────────────────────

// Mapa placa|data -> território disponibilizado no PCD (frota_disponibilidade
// .regiao), mesma fonte e mesmo filtro (DISPONIVEL + regiao presente) usados
// no cruzamento da aba Fixação de Território — só placas roteirizadas no PCD
// entram aqui.
export function agruparTerritorioProgramadoPorPlacaData(frotaRows: FrotaDisponibilidade[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const r of frotaRows) {
    if (normalizar(r.status) === 'DISPONIVEL' && r.regiao) mapa.set(`${r.placa}|${r.data}`, r.regiao)
  }
  return mapa
}

export type StatusTerritorioMotorista = 'ok' | 'divergente' | 'sem_execucao' | 'sem_roteirizacao'

export interface TerritorioMotoristaInfo {
  status: StatusTerritorioMotorista
  territorioProgramado: string | null
  regiaoExecutada: string | null
}

// Compara, pra uma placa+dia do cruzamento de Fixação de Motorista, o
// território disponibilizado no PCD com a região que ela realmente executou
// (mesma fonte e lógica usadas na Fixação de Território — Base do
// Mapa/TML). Reaproveita bairroBateNaRegiao, a mesma comparação aproximada
// já usada pra cruzar território x placa.
export function avaliarTerritorioMotorista(
  placa: string,
  data: string,
  territorioProgramadoPorPlacaData: Map<string, string>,
  regioesPorPlacaData: Map<string, string[]>,
): TerritorioMotoristaInfo {
  const territorioProgramado = territorioProgramadoPorPlacaData.get(`${placa}|${data}`) ?? null
  if (!territorioProgramado) return { status: 'sem_roteirizacao', territorioProgramado: null, regiaoExecutada: null }

  const regioes = regioesPorPlacaData.get(`${placa}|${data}`) ?? []
  if (regioes.length === 0) return { status: 'sem_execucao', territorioProgramado, regiaoExecutada: null }

  const bate = bairroBateNaRegiao(territorioProgramado, regioes)
  return { status: bate ? 'ok' : 'divergente', territorioProgramado, regiaoExecutada: regioes.join(' / ') }
}

export interface RankingMotoristaFixacao {
  matricula: number
  nome: string | null
  perdas: number
  placas: string[]
}

// Ranking de motoristas que mais rodaram em placas fixadas para outro
// motorista — quem mais "tomou" a placa de outro, não quem deixou de rodar.
export function rankingMotoristasPerdaFixacao(cruzamento: CruzamentoMotoristaItem[]): RankingMotoristaFixacao[] {
  const porMotorista = new Map<number, { nome: string | null; placas: Set<string>; perdas: number }>()
  for (const c of cruzamento) {
    if (c.bate) continue
    if (!porMotorista.has(c.matriculaExecutou)) {
      porMotorista.set(c.matriculaExecutou, { nome: c.nomeExecutou, placas: new Set(), perdas: 0 })
    }
    const m = porMotorista.get(c.matriculaExecutou)!
    m.perdas++
    m.placas.add(c.placa)
    if (!m.nome && c.nomeExecutou) m.nome = c.nomeExecutou
  }

  return Array.from(porMotorista.entries())
    .map(([matricula, v]) => ({ matricula, nome: v.nome, perdas: v.perdas, placas: Array.from(v.placas) }))
    .sort((a, b) => b.perdas - a.perdas)
}

export interface AderenciaMotoristaDia {
  data: string
  comDado: number
  ok: number
  percentual: number
}

export function calcularAderenciaMotoristaPorDia(cruzamento: CruzamentoMotoristaItem[]): AderenciaMotoristaDia[] {
  const porDia = new Map<string, CruzamentoMotoristaItem[]>()
  for (const c of cruzamento) {
    if (!porDia.has(c.data)) porDia.set(c.data, [])
    porDia.get(c.data)!.push(c)
  }

  return Array.from(porDia.entries())
    .map(([data, itens]) => {
      const ok = itens.filter(i => i.bate).length
      return {
        data,
        comDado: itens.length,
        ok,
        percentual: itens.length > 0 ? Math.round((ok / itens.length) * 100) : 0,
      }
    })
    .sort((a, b) => a.data.localeCompare(b.data))
}

export interface AderenciaMotoristaDiaSala {
  data: string
  sala: 'COLORADO' | 'SUB-FURIA'
  comDado: number
  ok: number
  percentual: number
}

export function calcularAderenciaMotoristaPorDiaESala(cruzamento: CruzamentoMotoristaItem[]): AderenciaMotoristaDiaSala[] {
  const porChave = new Map<string, CruzamentoMotoristaItem[]>()
  for (const c of cruzamento) {
    if (!c.sala) continue
    const chave = `${c.data}|${c.sala}`
    if (!porChave.has(chave)) porChave.set(chave, [])
    porChave.get(chave)!.push(c)
  }

  return Array.from(porChave.entries())
    .map(([chave, itens]) => {
      const [data, sala] = chave.split('|') as [string, 'COLORADO' | 'SUB-FURIA']
      const ok = itens.filter(i => i.bate).length
      return {
        data,
        sala,
        comDado: itens.length,
        ok,
        percentual: itens.length > 0 ? Math.round((ok / itens.length) * 100) : 0,
      }
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.sala.localeCompare(b.sala))
}

export interface AderenciaMotoristaAcumulado {
  ano: number
  mes: number
  diasComDado: number
  mediaPercentual: number
  totalOk: number
  totalComDado: number
}

// Acumulado do mês: média ponderada (soma de OK / soma do total comparado),
// não média simples dos percentuais diários — mesmo critério do DU.
export function calcularAderenciaMotoristaAcumulado(
  porDia: AderenciaMotoristaDia[],
  ano: number,
  mes: number,
): AderenciaMotoristaAcumulado {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`
  const doMes = porDia.filter(d => d.data.startsWith(prefixo))
  const totalOk = doMes.reduce((acc, d) => acc + d.ok, 0)
  const totalComDado = doMes.reduce((acc, d) => acc + d.comDado, 0)
  return {
    ano,
    mes,
    diasComDado: doMes.length,
    mediaPercentual: totalComDado > 0 ? Math.round((totalOk / totalComDado) * 100) : 0,
    totalOk,
    totalComDado,
  }
}

export interface AderenciaMotoristaMes {
  ano: number
  mes: number
  acumulado: AderenciaMotoristaAcumulado
}

// Evolução mês x mês dos últimos `n` meses com dado, mais recente por último.
export function calcularAderenciaMotoristaMeses(porDia: AderenciaMotoristaDia[], n = 6): AderenciaMotoristaMes[] {
  const chaves = Array.from(new Set(porDia.map(d => d.data.slice(0, 7)))).sort()
  const ultimas = chaves.slice(-n)
  return ultimas.map(chave => {
    const [ano, mes] = chave.split('-').map(Number)
    return { ano, mes, acumulado: calcularAderenciaMotoristaAcumulado(porDia, ano, mes) }
  })
}

// Opções de motivo enviadas como lista clicável ao supervisor na solicitação
// de justificativa da Fixação de Motorista. "OUTRO" não finaliza o alerta —
// pede uma resposta escrita, capturada pelo fluxo de texto livre do webhook.
export const MOTIVOS_FIXACAO_MOTORISTA = ['ABS DE MOTORISTA', 'ROTA GRADATIVA', 'PLACA EM MANUTENÇÃO', 'MAPA VIRADO', 'ROTA CRÍTICA', 'ERRO DE ROTEIRIZAÇÃO', 'OUTRO']

async function gerarNumeroFixacao(filial: string): Promise<string> {
  const { count } = await supabase
    .from('alertas_fixacao_motorista')
    .select('*', { count: 'exact', head: true })
    .eq('filial', filial)
  const n = ((count ?? 0) + 1).toString().padStart(4, '0')
  const d = new Date()
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `FIX-${ds}-${n}`
}

// Linha extra sobre território pra mensagem de fixação de motorista — null
// quando a placa/dia nem tem território programado ainda (não vale a pena
// avisar sobre um dado que não existe).
function linhaTerritorioFixacaoMotorista(info: TerritorioMotoristaInfo): string | null {
  if (info.status === 'sem_roteirizacao') return null
  if (info.status === 'ok') return `📍 Território: rodou em ${info.regiaoExecutada} — bate com o programado (${info.territorioProgramado}) ✅`
  if (info.status === 'divergente') return `📍 Território: devia rodar em ${info.territorioProgramado}, rodou em ${info.regiaoExecutada} ⚠️`
  return `📍 Território: programado ${info.territorioProgramado} — ainda sem região executada pra confirmar`
}

function montarMensagemFixacaoMotorista(item: {
  placa: string
  data: string
  sala: string | null
  nomeExecutou: string | null
  nomeEsperada1: string | null
  nomeEsperada2: string | null
  territorio?: TerritorioMotoristaInfo
}): string {
  const esperados = [item.nomeEsperada1, item.nomeEsperada2].filter(Boolean).join(' ou ')
  const linhaTerritorio = item.territorio ? linhaTerritorioFixacaoMotorista(item.territorio) : null
  return (
    `⚠️ *FIXAÇÃO DE MOTORISTA — DIVERGÊNCIA*\n\n` +
    `🚛 Placa: ${item.placa}\n` +
    `📅 Data: ${formatarDataBR(item.data)}\n` +
    `🏢 Sala: ${item.sala ?? '—'}\n` +
    `👤 Motorista que rodou: ${item.nomeExecutou ?? '—'}\n` +
    `📌 Motorista(s) fixado(s) na placa: ${esperados || '—'}\n` +
    (linhaTerritorio ? `${linhaTerritorio}\n` : '') +
    `\nA placa rodou com um motorista diferente do fixado. *Selecione abaixo o motivo da divergência*:`
  )
}

// Dispara a solicitação de justificativa pro supervisor da sala quando a
// placa roda com um motorista diferente do fixado em frota_placas. Chamada
// automaticamente a cada importação de saída e também sob demanda pelo botão
// "Forçar envio" da aba Fixação de Motorista (mesma lógica — só cria alerta
// pras divergências de placa+dia que ainda não tiverem um registrado, então
// rodar de novo no mesmo dia não duplica envios). Não lança em caso de falha
// de envio — só registra o alerta com status "erro".
export async function processarFixacaoMotorista(filial: string, historico: HistoricoTmlMotorista[]): Promise<void> {
  const placasDoLote = [...new Set(historico.map((h) => h.placa).filter((p): p is string => !!p))]
  if (placasDoLote.length === 0) return

  const { data: placasCadastro } = await supabase
    .from('frota_placas')
    .select('*')
    .eq('filial', filial)
    .eq('ativo', true)
    .in('placa', placasDoLote)

  const cruzamento = cruzarMotorista(historico, (placasCadastro ?? []) as FrotaPlaca[])
  const nok = cruzamento.filter((c) => !c.bate)
  if (nok.length === 0) return

  // Uma divergência por placa+dia (mesma chave única da tabela de alertas).
  const nokUnico = Array.from(new Map(nok.map((c) => [`${c.placa}|${c.data}`, c])).values())

  const { data: existentes } = await supabase
    .from('alertas_fixacao_motorista')
    .select('placa, data')
    .eq('filial', filial)
    .in('placa', nokUnico.map((c) => c.placa))
  const jaAlertados = new Set((existentes ?? []).map((a) => `${a.placa}|${a.data}`))

  // frota_placas só guarda a matrícula do motorista fixado, não o nome — o
  // nome é resolvido pelo roster cadastrado (motoristas_sala_tml), única
  // fonte confiável mesmo quando o fixado está ausente no dia da divergência.
  const matriculasEsperadas = [...new Set(nokUnico.flatMap((c) => [c.matriculaEsperada1, c.matriculaEsperada2]).filter((m): m is string => !!m))]
  const { data: roster } = matriculasEsperadas.length
    ? await supabase.from('motoristas_sala_tml').select('matricula, nome').eq('filial', filial).in('matricula', matriculasEsperadas.map(Number))
    : { data: [] as { matricula: number; nome: string }[] }
  const nomePorMatricula = new Map((roster ?? []).map((r) => [String(r.matricula), r.nome]))

  // Território disponibilizado no PCD x região realmente executada (mesma
  // fonte e lógica da Fixação de Território) — pra avisar o supervisor se a
  // placa também saiu do território, além do motorista.
  const placasNok = [...new Set(nokUnico.map((c) => c.placa))]
  const [{ data: dataDisponibilidade }, { data: dataHistoricoTml }, { data: dataTerritorioHist }] = await Promise.all([
    supabase.from('frota_disponibilidade').select('placa, data, status, regiao').eq('filial', filial).in('placa', placasNok),
    supabase.from('historico_tml').select('placa, data_saida, regiao_entregas, cidades_entregas').eq('filial', filial).in('placa', placasNok),
    supabase.from('frota_territorio_historico').select('placa, data, regiao_entregas').eq('filial', filial).in('placa', placasNok),
  ])
  const territorioProgramadoPorPlacaData = agruparTerritorioProgramadoPorPlacaData((dataDisponibilidade ?? []) as FrotaDisponibilidade[])
  const regioesPorPlacaData = agruparRegioesPorPlacaData([
    ...((dataHistoricoTml ?? []) as HistoricoTmlRegiao[]),
    ...((dataTerritorioHist ?? []) as { placa: string | null; data: string | null; regiao_entregas: string | null }[])
      .map((r) => ({ placa: r.placa, data_saida: r.data, regiao_entregas: r.regiao_entregas, cidades_entregas: null })),
  ])

  const statusPorNomeFixacao = await buscarStatusColaboradoresPorNome(filial)

  for (const item of nokUnico) {
    if (jaAlertados.has(`${item.placa}|${item.data}`)) continue

    // Quando sala é desconhecida (motoristas_sala_tml sem mapeamento), envia
    // para todos os supervisores ativos da filial em vez de silenciar.
    const { data: supervisoresRaw } = item.sala
      ? await supabase.from('supervisores_tml').select('id, nome, telefone').eq('filial', filial).eq('sala', item.sala)
      : await supabase.from('supervisores_tml').select('id, nome, telefone').eq('filial', filial)
    const supervisores = []
    for (const s of supervisoresRaw ?? []) {
      if (await podeEnviarPara({ origem: 'frota_divergencia_fixacao', filial, mapaStatus: statusPorNomeFixacao, nome: s.nome, telefone: s.telefone, detalhe: `Placa ${item.placa}` })) {
        supervisores.push(s)
      }
    }

    const mensagem = montarMensagemFixacaoMotorista({
      ...item,
      nomeEsperada1: item.matriculaEsperada1 ? nomePorMatricula.get(item.matriculaEsperada1) ?? null : null,
      nomeEsperada2: item.matriculaEsperada2 ? nomePorMatricula.get(item.matriculaEsperada2) ?? null : null,
      territorio: avaliarTerritorioMotorista(item.placa, item.data, territorioProgramadoPorPlacaData, regioesPorPlacaData),
    })
    const numero = await gerarNumeroFixacao(filial)

    if (!supervisores?.length) {
      await supabase.from('alertas_fixacao_motorista').insert({
        filial, numero, placa: item.placa, data: item.data, sala: item.sala,
        matricula_executou: item.matriculaExecutou, nome_executou: item.nomeExecutou,
        matricula_esperada_1: item.matriculaEsperada1, matricula_esperada_2: item.matriculaEsperada2,
        mensagem_enviada: mensagem, status: 'erro',
      })
      continue
    }

    // Insere primeiro para ter o id do alerta, usado nas opções da lista
    // (cada clique já identifica qual alerta deve ser justificado).
    const { data: novoAlerta } = await supabase.from('alertas_fixacao_motorista').insert({
      filial, numero, placa: item.placa, data: item.data, sala: item.sala,
      matricula_executou: item.matriculaExecutou, nome_executou: item.nomeExecutou,
      matricula_esperada_1: item.matriculaEsperada1, matricula_esperada_2: item.matriculaEsperada2,
      supervisor_id: supervisores[0].id,
      mensagem_enviada: mensagem,
      status: 'pendente',
    }).select('id').single()
    if (!novoAlerta) continue

    const opcoes = MOTIVOS_FIXACAO_MOTORISTA.map((motivo) => ({
      id: `fixmotivo:${novoAlerta.id}:${motivo}`,
      title: motivo,
    }))

    const errosEnvio: string[] = []
    for (const sup of supervisores) {
      const resultado = await enviarListaOpcoesWhatsApp(sup.telefone, mensagem, 'Motivo da divergência', 'Selecionar motivo', opcoes)
      if (!resultado.sucesso) errosEnvio.push(`${sup.nome}: ${resultado.erro}`)
    }

    await supabase.from('alertas_fixacao_motorista')
      .update({ status: errosEnvio.length === supervisores.length ? 'erro' : 'enviado' })
      .eq('id', novoAlerta.id)
  }
}
