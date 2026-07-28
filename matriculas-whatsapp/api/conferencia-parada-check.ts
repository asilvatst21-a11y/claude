/// <reference types="node" />

// Verificação de baias/mapas parados na Conferência Digital: quem abriu uma
// baia e não terminou em 5 minutos recebe um WhatsApp perguntando se já
// finalizou; um mapa em conferência há mais de 30 minutos sem terminar tem
// as baias que sobraram finalizadas automaticamente (ver
// finalizarMapasParadosAutomaticamente em zapi-webhook.ts). Chamado por
// cron (Vercel Cron / agendador externo) — sem gatilho oportunista, já que
// não existe um "grupo" recebendo mensagens pra essa verificação
// piggybackar (diferente do lembrete de Frota Leve).
//
// Protegido pelo mesmo segredo do webhook: chame com ?token=SEU_SEGREDO.
// Ex. de cron (vercel.json): { "path": "/api/conferencia-parada-check?token=...", "schedule": "*/5 * * * *" }
// (agendamentos mais frequentes que diário exigem plano Vercel Pro.)

import { verificarLembretesConferenciaParada, finalizarMapasParadosAutomaticamente } from './zapi-webhook'

const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

export default async function handler(req: any, res: any) {
  const segredo = WEBHOOK_SECRET.trim()
  const token = String(req.query?.token ?? '').trim()
  if (!segredo) { res.status(503).json({ ok: false, error: 'webhook secret not configured' }); return }
  if (token !== segredo) { res.status(401).json({ ok: false, error: 'invalid token' }); return }

  try {
    const enviados = await verificarLembretesConferenciaParada()
    const finalizados = await finalizarMapasParadosAutomaticamente()
    res.status(200).json({ ok: true, lembretes_enviados: enviados, mapas_finalizados_automaticamente: finalizados })
  } catch (e) {
    console.error('conferencia-parada-check erro:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}
