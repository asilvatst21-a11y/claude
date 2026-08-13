import { supabase } from './supabase'
import { enviarMensagemWhatsApp, aguardarEntreEnvios } from './zapi'

// Rotas de Risco: pontos de risco (cadastrados pela equipe ou sugeridos por
// motorista via Aurora), aviso automático ao motorista quando o mapa do dia
// passa por um PDV de referência do ponto — mesmo mecanismo do PDV Crítico
// (distribuicao_bees_visitas → escalas_tml → telefone), reaproveitado aqui.

export type Severidade = 'baixo' | 'moderado' | 'alto'
export type TipoPonto = 'ponto' | 'trecho'

export interface PontoRisco {
  id: string
  filial: string
  titulo: string
  tipo: TipoPonto
  severidade: Severidade
  rodovia: string | null
  velocidade_segura: string | null
  rota: string | null
  pdv_referencia: string | null
  latitude: number | null
  longitude: number | null
  maps_url: string | null
  origem: string
  sugestao_id: string | null
  ativo: boolean
  created_at: string
}

export interface SugestaoRisco {
  id: string
  filial: string
  matricula: string | null
  nome_motorista: string | null
  telefone: string | null
  relato_texto: string | null
  via_audio: boolean
  latitude: number | null
  longitude: number | null
  mapa: number | null
  status: 'pendente' | 'aprovado' | 'rejeitado'
  motivo_rejeicao: string | null
  ponto_id: string | null
  validado_por: string | null
  validado_em: string | null
  created_at: string
}

function normalizarCodigoPdv(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}
function normalizarMatricula(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}

export async function listarPontosRisco(filial: string): Promise<PontoRisco[]> {
  const { data, error } = await supabase
    .from('rotas_risco_pontos')
    .select('*')
    .eq('filial', filial).eq('ativo', true)
    .order('severidade', { ascending: false }).order('created_at', { ascending: false })
  if (error) { console.error('listarPontosRisco error:', error.message); return [] }
  return data ?? []
}

export interface NovoPontoInput {
  filial: string
  titulo: string
  tipo: TipoPonto
  severidade: Severidade
  rodovia: string | null
  velocidade_segura: string | null
  rota: string | null
  pdv_referencia: string | null
  latitude: number | null
  longitude: number | null
  maps_url: string | null
  origem?: string
  sugestao_id?: string | null
}

export async function criarPontoRisco(input: NovoPontoInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.from('rotas_risco_pontos').insert(input).select('id').single()
  if (error) console.error('criarPontoRisco error:', error.message)
  return { id: data?.id ?? null, error: error?.message ?? null }
}

export async function atualizarPontoRisco(id: string, patch: Partial<NovoPontoInput>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rotas_risco_pontos').update(patch).eq('id', id)
  if (error) console.error('atualizarPontoRisco error:', error.message)
  return { error: error?.message ?? null }
}

export async function listarSugestoes(filial: string, status: SugestaoRisco['status'] = 'pendente'): Promise<SugestaoRisco[]> {
  const { data, error } = await supabase
    .from('rotas_risco_sugestoes')
    .select('*')
    .eq('filial', filial).eq('status', status)
    .order('created_at', { ascending: true })
  if (error) { console.error('listarSugestoes error:', error.message); return [] }
  return data ?? []
}

// Aprova a sugestão, criando o ponto oficial com os dados (possivelmente
// ajustados pela Segurança) e marcando a sugestão como aprovada.
export async function aprovarSugestao(
  sugestaoId: string, ponto: NovoPontoInput, validadoPor: string,
): Promise<{ error: string | null }> {
  const { id: pontoId, error: erroPonto } = await criarPontoRisco({ ...ponto, origem: 'motorista', sugestao_id: sugestaoId })
  if (erroPonto) return { error: erroPonto }
  const { error } = await supabase
    .from('rotas_risco_sugestoes')
    .update({ status: 'aprovado', ponto_id: pontoId, validado_por: validadoPor, validado_em: new Date().toISOString() })
    .eq('id', sugestaoId)
  if (error) console.error('aprovarSugestao error:', error.message)
  return { error: error?.message ?? null }
}

export async function rejeitarSugestao(sugestaoId: string, motivo: string, validadoPor: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rotas_risco_sugestoes')
    .update({ status: 'rejeitado', motivo_rejeicao: motivo, validado_por: validadoPor, validado_em: new Date().toISOString() })
    .eq('id', sugestaoId)
  if (error) console.error('rejeitarSugestao error:', error.message)
  return { error: error?.message ?? null }
}

// ── Cruzamento com o BEES do dia (mesmo mecanismo do PDV Crítico) ─────────

interface VisitaBees { mapa: number | null; pdv_codigo: string }

async function buscarVisitasBeesDoDia(filial: string, data: string): Promise<VisitaBees[]> {
  const { data: visitas, error } = await supabase
    .from('distribuicao_bees_visitas')
    .select('mapa, pdv_codigo')
    .eq('filial', filial).eq('data', data)
  if (error) { console.error('buscarVisitasBeesDoDia error:', error.message); return [] }
  return visitas ?? []
}

export function montarMensagemAvisoRotaRisco(ponto: PontoRisco): string {
  const linhas = [
    `🚧 *Atenção — Rota de Risco*`,
    ``,
    `Seu mapa de hoje passa por um ponto sinalizado: *${ponto.titulo}*`,
  ]
  if (ponto.rodovia) linhas.push(`Rodovia: ${ponto.rodovia}`)
  if (ponto.velocidade_segura) linhas.push(`Velocidade segura: *${ponto.velocidade_segura}*`)
  linhas.push('', 'Redobre a atenção nesse trecho.')
  return linhas.join('\n')
}

// Mesmo padrão de avisarMotoristasPdvCritico (src/lib/pdvSeguranca.ts):
// cruza os PDVs do dia (BEES) com os pontos de risco que têm PDV de
// referência, acha o motorista de cada mapa (escalas_tml) e avisa por
// WhatsApp, com dedupe por filial+data+matricula+ponto.
export async function avisarMotoristasRotaRisco(filial: string, data: string): Promise<{ enviados: number; erros: string[] }> {
  const pontos = await listarPontosRisco(filial)
  const pontosComPdv = pontos.filter((p) => p.pdv_referencia)
  if (pontosComPdv.length === 0) return { enviados: 0, erros: [] }
  const pontoPorPdv = new Map(pontosComPdv.map((p) => [normalizarCodigoPdv(p.pdv_referencia as string), p]))

  const visitasBrutas = await buscarVisitasBeesDoDia(filial, data)
  if (visitasBrutas.length === 0) {
    return { enviados: 0, erros: ['Nenhuma visita do BEES encontrada pra essa data.'] }
  }
  const visitas = visitasBrutas.filter((v) => pontoPorPdv.has(normalizarCodigoPdv(v.pdv_codigo)))
  if (visitas.length === 0) return { enviados: 0, erros: [] }

  const mapas = [...new Set(visitas.map((v) => v.mapa).filter((m): m is number => m != null))]
  if (mapas.length === 0) return { enviados: 0, erros: [] }

  const [{ data: escalas }, { data: matriculasCad }, { data: rosterTml }, { data: jaAvisados }] = await Promise.all([
    supabase.from('escalas_tml').select('mapa, matricula').eq('filial', filial).eq('data_entrega', data).in('mapa', mapas),
    supabase.from('matriculas').select('numero, whatsapp').eq('filial', filial).eq('ativo', true),
    supabase.from('motoristas_sala_tml').select('matricula, telefone').eq('filial', filial),
    supabase.from('rotas_risco_avisos').select('matricula, ponto_id').eq('filial', filial).eq('data', data),
  ])
  const matriculaPorMapa = new Map((escalas ?? []).map((e) => [e.mapa, e.matricula]))
  const telefonePorNumero = new Map((matriculasCad ?? []).map((m) => [normalizarMatricula(String(m.numero)), m.whatsapp as string | null]))
  const telefonePorMatriculaTml = new Map((rosterTml ?? []).map((r) => [r.matricula, r.telefone as string | null]))
  const avisadoSet = new Set((jaAvisados ?? []).map((a) => `${a.matricula}|${a.ponto_id}`))

  const erros: string[] = []
  let enviados = 0
  for (const v of visitas) {
    if (v.mapa == null) continue
    const matricula = matriculaPorMapa.get(v.mapa)
    if (matricula == null) continue
    const ponto = pontoPorPdv.get(normalizarCodigoPdv(v.pdv_codigo))
    if (!ponto) continue
    const chave = `${matricula}|${ponto.id}`
    if (avisadoSet.has(chave)) continue

    const telefone = telefonePorNumero.get(normalizarMatricula(String(matricula))) ?? telefonePorMatriculaTml.get(matricula) ?? null
    if (!telefone) { erros.push(`Matrícula ${matricula} sem telefone cadastrado (ponto "${ponto.titulo}")`); continue }

    const envio = await enviarMensagemWhatsApp(telefone, montarMensagemAvisoRotaRisco(ponto))
    if (!envio.sucesso) { erros.push(`Falha ao avisar matrícula ${matricula}: ${envio.erro}`); continue }

    await supabase.from('rotas_risco_avisos').upsert(
      { filial, data, matricula: String(matricula), ponto_id: ponto.id },
      { onConflict: 'filial,data,matricula,ponto_id' },
    )
    avisadoSet.add(chave)
    enviados++
    await aguardarEntreEnvios()
  }
  return { enviados, erros }
}

// ── Consulta pela Aurora (sob demanda, por número de mapa) ────────────────

export async function pontosRiscoPorMapa(filial: string, data: string, mapa: number): Promise<PontoRisco[]> {
  const visitas = await buscarVisitasBeesDoDia(filial, data)
  const pdvsDoMapa = new Set(visitas.filter((v) => v.mapa === mapa).map((v) => normalizarCodigoPdv(v.pdv_codigo)))
  if (pdvsDoMapa.size === 0) return []
  const pontos = await listarPontosRisco(filial)
  return pontos.filter((p) => p.pdv_referencia && pdvsDoMapa.has(normalizarCodigoPdv(p.pdv_referencia)))
}

const SEV_ORDEM: Record<Severidade, number> = { alto: 0, moderado: 1, baixo: 2 }
const SEV_LABEL: Record<Severidade, string> = { alto: 'Alto', moderado: 'Moderado', baixo: 'Baixo' }

export function montarMensagemPontosDoMapa(mapa: number, pontos: PontoRisco[]): string {
  if (pontos.length === 0) {
    return `🔍 Não encontrei nenhum ponto de risco cadastrado na rota do mapa *${mapa}*.`
  }
  const ordenados = [...pontos].sort((a, b) => SEV_ORDEM[a.severidade] - SEV_ORDEM[b.severidade])
  const linhas = ordenados.map((p) =>
    `• *${p.titulo}* — ${SEV_LABEL[p.severidade]}${p.velocidade_segura ? ` (${p.velocidade_segura})` : ''}`,
  )
  return [`🛣️ *${pontos.length} ponto(s) de risco na rota do mapa ${mapa}:*`, ...linhas].join('\n')
}

// ── Pergunta proativa após import do BEES ("passou por algum ponto?") ─────

export interface MotoristaDoDia { matricula: string; telefone: string | null }

// Motoristas que rodaram na filial+data (mesma base de escalas_tml usada no
// aviso), com telefone resolvido — usado pra perguntar proativamente se
// avistaram algum ponto de risco novo.
export async function motoristasDoDia(filial: string, data: string): Promise<MotoristaDoDia[]> {
  const { data: escalas, error } = await supabase
    .from('escalas_tml').select('matricula').eq('filial', filial).eq('data_entrega', data)
  if (error) { console.error('motoristasDoDia error:', error.message); return [] }
  const matriculas = [...new Set((escalas ?? []).map((e) => e.matricula))]
  if (matriculas.length === 0) return []

  const [{ data: matriculasCad }, { data: rosterTml }] = await Promise.all([
    supabase.from('matriculas').select('numero, whatsapp').eq('filial', filial).eq('ativo', true),
    supabase.from('motoristas_sala_tml').select('matricula, telefone').eq('filial', filial),
  ])
  const telefonePorNumero = new Map((matriculasCad ?? []).map((m) => [normalizarMatricula(String(m.numero)), m.whatsapp as string | null]))
  const telefonePorMatriculaTml = new Map((rosterTml ?? []).map((r) => [r.matricula, r.telefone as string | null]))

  return matriculas.map((matricula) => ({
    matricula: String(matricula),
    telefone: telefonePorNumero.get(normalizarMatricula(String(matricula))) ?? telefonePorMatriculaTml.get(matricula) ?? null,
  }))
}

// Registra que a pergunta proativa já foi feita hoje pra essa matrícula —
// evita perguntar de novo se o BEES for reimportado no mesmo dia. Retorna
// true se é a primeira vez (deve perguntar), false se já tinha perguntado.
export async function marcarPerguntaFeita(filial: string, data: string, matricula: string): Promise<boolean> {
  const { error } = await supabase.from('rotas_risco_perguntas').insert({ filial, data, matricula })
  if (error) {
    if (!error.message.includes('duplicate')) console.error('marcarPerguntaFeita error:', error.message)
    return false
  }
  return true
}

// Pergunta proativa após o import do BEES: "passou por algum ponto de risco
// hoje?" — primeiro caso no projeto de a Aurora puxar assunto sozinha, sem
// o motorista ter mandado nada antes. Prepara a sessão da Aurora (mesmo
// formato de contexto usado no fluxo iniciado pelo menu, em
// api/zapi-webhook.ts) pra reconhecer a próxima resposta como parte desse
// cadastro. Pula quem já tem uma sessão ativa (não quer atropelar alguém no
// meio de outra conversa com a Aurora) e quem já foi perguntado hoje.
export async function perguntarSobrePontoRiscoParaMotoristasDoDia(filial: string, data: string): Promise<{ perguntados: number; erros: string[] }> {
  const motoristas = await motoristasDoDia(filial, data)
  const erros: string[] = []
  let perguntados = 0

  for (const m of motoristas) {
    if (!m.telefone) continue
    const primeiraVez = await marcarPerguntaFeita(filial, data, m.matricula)
    if (!primeiraVez) continue

    const { data: sessaoAtiva } = await supabase.from('aurora_sessoes').select('id').eq('telefone', m.telefone).maybeSingle()
    if (sessaoAtiva) continue // já está em outra conversa com a Aurora — não atropela

    const envio = await enviarMensagemWhatsApp(
      m.telefone,
      'Vi que você rodou hoje 👋 Passou por algum trecho ou ponto que merece atenção (buraco, curva sem placa, cruzamento perigoso)? Me conta por texto ou áudio — ou responde *não* se não teve nada.',
    )
    if (!envio.sucesso) { erros.push(`Falha ao perguntar pra matrícula ${m.matricula}: ${envio.erro}`); continue }

    await supabase.from('aurora_sessoes').upsert(
      { telefone: m.telefone, estado: 'aguardando_relato_ponto_risco', contexto: { texto: null, viaAudio: false, latitude: null, longitude: null, aguardandoLocalizacaoOpcional: false }, criado_em: new Date().toISOString() },
      { onConflict: 'telefone' },
    )
    perguntados++
    await aguardarEntreEnvios()
  }
  return { perguntados, erros }
}

export async function registrarSugestao(input: {
  filial: string; matricula: string | null; nomeMotorista: string | null; telefone: string
  relatoTexto: string | null; viaAudio: boolean; latitude: number | null; longitude: number | null; mapa: number | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rotas_risco_sugestoes').insert({
    filial: input.filial, matricula: input.matricula, nome_motorista: input.nomeMotorista, telefone: input.telefone,
    relato_texto: input.relatoTexto, via_audio: input.viaAudio, latitude: input.latitude, longitude: input.longitude, mapa: input.mapa,
  })
  if (error) console.error('registrarSugestao error:', error.message)
  return { error: error?.message ?? null }
}
