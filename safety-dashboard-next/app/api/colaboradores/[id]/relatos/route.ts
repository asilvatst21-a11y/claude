export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const id = Number(params.id)

    const { data, error } = await supabase
      .from('avaliacoes_conduta')
      .select('*')
      .eq('colaborador_id', id)
      .in('tipo', ['ato_inseguro', 'abordagem_positiva'])
      .order('data', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const atos = (data ?? []).filter(r => r.tipo === 'ato_inseguro')
    const positivas = (data ?? []).filter(r => r.tipo === 'abordagem_positiva')
    const saldo = positivas.length - atos.length

    return NextResponse.json({ relatos: data ?? [], atos: atos.length, positivas: positivas.length, saldo })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
