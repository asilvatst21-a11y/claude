const { createClient } = require('@supabase/supabase-js')

const MP_TOKEN = process.env.MP_ACCESS_TOKEN
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mapeamento de plan_id do MP para nome do plano
const PLAN_MAP = {
  '59ecf64a203546d09535317d47a5e4ae': 'starter', // R$97
  'ffb6736c2a1d48ba8c55ad93deb4f777': 'pro',     // R$150
  'ec60035eb523421da6408607fcde29cf': 'rede',    // R$249
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { type, data } = req.body || {}
  if (!type || !data?.id) return res.status(200).end()

  // Só processa notificações de assinatura
  if (type !== 'subscription_preapproval') return res.status(200).end()

  try {
    // Busca detalhes da assinatura no Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    })
    if (!mpRes.ok) return res.status(200).end()

    const subscription = await mpRes.json()
    const { payer_email, preapproval_plan_id, status, next_payment_date } = subscription

    const plan = PLAN_MAP[preapproval_plan_id]
    if (!plan || !payer_email) return res.status(200).end()

    // Encontra o usuário pelo e-mail via função RPC
    const { data: userId, error: rpcError } = await supabase
      .rpc('get_user_id_by_email', { user_email: payer_email })

    if (rpcError || !userId) return res.status(200).end()

    if (status === 'authorized') {
      // Ativa ou atualiza o plano
      await supabase.from('profiles').upsert({
        id: userId,
        plan,
        mp_subscription_id: data.id,
        plan_expires_at: next_payment_date
          ? new Date(new Date(next_payment_date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : null,
      }, { onConflict: 'id' })
    } else if (status === 'cancelled' || status === 'paused') {
      // Cancela o plano
      await supabase.from('profiles')
        .update({ plan: 'expired', mp_subscription_id: data.id })
        .eq('id', userId)
    }
  } catch (err) {
    console.error('mp-webhook error:', err)
  }

  res.status(200).end()
}
