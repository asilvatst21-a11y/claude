export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const setor = searchParams.get('setor')
  const lider_responsavel = searchParams.get('lider_responsavel')
  const status = searchParams.get('status')
  const cargo = searchParams.get('cargo')

  let query = supabase.from('colaboradores').select('*').order('nome', { ascending: true })

  if (setor) query = query.eq('setor', setor)
  if (lider_responsavel) query = query.eq('lider_responsavel', lider_responsavel)
  if (status) query = query.eq('status', status)
  if (cargo) query = query.eq('cargo', cargo)

  const { data, error } = await query

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { nome, cargo, setor, lider_responsavel, data_admissao, status = 'ativo' } = body

  if (!nome || !cargo || !setor || !lider_responsavel || !data_admissao) {
    return NextResponse.json({ message: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('colaboradores')
    .insert({ nome, cargo, setor, lider_responsavel, data_admissao, status })
    .select()
    .single()

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
