import { supabase } from './supabase'
import { enviarMensagemWhatsApp, enviarMensagemGrupo } from './zapi'
import type { SalaTML } from './tml'

export interface TreinamentoParaAviso {
  id: string
  titulo: string
}

// Manda o aviso individual do treinamento pra cada telefone cadastrado na
// sala (motoristas_sala_tml.telefone), e mais uma mensagem única no grupo
// da sala direcionando pra conversa particular com o bot. Reaproveitado
// tanto pelo disparo automático (Timer da Matinal, ao finalizar) quanto pelo
// botão de forçar disparo manual (tela Treinamentos), pros casos em que
// ninguém finalizou a matinal pelo botão (ex.: auto-finalização por
// reimport do checklist) e o aviso automático nunca saiu.
export async function enviarAvisosTreinamento(
  filial: string, sala: SalaTML, treino: TreinamentoParaAviso, matinalId?: number,
): Promise<{ enviados: number }> {
  const [{ data: colaboradores }, { data: filialRow }] = await Promise.all([
    supabase.from('motoristas_sala_tml').select('nome, telefone').eq('filial', filial).eq('sala', sala).not('telefone', 'is', null),
    supabase.from('filiais').select('grupo_matinal_colorado_whatsapp, grupo_matinal_subfuria_whatsapp').eq('nome', filial).maybeSingle(),
  ])

  let enviados = 0
  for (const c of colaboradores ?? []) {
    const telefone = (c.telefone ?? '').trim()
    if (!telefone) continue
    const primeiro = (c.nome ?? '').trim().split(/\s+/)[0] ?? ''
    const mensagem =
      `Bom dia${primeiro ? `, ${primeiro}` : ''}! Hoje na matinal vimos *${treino.titulo}*. ` +
      `Ficou alguma dúvida? Pode perguntar por aqui — escrevendo ou mandando um áudio.`
    const { sucesso } = await enviarMensagemWhatsApp(telefone, mensagem)
    if (sucesso) {
      enviados++
      await supabase.from('matinal_treinamento_avisos').insert({
        treinamento_id: treino.id, filial, sala, colaborador_telefone: telefone, colaborador_nome: c.nome ?? null,
      })
    }
  }

  const grupoSala = sala === 'COLORADO' ? filialRow?.grupo_matinal_colorado_whatsapp : filialRow?.grupo_matinal_subfuria_whatsapp
  if (grupoSala) {
    await enviarMensagemGrupo(grupoSala,
      `📋 Hoje na matinal tivemos o treinamento *${treino.titulo}*.\n` +
      `Quem ficou com alguma dúvida, me chama aqui no privado dizendo algo como *"fiquei com dúvida no treinamento"* — eu já te ajudo a tirar.`)
  }

  if (matinalId != null) {
    await supabase.from('matinal_tml').update({ treinamento_avisado_em: new Date().toISOString() }).eq('id', matinalId)
  }

  return { enviados }
}
