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

// Variante por matrícula — usada quando dá pra cruzar por um identificador
// estável em vez de nome. Nomes importados de planilha às vezes vêm
// truncados ou com grafia diferente entre tabelas (ex.: motoristas_sala_tml
// vs. o nome que originou o cadastro em `colaboradores`), o que faz o match
// por nome falhar mesmo com a pessoa ativa. Matrícula não tem esse problema.
export async function buscarStatusColaboradoresPorMatricula(filial: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('colaboradores').select('matricula, status').eq('filial', filial)
  const mapa = new Map<string, string>()
  for (const c of data ?? []) {
    if (c.matricula == null) continue
    mapa.set(String(c.matricula).trim(), (c.status ?? '').trim().toUpperCase())
  }
  return mapa
}

function normalizarTelefoneStatus(tel: string): string {
  const digitos = tel.replace(/\D/g, '')
  return digitos.length > 11 && digitos.startsWith('55') ? digitos.slice(2) : digitos
}

// Variante por telefone — usada pra quem não tem matrícula pra cruzar
// (supervisores TML/GSD). Nome sozinho falha quando o cadastro central foi
// gerado a partir de outra planilha com grafia diferente (ex.: supervisor
// existe em colaboradores só que com o nome de outra fonte de backfill) —
// telefone costuma ser mais estável que nome nesse caso.
export async function buscarStatusColaboradoresPorTelefone(filial: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('colaboradores').select('telefone, status').eq('filial', filial)
  const mapa = new Map<string, string>()
  for (const c of data ?? []) {
    if (!c.telefone) continue
    mapa.set(normalizarTelefoneStatus(c.telefone), (c.status ?? '').trim().toUpperCase())
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
  // Opcional: quando informados, matrícula e telefone têm prioridade sobre
  // o nome pra achar o status em `colaboradores` (mais confiáveis que casar
  // por nome — motorista casa por matrícula, supervisor (sem matrícula)
  // casa por telefone).
  matricula?: string | number | null
  mapaStatusPorMatricula?: Map<string, string>
  mapaStatusPorTelefone?: Map<string, string>
}): Promise<boolean> {
  const { origem, filial, mapaStatus, nome, telefone, detalhe, matricula, mapaStatusPorMatricula, mapaStatusPorTelefone } = params
  if (matricula != null && mapaStatusPorMatricula) {
    const statusPorMatricula = mapaStatusPorMatricula.get(String(matricula).trim())
    if (statusPorMatricula === STATUS_ATIVO) return true
    if (statusPorMatricula != null) {
      await registrarEnvioBloqueado({ origem, filial, nome, telefone, motivo: `Status "${statusPorMatricula}" — diferente de TRABALHANDO`, detalhe })
      return false
    }
    // Matrícula não encontrada em `colaboradores`: cai pro match por
    // telefone/nome abaixo em vez de bloquear direto — pode ser matrícula
    // divergente entre cadastros.
  }
  if (telefone && mapaStatusPorTelefone) {
    const statusPorTelefone = mapaStatusPorTelefone.get(normalizarTelefoneStatus(telefone))
    if (statusPorTelefone === STATUS_ATIVO) return true
    if (statusPorTelefone != null) {
      await registrarEnvioBloqueado({ origem, filial, nome, telefone, motivo: `Status "${statusPorTelefone}" — diferente de TRABALHANDO`, detalhe })
      return false
    }
    // Telefone não encontrado: cai pro match por nome abaixo.
  }
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
