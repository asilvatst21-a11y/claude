export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { calculateScore } from '@/lib/scoreService'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const setor = searchParams.get('setor')
  const lider_responsavel = searchParams.get('lider_responsavel')
  const risco = searchParams.get('risco')

  let query = supabase.from('colaboradores').select('*').eq('status', 'ativo')
  if (setor) query = query.eq('setor', setor)
  if (lider_responsavel) query = query.eq('lider_responsavel', lider_responsavel)

  const { data: cols, error } = await query
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const results = await Promise.all((cols ?? []).map(async col => {
    const { score, riskLevel } = await calculateScore(col.id, supabase)
    return { id: col.id, nome: col.nome, setor: col.setor, cargo: col.cargo, score, riskLevel }
  }))

  const filtered = risco ? results.filter(r => r.riskLevel === risco) : results
  filtered.sort((a, b) => a.score - b.score)

  return NextResponse.json(filtered)
}
