export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { calculateScore } from '@/lib/scoreService'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { count: totalColaboradores } = await supabase
    .from('colaboradores').select('*', { count: 'exact', head: true })

  const { count: totalAtivos } = await supabase
    .from('colaboradores').select('*', { count: 'exact', head: true }).eq('status', 'ativo')

  const { data: allDtos } = await supabase.from('dtos').select('data_validade, status')
  let dtosEmDia = 0, dtosCriticos = 0
  for (const dto of allDtos ?? []) {
    if (dto.status === 'ausente') continue
    if (dto.data_validade < today) {
      const days = Math.floor((new Date(today).getTime() - new Date(dto.data_validade).getTime()) / 86400000)
      if (days > 30) dtosCriticos++
    } else {
      dtosEmDia++
    }
  }

  const { count: encaminhamentosPendentes } = await supabase
    .from('encaminhamentos').select('*', { count: 'exact', head: true }).eq('status', 'pendente')

  const { data: ativos } = await supabase
    .from('colaboradores').select('id').eq('status', 'ativo')

  let scoreSum = 0
  for (const col of ativos ?? []) {
    const { score } = await calculateScore(col.id, supabase)
    scoreSum += score
  }
  const scoreMedia = (ativos?.length ?? 0) > 0 ? Math.round(scoreSum / (ativos?.length ?? 1)) : 0

  return NextResponse.json({
    totalColaboradores, totalAtivos, dtosEmDia, dtosCriticos,
    encaminhamentosPendentes, scoreMedia
  })
}
