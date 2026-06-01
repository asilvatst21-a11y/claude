export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { calculateScore } from '@/lib/scoreService'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const id = parseInt(params.id)

  const { data: col, error } = await supabase
    .from('colaboradores').select('*').eq('id', id).single()
  if (error || !col) return NextResponse.json({ message: 'Não encontrado' }, { status: 404 })

  const scoreData = await calculateScore(id, supabase)
  return NextResponse.json({ ...col, ...scoreData })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const id = parseInt(params.id)
  const body = await req.json()

  const { data: existing } = await supabase.from('colaboradores').select('id').eq('id', id).single()
  if (!existing) return NextResponse.json({ message: 'Não encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('colaboradores').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const id = parseInt(params.id)
  const { error } = await supabase
    .from('colaboradores').update({ status: 'inativo' }).eq('id', id)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ message: 'Inativado com sucesso' })
}
