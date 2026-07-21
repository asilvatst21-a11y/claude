/// <reference types="node" />

// Verificação dos lembretes de dúvida da matinal (Dúvidas da Matinal). Pode
// ser chamada por um cron para garantir o lembrete ao palestrante e o aviso
// de atraso ao colaborador mesmo sem tráfego no WhatsApp. O check também roda
// de forma oportunista a cada mensagem individual recebida (ver
// verificarLembretesMatinal em zapi-webhook.ts), então este endpoint é um
// reforço, não a única fonte.
//
// Protegido pelo mesmo segredo do webhook: chame com ?token=SEU_SEGREDO.

import { verificarLembretesMatinal } from './zapi-webhook'

const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

export default async function handler(req: any, res: any) {
  const segredo = WEBHOOK_SECRET.trim()
  const token = String(req.query?.token ?? '').trim()
  if (!segredo) { res.status(503).json({ ok: false, error: 'webhook secret not configured' }); return }
  if (token !== segredo) { res.status(401).json({ ok: false, error: 'invalid token' }); return }

  try {
    const acoes = await verificarLembretesMatinal()
    res.status(200).json({ ok: true, acoes })
  } catch (e) {
    console.error('matinal-duvidas-check erro:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}
