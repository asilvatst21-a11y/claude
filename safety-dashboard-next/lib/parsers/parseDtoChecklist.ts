import * as XLSX from 'xlsx'
import type { GsdpqItem, GsdpqRecord, ParseResult } from './parseGsdpq'

export type { GsdpqItem, GsdpqRecord, ParseResult }

function parseDate(value: unknown): Date {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    return new Date(parsed.y, parsed.m - 1, parsed.d)
  }
  if (typeof value === 'string' && value.trim()) {
    const parts = value.trim().split('/')
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
    }
  }
  return new Date()
}

export function parseDtoChecklist(buffer: Buffer): ParseResult {
  const records: GsdpqRecord[] = []
  const errors: string[] = []

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    if (rows.length < 2) {
      errors.push('Planilha vazia ou sem dados')
      return { records, errors }
    }

    const headers = rows[0] as unknown[]
    const itemHeaders = headers.slice(13).map(h => (h ? String(h).trim() : ''))

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      if (!row || row.length === 0) continue

      const colaboradorNome = row[5] ? String(row[5]).trim() : ''
      if (!colaboradorNome) continue

      try {
        const itens: GsdpqItem[] = []
        for (let j = 13; j < row.length; j++) {
          const itemName = itemHeaders[j - 13]
          if (!itemName) continue
          const valor = row[j] ? String(row[j]).trim().toUpperCase() : ''
          if (valor) {
            itens.push({ nome: itemName, valor })
          }
        }

        records.push({
          matricula: row[2] ? String(row[2]).trim() : '',
          colaborador_nome: colaboradorNome,
          realizado_por: row[3] ? String(row[3]).trim() : '',
          tipo: row[0] ? String(row[0]).trim() : 'DTO',
          data: parseDate(row[9]),
          observacoes: row[12] ? String(row[12]).trim() : '',
          itens,
        })
      } catch (err) {
        errors.push(`Linha ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    errors.push(`Erro ao ler arquivo: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { records, errors }
}
