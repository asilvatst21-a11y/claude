/// <reference types="node" />

// Verificação dos lembretes de retorno da frota leve. Pode ser chamada por um
// cron (Vercel Cron / agendador externo) para garantir o aviso mesmo quando o
// grupo está parado. O check também roda de forma oportunista a cada mensagem
// no grupo (ver tratarFrotaLeve em zapi-webhook.ts), então este endpoint é um
// reforço, não a única fonte.
//
// Protegido pelo mesmo segredo do webhook: chame com ?token=SEU_SEGREDO.
// Ex. de cron (vercel.json): { "path": "/api/frota-leve-check?token=...", "schedule": "*/30 * * * *" }
// (agendamentos mais frequentes que diário exigem plano Vercel Pro.)

import { verificarLembretesFrotaLeve } from './zapi-webhook'

const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

export default async function handler(req: any, res: any) {
  const segredo = WEBHOOK_SECRET.trim()
  const token = String(req.query?.token ?? '').trim()
  if (!segredo) { res.status(503).json({ ok: false, error: 'webhook secret not configured' }); return }
  if (token !== segredo) { res.status(401).json({ ok: false, error: 'invalid token' }); return }

  try {
    const enviados = await verificarLembretesFrotaLeve()
    res.status(200).json({ ok: true, lembretes_enviados: enviados })
  } catch (e) {
    console.error('frota-leve-check erro:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}
