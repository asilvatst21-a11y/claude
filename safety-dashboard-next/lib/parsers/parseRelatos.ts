import * as XLSX from 'xlsx'

export interface ParsedRelato {
  pessoa_relatada: string
  matricula_relator: string
  relator: string
  data: string
  classificacao: string // ABORDAGEM POSITIVA | ATO INSEGURO
  tipo_relato: string
  detalhamento: string
  area: string
}

export interface RelatosResult {
  records: ParsedRelato[]
  errors: string[]
}

function parseDate(val: unknown): string {
  if (!val) return new Date().toISOString().split('T')[0]
  const s = String(val)
  // "29/05/2026 08:19"
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  return new Date().toISOString().split('T')[0]
}

export function parseRelatos(buffer: Buffer): RelatosResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][]

  const records: ParsedRelato[] = []
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r || !r[0]) continue

    const classificacao = String(r[9] || '').trim()
    // Only process ATO INSEGURO and ABORDAGEM POSITIVA
    if (classificacao !== 'ATO INSEGURO' && classificacao !== 'ABORDAGEM POSITIVA') continue

    const pessoa_relatada = String(r[17] || '').trim()
    if (!pessoa_relatada) {
      errors.push(`Linha ${i + 1}: PESSOA RELATADA vazia`)
      continue
    }

    records.push({
      pessoa_relatada,
      matricula_relator: String(r[5] || '').trim(),
      relator: String(r[6] || '').trim(),
      data: parseDate(r[1]),
      classificacao,
      tipo_relato: String(r[10] || '').trim(),
      detalhamento: String(r[18] || '').trim(),
      area: String(r[11] || '').trim(),
    })
  }

  return { records, errors }
}
