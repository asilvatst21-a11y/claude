import * as XLSX from 'xlsx'
import type { Colaborador } from '../types'

// Planilha oficial de colaboradores (LOG20/Promax). Detecção e parsing
// compartilhados entre a tela Colaboradores e o import de Jornada.

export function isColaboradoresFile(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return false
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hdr = (rows[0] ?? []).map(h => String(h).trim().toUpperCase())
  return hdr.includes('COLABORADOR') && hdr.includes('FUNCAO') && hdr.includes('EQUIPE')
}

// A planilha vem de um relatório de RH onde, sempre que um campo do meio da
// linha (ex.: "BATE PONTO?") fica vazio, a exportação PULA a célula em vez
// de deixá-la em branco — isso empurra todos os campos seguintes daquela
// linha uma (ou mais) coluna(s) pra esquerda. Em ~60% das linhas reais isso
// faz o e-mail cair na coluna "Celular", a data do exame cair em "E-mail",
// etc. Por isso telefone/e-mail não são lidos pela posição da coluna: cada
// linha é varrida numa janela de colunas ao redor de onde eles deveriam
// estar, e o conteúdo é classificado pelo formato (telefone = só dígitos,
// 10 a 13 caracteres; e-mail = contém "@"; datas são ignoradas).
function extrairTelefoneEmail(row: unknown[], centroAprox: number): { telefone: string | null; email: string | null } {
  let telefone: string | null = null
  let email: string | null = null
  for (let i = Math.max(0, centroAprox - 3); i <= centroAprox + 4 && i < row.length; i++) {
    const bruto = row[i]
    if (bruto == null) continue
    const s = String(bruto).trim()
    if (!s) continue
    if (s.includes('@')) { if (!email) email = s; continue }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) continue // data (ex.: exame admissional), ignora
    const digitos = s.replace(/\D/g, '')
    if (digitos.length >= 10 && digitos.length <= 13 && !telefone) telefone = digitos
  }
  return { telefone, email }
}

export type ColaboradorImportado = Omit<Colaborador, 'id' | 'created_at'> & { email?: string | null }

export function parseColaboradores(buffer: ArrayBuffer, filial: string): ColaboradorImportado[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hdr = (rows[0] ?? []).map(h => String(h).trim().toUpperCase())
  const col = (name: string) => hdr.indexOf(name)
  const iMat = col('MATR'), iProm = col('PROMAX'), iNome = col('COLABORADOR'), iStatus = col('STATUS')
  const iProj = col('PROJETO'), iSub = col('SUBPROJETO'), iFunc = col('FUNCAO')
  const iEq = col('EQUIPE'), iCargo = col('CARGO AMBEV'), iCpf = col('CPF')
  // "TELEFONE" é o ponto de referência da janela de busca (ver comentário acima).
  const iTelRef = col('TELEFONE')

  const seen = new Set<string>()
  const out: ColaboradorImportado[] = []
  rows.slice(1).forEach(r => {
    const nome = String(r[iNome] ?? '').trim()
    if (!nome) return
    const key = nome.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const val = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() || null : null)
    const { telefone, email } = iTelRef >= 0 ? extrairTelefoneEmail(r, iTelRef) : { telefone: null, email: null }
    out.push({
      filial, nome,
      matricula:        val(iMat),
      matricula_promax:  val(iProm),
      status:     val(iStatus),
      projeto:    val(iProj),
      subprojeto: val(iSub),
      funcao:     val(iFunc),
      equipe:     val(iEq),
      cargo:      val(iCargo),
      cpf:        val(iCpf),
      telefone,
      email,
    })
  })
  return out
}
