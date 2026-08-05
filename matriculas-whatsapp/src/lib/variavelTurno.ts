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
  // Quando true, não paga por dia batido — paga o valor final mensal CHEIO
  // se a MÉDIA da competência inteira (21→20) estiver dentro da meta, ou
  // ZERO se não estiver (ex.: TMA com meta 01:28: bate a média do período,
  // leva tudo; não bate, perde tudo). O crédito passa a ser um só por
  // competência (variavel_turno_creditos_acumulados), não mais por dia.
  metaAcumulada: boolean
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
    metaAcumulada: r.meta_acumulada ?? false,
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

// Competência da RV (21→20) a que uma data pertence — mesmo conceito de
// variavelArmazem.ts (RV por pontuação), replicado aqui pra não criar
// dependência cruzada entre os dois módulos de Variável. Ex.: 15/07 cai na
// competência de julho (21/06 a 20/07); 25/07 já cai na de agosto
// (21/07 a 20/08).
function rangeCompetenciaDeData(dataISO: string): { ini: string; fim: string } {
  const [anoData, mesData, diaData] = dataISO.split('-').map(Number)
  let ano = anoData, mes = mesData
  if (diaData >= 21) { mes += 1; if (mes > 12) { mes = 1; ano += 1 } }
  const anoIni = mes <= 1 ? ano - 1 : ano
  const mesIni = mes <= 1 ? 12 : mes - 1
  return { ini: `${anoIni}-${String(mesIni).padStart(2, '0')}-21`, fim: `${ano}-${String(mes).padStart(2, '0')}-20` }
}

// Dias úteis (domingo fora) dentro de um período ini→fim, inclusive —
// usado pra dividir a cota diária pelo tamanho real da competência (21→20),
// em vez do mês calendário, que quase nunca bate com essa janela.
function diasUteisNoPeriodo(ini: string, fim: string): number {
  let dias = 0
  const cursor = new Date(`${ini}T00:00:00Z`)
  const fimData = new Date(`${fim}T00:00:00Z`)
  while (cursor <= fimData) {
    if (cursor.getUTCDay() !== 0) dias++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dias
}

// Valor gerado por dia batido: valor final mensal ÷ dias úteis da
// COMPETÊNCIA (21→20) a que a data pertence — não do mês calendário. Assim,
// batendo a meta em todo dia útil do período, a soma fecha exatamente nos
// 100% do valor cadastrado, do jeito que a RV por atividade é vendida pro
// colaborador (igual ao período que a RV por pontuação já usa).
export function cotaDiaria(valorFinalMensal: number, dataISO: string): number {
  const { ini, fim } = rangeCompetenciaDeData(dataISO)
  return valorFinalMensal / diasUteisNoPeriodo(ini, fim)
}

// Agrupa itens com `data` pela competência (21→20) a que cada um pertence —
// usado pra recalcular o crédito de meta acumulada de uma vez só pra TODAS
// as competências já lançadas de uma atividade (histórico incluso), não só
// a do dia que acabou de ser gravado.
function agruparPorCompetencia<T extends { data: string }>(itens: T[]): Map<string, { ini: string; fim: string; itens: T[] }> {
  const grupos = new Map<string, { ini: string; fim: string; itens: T[] }>()
  for (const item of itens) {
    const { ini, fim } = rangeCompetenciaDeData(item.data)
    const grupo = grupos.get(ini) ?? { ini, fim, itens: [] }
    grupo.itens.push(item)
    grupos.set(ini, grupo)
  }
  return grupos
}

// Meta acumulada: compara a MÉDIA dos resultados do período com a meta da
// atividade (mesma direção maior/menor melhor da meta diária). OK/NOK não
// tem média — a meta acumulada de um OK/NOK exige que TODOS os dias do
// período tenham sido OK.
export function bateuMetaAcumulada(atividade: TurnoAtividade, registros: { valorNumero: number | null; okNok: boolean | null }[]): boolean {
  if (registros.length === 0) return false
  if (atividade.unidade === 'ok_nok') return registros.every((r) => r.okNok === true)
  const validos = registros.map((r) => r.valorNumero).filter((v): v is number => v != null)
  if (validos.length === 0 || atividade.metaValor == null) return false
  const media = validos.reduce((acc, v) => acc + v, 0) / validos.length
  return atividade.direcao === 'menor_melhor' ? media <= atividade.metaValor : media >= atividade.metaValor
}

// Recalcula o crédito de TODAS as competências já lançadas de uma atividade
// de meta acumulada — chamado toda vez que um dia é (re)lançado ou um
// colaborador é vinculado/desvinculado, porque a média (e portanto o
// bateu/não bateu) do período pode mudar com qualquer dado novo. Grava um
// crédito só por colaborador por competência (cheio ou zero), substituindo
// a cota diária de variavel_turno_creditos.
export async function recalcularAcumuladoAtividade(atividade: TurnoAtividade): Promise<void> {
  if (!atividade.metaAcumulada) return
  const colaboradores = await listarColaboradoresDaAtividade(atividade.id)
  if (colaboradores.length === 0) return

  const payload: any[] = []

  if (atividade.porOperador) {
    const { data: registros } = await supabase
      .from('variavel_turno_registros_operador')
      .select('colaborador_id, data, valor_numero, ok_nok')
      .eq('atividade_id', atividade.id)
    const porColaborador = new Map<string, { data: string; valorNumero: number | null; okNok: boolean | null }[]>()
    for (const r of registros ?? []) {
      if (!r.colaborador_id) continue
      const lista = porColaborador.get(r.colaborador_id) ?? []
      lista.push({ data: r.data, valorNumero: r.valor_numero != null ? Number(r.valor_numero) : null, okNok: r.ok_nok })
      porColaborador.set(r.colaborador_id, lista)
    }
    for (const c of colaboradores) {
      if (!c.colaboradorId) continue
      const porCompetencia = agruparPorCompetencia(porColaborador.get(c.colaboradorId) ?? [])
      for (const { ini, fim, itens } of porCompetencia.values()) {
        const bateu = bateuMetaAcumulada(atividade, itens)
        payload.push({
          atividade_id: atividade.id, colaborador_id: c.colaboradorId, colaborador_nome: c.colaboradorNome,
          competencia_ini: ini, competencia_fim: fim, bateu, valor_gerado: bateu ? c.valorFinalMensal : 0,
          atualizado_em: new Date().toISOString(),
        })
      }
    }
  } else {
    const { data: registros } = await supabase
      .from('variavel_turno_registros')
      .select('data, valor_numero, ok_nok')
      .eq('atividade_id', atividade.id)
    const itens = (registros ?? []).map((r) => ({
      data: r.data as string, valorNumero: r.valor_numero != null ? Number(r.valor_numero) : null, okNok: r.ok_nok as boolean | null,
    }))
    const porCompetencia = agruparPorCompetencia(itens)
    for (const { ini, fim, itens: itensDaCompetencia } of porCompetencia.values()) {
      const bateu = bateuMetaAcumulada(atividade, itensDaCompetencia)
      for (const c of colaboradores) {
        payload.push({
          atividade_id: atividade.id, colaborador_id: c.colaboradorId, colaborador_nome: c.colaboradorNome,
          competencia_ini: ini, competencia_fim: fim, bateu, valor_gerado: bateu ? c.valorFinalMensal : 0,
          atualizado_em: new Date().toISOString(),
        })
      }
    }
  }

  if (payload.length > 0) {
    const { error } = await supabase.from('variavel_turno_creditos_acumulados').upsert(payload, { onConflict: 'atividade_id,colaborador_id,competencia_ini' })
    if (error) console.error('recalcularAcumuladoAtividade error:', error.message)
  }
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
  metaAcumulada: boolean
}): Promise<{ error: string | null; id: string | null }> {
  const payload = {
    filial: atividade.filial, turno: atividade.turno, nome: atividade.nome,
    tipo_registro: atividade.tipoRegistro, unidade: atividade.unidade,
    direcao: atividade.unidade === 'ok_nok' ? null : atividade.direcao,
    meta_valor: atividade.unidade === 'ok_nok' ? null : atividade.metaValor,
    conferente_usuario_id: atividade.conferenteUsuarioId, conferente_nome: atividade.conferenteNome,
    por_operador: atividade.porOperador,
    meta_acumulada: atividade.metaAcumulada,
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

// Preenche o crédito retroativo de um colaborador numa atividade "por
// turno" (registro compartilhado — variavel_turno_registros, um só por
// dia pra todo mundo da atividade) pros dias que já foram lançados ANTES
// de ele ter sido vinculado — sem isso, o dia já teria "bateu/não bateu"
// registrado, mas ninguém gerava crédito pra essa pessoa porque ela ainda
// não existia na lista de colaboradores da atividade na hora do registro.
// Não se aplica a atividades "por operador" (cada um lança o próprio
// valor): lá não tem o que preencher retroativamente, ninguém podia ter
// lançado o valor de alguém que ainda não estava vinculado.
export async function preencherCreditosRetroativos(
  atividadeId: string, colaboradorId: string, colaboradorNome: string, valorFinalMensal: number,
): Promise<number> {
  const { data: ativRow } = await supabase.from('variavel_turno_atividades').select('*').eq('id', atividadeId).maybeSingle()
  if (ativRow?.meta_acumulada) {
    // Meta acumulada não tem "dia preenchido retroativamente" — o vínculo
    // novo entra direto no recálculo da média de todas as competências já
    // lançadas dessa atividade.
    await recalcularAcumuladoAtividade(linhaParaAtividade(ativRow))
    return 0
  }

  const [{ data: registros }, { data: creditosExistentes }] = await Promise.all([
    supabase.from('variavel_turno_registros').select('id, data, bateu_meta').eq('atividade_id', atividadeId),
    supabase.from('variavel_turno_creditos').select('data').eq('atividade_id', atividadeId).eq('colaborador_id', colaboradorId),
  ])
  if (!registros || registros.length === 0) return 0
  const datasComCredito = new Set((creditosExistentes ?? []).map((c) => c.data))
  const faltantes = registros.filter((r) => !datasComCredito.has(r.data))
  if (faltantes.length === 0) return 0

  const payload = faltantes.map((r) => ({
    atividade_id: atividadeId, registro_id: r.id, colaborador_id: colaboradorId, colaborador_nome: colaboradorNome,
    data: r.data, valor_gerado: r.bateu_meta ? cotaDiaria(valorFinalMensal, r.data) : 0, ausente: false,
  }))
  const { error } = await supabase.from('variavel_turno_creditos').upsert(payload, { onConflict: 'atividade_id,colaborador_id,data' })
  if (error) { console.error('preencherCreditosRetroativos error:', error.message); return 0 }
  return payload.length
}

export async function salvarColaboradorAtividade(colab: {
  id?: string
  atividadeId: string
  colaboradorId: string
  colaboradorNome: string
  valorFinalMensal: number
}): Promise<{ error: string | null; diasPreenchidos?: number }> {
  const ehNovoVinculo = !colab.id
  const payload = {
    atividade_id: colab.atividadeId, colaborador_id: colab.colaboradorId,
    colaborador_nome: colab.colaboradorNome, valor_final_mensal: colab.valorFinalMensal,
  }
  const { error } = colab.id
    ? await supabase.from('variavel_turno_atividade_colaboradores').update(payload).eq('id', colab.id)
    : await supabase.from('variavel_turno_atividade_colaboradores').upsert(payload, { onConflict: 'atividade_id,colaborador_id' })
  if (error) return { error: error.message }
  if (!ehNovoVinculo) return { error: null }

  const diasPreenchidos = await preencherCreditosRetroativos(colab.atividadeId, colab.colaboradorId, colab.colaboradorNome, colab.valorFinalMensal)
  return { error: null, diasPreenchidos }
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

  if (atividade.metaAcumulada) {
    await recalcularAcumuladoAtividade(atividade)
    return { error: null, registro: gravado ? linhaParaRegistro(gravado) : null, creditos: [] }
  }

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
      if (!atividade.metaAcumulada) {
        creditosPayload.push({
          atividade_id: atividade.id, registro_id: null, colaborador_id: colaboradorId,
          colaborador_nome: c.colaboradorNome, data, valor_gerado: 0, ausente: true,
        })
      }
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
    if (!atividade.metaAcumulada) {
      creditosPayload.push({
        atividade_id: atividade.id, registro_id: null, colaborador_id: colaboradorId,
        colaborador_nome: c.colaboradorNome, data,
        valor_gerado: bateu ? cotaDiaria(c.valorFinalMensal, data) : 0, ausente: false,
      })
    }
  }

  if (registrosPayload.length > 0) {
    const { error } = await supabase
      .from('variavel_turno_registros_operador')
      .upsert(registrosPayload, { onConflict: 'atividade_id,colaborador_id,data' })
    if (error) return { error: error.message }
  }
  if (atividade.metaAcumulada) {
    await recalcularAcumuladoAtividade(atividade)
    return { error: null }
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
  // Bateu a meta NAQUELE dia — usado pra colorir vermelho/verde o indicador
  // diário, independente de valorGerado (que em meta acumulada é sempre 0,
  // já que o pagamento não varia dia a dia).
  bateuDia: boolean
}

export interface AcumuladoPorAtividade {
  atividadeId: string
  atividadeNome: string
  turno: string
  metaAcumulada: boolean
  totalGerado: number
  dias: AcumuladoAtividadeDia[]
}

export interface AcumuladoColaboradorMes {
  colaboradorNome: string
  ini: string
  fim: string
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
// `ini`/`fim` é o mesmo período da competência (21→20) usada na RV por
// pontuação — pra RV por atividade seguir a mesma janela ao trocar de mês.
export async function buscarAcumuladoPorCpf(filial: string, cpfReal: string, ini: string, fim: string): Promise<AcumuladoColaboradorMes | null> {
  const digitos = cpfReal.replace(/\D/g, '')
  const { data: colaboradoresCadastro } = await supabase
    .from('colaboradores')
    .select('id, cpf')
    .eq('filial', filial)
    .not('cpf', 'is', null)
  const encontrado = (colaboradoresCadastro ?? []).find((c) => (c.cpf as string).replace(/\D/g, '') === digitos)
  if (!encontrado) return null
  return buscarAcumuladoColaboradorPeriodo(filial, encontrado.id, ini, fim)
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

// Existe vínculo ativo de RV por atividade pra esse CPF? Usado no totem pra
// decidir se mostra a aba "RV por atividade" — independe de ter crédito na
// competência selecionada (o vínculo pode existir com o mês sem nada
// gerado ainda; a aba continua fazendo sentido).
export async function temVinculoAtividadeAtivo(filial: string, cpfReal: string): Promise<boolean> {
  const digitos = cpfReal.replace(/\D/g, '')
  const { data: colaboradoresCadastro } = await supabase
    .from('colaboradores').select('id, cpf').eq('filial', filial).not('cpf', 'is', null)
  const encontrado = (colaboradoresCadastro ?? []).find((c) => (c.cpf as string).replace(/\D/g, '') === digitos)
  if (!encontrado) return false
  const { data: vinculos } = await supabase
    .from('variavel_turno_atividade_colaboradores')
    .select('ativo, variavel_turno_atividades(filial)')
    .eq('colaborador_id', encontrado.id)
    .eq('ativo', true)
  return (vinculos ?? []).some((v: any) => v.variavel_turno_atividades?.filial === filial)
}

// Acumulado por atividade de turno de um colaborador, no PERÍODO informado
// — usado na consulta pública (mesmo totem da Variável por pontuação,
// seção extra "por atividade"). `ini`/`fim` é o mesmo período (21→20) da
// competência selecionada ali, pra RV por atividade seguir o mesmo
// padrão/janela da RV por pontuação em vez de ficar presa ao mês calendário
// atual. Lê os créditos já calculados (variavel_turno_creditos), não
// recalcula nada aqui.
export async function buscarAcumuladoColaboradorPeriodo(filial: string, colaboradorId: string, ini: string, fim: string): Promise<AcumuladoColaboradorMes | null> {
  const { data: vinculosRaw } = await supabase
    .from('variavel_turno_atividade_colaboradores')
    .select('atividade_id, colaborador_nome, valor_final_mensal, ativo, variavel_turno_atividades(id, nome, turno, filial, unidade, ativo, meta_valor, direcao, meta_acumulada, por_operador)')
    .eq('colaborador_id', colaboradorId)
  // Filtra pela filial no cliente — evita depender de sintaxe de filtro em
  // tabela aninhada (variavel_turno_atividades.filial), que muda conforme a
  // versão do PostgREST. Também tira quem tem o VÍNCULO desativado ou a
  // ATIVIDADE em si desativada — sem isso, uma atividade desligada
  // continuava aparecendo (e somando) no totem com o crédito antigo.
  const vinculos = (vinculosRaw ?? []).filter((v: any) =>
    v.variavel_turno_atividades?.filial === filial && v.ativo && v.variavel_turno_atividades?.ativo !== false
  )
  if (vinculos.length === 0) return null

  type MetaAtividade = { nome: string; turno: string; unidade: TurnoUnidade; metaValor: number | null; direcao: TurnoDirecao | null; metaAcumulada: boolean; porOperador: boolean }
  const atividadeMeta = new Map<string, MetaAtividade>(vinculos.map((v: any) => {
    const raw = v.variavel_turno_atividades
    return [v.atividade_id, {
      nome: raw?.nome, turno: raw?.turno, unidade: raw?.unidade,
      metaValor: raw?.meta_valor != null ? Number(raw.meta_valor) : null,
      direcao: raw?.direcao ?? null,
      metaAcumulada: raw?.meta_acumulada ?? false,
      porOperador: raw?.por_operador ?? false,
    } as MetaAtividade]
  }))
  const atividadeIds = vinculos.map((v: any) => v.atividade_id)
  const idsNormais = atividadeIds.filter((id) => !atividadeMeta.get(id)?.metaAcumulada)
  const idsAcumulados = atividadeIds.filter((id) => atividadeMeta.get(id)?.metaAcumulada)
  const idsAcumuladosOperador = idsAcumulados.filter((id) => atividadeMeta.get(id)?.porOperador)

  const [{ data: creditos }, { data: registrosEquipe }, { data: registrosOperador }, { data: creditosAcumulados }] = await Promise.all([
    idsNormais.length > 0
      ? supabase.from('variavel_turno_creditos').select('atividade_id, data, valor_gerado, ausente')
        .eq('colaborador_id', colaboradorId).in('atividade_id', idsNormais).gte('data', ini).lte('data', fim).order('data', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    atividadeIds.length > 0
      ? supabase.from('variavel_turno_registros').select('atividade_id, data, valor_numero, ok_nok')
        .in('atividade_id', atividadeIds).gte('data', ini).lte('data', fim)
      : Promise.resolve({ data: [] as any[] }),
    idsAcumuladosOperador.length > 0
      ? supabase.from('variavel_turno_registros_operador').select('atividade_id, data, valor_numero, ok_nok')
        .eq('colaborador_id', colaboradorId).in('atividade_id', idsAcumuladosOperador).gte('data', ini).lte('data', fim)
      : Promise.resolve({ data: [] as any[] }),
    idsAcumulados.length > 0
      ? supabase.from('variavel_turno_creditos_acumulados').select('atividade_id, bateu, valor_gerado')
        .eq('colaborador_id', colaboradorId).in('atividade_id', idsAcumulados).eq('competencia_ini', ini)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const registroPorChave = new Map((registrosEquipe ?? []).map((r) => [`${r.atividade_id}|${r.data}`, r]))
  const creditoAcumuladoPorAtividade = new Map((creditosAcumulados ?? []).map((c: any) => [c.atividade_id, c]))

  const porAtividadeMap = new Map<string, AcumuladoPorAtividade>()

  // Atividades normais — crédito por dia já calculado (cota diária).
  for (const c of creditos ?? []) {
    const meta = atividadeMeta.get(c.atividade_id)
    if (!meta) continue
    const entry: AcumuladoPorAtividade = porAtividadeMap.get(c.atividade_id) ?? { atividadeId: c.atividade_id, atividadeNome: meta.nome, turno: meta.turno, metaAcumulada: false, totalGerado: 0, dias: [] }
    const registro = registroPorChave.get(`${c.atividade_id}|${c.data}`)
    const resultadoTexto = c.ausente ? 'Ausente' : formatarResultadoAtividade(meta.unidade, registro?.valor_numero != null ? Number(registro.valor_numero) : null, registro?.ok_nok ?? null)
    entry.dias.push({ data: c.data, resultadoTexto, valorGerado: Number(c.valor_gerado), ausente: c.ausente, bateuDia: !c.ausente && Number(c.valor_gerado) > 0 })
    entry.totalGerado += Number(c.valor_gerado)
    porAtividadeMap.set(c.atividade_id, entry)
  }

  // Atividades de meta acumulada — um valor só (cheio ou zero) pra
  // competência inteira; cada dia só mostra o indicador (vermelho se
  // aquele dia específico não bateu a própria meta), sem R$ que varie.
  for (const atividadeId of idsAcumulados) {
    const meta = atividadeMeta.get(atividadeId)
    if (!meta) continue
    const registrosDaAtividade = meta.porOperador
      ? (registrosOperador ?? []).filter((r) => r.atividade_id === atividadeId)
      : (registrosEquipe ?? []).filter((r) => r.atividade_id === atividadeId)
    if (registrosDaAtividade.length === 0) continue
    const creditoAcumulado = creditoAcumuladoPorAtividade.get(atividadeId)
    const metaComoAtividade = { unidade: meta.unidade, metaValor: meta.metaValor, direcao: meta.direcao } as TurnoAtividade
    porAtividadeMap.set(atividadeId, {
      atividadeId, atividadeNome: meta.nome, turno: meta.turno, metaAcumulada: true,
      totalGerado: creditoAcumulado ? Number(creditoAcumulado.valor_gerado) : 0,
      dias: registrosDaAtividade
        .slice()
        .sort((a, b) => (a.data < b.data ? 1 : -1))
        .map((r) => {
          const valorNumero = r.valor_numero != null ? Number(r.valor_numero) : null
          return {
            data: r.data, resultadoTexto: formatarResultadoAtividade(meta.unidade, valorNumero, r.ok_nok),
            valorGerado: 0, ausente: false, bateuDia: bateuMetaAtividade(metaComoAtividade, valorNumero, r.ok_nok),
          }
        }),
    })
  }

  const porAtividade = [...porAtividadeMap.values()].sort((a, b) => a.atividadeNome.localeCompare(b.atividadeNome))

  const totalGerado = porAtividade.reduce((acc, a) => acc + a.totalGerado, 0)
  const todosDias = porAtividade.flatMap((a) => a.dias)
  // Cota diária de referência: mês em que a competência termina (fim da
  // janela 21→20), não "hoje" — senão trocar pra uma competência passada
  // continuaria mostrando a cota do mês atual. Não se aplica a meta
  // acumulada (não tem cota diária — é tudo ou nada no período).
  const cotaDiariaTotal = vinculos
    .filter((v: any) => v.ativo && !atividadeMeta.get(v.atividade_id)?.metaAcumulada)
    .reduce((acc: number, v: any) => acc + cotaDiaria(Number(v.valor_final_mensal), fim), 0)

  return {
    colaboradorNome: (vinculos[0] as any).colaborador_nome ?? '—',
    ini, fim, totalGerado,
    // Conta dia (data única), não linha — quem tem 3 atividades no mesmo dia
    // não pode contar como "3 dias batidos" só porque bateu nas 3.
    diasBatidos: new Set(todosDias.filter((d) => d.bateuDia).map((d) => d.data)).size,
    diasRegistrados: new Set(todosDias.map((d) => d.data)).size,
    cotaDiariaTotal,
    porAtividade,
  }
}

// ── Turno do conferente + horário de fechamento — base do futuro aviso via
// WhatsApp lembrando o conferente de lançar as atividades do dia. ──────────

export const TURNOS_CONFERENTE = ['TA', 'TB', 'TC'] as const
export type TurnoConferente = typeof TURNOS_CONFERENTE[number]
export const TURNO_CONFERENTE_LABEL: Record<TurnoConferente, string> = { TA: 'Turno A', TB: 'Turno B', TC: 'Turno C' }

export interface HorarioFechamentoTurno {
  id: string
  filial: string
  turno: string
  horarioFechamento: string // "HH:MM:SS" (coluna TIME do Postgres)
}

export async function listarHorariosFechamento(filial: string): Promise<HorarioFechamentoTurno[]> {
  const { data, error } = await supabase
    .from('variavel_turno_horarios')
    .select('*')
    .eq('filial', filial)
    .order('turno')
  if (error) { console.error('listarHorariosFechamento error:', error.message); return [] }
  return (data ?? []).map((r) => ({ id: r.id, filial: r.filial, turno: r.turno, horarioFechamento: String(r.horario_fechamento).slice(0, 5) }))
}

export async function salvarHorarioFechamento(filial: string, turno: string, horarioFechamento: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('variavel_turno_horarios')
    .upsert({ filial, turno, horario_fechamento: horarioFechamento }, { onConflict: 'filial,turno' })
  return { error: error?.message ?? null }
}

// Recalcula TODO o histórico já lançado de RV por atividade de uma filial
// com a cota diária corrigida (dias úteis da COMPETÊNCIA 21→20, não do mês
// calendário — ver cotaDiaria acima). Sem isso, créditos gravados antes do
// ajuste continuam com a conta antiga (mês calendário) pra sempre, já que
// o cálculo só entra em vigor pra lançamentos NOVOS. Não mexe em créditos
// marcados como ausente (ficam 0, correto do jeito que estão), nem em
// atividades de meta acumulada (o crédito delas é recalculado à parte, por
// competência inteira, via recalcularAcumuladoAtividade).
export async function recalcularCreditosHistorico(filial: string): Promise<{ atividadesProcessadas: number; creditosAtualizados: number }> {
  const atividades = await listarAtividadesTurno(filial)
  let creditosAtualizados = 0

  for (const atividade of atividades) {
    if (atividade.metaAcumulada) { await recalcularAcumuladoAtividade(atividade); continue }

    // Inclui colaboradores inativos — créditos históricos deles também
    // precisam da correção, mesmo que já não recebam mais hoje.
    const colaboradores = await listarColaboradoresDaAtividade(atividade.id)
    const colabPorId = new Map(colaboradores.filter((c) => c.colaboradorId).map((c) => [c.colaboradorId as string, c]))
    if (colabPorId.size === 0) continue

    const { data: creditos } = await supabase
      .from('variavel_turno_creditos')
      .select('id, colaborador_id, data, valor_gerado, ausente')
      .eq('atividade_id', atividade.id)
    if (!creditos || creditos.length === 0) continue

    let bateuPorChave: Map<string, boolean>
    if (atividade.porOperador) {
      const { data: registros } = await supabase
        .from('variavel_turno_registros_operador')
        .select('colaborador_id, data, bateu_meta')
        .eq('atividade_id', atividade.id)
      bateuPorChave = new Map((registros ?? []).map((r) => [`${r.colaborador_id}|${r.data}`, r.bateu_meta]))
    } else {
      const { data: registros } = await supabase
        .from('variavel_turno_registros')
        .select('data, bateu_meta')
        .eq('atividade_id', atividade.id)
      const bateuPorData = new Map((registros ?? []).map((r) => [r.data as string, r.bateu_meta as boolean]))
      bateuPorChave = new Map((creditos).map((c) => [`${c.colaborador_id}|${c.data}`, bateuPorData.get(c.data) ?? false]))
    }

    for (const c of creditos) {
      if (c.ausente) continue
      const colab = c.colaborador_id ? colabPorId.get(c.colaborador_id) : null
      if (!colab) continue
      const chave = atividade.porOperador ? `${c.colaborador_id}|${c.data}` : `${c.colaborador_id}|${c.data}`
      const bateu = bateuPorChave.get(chave) ?? false
      const novoValor = bateu ? cotaDiaria(colab.valorFinalMensal, c.data) : 0
      if (Math.abs(novoValor - Number(c.valor_gerado)) > 0.005) {
        const { error } = await supabase.from('variavel_turno_creditos').update({ valor_gerado: novoValor }).eq('id', c.id)
        if (!error) creditosAtualizados++
      }
    }
  }

  return { atividadesProcessadas: atividades.length, creditosAtualizados }
}

export { formatarBRL }
