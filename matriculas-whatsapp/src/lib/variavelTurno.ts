import { supabase } from './supabase'
import { formatarBRL } from './variavelArmazem'

// ── RV por atividade de turno — extensão da Variável do Armazém (pontuação
// → cluster) com um segundo mecanismo: atividades manuais com meta por
// turno, fechadas pelo conferente no fim do expediente. Uma atividade pode
// ter VÁRIOS colaboradores (ex.: EFC feita por vários ajudantes) — o
// registro do resultado é único por dia (é uma métrica de equipe), mas o
// valor final mensal continua individual: cada colaborador tem sua própria
// cota, dividida pelos dias úteis (segunda a sábado) do mês. ─────────────

// Colaboradores elegíveis a entrar numa atividade — vem do cadastro central
// de Colaboradores (Gente), não do cadastro específico da RV por pontuação
// (armazem_colaboradores). Só função/cargo condizente com atividade de
// armazém: Ajudante de Armazém ou Operador de Empilhadeira. `funcao` é
// texto livre importado de planilha de RH, daí o ILIKE em vez de um enum
// fixo (e o padrão solto, pra cobrir "AJUDANTE ARMAZEM" sem o "DE").
export interface ColaboradorElegivel { id: string; nome: string; funcao: string | null }

export async function listarColaboradoresElegiveis(filial: string): Promise<ColaboradorElegivel[]> {
  const { data, error } = await supabase
    .from('colaboradores')
    .select('id, nome, funcao, status')
    .eq('filial', filial)
    .or('funcao.ilike.%ajudante%armaz%,funcao.ilike.%operador%empilhadeira%')
    .order('nome')
  if (error) { console.error('listarColaboradoresElegiveis error:', error.message); return [] }
  return (data ?? []).filter((c) => c.status !== 'DESLIGADO').map((c) => ({ id: c.id, nome: c.nome, funcao: c.funcao }))
}

// 'manual' = conferente lança no fechamento do turno (kiosk); 'upload' =
// ainda por relatório, fora dessa tela; 'manual_admin' = lançado direto no
// painel (ex.: TMA, Eficiência de Carregamento) — diário e com suporte a
// lançamento retroativo, sem passar pela tela do conferente.
export type TurnoTipoRegistro = 'manual' | 'upload' | 'manual_admin'
export type TurnoUnidade = 'percentual' | 'reais' | 'numero' | 'ok_nok' | 'tempo'
export type TurnoDirecao = 'maior_melhor' | 'menor_melhor'

// Tempo é guardado em minutos (igual as outras unidades numéricas) — só a
// tela converte pra/de hh:mm.
export function minutosParaHHMM(minutos: number): string {
  const m = Math.round(minutos)
  const h = Math.floor(Math.abs(m) / 60)
  const min = Math.abs(m) % 60
  return `${m < 0 ? '-' : ''}${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function hhmmParaMinutos(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,3}):([0-5]?\d)$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export interface TurnoAtividade {
  id: string
  filial: string
  turno: string
  nome: string
  tipoRegistro: TurnoTipoRegistro
  unidade: TurnoUnidade
  direcao: TurnoDirecao | null
  metaValor: number | null
  conferenteUsuarioId: string | null
  conferenteNome: string | null
  // Quando true, cada colaborador lança o PRÓPRIO valor do dia (ex.: Quebra
  // TA/TB/TC — a quebra de um não tem nada a ver com a do colega), em vez de
  // todos herdarem um valor único compartilhado do turno. Grava em
  // variavel_turno_registros_operador, uma tabela à parte — não mexe em nada
  // do fluxo/tabela das atividades "normais" (TMA, EFC etc.).
  porOperador: boolean
  ativo: boolean
}

export interface AtividadeColaborador {
  id: string
  atividadeId: string
  colaboradorId: string | null
  colaboradorNome: string
  valorFinalMensal: number
  ativo: boolean
}

export interface TurnoRegistro {
  id: string
  atividadeId: string
  data: string
  valorNumero: number | null
  okNok: boolean | null
  bateuMeta: boolean
  registradoPorNome: string | null
  registradoEm: string
}

function linhaParaAtividade(r: any): TurnoAtividade {
  return {
    id: r.id, filial: r.filial, turno: r.turno, nome: r.nome,
    tipoRegistro: r.tipo_registro, unidade: r.unidade, direcao: r.direcao,
    metaValor: r.meta_valor != null ? Number(r.meta_valor) : null,
    conferenteUsuarioId: r.conferente_usuario_id, conferenteNome: r.conferente_nome,
    porOperador: r.por_operador ?? false,
    ativo: r.ativo,
  }
}

function linhaParaColaboradorAtividade(r: any): AtividadeColaborador {
  return {
    id: r.id, atividadeId: r.atividade_id, colaboradorId: r.colaborador_id,
    colaboradorNome: r.colaborador_nome, valorFinalMensal: Number(r.valor_final_mensal), ativo: r.ativo,
  }
}

function linhaParaRegistro(r: any): TurnoRegistro {
  return {
    id: r.id, atividadeId: r.atividade_id, data: r.data,
    valorNumero: r.valor_numero != null ? Number(r.valor_numero) : null,
    okNok: r.ok_nok, bateuMeta: r.bateu_meta,
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

export async function listarColaboradoresDaAtividade(atividadeId: string): Promise<AtividadeColaborador[]> {
  const { data, error } = await supabase
    .from('variavel_turno_atividade_colaboradores')
    .select('*')
    .eq('atividade_id', atividadeId)
    .order('colaborador_nome')
  if (error) { console.error('listarColaboradoresDaAtividade error:', error.message); return [] }
  return (data ?? []).map(linhaParaColaboradorAtividade)
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
  conferenteUsuarioId: string | null
  conferenteNome: string | null
  porOperador: boolean
}): Promise<{ error: string | null; id: string | null }> {
  const payload = {
    filial: atividade.filial, turno: atividade.turno, nome: atividade.nome,
    tipo_registro: atividade.tipoRegistro, unidade: atividade.unidade,
    direcao: atividade.unidade === 'ok_nok' ? null : atividade.direcao,
    meta_valor: atividade.unidade === 'ok_nok' ? null : atividade.metaValor,
    conferente_usuario_id: atividade.conferenteUsuarioId, conferente_nome: atividade.conferenteNome,
    por_operador: atividade.porOperador,
  }
  if (atividade.id) {
    const { error } = await supabase.from('variavel_turno_atividades').update(payload).eq('id', atividade.id)
    return { error: error?.message ?? null, id: atividade.id }
  }
  const { data, error } = await supabase.from('variavel_turno_atividades').insert(payload).select('id').maybeSingle()
  return { error: error?.message ?? null, id: data?.id ?? null }
}

export async function alternarAtivoAtividadeTurno(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('variavel_turno_atividades').update({ ativo }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function salvarColaboradorAtividade(colab: {
  id?: string
  atividadeId: string
  colaboradorId: string
  colaboradorNome: string
  valorFinalMensal: number
}): Promise<{ error: string | null }> {
  const payload = {
    atividade_id: colab.atividadeId, colaborador_id: colab.colaboradorId,
    colaborador_nome: colab.colaboradorNome, valor_final_mensal: colab.valorFinalMensal,
  }
  const { error } = colab.id
    ? await supabase.from('variavel_turno_atividade_colaboradores').update(payload).eq('id', colab.id)
    : await supabase.from('variavel_turno_atividade_colaboradores').upsert(payload, { onConflict: 'atividade_id,colaborador_id' })
  return { error: error?.message ?? null }
}

export async function alternarAtivoColaboradorAtividade(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('variavel_turno_atividade_colaboradores').update({ ativo }).eq('id', id)
  return { error: error?.message ?? null }
}

// ── Equipe de presença do conferente — lista fixa selecionada por quem
// cadastra o login dele na aba Armazém. É separada de "colaboradores da
// atividade" porque a presença é do TURNO (afeta todo mundo do turno, não
// só quem está numa atividade específica) e nem toda atividade tem meta
// vinculada a uma pessoa só. ────────────────────────────────────────────
export interface ConferenteEquipeMembro { id: string; colaboradorId: string | null; colaboradorNome: string; ativo: boolean }

export async function listarEquipeConferente(conferenteUsuarioId: string): Promise<ConferenteEquipeMembro[]> {
  const { data, error } = await supabase
    .from('variavel_turno_conferente_equipe')
    .select('id, colaborador_id, colaborador_nome, ativo')
    .eq('conferente_usuario_id', conferenteUsuarioId)
    .order('colaborador_nome')
  if (error) { console.error('listarEquipeConferente error:', error.message); return [] }
  return (data ?? []).map((r) => ({ id: r.id, colaboradorId: r.colaborador_id, colaboradorNome: r.colaborador_nome, ativo: r.ativo }))
}

export async function adicionarNaEquipeConferente(conferenteUsuarioId: string, colaboradorId: string, colaboradorNome: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('variavel_turno_conferente_equipe')
    .upsert({ conferente_usuario_id: conferenteUsuarioId, colaborador_id: colaboradorId, colaborador_nome: colaboradorNome, ativo: true }, { onConflict: 'conferente_usuario_id,colaborador_id' })
  return { error: error?.message ?? null }
}

export async function alternarAtivoEquipeConferente(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('variavel_turno_conferente_equipe').update({ ativo }).eq('id', id)
  return { error: error?.message ?? null }
}

export interface PresencaDia { colaboradorId: string | null; colaboradorNome: string; presente: boolean }

export async function buscarPresencaDoDia(conferenteUsuarioId: string, data: string): Promise<PresencaDia[]> {
  const { data: rows, error } = await supabase
    .from('variavel_turno_presencas')
    .select('colaborador_id, colaborador_nome, presente')
    .eq('conferente_usuario_id', conferenteUsuarioId)
    .eq('data', data)
  if (error) { console.error('buscarPresencaDoDia error:', error.message); return [] }
  return (rows ?? []).map((r) => ({ colaboradorId: r.colaborador_id, colaboradorNome: r.colaborador_nome, presente: r.presente }))
}

// Grava a presença do dia e, pra quem faltou, zera (retroativamente) os
// créditos já calculados naquele dia em TODAS as atividades — falta conta
// como perder o dia inteiro de RV, não só de uma atividade específica.
export async function registrarPresencasDoDia(
  conferenteUsuarioId: string, data: string, presencas: PresencaDia[],
): Promise<{ error: string | null }> {
  const payload = presencas.map((p) => ({
    conferente_usuario_id: conferenteUsuarioId, colaborador_id: p.colaboradorId,
    colaborador_nome: p.colaboradorNome, data, presente: p.presente, registrado_em: new Date().toISOString(),
  }))
  const { error } = await supabase.from('variavel_turno_presencas').upsert(payload, { onConflict: 'conferente_usuario_id,colaborador_id,data' })
  if (error) return { error: error.message }

  const ausentes = presencas.filter((p) => !p.presente && p.colaboradorId)
  for (const a of ausentes) {
    const { error: erroZerar } = await supabase
      .from('variavel_turno_creditos')
      .update({ valor_gerado: 0, ausente: true })
      .eq('colaborador_id', a.colaboradorId)
      .eq('data', data)
    if (erroZerar) return { error: erroZerar.message }
  }
  return { error: null }
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
  colaboradores: AtividadeColaborador[]
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
  const [{ data: registros }, { data: colaboradoresRaw }] = ids.length > 0
    ? await Promise.all([
      supabase.from('variavel_turno_registros').select('*').in('atividade_id', ids).eq('data', data),
      supabase.from('variavel_turno_atividade_colaboradores').select('*').in('atividade_id', ids).eq('ativo', true),
    ])
    : [{ data: [] }, { data: [] }]
  const registroPorAtividade = new Map((registros ?? []).map((r) => [r.atividade_id, linhaParaRegistro(r)]))
  const colaboradoresPorAtividade = new Map<string, AtividadeColaborador[]>()
  for (const c of colaboradoresRaw ?? []) {
    const lista = colaboradoresPorAtividade.get(c.atividade_id) ?? []
    lista.push(linhaParaColaboradorAtividade(c))
    colaboradoresPorAtividade.set(c.atividade_id, lista)
  }
  return (atividades ?? []).map((a) => ({
    ...linhaParaAtividade(a),
    colaboradores: colaboradoresPorAtividade.get(a.id) ?? [],
    registroHoje: registroPorAtividade.get(a.id) ?? null,
  }))
}

// Grava o resultado do dia (1 por atividade+data — métrica de equipe) e
// recalcula o crédito de CADA colaborador ativo da atividade (o valor final
// é individual, não dividido: todo mundo que bate a meta ganha a própria
// cota inteira). Reabrir e regravar o mesmo dia recalcula os créditos do
// zero, pra refletir mudanças de colaborador/valor entre um registro e outro.
export async function registrarAtividadeTurno(
  atividade: TurnoAtividade, colaboradores: AtividadeColaborador[], data: string,
  entrada: { valorNumero: number | null; okNok: boolean | null },
  registradoPor: { usuarioId: string; nome: string | null },
  // Colaboradores excluídos SÓ NESSE DIA/ATIVIDADE (não trabalhou, folga,
  // atestado etc.) — não recebem crédito mesmo que a meta tenha sido
  // batida. Diferente da ausência da lista de presença do conferente, que
  // zera o dia inteiro em todas as atividades; aqui é pontual, uma
  // atividade de cada vez.
  excluidosHoje: Set<string> = new Set(),
): Promise<{ error: string | null; registro: TurnoRegistro | null; creditos: { colaboradorNome: string; valorGerado: number }[] }> {
  const bateu = bateuMetaAtividade(atividade, entrada.valorNumero, entrada.okNok)
  const payload = {
    atividade_id: atividade.id, filial: atividade.filial, data,
    valor_numero: entrada.valorNumero, ok_nok: entrada.okNok,
    bateu_meta: bateu,
    registrado_por_usuario_id: registradoPor.usuarioId, registrado_por_nome: registradoPor.nome,
    registrado_em: new Date().toISOString(),
  }
  const { data: gravado, error } = await supabase
    .from('variavel_turno_registros')
    .upsert(payload, { onConflict: 'atividade_id,data' })
    .select('*')
    .maybeSingle()
  if (error) return { error: error.message, registro: null, creditos: [] }

  const ativos = colaboradores.filter((c) => c.ativo)
  const creditosPayload = ativos.map((c) => {
    const excluido = c.colaboradorId != null && excluidosHoje.has(c.colaboradorId)
    return {
      atividade_id: atividade.id, registro_id: gravado?.id ?? null, colaborador_id: c.colaboradorId,
      colaborador_nome: c.colaboradorNome, data,
      valor_gerado: excluido || !bateu ? 0 : cotaDiaria(c.valorFinalMensal, data),
      ausente: excluido,
    }
  })
  if (creditosPayload.length > 0) {
    const { error: erroCreditos } = await supabase
      .from('variavel_turno_creditos')
      .upsert(creditosPayload, { onConflict: 'atividade_id,colaborador_id,data' })
    if (erroCreditos) return { error: erroCreditos.message, registro: null, creditos: [] }
  }

  return {
    error: null, registro: gravado ? linhaParaRegistro(gravado) : null,
    creditos: creditosPayload.map((c) => ({ colaboradorNome: c.colaborador_nome, valorGerado: c.valor_gerado })),
  }
}

// ── Atividades "por operador" (ex.: Quebra TA/TB/TC) — cada colaborador
// lança o próprio valor do dia, em vez de herdar um valor único do turno.
// Grava numa tabela separada (variavel_turno_registros_operador), sem tocar
// em nada do fluxo das atividades normais. ──────────────────────────────

export interface RegistroOperador {
  colaboradorId: string | null
  valorNumero: number | null
  okNok: boolean | null
  bateuMeta: boolean
}

// Registros do mês de uma atividade "por operador" — Map<data, Map<colaboradorId, registro>>,
// pra tela de lançamento retroativo pré-preencher uma coluna por pessoa.
export async function listarRegistrosOperadorDoMes(atividadeId: string, mesISO: string): Promise<Map<string, Map<string, RegistroOperador>>> {
  const [ano, mes] = mesISO.split('-').map(Number)
  const ini = `${mesISO}-01`
  const fim = `${mesISO}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('variavel_turno_registros_operador')
    .select('*')
    .eq('atividade_id', atividadeId)
    .gte('data', ini)
    .lte('data', fim)
  if (error) { console.error('listarRegistrosOperadorDoMes error:', error.message); return new Map() }
  const porDia = new Map<string, Map<string, RegistroOperador>>()
  for (const r of data ?? []) {
    if (!r.colaborador_id) continue
    if (!porDia.has(r.data)) porDia.set(r.data, new Map())
    porDia.get(r.data)!.set(r.colaborador_id, {
      colaboradorId: r.colaborador_id,
      valorNumero: r.valor_numero != null ? Number(r.valor_numero) : null,
      okNok: r.ok_nok, bateuMeta: r.bateu_meta,
    })
  }
  return porDia
}

// Grava o valor de CADA colaborador nesse dia (um por pessoa, não um só
// compartilhado) e credita cada um a partir do próprio valor — quem não
// trabalhou (excluidosHoje) não entra, nem gera registro nem crédito.
export async function registrarAtividadeTurnoPorOperador(
  atividade: TurnoAtividade, colaboradores: AtividadeColaborador[], data: string,
  valoresPorColaborador: Map<string, { valorNumero: number | null; okNok: boolean | null }>,
  registradoPor: { usuarioId: string; nome: string | null },
  excluidosHoje: Set<string> = new Set(),
): Promise<{ error: string | null }> {
  const ativos = colaboradores.filter((c) => c.ativo && c.colaboradorId)
  const registrosPayload: any[] = []
  const creditosPayload: any[] = []

  for (const c of ativos) {
    const colaboradorId = c.colaboradorId as string
    const excluido = excluidosHoje.has(colaboradorId)
    if (excluido) {
      creditosPayload.push({
        atividade_id: atividade.id, registro_id: null, colaborador_id: colaboradorId,
        colaborador_nome: c.colaboradorNome, data, valor_gerado: 0, ausente: true,
      })
      continue
    }
    const entrada = valoresPorColaborador.get(colaboradorId)
    if (!entrada || (entrada.valorNumero == null && entrada.okNok == null)) continue // sem valor lançado pra essa pessoa nesse dia — não grava nada

    const bateu = bateuMetaAtividade(atividade, entrada.valorNumero, entrada.okNok)
    registrosPayload.push({
      atividade_id: atividade.id, filial: atividade.filial, colaborador_id: colaboradorId,
      colaborador_nome: c.colaboradorNome, data,
      valor_numero: entrada.valorNumero, ok_nok: entrada.okNok, bateu_meta: bateu,
      registrado_por_usuario_id: registradoPor.usuarioId, registrado_por_nome: registradoPor.nome,
      registrado_em: new Date().toISOString(),
    })
    creditosPayload.push({
      atividade_id: atividade.id, registro_id: null, colaborador_id: colaboradorId,
      colaborador_nome: c.colaboradorNome, data,
      valor_gerado: bateu ? cotaDiaria(c.valorFinalMensal, data) : 0, ausente: false,
    })
  }

  if (registrosPayload.length > 0) {
    const { error } = await supabase
      .from('variavel_turno_registros_operador')
      .upsert(registrosPayload, { onConflict: 'atividade_id,colaborador_id,data' })
    if (error) return { error: error.message }
  }
  if (creditosPayload.length > 0) {
    const { error } = await supabase
      .from('variavel_turno_creditos')
      .upsert(creditosPayload, { onConflict: 'atividade_id,colaborador_id,data' })
    if (error) return { error: error.message }
  }
  return { error: null }
}

// Registros já lançados de uma atividade num mês — pra tela de lançamento
// retroativo (admin escolhe a atividade + o mês, vê os dias com o que já
// foi preenchido e completa o que falta). Reaproveita registrarAtividadeTurno
// pra gravar cada dia — ele já aceita qualquer `data`, não só hoje.
export async function listarRegistrosDoMes(atividadeId: string, mesISO: string): Promise<Map<string, TurnoRegistro>> {
  const [ano, mes] = mesISO.split('-').map(Number)
  const ini = `${mesISO}-01`
  const fim = `${mesISO}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('variavel_turno_registros')
    .select('*')
    .eq('atividade_id', atividadeId)
    .gte('data', ini)
    .lte('data', fim)
  if (error) { console.error('listarRegistrosDoMes error:', error.message); return new Map() }
  return new Map((data ?? []).map((r) => [r.data as string, linhaParaRegistro(r)]))
}

// Formata o resultado bruto que o conferente lançou (não o valor de RV) —
// "resultado que o conferente colocou no fechamento", pra tela de consulta
// do ajudante.
export function formatarResultadoAtividade(unidade: TurnoUnidade, valorNumero: number | null, okNok: boolean | null): string {
  if (unidade === 'ok_nok') return okNok == null ? '—' : okNok ? 'OK' : 'NOK'
  if (valorNumero == null) return '—'
  if (unidade === 'tempo') return minutosParaHHMM(valorNumero)
  if (unidade === 'percentual') return `${valorNumero}%`
  if (unidade === 'reais') return formatarBRL(valorNumero)
  return String(valorNumero)
}

export interface AcumuladoAtividadeDia {
  data: string
  resultadoTexto: string
  valorGerado: number
  ausente: boolean
}

export interface AcumuladoPorAtividade {
  atividadeId: string
  atividadeNome: string
  turno: string
  totalGerado: number
  dias: AcumuladoAtividadeDia[]
}

export interface AcumuladoColaboradorMes {
  colaboradorNome: string
  mesISO: string
  totalGerado: number
  diasBatidos: number
  diasRegistrados: number
  cotaDiariaTotal: number
  porAtividade: AcumuladoPorAtividade[]
}

// Mesma consulta, mas a partir do CPF (real, não mascarado) — é o que o
// totem público tem em mãos depois de identificar a pessoa (via
// armazem_colaboradores, cadastro da RV por pontuação), sem conhecer o id
// do cadastro central de Colaboradores usado nas atividades de turno.
// Compara só os dígitos — o cadastro central nem sempre guarda o CPF já
// normalizado (sem pontuação) como o de armazem_colaboradores guarda.
export async function buscarAcumuladoPorCpf(filial: string, cpfReal: string, mesISO: string): Promise<AcumuladoColaboradorMes | null> {
  const digitos = cpfReal.replace(/\D/g, '')
  const { data: colaboradoresCadastro } = await supabase
    .from('colaboradores')
    .select('id, cpf')
    .eq('filial', filial)
    .not('cpf', 'is', null)
  const encontrado = (colaboradoresCadastro ?? []).find((c) => (c.cpf as string).replace(/\D/g, '') === digitos)
  if (!encontrado) return null
  return buscarAcumuladoColaboradorMes(filial, encontrado.id, mesISO)
}

// Fallback do totem quando a busca por pontuação (variavel_pontuacao) não
// acha nada — a pessoa pode estar flegada só na RV por atividade de turno,
// sem nunca ter tido pontuação lançada (nem precisa estar em
// armazem_colaboradores pra isso). Compara pelos 3 primeiros dígitos, igual
// a busca original, e só devolve quem realmente tem algum vínculo de
// atividade — senão o totem "encontraria" qualquer colaborador do cadastro
// central sem RV nenhuma pra mostrar.
export async function buscarColaboradoresTurnoPorPrefixoCpf(filial: string, prefixo: string): Promise<{ cpfReal: string; nome: string }[]> {
  const digitosPrefixo = prefixo.replace(/\D/g, '')
  if (digitosPrefixo.length < 3) return []
  const [{ data: colaboradoresCadastro }, { data: vinculos }] = await Promise.all([
    supabase.from('colaboradores').select('id, nome, cpf').eq('filial', filial).not('cpf', 'is', null),
    supabase.from('variavel_turno_atividade_colaboradores').select('colaborador_id').eq('ativo', true),
  ])
  const idsComVinculo = new Set((vinculos ?? []).map((v) => v.colaborador_id).filter(Boolean))
  return (colaboradoresCadastro ?? [])
    .filter((c) => idsComVinculo.has(c.id) && (c.cpf as string).replace(/\D/g, '').startsWith(digitosPrefixo))
    .map((c) => ({ cpfReal: (c.cpf as string).replace(/\D/g, ''), nome: c.nome as string }))
}

// Acumulado do mês de um colaborador flegado em alguma atividade de turno —
// usado na consulta pública (mesmo totem da Variável por pontuação, seção
// extra "por atividade"). Lê os créditos já calculados (variavel_turno_
// creditos), não recalcula nada aqui.
export async function buscarAcumuladoColaboradorMes(filial: string, colaboradorId: string, mesISO: string): Promise<AcumuladoColaboradorMes | null> {
  const { data: vinculosRaw } = await supabase
    .from('variavel_turno_atividade_colaboradores')
    .select('atividade_id, colaborador_nome, valor_final_mensal, ativo, variavel_turno_atividades(id, nome, turno, filial, unidade)')
    .eq('colaborador_id', colaboradorId)
  // Filtra pela filial no cliente — evita depender de sintaxe de filtro em
  // tabela aninhada (variavel_turno_atividades.filial), que muda conforme a
  // versão do PostgREST.
  const vinculos = (vinculosRaw ?? []).filter((v: any) => v.variavel_turno_atividades?.filial === filial)
  if (vinculos.length === 0) return null

  const atividadeMeta = new Map(vinculos.map((v: any) => [v.atividade_id, v.variavel_turno_atividades as { nome: string; turno: string; unidade: TurnoUnidade }]))
  const atividadeIds = vinculos.map((v: any) => v.atividade_id)
  const [ano, mes] = mesISO.split('-').map(Number)
  const ini = `${mesISO}-01`
  const fim = `${mesISO}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`
  const [{ data: creditos }, { data: registros }] = await Promise.all([
    supabase
      .from('variavel_turno_creditos')
      .select('atividade_id, data, valor_gerado, ausente')
      .eq('colaborador_id', colaboradorId)
      .in('atividade_id', atividadeIds)
      .gte('data', ini)
      .lte('data', fim)
      .order('data', { ascending: false }),
    supabase
      .from('variavel_turno_registros')
      .select('atividade_id, data, valor_numero, ok_nok')
      .in('atividade_id', atividadeIds)
      .gte('data', ini)
      .lte('data', fim),
  ])
  const registroPorChave = new Map((registros ?? []).map((r) => [`${r.atividade_id}|${r.data}`, r]))

  const porAtividadeMap = new Map<string, AcumuladoPorAtividade>()
  for (const c of creditos ?? []) {
    const meta = atividadeMeta.get(c.atividade_id)
    if (!meta) continue
    const entry: AcumuladoPorAtividade = porAtividadeMap.get(c.atividade_id) ?? { atividadeId: c.atividade_id, atividadeNome: meta.nome, turno: meta.turno, totalGerado: 0, dias: [] }
    const registro = registroPorChave.get(`${c.atividade_id}|${c.data}`)
    const resultadoTexto = c.ausente ? 'Ausente' : formatarResultadoAtividade(meta.unidade, registro?.valor_numero != null ? Number(registro.valor_numero) : null, registro?.ok_nok ?? null)
    entry.dias.push({ data: c.data, resultadoTexto, valorGerado: Number(c.valor_gerado), ausente: c.ausente })
    entry.totalGerado += Number(c.valor_gerado)
    porAtividadeMap.set(c.atividade_id, entry)
  }
  const porAtividade = [...porAtividadeMap.values()].sort((a, b) => a.atividadeNome.localeCompare(b.atividadeNome))

  const totalGerado = porAtividade.reduce((acc, a) => acc + a.totalGerado, 0)
  const todosDias = porAtividade.flatMap((a) => a.dias)
  const hoje = new Date().toISOString().slice(0, 10)
  const cotaDiariaTotal = vinculos
    .filter((v: any) => v.ativo)
    .reduce((acc: number, v: any) => acc + cotaDiaria(Number(v.valor_final_mensal), hoje), 0)

  return {
    colaboradorNome: (vinculos[0] as any).colaborador_nome ?? '—',
    mesISO, totalGerado,
    diasBatidos: todosDias.filter((d) => d.valorGerado > 0).length,
    diasRegistrados: new Set(todosDias.map((d) => d.data)).size,
    cotaDiariaTotal,
    porAtividade,
  }
}

export { formatarBRL }
