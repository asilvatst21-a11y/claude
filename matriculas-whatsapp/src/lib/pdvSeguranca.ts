import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { traduzirStatusBees, type StatusFarol } from './farolCriticos'

// ── PDV Crítico (Segurança) ─────────────────────────────────────────────
// Relato do motorista (categoria/subgrupo) já existe hoje fora deste app —
// entra aqui por upload periódico da planilha de origem. Só a categoria
// "Segurança" vira caso neste módulo; as demais (Produtividade, Qualidade,
// Cordialidade, Outros) seguem pro time responsável e nunca são gravadas
// aqui.

export type NivelCriticidade = 'alto' | 'medio' | 'leve'
export type NivelMedido = NivelCriticidade | 'conforme'
export type StatusRelato = 'aguardando_triagem' | 'agendado' | 'preenchido' | 'aprovado' | 'nao_critico'

export const NIVEL_LABEL: Record<NivelCriticidade, string> = { alto: 'NC Alto', medio: 'NC Médio', leve: 'NC Leve' }
export const NIVEL_MEDIDO_LABEL: Record<NivelMedido, string> = { alto: 'NC Alto', medio: 'NC Médio', leve: 'NC Leve', conforme: 'Conforme' }
export const STATUS_LABEL: Record<StatusRelato, string> = {
  aguardando_triagem: 'Aguardando triagem',
  agendado: 'Visita agendada',
  preenchido: 'Aguarda finalização',
  aprovado: 'Encerrado',
  nao_critico: 'Não crítico · sem visita',
}

// Prazo da visita a partir do nível inicial — editável no código até
// virar tela de configuração própria; hoje reflete o mockup aprovado.
export const PRAZO_DIAS: Record<NivelCriticidade, number> = { alto: 2, medio: 7, leve: 30 }

// Sugestão inicial (mockup aprovado) — usada só pra semear a config na
// primeira vez que a filial abre a tela; depois disso é 100% editável.
export const SUBGRUPOS_SEGURANCA_PADRAO: { subgrupo: string; nivel: NivelCriticidade }[] = [
  { subgrupo: 'Alto risco de violência urbana (roubo)', nivel: 'alto' },
  { subgrupo: 'Risco de empilhamento no estoque', nivel: 'alto' },
  { subgrupo: 'Acesso / Escada / Rampa irregular', nivel: 'medio' },
  { subgrupo: 'Rua de difícil acesso', nivel: 'medio' },
  { subgrupo: 'Restrições de estacionamento', nivel: 'leve' },
  { subgrupo: 'Calçada de acesso irregular', nivel: 'leve' },
  { subgrupo: 'Dificuldade do uso do cone', nivel: 'leve' },
  { subgrupo: 'Baldeio em excesso', nivel: 'leve' },
]

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

// normalize() já tira acento — comparar contra uma constante SEM tirar
// acento dela mesma (bug real: "segurança" nunca batia com o resultado
// normalizado "seguranca", e todo relato caía em "outras áreas").
const CATEGORIA_SEGURANCA = normalize('Segurança')

// Célula de data real do Excel: extrai ano/mês/dia em UTC (seguro pra
// datas de calendário normais — o deslocamento por fuso só afeta células
// de HORÁRIO puro ancoradas em 1899, não datas reais como esta).
function excelDateParaISO(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
  }
  return null
}

export interface RelatoImportado {
  codigoPdv: string
  categoria: string
  subgrupo: string
  codigoMotorista: string | null
  relatoMotorista: string | null
  dataRelato: string | null
  origemStatus: string | null
}

/**
 * Planilha de relatos do motorista (ex.: export "Export (2)") — colunas:
 * pais, REGIONAL, OPERAÇÃO, cdd, data_de_criacao, codigo_pdv, categoria,
 * subcategoria, codigo_motorista, relato_motorista, instrucao_registrada,
 * status, prazo, ultima_atualizacao, mes, tipo, transportadora, partition.
 */
export function parseRelatosPdvBuffer(buffer: ArrayBuffer): RelatoImportado[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames.find((n) => normalize(n).includes('export')) ?? workbook.SheetNames[0]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null })
  if (rows.length === 0) return []

  const header = rows[0].map(normalize)
  const pdvIdx = header.findIndex((c) => c.includes('codigo_pdv') || c.includes('codigo pdv'))
  const categoriaIdx = header.indexOf('categoria')
  const subcatIdx = header.findIndex((c) => c.includes('subcategoria'))
  const motoristaIdx = header.findIndex((c) => c.includes('codigo_motorista') || c.includes('codigo motorista'))
  const relatoIdx = header.findIndex((c) => c.includes('relato_motorista') || c.includes('relato motorista'))
  const dataIdx = header.findIndex((c) => c.includes('data_de_criacao') || c.includes('data de criacao'))
  const statusIdx = header.indexOf('status')
  if (pdvIdx === -1 || categoriaIdx === -1 || subcatIdx === -1) return []

  const out: RelatoImportado[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const codigoPdv = String(row[pdvIdx] ?? '').trim()
    const categoria = String(row[categoriaIdx] ?? '').trim()
    const subgrupo = String(row[subcatIdx] ?? '').trim()
    if (!codigoPdv || !categoria || !subgrupo) continue
    out.push({
      codigoPdv,
      categoria,
      subgrupo,
      codigoMotorista: motoristaIdx !== -1 ? String(row[motoristaIdx] ?? '').trim() || null : null,
      relatoMotorista: relatoIdx !== -1 ? String(row[relatoIdx] ?? '').trim() || null : null,
      dataRelato: dataIdx !== -1 ? excelDateParaISO(row[dataIdx]) : null,
      origemStatus: statusIdx !== -1 ? String(row[statusIdx] ?? '').trim() || null : null,
    })
  }
  return out
}

// ── Config: nível inicial por subgrupo ──────────────────────────────────

export interface NivelSubgrupo {
  id: string
  filial: string
  subgrupo: string
  nivel: NivelCriticidade
}

export async function listarNiveisSubgrupo(filial: string): Promise<NivelSubgrupo[]> {
  const { data, error } = await supabase
    .from('pdv_seguranca_niveis_subgrupo')
    .select('*')
    .eq('filial', filial)
    .order('subgrupo')
  if (error) { console.error('listarNiveisSubgrupo error:', error.message); return [] }
  return data ?? []
}

export async function salvarNivelSubgrupo(filial: string, subgrupo: string, nivel: NivelCriticidade): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('pdv_seguranca_niveis_subgrupo')
    .upsert({ filial, subgrupo, nivel, updated_at: new Date().toISOString() }, { onConflict: 'filial,subgrupo' })
  return { error: error?.message ?? null }
}

// Semeia a sugestão padrão só pros subgrupos que a filial ainda não configurou.
export async function semearNiveisPadrao(filial: string): Promise<void> {
  const existentes = new Set((await listarNiveisSubgrupo(filial)).map((n) => n.subgrupo))
  const faltando = SUBGRUPOS_SEGURANCA_PADRAO.filter((s) => !existentes.has(s.subgrupo))
  if (faltando.length === 0) return
  await supabase.from('pdv_seguranca_niveis_subgrupo').insert(
    faltando.map((s) => ({ filial, subgrupo: s.subgrupo, nivel: s.nivel }))
  )
}

// ── Import dos relatos ───────────────────────────────────────────────────

function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export interface ResultadoImportRelatos {
  seguranca: number
  outrasAreas: number
  jaExistiam: number
  semData: number
}

/**
 * Importa relatos de PDV. Só grava categoria "Segurança" — o resto é só
 * contado (some pro time responsável, não vira linha aqui). Nunca
 * sobrescreve um relato que já existe (mesma chave filial+pdv+subgrupo+
 * data): um caso em andamento não pode ser resetado por uma reimportação.
 */
export async function importarRelatosPdv(file: File, filial: string): Promise<ResultadoImportRelatos> {
  const buffer = await file.arrayBuffer()
  const linhas = parseRelatosPdvBuffer(buffer)
  if (linhas.length === 0) throw new Error('Nenhum relato reconhecido na planilha.')

  const niveis = new Map((await listarNiveisSubgrupo(filial)).map((n) => [n.subgrupo, n.nivel]))

  const resultado: ResultadoImportRelatos = { seguranca: 0, outrasAreas: 0, jaExistiam: 0, semData: 0 }
  const candidatasComRepetidas = linhas.filter((l) => {
    if (normalize(l.categoria) !== CATEGORIA_SEGURANCA) { resultado.outrasAreas++; return false }
    if (!l.dataRelato) { resultado.semData++; return false }
    return true
  })
  if (candidatasComRepetidas.length === 0) return resultado

  // A planilha de origem traz o mesmo relato repetido em mais de uma linha
  // (ex.: atualizações sucessivas do mesmo caso) — sem isso o INSERT em
  // lote quebra na constraint única, já que duas linhas do próprio arquivo
  // caem na mesma chave filial+pdv+subgrupo+data.
  const porChave = new Map(candidatasComRepetidas.map((l) => [`${l.codigoPdv}|${l.subgrupo}|${l.dataRelato}`, l]))
  const candidatas = [...porChave.values()]

  const { data: existentesRaw } = await supabase
    .from('pdv_seguranca_relatos')
    .select('codigo_pdv, subgrupo, data_relato')
    .eq('filial', filial)
    .in('codigo_pdv', [...new Set(candidatas.map((l) => l.codigoPdv))])
  const chaveExiste = new Set((existentesRaw ?? []).map((r) => `${r.codigo_pdv}|${r.subgrupo}|${r.data_relato}`))

  const novas = candidatas.filter((l) => !chaveExiste.has(`${l.codigoPdv}|${l.subgrupo}|${l.dataRelato}`))
  resultado.jaExistiam = candidatas.length - novas.length
  resultado.seguranca = novas.length
  if (novas.length === 0) return resultado

  const rows = novas.map((l) => {
    const nivel = niveis.get(l.subgrupo) ?? null
    return {
      filial,
      codigo_pdv: l.codigoPdv,
      categoria: l.categoria,
      subgrupo: l.subgrupo,
      codigo_motorista: l.codigoMotorista,
      relato_motorista: l.relatoMotorista,
      data_relato: l.dataRelato,
      origem_status: l.origemStatus,
      nivel_inicial: nivel,
      prazo_visita: nivel ? somarDias(l.dataRelato!, PRAZO_DIAS[nivel]) : null,
      status: 'aguardando_triagem' as const,
    }
  })
  const BATCH = 300
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('pdv_seguranca_relatos').insert(rows.slice(i, i + BATCH))
    if (error) throw new Error(`Erro ao salvar relatos: ${error.message}`)
  }
  return resultado
}

// ── Painel de relatos ────────────────────────────────────────────────────

export interface RelatoLinha {
  id: string
  codigoPdv: string
  subgrupo: string
  nivel: NivelCriticidade | null
  codigoMotorista: string | null
  dataRelato: string
  prazoVisita: string | null
  status: StatusRelato
  statusBees: { farol: StatusFarol; label: string } | null
}

export async function listarRelatos(filial: string): Promise<RelatoLinha[]> {
  const { data, error } = await supabase
    .from('pdv_seguranca_relatos')
    .select('id, codigo_pdv, subgrupo, nivel_inicial, nivel_medido, codigo_motorista, data_relato, prazo_visita, status')
    .eq('filial', filial)
    .order('data_relato', { ascending: false })
    .limit(300)
  if (error) { console.error('listarRelatos error:', error.message); return [] }
  const linhas = data ?? []

  const codigos = [...new Set(linhas.map((l) => l.codigo_pdv))]
  const { data: bees } = codigos.length > 0
    ? await supabase.from('distribuicao_bees_visitas').select('pdv_codigo, status, data').eq('filial', filial).in('pdv_codigo', codigos).order('data', { ascending: false })
    : { data: [] as any[] }
  const beesPorPdv = new Map<string, string | null>()
  for (const b of bees ?? []) {
    if (!beesPorPdv.has(String(b.pdv_codigo))) beesPorPdv.set(String(b.pdv_codigo), b.status)
  }

  return linhas.map((l) => ({
    id: l.id,
    codigoPdv: l.codigo_pdv,
    subgrupo: l.subgrupo,
    nivel: (l.nivel_medido ?? l.nivel_inicial) as NivelCriticidade | null,
    codigoMotorista: l.codigo_motorista,
    dataRelato: l.data_relato,
    prazoVisita: l.prazo_visita,
    status: l.status as StatusRelato,
    statusBees: beesPorPdv.has(l.codigo_pdv) ? traduzirStatusBees(beesPorPdv.get(l.codigo_pdv) ?? null) : null,
  }))
}

export async function marcarNaoCritico(id: string, justificativa: string, decididoPor: string): Promise<{ error: string | null }> {
  if (!justificativa.trim()) return { error: 'Justificativa é obrigatória.' }
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'nao_critico',
      justificativa_nao_critico: justificativa.trim(),
      decidido_por: decididoPor,
      decidido_em: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}
