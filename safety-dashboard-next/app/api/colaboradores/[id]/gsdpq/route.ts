export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient()
    const id = Number(params.id)

    const { data: col } = await supabase.from('colaboradores').select('nome').eq('id', id).single()
    const nome = col?.nome ?? ''

    // Fetch by colaborador_id OR by name (for records imported before seed)
    const { data: registros } = await supabase
      .from('gsdpq_registros')
      .select('*')
      .or(`colaborador_id.eq.${id},colaborador_nome.ilike.${encodeURIComponent(nome)}`)
      .order('data', { ascending: false })

    const { data: itensNo } = await supabase
      .from('gsdpq_itens_no')
      .select('item_nome, data')
      .or(`colaborador_id.eq.${id},colaborador_nome.ilike.${encodeURIComponent(nome)}`)
      .order('data', { ascending: false })

    // Count top recurring NO items
    const freq: Record<string, number> = {}
    for (const item of itensNo ?? []) {
      freq[item.item_nome] = (freq[item.item_nome] ?? 0) + 1
    }
    const topNos = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([item_nome, count]) => ({ item_nome, count }))

    return NextResponse.json({ registros: registros ?? [], topNos, totalNo: itensNo?.length ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
