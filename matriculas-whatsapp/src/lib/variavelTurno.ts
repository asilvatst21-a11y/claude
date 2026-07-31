import { supabase } from './supabase'
import { formatarBRL } from './variavelArmazem'

// ── RV por atividade de turno — extensão da Variável do Armazém (pontuação
// → cluster) com um segundo mecanismo: atividades manuais com meta por
// turno, fechadas pelo conferente no fim do expediente. O valor final
// mensal é dividido pelos dias úteis (segunda a sábado) do mês corrente pra
// virar a cota diária de cada atividade. ──────────────────────────────────

export type TurnoTipoRegistro = 'manual' | 'upload'
export type TurnoUnidade = 'percentual' | 'reais' | 'numero' | 'ok_nok'
export type TurnoDirecao = 'maior_melhor' | 'menor_melhor'

export interface TurnoAtividade {
  id: string
  filial: string
  turno: string
  nome: string
  tipoRegistro: TurnoTipoRegistro
  unidade: TurnoUnidade
  direcao: TurnoDirecao | null
  metaValor: number | null
  valorFinalMensal: number
  colaboradorId: string | null
  colaboradorNome: string | null
  conferenteUsuarioId: string | null
  conferenteNome: string | null
  ativo: boolean
}

export interface TurnoRegistro {
  id: string
  atividadeId: string
  data: string
  valorNumero: number | null
  okNok: boolean | null
  bateuMeta: boolean
  valorGerado: number
  registradoPorNome: string | null
  registradoEm: string
}

function linhaParaAtividade(r: any): TurnoAtividade {
  return {
    id: r.id, filial: r.filial, turno: r.turno, nome: r.nome,
    tipoRegistro: r.tipo_registro, unidade: r.unidade, direcao: r.direcao,
    metaValor: r.meta_valor != null ? Number(r.meta_valor) : null,
    valorFinalMensal: Number(r.valor_final_mensal),
    colaboradorId: r.colaborador_id, colaboradorNome: r.colaborador_nome,
    conferenteUsuarioId: r.conferente_usuario_id, conferenteNome: r.conferente_nome,
    ativo: r.ativo,
  }
}

function linhaParaRegistro(r: any): TurnoRegistro {
  return {
    id: r.id, atividadeId: r.atividade_id, data: r.data,
    valorNumero: r.valor_numero != null ? Number(r.valor_numero) : null,
    okNok: r.ok_nok, bateuMeta: r.bateu_meta, valorGerado: Number(r.valor_gerado),
    registradoPorNome: r.registrado_por_nome, registradoEm: r.registrado_em,
  }
}

// Dias úteis (segunda a sábado) de um mês "yyyy-mm" — mesma régua já usada
// em Fechamento do Dia/Distribuição (domingo não é dia de operação normal).
// Cálculo em UTC explícito pra não depender do fuso do navegador.
export function diasUteisDoMes(mesISO: string): number {
  const [ano, mes] = mesISO.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  let dias = 0
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() !== 0) dias++
  }
  return dias
}

export function cotaDiaria(valorFinalMensal: number, dataISO: string): number {
  return valorFinalMensal / diasUteisDoMes(dataISO.slice(0, 7))
}

export async function listarAtividadesTurno(filial: string): Promise<TurnoAtividade[]> {
  const { data, error } = await supabase
    .from('variavel_turno_atividades')
    .select('*')
    .eq('filial', filial)
    .order('turno')
    .order('nome')
  if (error) { console.error('listarAtividadesTurno error:', error.message); return [] }
  return (data ?? []).map(linhaParaAtividade)
}

export async function salvarAtividadeTurno(atividade: {
  id?: string
  filial: string
  turno: string
  nome: string
  tipoRegistro: TurnoTipoRegistro
  unidade: TurnoUnidade
  direcao: TurnoDirecao | null
  metaValor: number | null
  valorFinalMensal: number
  colaboradorId: string | null
  colaboradorNome: string | null
  conferenteUsuarioId: string | null
  conferenteNome: string | null
}): Promise<{ error: string | null }> {
  const payload = {
    filial: atividade.filial, turno: atividade.turno, nome: atividade.nome,
    tipo_registro: atividade.tipoRegistro, unidade: atividade.unidade,
    direcao: atividade.unidade === 'ok_nok' ? null : atividade.direcao,
    meta_valor: atividade.unidade === 'ok_nok' ? null : atividade.metaValor,
    valor_final_mensal: atividade.valorFinalMensal,
    colaborador_id: atividade.colaboradorId, colaborador_nome: atividade.colaboradorNome,
    conferente_usuario_id: atividade.conferenteUsuarioId, conferente_nome: atividade.conferenteNome,
  }
  const { error } = atividade.id
    ? await supabase.from('variavel_turno_atividades').update(payload).eq('id', atividade.id)
    : await supabase.from('variavel_turno_atividades').insert(payload)
  return { error: error?.message ?? null }
}

export async function alternarAtivoAtividadeTurno(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('variavel_turno_atividades').update({ ativo }).eq('id', id)
  return { error: error?.message ?? null }
}

// Compara o resultado do turno com a meta da atividade, respeitando a
// direção (maior/menor melhor). OK/NOK não tem meta numérica — só considera
// "bateu" quando okNok === true.
export function bateuMetaAtividade(atividade: TurnoAtividade, valorNumero: number | null, okNok: boolean | null): boolean {
  if (atividade.unidade === 'ok_nok') return okNok === true
  if (valorNumero == null || atividade.metaValor == null) return false
  return atividade.direcao === 'menor_melhor' ? valorNumero <= atividade.metaValor : valorNumero >= atividade.metaValor
}

export interface AtividadeConferente extends TurnoAtividade {
  registroHoje: TurnoRegistro | null
}

// Atividades MANUAIS do conferente logado, pra tela de fechamento de turno
// — atividades tipo "upload" não entram aqui (seguem o fluxo de relatório
// de sempre, fora desse fechamento).
export async function listarAtividadesConferente(filial: string, conferenteUsuarioId: string, data: string): Promise<AtividadeConferente[]> {
  const { data: atividades, error } = await supabase
    .from('variavel_turno_atividades')
    .select('*')
    .eq('filial', filial)
    .eq('conferente_usuario_id', conferenteUsuarioId)
    .eq('tipo_registro', 'manual')
    .eq('ativo', true)
    .order('nome')
  if (error) { console.error('listarAtividadesConferente error:', error.message); return [] }
  const ids = (atividades ?? []).map((a) => a.id)
  const { data: registros } = ids.length > 0
    ? await supabase.from('variavel_turno_registros').select('*').in('atividade_id', ids).eq('data', data)
    : { data: [] }
  const registroPorAtividade = new Map((registros ?? []).map((r) => [r.atividade_id, linhaParaRegistro(r)]))
  return (atividades ?? []).map((a) => ({ ...linhaParaAtividade(a), registroHoje: registroPorAtividade.get(a.id) ?? null }))
}

export async function registrarAtividadeTurno(
  atividade: TurnoAtividade, data: string,
  entrada: { valorNumero: number | null; okNok: boolean | null },
  registradoPor: { usuarioId: string; nome: string | null },
): Promise<{ error: string | null; registro: TurnoRegistro | null }> {
  const bateu = bateuMetaAtividade(atividade, entrada.valorNumero, entrada.okNok)
  const payload = {
    atividade_id: atividade.id, filial: atividade.filial, data,
    valor_numero: entrada.valorNumero, ok_nok: entrada.okNok,
    bateu_meta: bateu, valor_gerado: bateu ? cotaDiaria(atividade.valorFinalMensal, data) : 0,
    registrado_por_usuario_id: registradoPor.usuarioId, registrado_por_nome: registradoPor.nome,
    registrado_em: new Date().toISOString(),
  }
  const { data: gravado, error } = await supabase
    .from('variavel_turno_registros')
    .upsert(payload, { onConflict: 'atividade_id,data' })
    .select('*')
    .maybeSingle()
  if (error) return { error: error.message, registro: null }
  return { error: null, registro: gravado ? linhaParaRegistro(gravado) : null }
}

export interface AcumuladoAtividadeDia {
  data: string
  atividadeNome: string
  valorNumero: number | null
  okNok: boolean | null
  bateuMeta: boolean
  valorGerado: number
}

export interface AcumuladoColaboradorMes {
  colaboradorNome: string
  mesISO: string
  totalGerado: number
  diasBatidos: number
  diasRegistrados: number
  cotaDiariaTotal: number
  atividades: { nome: string; turno: string }[]
  dias: AcumuladoAtividadeDia[]
}

// Mesma consulta, mas a partir do CPF (real, não mascarado) — é o que o
// totem público tem em mãos depois de identificar a pessoa, sem conhecer o
// id interno de armazem_colaboradores.
export async function buscarAcumuladoPorCpf(filial: string, cpfReal: string, mesISO: string): Promise<AcumuladoColaboradorMes | null> {
  const { data: colaborador } = await supabase
    .from('armazem_colaboradores')
    .select('id')
    .eq('filial', filial)
    .eq('cpf', cpfReal)
    .maybeSingle()
  if (!colaborador) return null
  return buscarAcumuladoColaboradorMes(filial, colaborador.id, mesISO)
}

// Acumulado do mês de um colaborador (ajudante) flegado como responsável de
// alguma atividade — usado na consulta pública (mesmo totem da Variável por
// pontuação, seção extra "por atividade").
export async function buscarAcumuladoColaboradorMes(filial: string, colaboradorId: string, mesISO: string): Promise<AcumuladoColaboradorMes | null> {
  const { data: atividades } = await supabase
    .from('variavel_turno_atividades')
    .select('id, nome, turno, colaborador_nome, valor_final_mensal')
    .eq('filial', filial)
    .eq('colaborador_id', colaboradorId)
    .eq('ativo', true)
  if (!atividades || atividades.length === 0) return null

  const nomePorAtividade = new Map(atividades.map((a) => [a.id, a.nome as string]))
  const [ano, mes] = mesISO.split('-').map(Number)
  const ini = `${mesISO}-01`
  const fim = `${mesISO}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`
  const { data: registros } = await supabase
    .from('variavel_turno_registros')
    .select('atividade_id, data, valor_numero, ok_nok, bateu_meta, valor_gerado')
    .in('atividade_id', atividades.map((a) => a.id))
    .gte('data', ini)
    .lte('data', fim)
    .order('data', { ascending: false })

  const dias: AcumuladoAtividadeDia[] = (registros ?? []).map((r) => ({
    data: r.data, atividadeNome: nomePorAtividade.get(r.atividade_id) ?? '—',
    valorNumero: r.valor_numero != null ? Number(r.valor_numero) : null,
    okNok: r.ok_nok, bateuMeta: r.bateu_meta, valorGerado: Number(r.valor_gerado),
  }))
  const totalGerado = dias.reduce((acc, d) => acc + d.valorGerado, 0)
  const hoje = new Date().toISOString().slice(0, 10)
  const cotaDiariaTotal = atividades.reduce((acc, a) => acc + cotaDiaria(Number(a.valor_final_mensal), hoje), 0)

  return {
    colaboradorNome: atividades[0].colaborador_nome ?? '—',
    mesISO, totalGerado,
    diasBatidos: dias.filter((d) => d.bateuMeta).length,
    diasRegistrados: new Set(dias.map((d) => d.data)).size,
    cotaDiariaTotal,
    atividades: atividades.map((a) => ({ nome: a.nome, turno: a.turno })),
    dias,
  }
}

export { formatarBRL }
