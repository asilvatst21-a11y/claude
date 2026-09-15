// Leitura da planilha "Apuração de KM" (aba "Base"). Funções puras — sem
// I/O — para poderem rodar tanto no Web Worker (kmApuracaoWorker.ts, arquivo
// grande) quanto em testes, sem duplicar a lógica de mapeamento de colunas.
import * as XLSX from 'xlsx'
import type { LinhaViagemImportada } from './types'

function normalizarNome(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function encontrarColuna(headerNormalizado: string[], ...nomes: string[]): number {
  for (const nome of nomes) {
    const idx = headerNormalizado.indexOf(normalizarNome(nome))
    if (idx !== -1) return idx
  }
  return -1
}

// "19.456,00" / "19456.00" / 19456 → number | null. Ilegível (texto que não
// é número) vira { valido: false } — usado pra marcar "erro de dado".
export function parseNumero(v: unknown): { valor: number | null; valido: boolean } {
  if (v == null || v === '') return { valor: null, valido: true }
  if (typeof v === 'number') return { valor: isFinite(v) ? v : null, valido: isFinite(v) }
  const s = String(v).trim()
  if (!s) return { valor: null, valido: true }
  const normalizado = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = parseFloat(normalizado)
  return isNaN(n) ? { valor: null, valido: false } : { valor: n, valido: true }
}

// Excel guarda data/hora como número serial (dias desde 30/12/1899, hora
// como fração do dia). As colunas de horário desta planilha não têm
// formatação de data reconhecida pelo SheetJS/openpyxl (vêm como número
// puro), então a conversão é feita manualmente em vez de depender de
// `cellDates`.
const EPOCA_EXCEL_UTC = Date.UTC(1899, 11, 30)

export function serialParaDataLocal(serial: number): Date {
  const ms = EPOCA_EXCEL_UTC + Math.round(serial * 86400000)
  const utc = new Date(ms)
  // Os componentes (ano/mês/dia/hora) representam o horário local gravado
  // na planilha, sem timezone — reconstrói como Date local com os mesmos
  // componentes (mesma convenção "naive" já usada em outros pontos do app).
  return new Date(
    utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(),
    utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds()
  )
}

// Aceita "2026-08-14", "2026-08-14 06:42:00", "2026-08-14T06:42:00" (ISO) e
// "14/08/2026", "14/08/2026 06:42:00" (BR) — a mesma coluna às vezes vem
// como número serial do Excel e às vezes como texto, dependendo de como a
// planilha foi exportada (arquivo mensal completo x extrato de 1 CDD).
const RE_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
const RE_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/

function parseDataDeTexto(s: string): Date | null {
  const texto = s.trim()
  const iso = RE_DATA_ISO.exec(texto)
  if (iso) {
    const [, ano, mes, dia, h, m, seg] = iso
    return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(h ?? 0), Number(m ?? 0), Number(seg ?? 0))
  }
  const br = RE_DATA_BR.exec(texto)
  if (br) {
    const [, dia, mes, ano, h, m, seg] = br
    return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(h ?? 0), Number(m ?? 0), Number(seg ?? 0))
  }
  return null
}

function parseDataGenerica(v: unknown): Date | null {
  if (typeof v === 'number' && isFinite(v)) return serialParaDataLocal(v)
  if (v instanceof Date) return v
  if (typeof v === 'string' && v.trim() !== '') return parseDataDeTexto(v)
  return null
}

function parseDataHora(v: unknown): string | null {
  if (v == null || v === '') return null
  const d = parseDataGenerica(v)
  return d ? d.toISOString() : null
}

function parseData(v: unknown): string | null {
  if (v == null || v === '') return null
  const d = parseDataGenerica(v)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseTexto(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function parseBooleanoFlag(v: unknown): boolean {
  if (typeof v === 'number') return v === 1
  const s = String(v ?? '').trim().toUpperCase()
  return s === '1' || s === 'SIM' || s === 'TRUE'
}

interface IndicesColunas {
  mapa: number; placa: number; codFilial: number; nomeCdd: number; transportadora: number; geo: number
  entrega: number; cargaAtual: number; frota: number; tipoCombustivel: number; classificacaoExtra: number
  kmRoteirizador: number; kmTelemetria: number; kmMax: number; aderencia: number; mapaVirado: number; dMais1: number
  data: number; hrCarregRot: number; hrCarregTel: number; hrSaiRot: number; hrSaiTel: number; hrEntrRot: number; hrEntrTel: number
}

function localizarColunas(headerNormalizado: string[]): IndicesColunas {
  return {
    mapa: encontrarColuna(headerNormalizado, 'mapa'),
    placa: encontrarColuna(headerNormalizado, 'placa'),
    codFilial: encontrarColuna(headerNormalizado, 'cod_filial'),
    nomeCdd: encontrarColuna(headerNormalizado, 'nome_cdd'),
    transportadora: encontrarColuna(headerNormalizado, 'transportadora'),
    geo: encontrarColuna(headerNormalizado, 'geo'),
    entrega: encontrarColuna(headerNormalizado, 'entrega'),
    cargaAtual: encontrarColuna(headerNormalizado, 'carga_atual'),
    frota: encontrarColuna(headerNormalizado, 'frota'),
    tipoCombustivel: encontrarColuna(headerNormalizado, 'tipo_combustivel_shared_descricao'),
    classificacaoExtra: encontrarColuna(headerNormalizado, 'classificacao_roadshow'),
    kmRoteirizador: encontrarColuna(headerNormalizado, 'KM Roteirizador (num)', 'KmPrevistoRoad', 'km_previsto_road'),
    kmTelemetria: encontrarColuna(headerNormalizado, 'KM Veltec'),
    kmMax: encontrarColuna(headerNormalizado, 'KM Max'),
    aderencia: encontrarColuna(headerNormalizado, 'ADERENCIA'),
    mapaVirado: encontrarColuna(headerNormalizado, 'Mapa Virado'),
    dMais1: encontrarColuna(headerNormalizado, 'D+1?'),
    data: encontrarColuna(headerNormalizado, 'data'),
    hrCarregRot: encontrarColuna(headerNormalizado, 'hr_carreg_2artq'),
    hrCarregTel: encontrarColuna(headerNormalizado, 'hr_carreg_veltec'),
    hrSaiRot: encontrarColuna(headerNormalizado, 'hr_sai_2artq'),
    hrSaiTel: encontrarColuna(headerNormalizado, 'hr_sai_veltec'),
    hrEntrRot: encontrarColuna(headerNormalizado, 'hr_entr_2artq'),
    hrEntrTel: encontrarColuna(headerNormalizado, 'hr_entr_veltec'),
  }
}

export const COLUNAS_OBRIGATORIAS = ['mapa', 'placa', 'data', 'hr_sai_2artq'] as const

export interface PlanilhaLida {
  header: string[]
  linhas: unknown[][]
  colunas: IndicesColunas
}

// Só abre o workbook e localiza as colunas — não converte linha a linha
// (isso fica em converterLinha, chamado em lotes pelo worker pra poder
// reportar progresso).
export function lerPlanilha(buffer: ArrayBuffer): PlanilhaLida {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, sheets: ['Base'] })
  const sheet = wb.Sheets['Base'] ?? wb.Sheets[wb.SheetNames[0]]
  const todasLinhas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][]
  const header = (todasLinhas[0] ?? []).map((c) => String(c ?? ''))
  const headerNormalizado = header.map(normalizarNome)
  const colunas = localizarColunas(headerNormalizado)

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => {
    if (c === 'mapa') return colunas.mapa === -1
    if (c === 'placa') return colunas.placa === -1
    if (c === 'data') return colunas.data === -1
    return colunas.hrSaiRot === -1
  })
  if (faltando.length > 0) {
    throw new Error(`Colunas obrigatórias não encontradas na aba "Base": ${faltando.join(', ')}`)
  }

  return { header, linhas: todasLinhas.slice(1), colunas }
}

export function converterLinha(row: unknown[], colunas: IndicesColunas, header: string[]): LinhaViagemImportada | null {
  const get = (idx: number): unknown => (idx === -1 ? null : row[idx])

  const saidaEm = parseDataHora(get(colunas.hrSaiRot))
  const data = parseData(get(colunas.data))
  if (!saidaEm || !data) return null // linha sem saída/data não forma chave natural válida — ignorada, não é "erro de dado"

  const kmRot = parseNumero(get(colunas.kmRoteirizador))
  const kmTel = parseNumero(get(colunas.kmTelemetria))
  const kmMax = parseNumero(get(colunas.kmMax))
  const ader = parseNumero(get(colunas.aderencia))
  const entradaValida = kmRot.valido && kmTel.valido && kmMax.valido && ader.valido

  const linhaOrigem: Record<string, unknown> = {}
  header.forEach((h, i) => { if (h) linhaOrigem[h] = row[i] ?? null })

  return {
    filial: '', // preenchido pelo chamador (importacao.ts) — não vem do arquivo
    data,
    mapa: (() => { const n = parseNumero(get(colunas.mapa)); return n.valor })(),
    placa: parseTexto(get(colunas.placa)),
    saidaEm,

    cddCodigo: parseTexto(get(colunas.codFilial)),
    cddNome: parseTexto(get(colunas.nomeCdd)),
    transportadora: parseTexto(get(colunas.transportadora)),
    regiao: parseTexto(get(colunas.geo)),

    tipoEntrega: parseTexto(get(colunas.entrega)),
    tipoCarga: parseTexto(get(colunas.cargaAtual)),
    tipoFrota: parseTexto(get(colunas.frota)),
    tipoCombustivel: parseTexto(get(colunas.tipoCombustivel)),
    classificacaoExtra: parseTexto(get(colunas.classificacaoExtra)),

    kmRoteirizador: kmRot.valor,
    kmTelemetria: kmTel.valor,
    kmMaximoOrigem: kmMax.valor,
    aderencia: ader.valor,

    mapaVirado: parseBooleanoFlag(get(colunas.mapaVirado)),
    entregaDMais1: parseBooleanoFlag(get(colunas.dMais1)),
    carregamentoRoteirizadorEm: parseDataHora(get(colunas.hrCarregRot)),
    carregamentoTelemetriaEm: parseDataHora(get(colunas.hrCarregTel)),
    saidaTelemetriaEm: parseDataHora(get(colunas.hrSaiTel)),
    entradaEm: parseDataHora(get(colunas.hrEntrRot)),
    entradaTelemetriaEm: parseDataHora(get(colunas.hrEntrTel)),

    entradaValida,
    linhaOrigem,
  }
}
