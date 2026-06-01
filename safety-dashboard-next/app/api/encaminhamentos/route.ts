export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const colaborador_id = searchParams.get('colaborador_id')
  const tipo = searchParams.get('tipo')
  const status = searchParams.get('status')
  const lider_id = searchParams.get('lider_id')

  let query = supabase.from('encaminhamentos').select('*, colaboradores(nome, cargo, setor)')
    .order('prazo', { ascending: true })
  if (colaborador_id) query = query.eq('colaborador_id', parseInt(colaborador_id))
  if (tipo) query = query.eq('tipo', tipo)
  if (status) query = query.eq('status', status)
  if (lider_id) query = query.eq('lider_id', parseInt(lider_id))

  const { data, error } = await query
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { colaborador_id, tipo, lider_id, prazo, status = 'pendente' } = body

  if (!colaborador_id || !tipo || !prazo) {
    return NextResponse.json({ message: 'Campos obrigatórios faltando' }, { status: 400 })
  }
  if (!['refazer_dto','feedback','encerramento_contrato'].includes(tipo)) {
    return NextResponse.json({ message: 'Tipo inválido' }, { status: 400 })
  }

  const { data, error } = await supabase.from('encaminhamentos')
    .insert({ colaborador_id, tipo, lider_id, prazo, status }).select().single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
