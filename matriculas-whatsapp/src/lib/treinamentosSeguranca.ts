import { supabase } from './supabase'

// Ranking de atos + sessões de treinamento, a partir dos relatos de
// segurança (classificação "Ato Inseguro" — mesmo filtro usado em
// Relatos.tsx: `classificacao` contém "ATO"). Prazo/status é sempre
// derivado das datas na hora de exibir, nunca guardado — evita ficar
// desatualizado.

export interface AtoRanking {
  atoAlvo: string
  total: number
  deltaPct: number | null // vs período anterior de mesmo tamanho; null = sem dado no período anterior
}

export interface SessaoTreinamento {
  id: string
  filial: string
  origem: string
  ato_alvo: string
  titulo: string
  responsavel: string | null
  equipe_alvo: string | null
  data_prevista: string | null
  prazo_conclusao: string | null
  canal: string | null
  conteudo: string | null
  participantes_previstos: number
  participantes_confirmados: number
  concluido_por: string | null
  concluido_em: string | null
  created_at: string
}

export type StatusSessao = 'agendado' | 'andamento' | 'atrasado' | 'concluido'

export function statusSessao(s: Pick<SessaoTreinamento, 'concluido_em' | 'prazo_conclusao' | 'data_prevista'>): StatusSessao {
  if (s.concluido_em) return 'concluido'
  const hoje = new Date().toISOString().slice(0, 10)
  if (s.prazo_conclusao && s.prazo_conclusao < hoje) return 'atrasado'
  if (s.data_prevista && s.data_prevista <= hoje) return 'andamento'
  return 'agendado'
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Busca todos os relatos "Ato Inseguro" da filial num intervalo de datas
// (por data_ocorrencia, mesma coluna usada em Relatos.tsx), paginando de
// 1000 em 1000 — sem isso, filiais com muito relato cortam silenciosamente.
async function buscarTiposAtoNoIntervalo(filial: string, inicio: string, fim: string): Promise<string[]> {
  const PAGINA = 1000
  const tipos: string[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('relatos')
      .select('tipo_relato, classificacao')
      .eq('filial', filial)
      .gte('data_ocorrencia', inicio)
      .lte('data_ocorrencia', fim)
      .range(de, de + PAGINA - 1)
    if (error) { console.error('buscarTiposAtoNoIntervalo error:', error.message); break }
    for (const r of data ?? []) {
      if (r.classificacao?.includes('ATO') && r.tipo_relato) tipos.push(r.tipo_relato)
    }
    if (!data || data.length < PAGINA) break
  }
  return tipos
}

// Ranking dos atos mais recorrentes no período (semana ou mês corrente),
// com variação % vs período anterior de mesmo tamanho.
export async function rankingAtos(filial: string, periodo: 'semana' | 'mes'): Promise<AtoRanking[]> {
  const fim = hojeISO()
  const inicio = periodo === 'semana' ? somarDias(fim, -7) : somarDias(fim, -30)
  const inicioAnterior = periodo === 'semana' ? somarDias(inicio, -7) : somarDias(inicio, -30)
  const fimAnterior = somarDias(inicio, -1)

  const [atual, anterior] = await Promise.all([
    buscarTiposAtoNoIntervalo(filial, inicio, fim),
    buscarTiposAtoNoIntervalo(filial, inicioAnterior, fimAnterior),
  ])

  const contagemAtual = new Map<string, number>()
  for (const t of atual) contagemAtual.set(t, (contagemAtual.get(t) ?? 0) + 1)
  const contagemAnterior = new Map<string, number>()
  for (const t of anterior) contagemAnterior.set(t, (contagemAnterior.get(t) ?? 0) + 1)

  return [...contagemAtual.entries()]
    .map(([atoAlvo, total]) => {
      const anteriorTotal = contagemAnterior.get(atoAlvo)
      const deltaPct = anteriorTotal ? Math.round(((total - anteriorTotal) / anteriorTotal) * 100) : null
      return { atoAlvo, total, deltaPct }
    })
    .sort((a, b) => b.total - a.total)
}

export async function listarSessoes(filial: string): Promise<SessaoTreinamento[]> {
  const { data, error } = await supabase
    .from('treinamentos_seguranca_sessoes')
    .select('*')
    .eq('filial', filial)
    .order('created_at', { ascending: false })
  if (error) { console.error('listarSessoes error:', error.message); return [] }
  return data ?? []
}

export interface NovaSessaoInput {
  filial: string
  origem: string
  ato_alvo: string
  titulo: string
  responsavel: string | null
  equipe_alvo: string | null
  data_prevista: string | null
  prazo_conclusao: string | null
  canal: string | null
  conteudo: string | null
  participantes_previstos: number
}

export async function criarSessao(input: NovaSessaoInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('treinamentos_seguranca_sessoes').insert(input)
  if (error) console.error('criarSessao error:', error.message)
  return { error: error?.message ?? null }
}

export async function marcarConcluido(id: string, concluidoPor: string, concluidoEm: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('treinamentos_seguranca_sessoes')
    .update({ concluido_por: concluidoPor, concluido_em: concluidoEm })
    .eq('id', id)
  if (error) console.error('marcarConcluido error:', error.message)
  return { error: error?.message ?? null }
}

export async function atualizarParticipantesConfirmados(id: string, confirmados: number): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('treinamentos_seguranca_sessoes')
    .update({ participantes_confirmados: confirmados })
    .eq('id', id)
  if (error) console.error('atualizarParticipantesConfirmados error:', error.message)
  return { error: error?.message ?? null }
}

export interface Efetividade {
  mediaAntes: number
  mediaDepois: number | null // null = ainda não passou 4 semanas completas
  deltaPct: number | null
}

// Compara a média de relatos/semana daquele ato nas 4 semanas antes e nas 4
// semanas depois da conclusão. Só calcula "depois" se já tiverem se passado
// as 4 semanas completas — antes disso mostra "aguardando".
export async function calcularEfetividade(filial: string, atoAlvo: string, concluidoEm: string): Promise<Efetividade | null> {
  const antesFim = somarDias(concluidoEm, -1)
  const antesInicio = somarDias(concluidoEm, -28)
  const depoisInicio = somarDias(concluidoEm, 1)
  const depoisFim = somarDias(concluidoEm, 28)
  const passaramQuatroSemanas = depoisFim <= hojeISO()

  const [antes, depois] = await Promise.all([
    buscarTiposAtoNoIntervalo(filial, antesInicio, antesFim),
    passaramQuatroSemanas ? buscarTiposAtoNoIntervalo(filial, depoisInicio, depoisFim) : Promise.resolve(null),
  ])

  const totalAntes = antes.filter((t) => t === atoAlvo).length
  const mediaAntes = totalAntes / 4
  if (!passaramQuatroSemanas || depois === null) return { mediaAntes, mediaDepois: null, deltaPct: null }

  const totalDepois = depois.filter((t) => t === atoAlvo).length
  const mediaDepois = totalDepois / 4
  const deltaPct = mediaAntes > 0 ? Math.round(((mediaDepois - mediaAntes) / mediaAntes) * 100) : null
  return { mediaAntes, mediaDepois, deltaPct }
}
