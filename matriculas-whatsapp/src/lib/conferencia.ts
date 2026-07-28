import { supabase } from './supabase'
import { valesSupabase } from './valesSupabase'
import { parseSeparacaoBuffer, parseRetornavelBuffer, type RetornavelItem } from './tmlParser'

// ── Baia (palete) ─────────────────────────────────────────────────────────
// O campo "Palete" do Relatório de Separação já traz a porta e a ordem:
//   P02_M_02_1/42  → porta M (motorista), ordem 02
//   P03_A_03_1/42  → porta A (ajudante),  ordem 03
//   Z_ITEM_NAO_PALLETIZADO → itens avulsos (sem palete)
// "R" é uma baia própria de retornáveis (garrafeira, palete, chapatex etc.),
// importada do relatório 02.05.01 — não vem do Relatório de Separação.
export type PortaConf = 'M' | 'A' | 'Z' | 'R'

// Chave de palete fixa pra baia de retornáveis — só existe uma por mapa/dia.
export const PALETE_RETORNAVEL = 'RETORNAVEL'

interface PaleteInfo {
  porta: PortaConf
  ordem: number | null
  rotulo: string
}

// Rótulo de exibição a partir de porta+ordem — usado tanto no import quanto
// (mais importante) ao LER de volta em buscarBaiasDoMapa, ignorando o texto
// gravado no banco. O rótulo salvo em conferencia_baias.rotulo é só um
// resquício de imports antigos; se essa função mudar o texto, baias já
// importadas antes não ficariam atualizadas sem reimportar o relatório.
export function rotuloBaia(porta: PortaConf, ordem: number | null): string {
  const nomePorta = porta === 'M' ? 'Motorista' : porta === 'A' ? 'Ajudante' : porta === 'R' ? 'Retornáveis' : 'Avulsos'
  return porta === 'Z' || porta === 'R' || ordem == null ? nomePorta : `${nomePorta} · Baia ${String(ordem).padStart(2, '0')}`
}

export function parsePalete(palete: string): PaleteInfo {
  if (/nao_pallet/i.test(palete)) return { porta: 'Z', ordem: null, rotulo: 'Itens avulsos' }
  const partes = palete.split('_')
  const porta = (partes[1] === 'A' ? 'A' : partes[1] === 'M' ? 'M' : 'Z') as PortaConf
  const ordem = Number(partes[2])
  const ordemOuNull = isNaN(ordem) ? null : ordem
  return { porta, ordem: ordemOuNull, rotulo: rotuloBaia(porta, ordemOuNull) }
}

// Ordena baias: porta Motorista, depois Ajudante, depois Avulsos, depois
// Retornáveis; dentro de cada porta pela ordem.
export function ordemBaia(porta: PortaConf, ordem: number | null): number {
  const base = porta === 'M' ? 0 : porta === 'A' ? 1000 : porta === 'Z' ? 2000 : 3000
  return base + (ordem ?? 999)
}

export const PORTA_LABEL: Record<PortaConf, string> = {
  M: 'Porta Motorista',
  A: 'Porta Ajudante',
  Z: 'Itens avulsos',
  R: 'Retornáveis',
}

export interface ItemConf {
  id: string
  sequencia: number
  codigo: string | null
  descricao: string | null
  tipo: string | null
  quantidade: number | null
  unidade: string | null
  conferido: boolean
  divergencia: boolean
  tipoDivergencia: string | null
  qtdReal: number | null
  obs: string | null
}

export interface BaiaConf {
  id: string
  palete: string
  porta: PortaConf
  ordem: number | null
  rotulo: string
  totalItens: number
  totalCaixas: number
  status: 'pendente' | 'conferida' | 'pulada'
  iniciadaEm: string | null
  primeiroItemEm: string | null
  finalizadaEm: string | null
  motivoPulada: string | null
  itens: ItemConf[]
}

// Motivos pré-definidos pra pular a conferência de uma baia (baia
// segregada, volume grande demais pro tempo disponível, carro parado pela
// blitz) — "Outro" libera um campo de texto livre na tela.
export const MOTIVOS_PULAR_BAIA = [
  'Baia segregada',
  'Baia complexa',
  'Carro da Blitz',
  'Outro',
] as const

// ── Import diário do Relatório de Separação ──────────────────────────────
// Upsert que preserva o progresso: reimportar o mesmo dia atualiza só os
// campos descritivos (rótulo, quantidades, descrição) — sem tocar em
// status/conferido/divergência que já foram marcados pelo ajudante.
export async function importarSeparacao(
  filial: string,
  data: string,
  buffer: ArrayBuffer,
): Promise<{ mapas: number; baias: number; itens: number }> {
  const itens = parseSeparacaoBuffer(buffer)
  if (itens.length === 0) {
    throw new Error('Nenhum item encontrado na planilha. Confira se é o Relatório de Separação.')
  }

  // Agrupa por (mapa, palete) → baia.
  const baiasMap = new Map<string, {
    mapa: number; palete: string; info: PaleteInfo; totalItens: number; totalCaixas: number
  }>()
  for (const it of itens) {
    const chave = `${it.mapa}|${it.palete}`
    let b = baiasMap.get(chave)
    if (!b) {
      b = { mapa: it.mapa, palete: it.palete, info: parsePalete(it.palete), totalItens: 0, totalCaixas: 0 }
      baiasMap.set(chave, b)
    }
    b.totalItens += 1
    b.totalCaixas += it.quantidade ?? 0
  }

  const agora = new Date().toISOString()
  const baiaRows = [...baiasMap.values()].map((b) => ({
    filial, mapa: b.mapa, data, palete: b.palete,
    porta: b.info.porta, ordem: b.info.ordem, rotulo: b.info.rotulo,
    total_itens: b.totalItens, total_caixas: b.totalCaixas, importado_em: agora,
  }))
  const { error: eBaias } = await supabase
    .from('conferencia_baias')
    .upsert(baiaRows, { onConflict: 'filial,mapa,data,palete' })
  if (eBaias) throw new Error(eBaias.message)

  // Busca as baias de volta pra pegar os ids e ligar os itens.
  const mapasDistintos = [...new Set([...baiasMap.values()].map((b) => b.mapa))]
  const { data: baiasSalvas, error: eSel } = await supabase
    .from('conferencia_baias')
    .select('id, mapa, palete')
    .eq('filial', filial).eq('data', data)
    .in('mapa', mapasDistintos.length > 0 ? mapasDistintos : [-1])
  if (eSel) throw new Error(eSel.message)
  const idPorChave = new Map((baiasSalvas ?? []).map((b) => [`${b.mapa}|${b.palete}`, b.id]))

  const itemRows = itens.map((it) => ({
    baia_id: idPorChave.get(`${it.mapa}|${it.palete}`)!,
    filial, mapa: it.mapa, data, palete: it.palete, sequencia: it.sequencia,
    codigo: it.codigo, descricao: it.descricao, tipo: it.tipo,
    quantidade: it.quantidade, unidade: it.unidade,
  })).filter((r) => r.baia_id)
  const { error: eItens } = await supabase
    .from('conferencia_itens')
    .upsert(itemRows, { onConflict: 'filial,mapa,data,palete,sequencia' })
  if (eItens) throw new Error(eItens.message)

  return { mapas: mapasDistintos.length, baias: baiaRows.length, itens: itemRows.length }
}

// ── Import diário do relatório 02.05.01 (retornáveis) ────────────────────
// Cria uma baia própria por mapa (porta "R") com a quantidade de cada
// retornável que deveria sair no caminhão — conferida de manhã, antes da
// rota, junto com as demais baias. Mesmo padrão de upsert que preserva
// progresso já feito ao reimportar.
export async function importarRetornaveis(
  filial: string,
  data: string,
  buffer: ArrayBuffer,
): Promise<{ mapas: number; itens: number }> {
  const itens = parseRetornavelBuffer(buffer)
  if (itens.length === 0) {
    throw new Error('Nenhum item encontrado no arquivo. Confira se é o relatório 02.05.01 de retornáveis.')
  }

  const porMapa = new Map<number, { totalItens: number; totalCaixas: number }>()
  for (const it of itens) {
    const b = porMapa.get(it.mapa) ?? { totalItens: 0, totalCaixas: 0 }
    b.totalItens += 1
    b.totalCaixas += it.quantidade
    porMapa.set(it.mapa, b)
  }

  const agora = new Date().toISOString()
  const baiaRows = [...porMapa.entries()].map(([mapa, b]) => ({
    filial, mapa, data, palete: PALETE_RETORNAVEL,
    porta: 'R' as PortaConf, ordem: null, rotulo: rotuloBaia('R', null),
    total_itens: b.totalItens, total_caixas: b.totalCaixas, importado_em: agora,
  }))
  const { error: eBaias } = await supabase
    .from('conferencia_baias')
    .upsert(baiaRows, { onConflict: 'filial,mapa,data,palete' })
  if (eBaias) throw new Error(eBaias.message)

  const mapasDistintos = [...porMapa.keys()]
  const { data: baiasSalvas, error: eSel } = await supabase
    .from('conferencia_baias')
    .select('id, mapa')
    .eq('filial', filial).eq('data', data).eq('palete', PALETE_RETORNAVEL)
    .in('mapa', mapasDistintos.length > 0 ? mapasDistintos : [-1])
  if (eSel) throw new Error(eSel.message)
  const idPorMapa = new Map((baiasSalvas ?? []).map((b) => [b.mapa, b.id]))

  // Sequência estável por mapa (ordenada pelo código do item, não pela
  // ordem bruta do arquivo) — reimportar não pode embaralhar qual item já
  // foi conferido, já que o upsert casa por (mapa, palete, sequencia).
  const itensPorMapaOrdenados = new Map<number, RetornavelItem[]>()
  for (const it of itens) {
    const arr = itensPorMapaOrdenados.get(it.mapa) ?? []
    arr.push(it)
    itensPorMapaOrdenados.set(it.mapa, arr)
  }
  const itemRows: {
    baia_id: string; filial: string; mapa: number; data: string; palete: string; sequencia: number
    codigo: string | null; descricao: string | null; tipo: null; quantidade: number; unidade: string | null
  }[] = []
  for (const [mapa, arr] of itensPorMapaOrdenados) {
    const baiaId = idPorMapa.get(mapa)
    if (!baiaId) continue
    const ordenados = [...arr].sort((a, b) => a.codigo.localeCompare(b.codigo))
    ordenados.forEach((it, i) => {
      itemRows.push({
        baia_id: baiaId,
        filial, mapa, data, palete: PALETE_RETORNAVEL, sequencia: i + 1,
        codigo: it.codigo, descricao: it.descricao, tipo: null,
        quantidade: it.quantidade, unidade: it.unidade,
      })
    })
  }
  const { error: eItens } = await supabase
    .from('conferencia_itens')
    .upsert(itemRows, { onConflict: 'filial,mapa,data,palete,sequencia' })
  if (eItens) throw new Error(eItens.message)

  return { mapas: mapasDistintos.length, itens: itemRows.length }
}

// ── Página do ajudante ────────────────────────────────────────────────────
export async function buscarBaiasDoMapa(filial: string, mapa: number, data: string): Promise<BaiaConf[]> {
  const { data: baias, error: eBaias } = await supabase
    .from('conferencia_baias')
    .select('id, palete, porta, ordem, rotulo, total_itens, total_caixas, status, iniciada_em, finalizada_em, primeiro_item_em, motivo_pulada')
    .eq('filial', filial).eq('mapa', mapa).eq('data', data)
  if (eBaias) throw new Error(eBaias.message)
  if (!baias || baias.length === 0) return []

  const { data: itens, error: eItens } = await supabase
    .from('conferencia_itens')
    .select('id, baia_id, sequencia, codigo, descricao, tipo, quantidade, unidade, conferido, divergencia, tipo_divergencia, qtd_real, obs')
    .eq('filial', filial).eq('mapa', mapa).eq('data', data)
  if (eItens) throw new Error(eItens.message)

  const itensPorBaia = new Map<string, ItemConf[]>()
  for (const it of itens ?? []) {
    const arr = itensPorBaia.get(it.baia_id) ?? []
    arr.push({
      id: it.id, sequencia: it.sequencia, codigo: it.codigo, descricao: it.descricao,
      tipo: it.tipo, quantidade: it.quantidade, unidade: it.unidade,
      conferido: it.conferido, divergencia: it.divergencia,
      tipoDivergencia: it.tipo_divergencia, qtdReal: it.qtd_real, obs: it.obs,
    })
    itensPorBaia.set(it.baia_id, arr)
  }

  return baias
    .map((b) => ({
      id: b.id, palete: b.palete, porta: b.porta as PortaConf, ordem: b.ordem, rotulo: rotuloBaia(b.porta as PortaConf, b.ordem),
      totalItens: b.total_itens, totalCaixas: b.total_caixas,
      status: b.status as 'pendente' | 'conferida' | 'pulada',
      iniciadaEm: b.iniciada_em, finalizadaEm: b.finalizada_em, primeiroItemEm: b.primeiro_item_em, motivoPulada: b.motivo_pulada,
      itens: (itensPorBaia.get(b.id) ?? []).sort((x, y) => x.sequencia - y.sequencia),
    }))
    .sort((x, y) => ordemBaia(x.porta, x.ordem) - ordemBaia(y.porta, y.ordem))
}

// Marca a baia como iniciada (só na primeira vez) — base pro tempo de conferência.
export async function iniciarBaia(baiaId: string): Promise<void> {
  const { error } = await supabase.from('conferencia_baias')
    .update({ iniciada_em: new Date().toISOString() })
    .eq('id', baiaId).is('iniciada_em', null)
  if (error) throw new Error(error.message)
}

// Grava quando o PRIMEIRO item da baia foi marcado (conferido ou com
// divergência) — só na primeira vez. Diferente de "iniciada_em" (que marca
// quando o ajudante só ABRIU a baia, mesmo sem mexer em nada ainda), esse
// horário reflete o início real do trabalho de conferência, usado pra medir
// quanto tempo cada baia efetivamente levou.
async function marcarPrimeiroItem(baiaId: string): Promise<void> {
  await supabase.from('conferencia_baias')
    .update({ primeiro_item_em: new Date().toISOString() })
    .eq('id', baiaId).is('primeiro_item_em', null)
}

export async function marcarItem(itemId: string, conferido: boolean, baiaId: string): Promise<void> {
  const { error } = await supabase.from('conferencia_itens')
    .update({ conferido, conferido_em: conferido ? new Date().toISOString() : null })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  if (conferido) await marcarPrimeiroItem(baiaId)
}

export async function registrarDivergencia(
  itemId: string,
  tipo: 'falta' | 'sobra' | 'avaria',
  qtdReal: number | null,
  obs: string | null,
  baiaId: string,
): Promise<void> {
  const { error } = await supabase.from('conferencia_itens')
    .update({ divergencia: true, tipo_divergencia: tipo, qtd_real: qtdReal, obs, conferido: true, conferido_em: new Date().toISOString() })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  await marcarPrimeiroItem(baiaId)
}

export async function finalizarBaia(baiaId: string, conferidoPor: string | null): Promise<void> {
  const { error } = await supabase.from('conferencia_baias')
    .update({ status: 'conferida', finalizada_em: new Date().toISOString(), conferido_por: conferidoPor })
    .eq('id', baiaId)
  if (error) throw new Error(error.message)
}

// Finaliza a baia sem exigir que todos os itens estejam marcados — baia
// segregada, volume grande demais pro tempo disponível etc. Fica com status
// próprio ('pulada'), diferente de 'conferida', e não conta no tempo médio
// de conferência do mapa (ver buscarResumoDia/buscarConferenciaPorMapaPeriodo).
export async function pularBaia(baiaId: string, motivo: string, conferidoPor: string | null): Promise<void> {
  const { error } = await supabase.from('conferencia_baias')
    .update({ status: 'pulada', motivo_pulada: motivo, finalizada_em: new Date().toISOString(), conferido_por: conferidoPor })
    .eq('id', baiaId)
  if (error) throw new Error(error.message)
}

// ── Painel Conferência Digital (Distribuição) ────────────────────────────
export interface BaiaPuladaResumo {
  rotulo: string
  motivo: string | null
}

export interface ResumoMapaConf {
  mapa: number
  totalBaias: number
  baiasConferidas: number
  baiasPuladas: number
  puladasDetalhe: BaiaPuladaResumo[]
  totalItens: number
  itensConferidos: number
  divergencias: number
  concluido: boolean
  tempoMin: number | null      // do início da 1ª baia ao fim da última CONFERIDA — baia pulada não entra na conta
  conferidoPor: string | null
}

export interface ResumoDiaConf {
  mapas: ResumoMapaConf[]
  mapasConcluidos: number
  totalDivergencias: number
  tempoMedioMin: number | null
}

export async function buscarResumoDia(filial: string, data: string): Promise<ResumoDiaConf> {
  const { data: baias } = await supabase
    .from('conferencia_baias')
    .select('mapa, porta, ordem, status, iniciada_em, finalizada_em, primeiro_item_em, conferido_por, motivo_pulada')
    .eq('filial', filial).eq('data', data)
  const { data: itens } = await supabase
    .from('conferencia_itens')
    .select('mapa, conferido, divergencia')
    .eq('filial', filial).eq('data', data)

  const porMapa = new Map<number, ResumoMapaConf & { inicios: number[]; fins: number[] }>()
  const get = (m: number) => {
    let r = porMapa.get(m)
    if (!r) {
      r = { mapa: m, totalBaias: 0, baiasConferidas: 0, baiasPuladas: 0, puladasDetalhe: [], totalItens: 0, itensConferidos: 0, divergencias: 0, concluido: false, tempoMin: null, conferidoPor: null, inicios: [], fins: [] }
      porMapa.set(m, r)
    }
    return r
  }

  for (const b of baias ?? []) {
    const r = get(b.mapa)
    r.totalBaias += 1
    if (b.status === 'conferida') r.baiasConferidas += 1
    if (b.status === 'pulada') {
      r.baiasPuladas += 1
      r.puladasDetalhe.push({ rotulo: rotuloBaia(b.porta as PortaConf, b.ordem), motivo: b.motivo_pulada })
    }
    if (b.conferido_por && !r.conferidoPor) r.conferidoPor = b.conferido_por
    // Baia pulada não entra no tempo de conferência — não representa uma
    // conferência real feita item a item. Usa o horário do PRIMEIRO ITEM
    // marcado como início (não "iniciada_em", que só marca a abertura da
    // baia — inflava o tempo quando o ajudante dava uma olhada em várias
    // baias antes de conferir de verdade).
    if (b.status === 'conferida') {
      const inicioReal = b.primeiro_item_em ?? b.iniciada_em
      if (inicioReal) r.inicios.push(new Date(inicioReal).getTime())
      if (b.finalizada_em) r.fins.push(new Date(b.finalizada_em).getTime())
    }
  }
  for (const it of itens ?? []) {
    const r = get(it.mapa)
    r.totalItens += 1
    if (it.conferido) r.itensConferidos += 1
    if (it.divergencia) r.divergencias += 1
  }

  const mapas: ResumoMapaConf[] = [...porMapa.values()].map((r) => {
    const concluido = r.totalBaias > 0 && (r.baiasConferidas + r.baiasPuladas) === r.totalBaias
    const tempoMin = concluido && r.inicios.length > 0 && r.fins.length > 0
      ? Math.max(1, Math.round((Math.max(...r.fins) - Math.min(...r.inicios)) / 60000))
      : null
    return {
      mapa: r.mapa, totalBaias: r.totalBaias, baiasConferidas: r.baiasConferidas,
      baiasPuladas: r.baiasPuladas, puladasDetalhe: r.puladasDetalhe,
      totalItens: r.totalItens, itensConferidos: r.itensConferidos, divergencias: r.divergencias,
      concluido, tempoMin, conferidoPor: r.conferidoPor,
    }
  }).sort((a, b) => a.mapa - b.mapa)

  const concluidos = mapas.filter((m) => m.concluido)
  const temposConcluidos = concluidos.map((m) => m.tempoMin).filter((t): t is number => t != null)
  return {
    mapas,
    mapasConcluidos: concluidos.length,
    totalDivergencias: mapas.reduce((s, m) => s + m.divergencias, 0),
    tempoMedioMin: temposConcluidos.length > 0
      ? Math.round(temposConcluidos.reduce((a, b) => a + b, 0) / temposConcluidos.length)
      : null,
  }
}

// ── Análise do TML: início/fim da conferência por mapa num período ──────
export interface ConferenciaPassoMapa {
  inicio: string | null // ISO — menor iniciada_em entre as baias do mapa
  fim: string | null    // ISO — maior finalizada_em, só quando concluído
  concluido: boolean
}

// Usado no passo a passo da Análise do TML (Início/Término da conferência).
// Início = menor "iniciada_em" das baias do mapa; fim = maior
// "finalizada_em", só quando TODAS as baias já foram conferidas — senão a
// conferência ainda está em andamento e não tem "término" pra mostrar.
export async function buscarConferenciaPorMapaPeriodo(
  filial: string, de: string, ate: string
): Promise<Map<string, ConferenciaPassoMapa>> {
  const { data, error } = await supabase
    .from('conferencia_baias')
    .select('mapa, data, status, iniciada_em, finalizada_em')
    .eq('filial', filial)
    .gte('data', de)
    .lte('data', ate)
  if (error) throw new Error(error.message)

  const porMapa = new Map<string, { inicios: string[]; fins: string[]; totalBaias: number; conferidas: number; puladas: number }>()
  for (const b of data ?? []) {
    const chave = `${b.mapa}|${b.data}`
    const r = porMapa.get(chave) ?? { inicios: [], fins: [], totalBaias: 0, conferidas: 0, puladas: 0 }
    r.totalBaias += 1
    if (b.status === 'conferida') r.conferidas += 1
    if (b.status === 'pulada') r.puladas += 1
    // Baia pulada não entra no início/fim da conferência — não representa
    // uma conferência real feita item a item (ver buscarResumoDia).
    if (b.status === 'conferida') {
      if (b.iniciada_em) r.inicios.push(b.iniciada_em)
      if (b.finalizada_em) r.fins.push(b.finalizada_em)
    }
    porMapa.set(chave, r)
  }

  const resultado = new Map<string, ConferenciaPassoMapa>()
  for (const [chave, r] of porMapa) {
    const concluido = r.totalBaias > 0 && (r.conferidas + r.puladas) === r.totalBaias
    resultado.set(chave, {
      inicio: r.inicios.length > 0 ? [...r.inicios].sort()[0] : null,
      fim: concluido && r.fins.length > 0 ? [...r.fins].sort().slice(-1)[0] : null,
      concluido,
    })
  }
  return resultado
}

// ── Mensagem de divergência pro grupo ────────────────────────────────────
export function montarMensagemDivergencia(p: {
  mapa: number; baiaRotulo: string; item: ItemConf; conferente: string; data: string
}): string {
  const tipo = p.item.tipoDivergencia === 'falta' ? 'FALTA'
    : p.item.tipoDivergencia === 'sobra' ? 'SOBRA'
    : 'AVARIA'
  let texto = `⚠️ *DIVERGÊNCIA NA CONFERÊNCIA*\n\n`
  texto += `🗺️ Mapa: ${p.mapa}\n`
  texto += `📦 Baia: ${p.baiaRotulo}\n`
  texto += `🔎 Tipo: ${tipo}\n`
  texto += `🍺 Item: ${p.item.descricao ?? p.item.codigo ?? '—'}${p.item.codigo ? ` (cód. ${p.item.codigo})` : ''}\n`
  texto += `📊 Separado: ${p.item.quantidade ?? '—'} ${p.item.unidade ?? ''}`.trim() + `\n`
  if (p.item.qtdReal != null) texto += `📥 No caminhão: ${p.item.qtdReal}\n`
  if (p.item.obs) texto += `📝 Obs: ${p.item.obs}\n`
  texto += `\n👤 Ajudante: ${p.conferente || '—'}`
  return texto
}

// ── Painel do supervisor: divergências item a item de um mapa ───────────
// Usado pelo botão "Copiar msg" — monta o mesmo texto que seria mandado
// automaticamente ao grupo pra cada item com divergência, pra copiar e
// colar manualmente enquanto o envio automático está pausado.
export interface DivergenciaMapa {
  baiaRotulo: string
  conferente: string | null
  item: ItemConf
}

export async function buscarDivergenciasDoMapa(filial: string, mapa: number, data: string): Promise<DivergenciaMapa[]> {
  const { data: baias, error: eBaias } = await supabase
    .from('conferencia_baias')
    .select('id, porta, ordem, conferido_por')
    .eq('filial', filial).eq('mapa', mapa).eq('data', data)
  if (eBaias) throw new Error(eBaias.message)
  const baiaInfo = new Map((baias ?? []).map((b) => [
    b.id, { rotulo: rotuloBaia(b.porta as PortaConf, b.ordem), conferente: b.conferido_por as string | null },
  ]))

  const { data: itens, error: eItens } = await supabase
    .from('conferencia_itens')
    .select('id, baia_id, sequencia, codigo, descricao, tipo, quantidade, unidade, conferido, divergencia, tipo_divergencia, qtd_real, obs')
    .eq('filial', filial).eq('mapa', mapa).eq('data', data)
    .eq('divergencia', true)
  if (eItens) throw new Error(eItens.message)

  return (itens ?? [])
    .map((it) => {
      const b = baiaInfo.get(it.baia_id)
      return {
        baiaRotulo: b?.rotulo ?? '—',
        conferente: b?.conferente ?? null,
        item: {
          id: it.id, sequencia: it.sequencia, codigo: it.codigo, descricao: it.descricao,
          tipo: it.tipo, quantidade: it.quantidade, unidade: it.unidade,
          conferido: it.conferido, divergencia: it.divergencia,
          tipoDivergencia: it.tipo_divergencia, qtdReal: it.qtd_real, obs: it.obs,
        },
      }
    })
    .sort((x, y) => x.baiaRotulo.localeCompare(y.baiaRotulo) || x.item.sequencia - y.item.sequencia)
}

// Concatena uma mensagem por divergência (mesmo formato do envio automático),
// separadas por uma linha, pronta pra copiar de uma vez só.
export function montarMensagensDivergenciaMapa(mapa: number, data: string, divergencias: DivergenciaMapa[]): string {
  return divergencias
    .map((d) => montarMensagemDivergencia({ mapa, baiaRotulo: d.baiaRotulo, item: d.item, conferente: d.conferente ?? '—', data }))
    .join('\n\n─────────────\n\n')
}

// ── Autocomplete de "quem está conferindo" ───────────────────────────────
// Junta motoristas (motoristas_sala_tml, cadastro da própria filial) e
// ajudantes (tabela "ajudantes" do módulo de Vales, cadastro único da
// empresa) num só nome pra sugerir no campo de nome da Conferência — assim
// não depende de digitar certinho, só escolher da lista.
export interface PessoaConferencia {
  nome: string
  tipo: 'motorista' | 'ajudante'
  telefone: string | null
  // Só motorista tem matrícula aqui (vem de motoristas_sala_tml). É a chave
  // usada pra cruzar com `colaboradores` no lugar do nome — nomes importados
  // em motoristas_sala_tml às vezes vêm truncados (ex.: planilha de origem
  // com nome cortado em 30 caracteres), o que faz o nome não bater com o
  // cadastro central e bloquear o envio por engano mesmo a pessoa estando
  // ativa. Matrícula não sofre esse problema.
  matricula: string | null
}

export async function buscarPessoasConferencia(filial: string): Promise<PessoaConferencia[]> {
  const [{ data: motoristas }, { data: ajudantes }] = await Promise.all([
    supabase.from('motoristas_sala_tml').select('nome, telefone, matricula').eq('filial', filial),
    // A tabela "ajudantes" (módulo de Vales) só concede acesso ao
    // service_role — usa o client com a service key, igual o resto do
    // módulo de Vales já faz no front.
    valesSupabase.from('ajudantes').select('nome, telefone'),
  ])
  const vistos = new Set<string>()
  const lista: PessoaConferencia[] = []
  for (const m of motoristas ?? []) {
    const nome = (m.nome ?? '').trim()
    const chave = nome.toLowerCase()
    if (!nome || vistos.has(chave)) continue
    vistos.add(chave)
    lista.push({ nome, tipo: 'motorista', telefone: m.telefone || null, matricula: m.matricula != null ? String(m.matricula) : null })
  }
  for (const a of ajudantes ?? []) {
    const nome = (a.nome ?? '').trim()
    const chave = nome.toLowerCase()
    if (!nome || vistos.has(chave)) continue
    vistos.add(chave)
    lista.push({ nome, tipo: 'ajudante', telefone: a.telefone || null, matricula: null })
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ── Painel: listagem de sugestões (aba "Sugestões") ──────────────────────
// A pergunta de sugestão não é mais mandada automaticamente ao finalizar um
// mapa — agora é uma opção dentro do menu de autoatendimento da Aurora
// (api/zapi-webhook.ts, item "Sugestões"). Essa listagem continua valendo,
// só passa a ler linhas inseridas pelo fluxo da Aurora em vez do antigo
// envio automático.
export interface SugestaoConf {
  id: string
  // null quando a sugestão veio do menu geral da Aurora, sem mapa associado.
  mapa: number | null
  data: string | null
  nome: string | null
  telefone: string
  perguntaEnviadaEm: string
  resposta: string | null
  respondidaEm: string | null
  status: 'aguardando' | 'respondida'
}

export async function buscarSugestoes(filial: string, limite = 200): Promise<SugestaoConf[]> {
  const { data, error } = await supabase
    .from('conferencia_sugestoes')
    .select('id, mapa, data, nome, telefone, pergunta_enviada_em, resposta, respondida_em, status')
    .eq('filial', filial)
    .order('pergunta_enviada_em', { ascending: false })
    .limit(limite)
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({
    id: s.id, mapa: s.mapa, data: s.data, nome: s.nome, telefone: s.telefone,
    perguntaEnviadaEm: s.pergunta_enviada_em, resposta: s.resposta, respondidaEm: s.respondida_em,
    status: s.status as 'aguardando' | 'respondida',
  }))
}
