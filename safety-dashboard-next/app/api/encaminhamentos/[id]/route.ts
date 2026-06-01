export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const id = parseInt(params.id)
  const body = await req.json()

  const allowed = ['status', 'prazo', 'observacoes']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  const { data, error } = await supabase
    .from('encaminhamentos').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json(data)
}
