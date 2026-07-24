import { supabase } from './supabase'

// Único valor considerado "ativo" pro envio de WhatsApp — qualquer outro
// status (DESLIGADO, FÉRIAS, AFASTADO etc.) OU a ausência de registro no
// cadastro central bloqueia o envio.
export const STATUS_ATIVO = 'TRABALHANDO'

export function normalizarNomeStatus(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// `colaboradores` é a base central de cadastro (nome, status, telefone),
// backfilled a partir de motoristas_sala_tml/supervisores_tml/
// gsdpq_supervisores/gsdpq_colaboradores.
export async function buscarStatusColaboradoresPorNome(filial: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('colaboradores').select('nome, status').eq('filial', filial)
  const mapa = new Map<string, string>()
  for (const c of data ?? []) {
    if (!c.nome) continue
    mapa.set(normalizarNomeStatus(c.nome), (c.status ?? '').trim().toUpperCase())
  }
  return mapa
}

// Variante sem filtro de filial — usada pra tabelas que não têm coluna
// `filial` (ex.: `ajudantes`, do módulo de Vales, base única da empresa).
export async function buscarStatusColaboradoresPorNomeGlobal(): Promise<Map<string, string>> {
  const { data } = await supabase.from('colaboradores').select('nome, status')
  const mapa = new Map<string, string>()
  for (const c of data ?? []) {
    if (!c.nome) continue
    const chave = normalizarNomeStatus(c.nome)
    // Nome duplicado em filiais diferentes: mantém TRABALHANDO se qualquer
    // uma das ocorrências estiver ativa, pra não bloquear por engano quem
    // tem homônimo desligado em outra filial.
    const atual = mapa.get(chave)
    const status = (c.status ?? '').trim().toUpperCase()
    if (atual !== STATUS_ATIVO) mapa.set(chave, status)
  }
  return mapa
}

// Grava na central de bloqueios (tela "Envios bloqueados") — não trava o
// fluxo de quem chamou; falha ao registrar é só logada no console.
export async function registrarEnvioBloqueado(params: {
  origem: string
  filial?: string | null
  nome?: string | null
  telefone?: string | null
  motivo: string
  detalhe?: string | null
}): Promise<void> {
  const { error } = await supabase.from('whatsapp_envios_bloqueados').insert({
    origem: params.origem,
    filial: params.filial ?? null,
    nome: params.nome ?? null,
    telefone: params.telefone ?? null,
    motivo: params.motivo,
    detalhe: params.detalhe ?? null,
  })
  if (error) console.error('registrarEnvioBloqueado:', error.message)
}

// Checa se pode mandar mensagem pra essa pessoa e, se NÃO puder, já registra
// o bloqueio na central — um único ponto de chamada pra cada canal de envio,
// em vez de checar e logar em separado toda vez.
//
// Bloqueia quando:
//  - a pessoa tem status cadastrado diferente de TRABALHANDO, OU
//  - a pessoa não tem NENHUM registro no cadastro central `colaboradores`
//    (nome não encontrado) — nesse caso não dá pra confirmar que está
//    ativa, então por segurança o envio não sai.
export async function podeEnviarPara(params: {
  origem: string
  filial?: string | null
  mapaStatus: Map<string, string>
  nome: string | null | undefined
  telefone?: string | null
  detalhe?: string | null
}): Promise<boolean> {
  const { origem, filial, mapaStatus, nome, telefone, detalhe } = params
  if (!nome) {
    await registrarEnvioBloqueado({ origem, filial, nome, telefone, motivo: 'Sem nome cadastrado — não dá pra confirmar o status', detalhe })
    return false
  }
  const status = mapaStatus.get(normalizarNomeStatus(nome))
  if (status === STATUS_ATIVO) return true
  const motivo = status == null
    ? 'Colaborador não encontrado no cadastro central (colaboradores) — status não confirmado'
    : `Status "${status}" — diferente de TRABALHANDO`
  await registrarEnvioBloqueado({ origem, filial, nome, telefone, motivo, detalhe })
  return false
}
