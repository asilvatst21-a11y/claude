import { supabase } from './supabase'

// Único valor considerado "ativo" pro envio de WhatsApp — qualquer outro
// status explícito (DESLIGADO, FÉRIAS, AFASTADO etc.) bloqueia o envio.
export const STATUS_ATIVO = 'TRABALHANDO'

export function normalizarNomeStatus(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// `colaboradores` é a base central de cadastro (nome, status, telefone),
// backfilled a partir de motoristas_sala_tml/supervisores_tml/
// gsdpq_supervisores/gsdpq_colaboradores — mas essa sincronização foi um
// import único, não é automática. Por isso: encontrar a pessoa com outro
// status (DESLIGADO/FÉRIAS/AFASTADO/etc.) BLOQUEIA o envio; não encontrar
// nenhum registro (ainda não sincronizado) NÃO bloqueia — evita quebrar
// envio pra gente admitida depois da última sincronização.
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
// `filial` (ex.: `ajudantes`, do módulo de Vales, que é uma base única da
// empresa, não por filial).
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

// true = pode mandar (status TRABALHANDO, ou pessoa ainda sem registro
// sincronizado em `colaboradores`); false = bloqueado por status explícito.
export function pessoaEstaAtiva(mapaStatus: Map<string, string>, nome: string | null | undefined): boolean {
  if (!nome) return true
  const status = mapaStatus.get(normalizarNomeStatus(nome))
  if (status == null) return true
  return status === STATUS_ATIVO
}
