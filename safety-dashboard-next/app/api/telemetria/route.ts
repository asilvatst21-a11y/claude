export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function calcScore(exc: number, fren: number, curv: number) {
  const ep = Math.min(exc * 3, 40)
  const bp = Math.min(fren * 2, 30)
  const cp = Math.min(curv * 2, 30)
  let raw = Math.max(0, Math.min(100, 100 - ep - bp - cp))
  if (exc > 10) raw = Math.min(raw, 30)
  return parseFloat((raw * 0.3).toFixed(2))
}

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const motorista_id = searchParams.get('motorista_id')
  const periodo_ref = searchParams.get('periodo_ref')

  let query = supabase.from('telemetria').select('*').order('periodo_ref', { ascending: false })
  if (motorista_id) query = query.eq('motorista_id', parseInt(motorista_id))
  if (periodo_ref) query = query.eq('periodo_ref', periodo_ref)

  const { data, error } = await query
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const motorista_id = body.motorista_id
  const periodo_ref = body.periodo_ref
  const qtd_excessos_velocidade = Number(body.qtd_excessos_velocidade ?? 0)
  const qtd_frenagens_bruscas = Number(body.qtd_frenagens_bruscas ?? 0)
  const qtd_curvas_bruscas = Number(body.qtd_curvas_bruscas ?? 0)

  if (!motorista_id || !periodo_ref) {
    return NextResponse.json({ message: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const score_calculado = calcScore(qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas)

  const { data, error } = await supabase.from('telemetria').insert({
    motorista_id, periodo_ref, qtd_excessos_velocidade,
    qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado
  }).select().single()

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
