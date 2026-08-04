import { supabase } from './supabase'

// ── Farol de Mercados e PDVs Críticos (Distribuição) ────────────────────
// Status de entrega vem do BEES por PDV (distribuicao_bees_visitas, gravado
// pelo mesmo import de Jornada e Tempo em Rota). Motorista/placa vêm de
// escalas_tml (03.11.49.02, já importado) — não do BEES, pra evitar
// divergência com quem realmente saiu no mapa. CORA só entra pro valor da
// nota, não pro status.

export type CategoriaWatchlist = 'pdv_critico' | 'mercado_sellerze' | 'mercado_trava'

export const CATEGORIA_LABEL: Record<CategoriaWatchlist, string> = {
  pdv_critico: 'PDV Crítico',
  mercado_sellerze: 'Mercado — Seller Zé',
  mercado_trava: 'Mercado — Trava',
}

export interface WatchlistItem {
  id: string
  filial: string
  codigo: string
  nome: string
  categoria: CategoriaWatchlist
  ativo: boolean
}

function linhaParaWatchlist(r: any): WatchlistItem {
  return { id: r.id, filial: r.filial, codigo: r.codigo, nome: r.nome, categoria: r.categoria, ativo: r.ativo }
}

export async function listarWatchlist(filial: string): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('distribuicao_watchlist_pdv')
    .select('*')
    .eq('filial', filial)
    .order('categoria').order('nome')
  if (error) { console.error('listarWatchlist error:', error.message); return [] }
  return (data ?? []).map(linhaParaWatchlist)
}

export async function salvarWatchlistItem(item: {
  filial: string; codigo: string; nome: string; categoria: CategoriaWatchlist
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('distribuicao_watchlist_pdv')
    .upsert(
      { filial: item.filial, codigo: item.codigo.trim(), nome: item.nome.trim(), categoria: item.categoria },
      { onConflict: 'filial,codigo,categoria' }
    )
  return { error: error?.message ?? null }
}

export async function alternarAtivoWatchlist(id: string, ativo: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('distribuicao_watchlist_pdv').update({ ativo }).eq('id', id)
  return { error: error?.message ?? null }
}

// ── Tradução do status do BEES (mesma legenda usada na planilha atual) ──

export type StatusFarol = 'pendente' | 'iniciado' | 'concluido' | 'atencao' | 'sem_mapa'

const STATUS_BEES: Record<string, { farol: StatusFarol; label: string }> = {
  NOT_STARTED: { farol: 'pendente', label: 'Não iniciada' },
  DELIVERY_STARTED: { farol: 'iniciado', label: 'Em andamento' },
  ON_THE_WAY: { farol: 'iniciado', label: 'Em andamento' },
  CONCLUDED: { farol: 'concluido', label: 'Concluída com sucesso' },
  DEFINITELY_RETURNED: { farol: 'atencao', label: 'Devolução confirmada' },
  PARTIAL_DELIVERY: { farol: 'atencao', label: 'Entrega devolvida parcialmente' },
  WAITING_MODULATION: { farol: 'atencao', label: 'Devolução aguardando tratativa' },
  IN_TREATMENT: { farol: 'atencao', label: 'Devolução em tratativa' },
  RESCHEDULED: { farol: 'atencao', label: 'Reagendada (repasse)' },
}

export function traduzirStatusBees(status: string | null): { farol: StatusFarol; label: string } {
  if (!status) return { farol: 'sem_mapa', label: 'Sem mapa hoje' }
  return STATUS_BEES[status] ?? { farol: 'atencao', label: status }
}

export interface FarolLinha {
  watchlistId: string
  codigo: string
  nome: string
  categoria: CategoriaWatchlist
  mapa: number | null
  statusBruto: string | null
  statusFarol: StatusFarol
  statusLabel: string
  motorista: string | null
  placa: string | null
  valorNota: number | null
}

export async function buscarFarol(filial: string, data: string): Promise<FarolLinha[]> {
  const [watchlist, { data: visitas }, { data: cora }] = await Promise.all([
    listarWatchlist(filial),
    supabase.from('distribuicao_bees_visitas').select('mapa, pdv_codigo, status').eq('filial', filial).eq('data', data),
    supabase.from('distribuicao_cora_notas').select('cliente_codigo, valor_total_nf').eq('filial', filial).eq('data', data),
  ])

  const visitaPorPdv = new Map((visitas ?? []).map((v) => [String(v.pdv_codigo), v]))
  const valorPorCliente = new Map<string, number>()
  for (const c of cora ?? []) {
    const cod = String(c.cliente_codigo)
    valorPorCliente.set(cod, (valorPorCliente.get(cod) ?? 0) + (c.valor_total_nf != null ? Number(c.valor_total_nf) : 0))
  }

  const mapasDoDia = [...new Set((visitas ?? []).map((v) => v.mapa).filter((m): m is number => m != null))]
  const [{ data: escalas }, { data: matriculas }] = mapasDoDia.length > 0
    ? await Promise.all([
      supabase.from('escalas_tml').select('mapa, matricula, placa').eq('filial', filial).eq('data_entrega', data).in('mapa', mapasDoDia),
      supabase.from('matriculas').select('numero, nome').eq('filial', filial).eq('ativo', true),
    ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  const escalaPorMapa = new Map((escalas ?? []).map((e) => [e.mapa, e]))
  const nomePorMatricula = new Map((matriculas ?? []).map((m) => [String(m.numero).trim(), m.nome as string]))

  return watchlist.filter((w) => w.ativo).map((w) => {
    const visita = visitaPorPdv.get(w.codigo)
    const { farol, label } = traduzirStatusBees(visita?.status ?? null)
    const escala = visita?.mapa != null ? escalaPorMapa.get(visita.mapa) : undefined
    const motorista = escala?.matricula != null ? (nomePorMatricula.get(String(escala.matricula).trim()) ?? `Matrícula ${escala.matricula}`) : null
    return {
      watchlistId: w.id,
      codigo: w.codigo,
      nome: w.nome,
      categoria: w.categoria,
      mapa: visita?.mapa ?? null,
      statusBruto: visita?.status ?? null,
      statusFarol: farol,
      statusLabel: label,
      motorista,
      placa: escala?.placa ?? null,
      valorNota: valorPorCliente.get(w.codigo) ?? null,
    }
  })
}

// ── Controle do envio automático ao WhatsApp (a cada import do BEES) ────
// O disparo repete a cada import do BEES; pra de reenviar quando todos os
// PDVs da watchlist do dia já estiverem "Concluído" — a corrida termina.

export async function statusEnvioFarol(filial: string, data: string): Promise<{ finalizado: boolean }> {
  const { data: row } = await supabase
    .from('distribuicao_farol_envios')
    .select('finalizado')
    .eq('filial', filial).eq('data', data).maybeSingle()
  return { finalizado: row?.finalizado ?? false }
}

export async function registrarEnvioFarol(filial: string, data: string, tudoConcluido: boolean): Promise<void> {
  await supabase.from('distribuicao_farol_envios').upsert(
    { filial, data, finalizado: tudoConcluido, ultimo_envio: new Date().toISOString() },
    { onConflict: 'filial,data' }
  )
}

// ── Import CORA (CSV, ponto e vírgula) — só usado pro valor da nota ─────

interface LinhaCora { clienteCodigo: string; clienteNome: string | null; numeroNf: string | null; valorTotalNf: number | null }

function parseValorBR(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function parseCoraBuffer(texto: string): LinhaCora[] {
  const linhas = texto.split(/\r?\n/).filter(Boolean)
  if (linhas.length < 2) return []
  return linhas.slice(1).map((linha) => {
    const cols = linha.split(';')
    const clienteCodigo = cols[6]?.trim()
    if (!clienteCodigo) return null
    return {
      clienteCodigo,
      clienteNome: cols[7]?.trim() || null,
      numeroNf: cols[29]?.trim() || null,
      valorTotalNf: parseValorBR(cols[36]),
    }
  }).filter((l): l is LinhaCora => l !== null)
}

export async function importarCora(file: File, filial: string, data: string): Promise<{ contagem: number }> {
  const texto = await file.text()
  const linhas = parseCoraBuffer(texto)
  if (linhas.length === 0) throw new Error('Nenhuma linha reconhecida no arquivo. Confira se é o export do CORA (CSV, ponto e vírgula).')

  // Uma nota pode aparecer em várias linhas do CORA (um item por linha) —
  // dedup por número de NF antes de gravar, senão o valor da nota conta
  // em dobro/triplo no Farol.
  const porNf = new Map<string, LinhaCora>()
  for (const l of linhas) {
    const chave = `${l.clienteCodigo}|${l.numeroNf ?? l.clienteCodigo}`
    if (!porNf.has(chave)) porNf.set(chave, l)
  }

  const { error: delErr } = await supabase.from('distribuicao_cora_notas').delete().eq('filial', filial).eq('data', data)
  if (delErr) throw new Error(`Erro ao limpar notas do dia: ${delErr.message}`)

  const rows = [...porNf.values()].map((l) => ({
    filial, data, cliente_codigo: l.clienteCodigo, cliente_nome: l.clienteNome,
    numero_nf: l.numeroNf, valor_total_nf: l.valorTotalNf,
  }))
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('distribuicao_cora_notas').insert(rows.slice(i, i + BATCH))
    if (error) throw new Error(`Erro ao salvar notas: ${error.message}`)
  }
  return { contagem: rows.length }
}
