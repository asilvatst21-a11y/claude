import * as XLSX from 'xlsx'
import { supabase } from './supabase'
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
// Aceita 'yyyy-mm-dd...' (serial de data já convertido pelo XLSX) ou
// 'dd/mm/aaaa' / 'dd/mm/aa'. Mesma lógica usada no import de GSDPQ
// (src/pages/Gsdpq.tsx) — mantida aqui separada porque um é import de
// planilha bruta (header por índice) e o outro por objeto.
function parseDataAdmissao(s: string): string | null {
  const v = (s ?? '').trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

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
  const iAdmissao = [col('DATA_ADMISSAO'), col('DATA ADMISSAO'), col('DT ADMISSAO'), col('ADMISSAO')].find(i => i >= 0) ?? -1

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
      data_admissao: iAdmissao >= 0 ? parseDataAdmissao(String(r[iAdmissao] ?? '')) : null,
      telefone,
      email,
    })
  })
  return out
}

export interface ResultadoImportacaoColaboradores {
  novos: number
  novosInseridos: ColaboradorImportado[]
  desligados: number
  mantidos: number
}

// Compartilhada entre a tela Colaboradores e o import de Jornada — importar
// a planilha NUNCA altera quem já está cadastrado e continua aparecendo
// nela (evita sobrescrever edição manual feita na tela). Só:
//  1) insere quem é realmente novo (não existia ainda pra essa filial);
//  2) marca como DESLIGADO quem estava TRABALHANDO mas sumiu da planilha
//     mais recente (não mexe em quem já tinha outro status manual, ex.:
//     Férias).
export async function importarColaboradores(
  filial: string, rows: ColaboradorImportado[],
): Promise<ResultadoImportacaoColaboradores> {
  const { data: existentes, error: eExistentes } = await supabase
    .from('colaboradores')
    .select('id, nome_norm, status, data_admissao')
    .eq('filial', filial)
  if (eExistentes) throw new Error(eExistentes.message)

  const normalizarNome = (s: string) => s.trim().toLowerCase()
  const nomesExistentes = new Set((existentes ?? []).map((c) => c.nome_norm))
  const nomesNaPlanilha = new Set(rows.map((r) => normalizarNome(r.nome)))

  const novos = rows.filter((r) => !nomesExistentes.has(normalizarNome(r.nome)))

  // Quem já está cadastrado mas ainda não tem data de admissão registrada
  // recebe o valor da planilha agora — só preenche o que está vazio, nunca
  // sobrescreve uma data já existente (evita mexer em ajuste manual feito na tela).
  const porNome = new Map(rows.map((r) => [normalizarNome(r.nome), r]))
  const semAdmissao = (existentes ?? []).filter((c) => !c.data_admissao && porNome.get(c.nome_norm)?.data_admissao)
  for (const c of semAdmissao) {
    const { error } = await supabase.from('colaboradores')
      .update({ data_admissao: porNome.get(c.nome_norm)!.data_admissao })
      .eq('id', c.id)
    if (error) throw new Error(error.message)
  }
  const CHUNK = 100
  for (let i = 0; i < novos.length; i += CHUNK) {
    const lote = novos.slice(i, i + CHUNK).map(({ email: _email, ...resto }) => resto)
    if (lote.length === 0) continue
    const { error } = await supabase.from('colaboradores').insert(lote)
    if (error) throw new Error(error.message)
  }

  const desligados = (existentes ?? []).filter((c) => c.status === 'TRABALHANDO' && !nomesNaPlanilha.has(c.nome_norm))
  if (desligados.length > 0) {
    const { error } = await supabase.from('colaboradores')
      .update({ status: 'DESLIGADO' })
      .in('id', desligados.map((c) => c.id))
    if (error) throw new Error(error.message)
  }

  return { novos: novos.length, novosInseridos: novos, desligados: desligados.length, mantidos: rows.length - novos.length }
}
