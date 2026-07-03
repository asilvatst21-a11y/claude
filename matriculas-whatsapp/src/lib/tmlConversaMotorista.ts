import { supabase } from './supabase'
import { enviarMensagemWhatsApp } from './zapi'
import type { AlertaTML, ConversaMotoristaTML } from '../types'

// Primeiro nome, pra deixar a abordagem mais pessoal ("Oi, João!" em vez do
// nome completo em caixa alta).
function primeiroNome(nome: string | null): string {
  if (!nome) return 'tudo bem'
  const p = nome.trim().split(/\s+/)[0]
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

// Mensagem 1 — tom acolhedor. Enviada no disparo manual. As respostas
// (motivo e depois solução) são conduzidas pelo webhook.
export function montarMensagemAberturaMotorista(a: {
  nome: string | null
  mapa: number
  atraso_minutos: number
}): string {
  return (
    `Oi, ${primeiroNome(a.nome)}! Tudo bem? 👋\n\n` +
    `Vi aqui que sua saída de hoje (mapa ${a.mapa}) ficou ${a.atraso_minutos} minutos além do horário combinado.\n\n` +
    `Não é pra te cobrar nada, só quero entender: o que rolou hoje que atrasou a saída?\n\n` +
    `_Pode responder por texto ou áudio, como for melhor pra você._`
  )
}

export interface IniciarConversaResultado {
  ok: boolean
  erro?: string
}

// Dispara a conversa com o motorista: cria o registro e manda a 1ª mensagem.
// Se já existe uma conversa aberta (não concluída) para este alerta, não
// duplica — apenas reenvia a mensagem de abertura.
export async function iniciarConversaMotorista(
  alerta: Pick<AlertaTML, 'id' | 'filial' | 'nome' | 'matricula' | 'mapa' | 'data_saida' | 'atraso_minutos'>,
  telefone: string,
): Promise<IniciarConversaResultado> {
  const tel = telefone.trim()
  if (!tel) return { ok: false, erro: 'Motorista sem telefone cadastrado. Cadastre em "Motoristas".' }

  // Reaproveita uma conversa aberta do mesmo alerta, se houver.
  const { data: existente } = await supabase
    .from('conversas_motorista_tml')
    .select('id, estado')
    .eq('alerta_id', alerta.id)
    .neq('estado', 'concluido')
    .maybeSingle()

  if (!existente) {
    const { error } = await supabase.from('conversas_motorista_tml').insert({
      filial: alerta.filial,
      alerta_id: alerta.id,
      matricula: alerta.matricula,
      nome: alerta.nome,
      telefone: tel,
      mapa: alerta.mapa,
      data_saida: alerta.data_saida,
      atraso_minutos: alerta.atraso_minutos,
      estado: 'aguardando_motivo',
    })
    if (error) return { ok: false, erro: error.message }
  }

  const mensagem = montarMensagemAberturaMotorista({
    nome: alerta.nome,
    mapa: alerta.mapa,
    atraso_minutos: alerta.atraso_minutos,
  })
  const envio = await enviarMensagemWhatsApp(tel, mensagem)
  if (!envio.sucesso) return { ok: false, erro: envio.erro ?? 'Falha ao enviar a mensagem no WhatsApp.' }

  return { ok: true }
}

// Busca as conversas ligadas a um conjunto de alertas (para exibir motivo/
// solução na tabela de Alertas TML).
export async function buscarConversasPorAlertas(alertaIds: string[]): Promise<Map<string, ConversaMotoristaTML>> {
  if (alertaIds.length === 0) return new Map()
  const { data } = await supabase
    .from('conversas_motorista_tml')
    .select('*')
    .in('alerta_id', alertaIds)
  const mapa = new Map<string, ConversaMotoristaTML>()
  for (const c of (data ?? []) as ConversaMotoristaTML[]) {
    if (c.alerta_id) mapa.set(c.alerta_id, c)
  }
  return mapa
}
