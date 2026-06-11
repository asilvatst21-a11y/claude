import * as XLSX from 'xlsx'

export interface ProntuarioRecord {
  situacao_empregado: string
  nome: string
  cpf: string
  cargo: string
  status_liberacao: string
  motivo_bloqueio: string
  pontuacao_ponderada: number
  faixa: string
  acidentes: number
  colisoes: number
  desvios_monitoramentos: number
  fadigas: number
  multas: number
  sancoes_disciplinares: number
  telemetria_pontuacao: number
}

export interface ProntuarioParseResult {
  records: ProntuarioRecord[]
  errors: string[]
}

function parsePortugueseDecimal(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  const str = String(value).trim().replace(',', '.')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function sumCols(row: unknown[], start: number, end: number): number {
  let total = 0
  for (let i = start; i <= end; i++) {
    total += parsePortugueseDecimal(row[i] ?? 0)
  }
  return total
}

export function parseProntuario(buffer: Buffer): ProntuarioParseResult {
  const records: ProntuarioRecord[] = []
  const errors: string[] = []

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    // Data rows start at index 4, row 3 = headers (but use index-based mapping)
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      if (!row || row.length === 0) continue

      // Skip rows where col[1] (nome) is empty
      const nome = row[1] ? String(row[1]).trim() : ''
      if (!nome) continue

      try {
        const statusRaw = row[8] ? String(row[8]).trim().toUpperCase() : ''
        const status_liberacao = statusRaw.includes('BLOQ') ? 'BLOQUEADO' : 'LIBERADO'

        records.push({
          situacao_empregado: row[0] ? String(row[0]).trim() : '',
          nome,
          cpf: row[4] ? String(row[4]).trim() : '',
          cargo: row[6] ? String(row[6]).trim() : '',
          status_liberacao,
          motivo_bloqueio: row[9] ? String(row[9]).trim() : '',
          pontuacao_ponderada: parsePortugueseDecimal(row[19]),
          faixa: row[20] ? String(row[20]).trim() : '',
          acidentes: sumCols(row, 22, 25),
          colisoes: sumCols(row, 26, 28),
          desvios_monitoramentos: sumCols(row, 29, 39),
          fadigas: sumCols(row, 40, 44),
          multas: sumCols(row, 45, 48),
          sancoes_disciplinares: sumCols(row, 51, 52),
          telemetria_pontuacao: parsePortugueseDecimal(row[57] ?? sumCols(row, 55, 63)),
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
