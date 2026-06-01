export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const today = new Date()
  const history = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const period = d.toISOString().substring(0, 7)
    const monthStart = period + '-01'
    const nextD = new Date(d)
    nextD.setMonth(nextD.getMonth() + 1)
    const monthEnd = nextD.toISOString().split('T')[0]

    const { data: avals } = await supabase
      .from('avaliacoes_conduta')
      .select('tipo, gravidade')
      .gte('data', monthStart)
      .lt('data', monthEnd)

    let raw_conduta = 100
    for (const a of avals ?? []) {
      if (a.tipo === 'ato_inseguro') raw_conduta -= a.gravidade * 4
      if (a.tipo === 'condicao_insegura') raw_conduta -= a.gravidade * 2
      if (a.tipo === 'abordagem_positiva') raw_conduta += a.gravidade * 3
    }
    raw_conduta = Math.max(0, Math.min(100, raw_conduta))
    const condutaComponent = Math.round(raw_conduta * 0.4)

    const { data: telRows } = await supabase
      .from('telemetria')
      .select('qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas')
      .eq('periodo_ref', period)

    let telComponent = 30
    if ((telRows?.length ?? 0) > 0) {
      const rawScores = (telRows ?? []).map(r => {
        const ep = Math.min(Number(r.qtd_excessos_velocidade) * 3, 40)
        const bp = Math.min(Number(r.qtd_frenagens_bruscas) * 2, 30)
        const cp = Math.min(Number(r.qtd_curvas_bruscas) * 2, 30)
        let raw = Math.max(0, Math.min(100, 100 - ep - bp - cp))
        if (Number(r.qtd_excessos_velocidade) > 10) raw = Math.min(raw, 30)
        return raw * 0.3
      })
      telComponent = Math.round(rawScores.reduce((a, b) => a + b, 0) / rawScores.length)
    }

    history.push({ period, score: Math.min(100, 21 + condutaComponent + telComponent) })
  }

  return NextResponse.json(history)
}
