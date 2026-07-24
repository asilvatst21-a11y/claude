import { supabase } from './supabase'
import { enviarMensagemWhatsApp, enviarMensagemGrupo } from './zapi'
import { ENVIOS_TREINAMENTO_PAUSADOS } from './whatsappStatus'
import type { SalaTML } from './tml'

export interface TreinamentoParaAviso {
  id: string
  titulo: string
}

// Mesma normalização usada em jornada.ts/Disparos.tsx pra casar matrícula
// (número) entre cadastros que guardam ela como string (zeros à esquerda variam).
function normalizarMatricula(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}

// Manda o aviso individual do treinamento pra cada motorista da sala, e mais
// uma mensagem única no grupo da sala direcionando pra conversa particular
// com o bot. Reaproveitado tanto pelo disparo automático (Timer da Matinal,
// ao finalizar) quanto pelo botão de forçar disparo manual (tela
// Treinamentos), pros casos em que ninguém finalizou a matinal pelo botão
// (ex.: auto-finalização por reimport do checklist) e o aviso automático
// nunca saiu.
//
// Telefone: prioriza motoristas_sala_tml.telefone, mas cai pro cadastro
// central de Matrículas (Segurança) quando esse campo estiver vazio — a
// maioria dos motoristas só tem o número lá, sem duplicar cadastro só pra
// sala de Distribuição (mesmo fallback já usado em jornada.ts). Sem isso,
// só quem tivesse telefone preenchido nas duas tabelas recebia o aviso.
export async function enviarAvisosTreinamento(
  filial: string, sala: SalaTML, treino: TreinamentoParaAviso, matinalId?: number,
): Promise<{ enviados: number }> {
  // Envio em massa pausado (número em análise no WhatsApp) — ver whatsappStatus.ts.
  if (ENVIOS_TREINAMENTO_PAUSADOS) return { enviados: 0 }

  const [{ data: colaboradores }, { data: cadastroMatriculas }, { data: filialRow }] = await Promise.all([
    supabase.from('motoristas_sala_tml').select('matricula, nome, telefone').eq('filial', filial).eq('sala', sala),
    supabase.from('matriculas').select('numero, whatsapp').eq('filial', filial).eq('ativo', true),
    supabase.from('filiais').select('grupo_matinal_colorado_whatsapp, grupo_matinal_subfuria_whatsapp').eq('nome', filial).maybeSingle(),
  ])
  const telefonePorNumeroCadastro = new Map((cadastroMatriculas ?? []).map((m) => [normalizarMatricula(m.numero), m.whatsapp]))

  let enviados = 0
  for (const c of colaboradores ?? []) {
    const telefoneCadastro = c.matricula != null ? telefonePorNumeroCadastro.get(normalizarMatricula(String(c.matricula))) : null
    const telefone = (c.telefone ?? telefoneCadastro ?? '').trim()
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
