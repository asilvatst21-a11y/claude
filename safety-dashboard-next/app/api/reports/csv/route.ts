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
  const data_inicio = searchParams.get('data_inicio')
  const data_fim = searchParams.get('data_fim')
  const today = new Date().toISOString().split('T')[0]

  let query = supabase.from('colaboradores').select('*').eq('status', 'ativo').order('nome')
  if (setor) query = query.eq('setor', setor)
  if (lider_responsavel) query = query.eq('lider_responsavel', lider_responsavel)

  const { data: cols, error } = await query
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const rows = []
  for (const col of cols ?? []) {
    const { score, riskLevel } = await calculateScore(col.id, supabase)
    if (risco && riskLevel !== risco) continue

    if (data_inicio || data_fim) {
      const { count } = await supabase.from('avaliacoes_conduta')
        .select('*', { count: 'exact', head: true })
        .eq('colaborador_id', col.id)
        .gte('data', data_inicio || '1970-01-01')
        .lte('data', data_fim || today)
      if ((count ?? 0) === 0) continue
    }

    const { data: dtos } = await supabase.from('dtos').select('*')
      .eq('colaborador_id', col.id).order('data_realizacao', { ascending: false }).limit(1)
    const latestDto = dtos?.[0]
    const dto_status = !latestDto ? 'sem_dto' :
      latestDto.status === 'ausente' ? 'ausente' :
      latestDto.data_validade < today ? 'vencido' : 'em_dia'

    const { count: encPendentes } = await supabase.from('encaminhamentos')
      .select('*', { count: 'exact', head: true })
      .eq('colaborador_id', col.id).eq('status', 'pendente')

    rows.push([
      col.id, col.nome, col.cargo, col.setor, col.lider_responsavel,
      score, riskLevel, dto_status, latestDto?.data_validade || '', encPendentes ?? 0
    ])
  }

  const header = 'ID,Nome,Cargo,Setor,Líder Responsável,Score,Nível de Risco,Status DTO,Validade DTO,Encaminhamentos Pendentes\n'
  const csv = header + rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="safety-report-${today}.csv"`,
    }
  })
}
