export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase'
import { calculateScore } from '@/lib/scoreService'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const currentMonth = today.substring(0, 7)
  const alerts: object[] = []

  // DTOs vencidos > 30 dias
  const { data: dtos } = await supabase
    .from('dtos')
    .select('*, colaboradores(nome)')
    .neq('status', 'ausente')

  for (const dto of dtos ?? []) {
    if (dto.data_validade < today) {
      const days = Math.floor((new Date(today).getTime() - new Date(dto.data_validade).getTime()) / 86400000)
      if (days > 30) {
        alerts.push({
          type: 'dto_critico',
          message: `DTO vencido há ${days} dias`,
          colaborador_id: dto.colaborador_id,
          colaborador_nome: dto.colaboradores?.nome,
          severity: 'critico'
        })
      }
    }
  }

  // Telemetria crítica
  const { data: telCrits } = await supabase
    .from('telemetria')
    .select('*, colaboradores(nome)')
    .eq('periodo_ref', currentMonth)
    .gt('qtd_excessos_velocidade', 10)

  for (const tel of telCrits ?? []) {
    alerts.push({
      type: 'telemetria_critica',
      message: `${tel.qtd_excessos_velocidade} excessos de velocidade em ${currentMonth}`,
      colaborador_id: tel.motorista_id,
      colaborador_nome: tel.colaboradores?.nome,
      severity: 'alto'
    })
  }

  // Score baixo (encaminhamentos pendentes de encerramento)
  const { data: scoreBaixo } = await supabase
    .from('encaminhamentos')
    .select('colaborador_id, colaboradores(nome)')
    .eq('tipo', 'encerramento_contrato')
    .eq('status', 'pendente')

  for (const row of scoreBaixo ?? []) {
    const { score } = await calculateScore(row.colaborador_id, supabase)
    alerts.push({
      type: 'score_baixo',
      message: `Score ${score} — risco elevado`,
      colaborador_id: row.colaborador_id,
      colaborador_nome: (row.colaboradores as { nome?: string })?.nome,
      severity: score < 25 ? 'critico' : 'alto'
    })
  }

  return NextResponse.json(alerts)
}
