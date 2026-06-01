export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const colaborador_id = searchParams.get('colaborador_id')
  const tipo = searchParams.get('tipo')
  const data_inicio = searchParams.get('data_inicio')
  const data_fim = searchParams.get('data_fim')

  let query = supabase.from('avaliacoes_conduta').select('*').order('data', { ascending: false })
  if (colaborador_id) query = query.eq('colaborador_id', parseInt(colaborador_id))
  if (tipo) query = query.eq('tipo', tipo)
  if (data_inicio) query = query.gte('data', data_inicio)
  if (data_fim) query = query.lte('data', data_fim)

  const { data, error } = await query
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { colaborador_id, data, tipo, descricao, gravidade, registrado_por } = body

  if (!colaborador_id || !data || !tipo || !descricao || !gravidade || !registrado_por) {
    return NextResponse.json({ message: 'Campos obrigatórios faltando' }, { status: 400 })
  }
  if (!['ato_inseguro','condicao_insegura','abordagem_positiva'].includes(tipo)) {
    return NextResponse.json({ message: 'Tipo inválido' }, { status: 400 })
  }
  if (gravidade < 1 || gravidade > 5) {
    return NextResponse.json({ message: 'Gravidade deve ser entre 1 e 5' }, { status: 400 })
  }

  const { data: row, error } = await supabase
    .from('avaliacoes_conduta').insert({ colaborador_id, data, tipo, descricao, gravidade, registrado_por })
    .select().single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(row, { status: 201 })
}
