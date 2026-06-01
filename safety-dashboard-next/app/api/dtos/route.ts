export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function deriveStatus(data_validade: string): string {
  const today = new Date().toISOString().split('T')[0]
  return data_validade >= today ? 'em_dia' : 'vencido'
}

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const colaborador_id = searchParams.get('colaborador_id')
  const status = searchParams.get('status')
  const lider_id = searchParams.get('lider_id')

  let query = supabase.from('dtos').select('*').order('data_realizacao', { ascending: false })
  if (colaborador_id) query = query.eq('colaborador_id', parseInt(colaborador_id))
  if (lider_id) query = query.eq('lider_id', parseInt(lider_id))

  const { data, error } = await query
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const withDerived = (data ?? []).map(d => ({
    ...d,
    status: d.status === 'ausente' ? 'ausente' : deriveStatus(d.data_validade)
  }))

  const filtered = status
    ? withDerived.filter(d => d.status === status)
    : withDerived

  return NextResponse.json(filtered)
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { colaborador_id, data_realizacao, data_validade, status, lider_id, observacoes } = body

  if (!colaborador_id || !data_realizacao || !data_validade) {
    return NextResponse.json({ message: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const { data, error } = await supabase.from('dtos').insert({
    colaborador_id, data_realizacao, data_validade,
    status: status || deriveStatus(data_validade),
    lider_id, observacoes
  }).select().single()

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
