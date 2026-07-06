import { supabase } from './supabase'
import { parseSeparacaoBuffer } from './tmlParser'

// ── Baia (palete) ─────────────────────────────────────────────────────────
// O campo "Palete" do Relatório de Separação já traz a porta e a ordem:
//   P02_M_02_1/42  → porta M (motorista), ordem 02
//   P03_A_03_1/42  → porta A (ajudante),  ordem 03
//   Z_ITEM_NAO_PALLETIZADO → itens avulsos (sem palete)
export type PortaConf = 'M' | 'A' | 'Z'

interface PaleteInfo {
  porta: PortaConf
  ordem: number | null
  rotulo: string
}

export function parsePalete(palete: string): PaleteInfo {
  if (/nao_pallet/i.test(palete)) return { porta: 'Z', ordem: null, rotulo: 'Itens avulsos' }
  const partes = palete.split('_')
  const porta = (partes[1] === 'A' ? 'A' : partes[1] === 'M' ? 'M' : 'Z') as PortaConf
  const ordem = Number(partes[2])
  const nomePorta = porta === 'M' ? 'Motorista' : porta === 'A' ? 'Ajudante' : 'Avulsos'
  const rotulo = porta === 'Z' || isNaN(ordem)
    ? nomePorta
    : `${nomePorta} · Ordem ${String(ordem).padStart(2, '0')}`
  return { porta, ordem: isNaN(ordem) ? null : ordem, rotulo }
}

// Ordena baias: porta Motorista, depois Ajudante, depois Avulsos; dentro de
// cada porta pela ordem.
export function ordemBaia(porta: PortaConf, ordem: number | null): number {
  const base = porta === 'M' ? 0 : porta === 'A' ? 1000 : 2000
  return base + (ordem ?? 999)
}

export const PORTA_LABEL: Record<PortaConf, string> = {
  M: 'Porta Motorista',
  A: 'Porta Ajudante',
  Z: 'Itens avulsos',
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
  status: 'pendente' | 'conferida'
  iniciadaEm: string | null
  finalizadaEm: string | null
  itens: ItemConf[]
}

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

// ── Página do ajudante ────────────────────────────────────────────────────
export async function buscarBaiasDoMapa(filial: string, mapa: number, data: string): Promise<BaiaConf[]> {
  const { data: baias, error: eBaias } = await supabase
    .from('conferencia_baias')
    .select('id, palete, porta, ordem, rotulo, total_itens, total_caixas, status, iniciada_em, finalizada_em')
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
      id: b.id, palete: b.palete, porta: b.porta as PortaConf, ordem: b.ordem, rotulo: b.rotulo,
      totalItens: b.total_itens, totalCaixas: b.total_caixas,
      status: b.status as 'pendente' | 'conferida',
      iniciadaEm: b.iniciada_em, finalizadaEm: b.finalizada_em,
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

export async function marcarItem(itemId: string, conferido: boolean): Promise<void> {
  const { error } = await supabase.from('conferencia_itens')
    .update({ conferido, conferido_em: conferido ? new Date().toISOString() : null })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function registrarDivergencia(
  itemId: string,
  tipo: 'falta' | 'sobra' | 'avaria',
  qtdReal: number | null,
  obs: string | null,
): Promise<void> {
  const { error } = await supabase.from('conferencia_itens')
    .update({ divergencia: true, tipo_divergencia: tipo, qtd_real: qtdReal, obs, conferido: true, conferido_em: new Date().toISOString() })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function finalizarBaia(baiaId: string, conferidoPor: string | null): Promise<void> {
  const { error } = await supabase.from('conferencia_baias')
    .update({ status: 'conferida', finalizada_em: new Date().toISOString(), conferido_por: conferidoPor })
    .eq('id', baiaId)
  if (error) throw new Error(error.message)
}

// ── Painel Conferência Digital (Distribuição) ────────────────────────────
export interface ResumoMapaConf {
  mapa: number
  totalBaias: number
  baiasConferidas: number
  totalItens: number
  itensConferidos: number
  divergencias: number
  concluido: boolean
  tempoMin: number | null      // do início da 1ª baia ao fim da última
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
    .select('mapa, status, iniciada_em, finalizada_em, conferido_por')
    .eq('filial', filial).eq('data', data)
  const { data: itens } = await supabase
    .from('conferencia_itens')
    .select('mapa, conferido, divergencia')
    .eq('filial', filial).eq('data', data)

  const porMapa = new Map<number, ResumoMapaConf & { inicios: number[]; fins: number[] }>()
  const get = (m: number) => {
    let r = porMapa.get(m)
    if (!r) {
      r = { mapa: m, totalBaias: 0, baiasConferidas: 0, totalItens: 0, itensConferidos: 0, divergencias: 0, concluido: false, tempoMin: null, conferidoPor: null, inicios: [], fins: [] }
      porMapa.set(m, r)
    }
    return r
  }

  for (const b of baias ?? []) {
    const r = get(b.mapa)
    r.totalBaias += 1
    if (b.status === 'conferida') r.baiasConferidas += 1
    if (b.conferido_por && !r.conferidoPor) r.conferidoPor = b.conferido_por
    if (b.iniciada_em) r.inicios.push(new Date(b.iniciada_em).getTime())
    if (b.finalizada_em) r.fins.push(new Date(b.finalizada_em).getTime())
  }
  for (const it of itens ?? []) {
    const r = get(it.mapa)
    r.totalItens += 1
    if (it.conferido) r.itensConferidos += 1
    if (it.divergencia) r.divergencias += 1
  }

  const mapas: ResumoMapaConf[] = [...porMapa.values()].map((r) => {
    const concluido = r.totalBaias > 0 && r.baiasConferidas === r.totalBaias
    const tempoMin = concluido && r.inicios.length > 0 && r.fins.length > 0
      ? Math.max(1, Math.round((Math.max(...r.fins) - Math.min(...r.inicios)) / 60000))
      : null
    return {
      mapa: r.mapa, totalBaias: r.totalBaias, baiasConferidas: r.baiasConferidas,
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
  texto += `\n👤 Conferente: ${p.conferente || '—'}`
  return texto
}
