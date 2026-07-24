import { supabase } from './supabase'
import { enviarMensagemGrupo } from './zapi'
import type { SalaTML } from './tml'

export interface TreinamentoParaAviso {
  id: string
  titulo: string
}

// Manda UMA mensagem no grupo da sala avisando do treinamento e
// direcionando quem tiver dúvida pra conversa particular com o bot.
// Reaproveitado tanto pelo disparo automático (Timer da Matinal, ao
// finalizar) quanto pelo botão de forçar disparo manual (tela
// Treinamentos), pros casos em que ninguém finalizou a matinal pelo botão
// (ex.: auto-finalização por reimport do checklist) e o aviso automático
// nunca saiu.
//
// Antes isso também mandava uma mensagem individual pra cada motorista da
// sala — removido porque um disparo em massa desses foi o que derrubou o
// número do WhatsApp (23/07/2026). Só o aviso único ao grupo permanece.
export async function enviarAvisosTreinamento(
  filial: string, sala: SalaTML, treino: TreinamentoParaAviso, matinalId?: number,
): Promise<{ enviados: number }> {
  const { data: filialRow } = await supabase
    .from('filiais')
    .select('grupo_matinal_colorado_whatsapp, grupo_matinal_subfuria_whatsapp')
    .eq('nome', filial)
    .maybeSingle()

  let enviados = 0
  const grupoSala = sala === 'COLORADO' ? filialRow?.grupo_matinal_colorado_whatsapp : filialRow?.grupo_matinal_subfuria_whatsapp
  if (grupoSala) {
    const { sucesso } = await enviarMensagemGrupo(grupoSala,
      `📋 Hoje na matinal tivemos o treinamento *${treino.titulo}*.\n` +
      `Quem ficou com alguma dúvida, me chama aqui no privado dizendo algo como *"fiquei com dúvida no treinamento"* — eu já te ajudo a tirar.`)
    if (sucesso) enviados = 1
  }

  if (matinalId != null) {
    await supabase.from('matinal_tml').update({ treinamento_avisado_em: new Date().toISOString() }).eq('id', matinalId)
  }

  return { enviados }
}
