import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScoreComponents {
  dto: number
  conduta: number
  telemetria: number
}

export interface ScoreFlags {
  dtoCritical: boolean
  telemetriaCritical: boolean
}

export interface ScoreResult {
  score: number
  riskLevel: 'baixo' | 'medio' | 'alto' | 'critico'
  components: ScoreComponents
  flags: ScoreFlags
}

export async function calculateScore(
  colaboradorId: number,
  supabase: SupabaseClient
): Promise<ScoreResult> {
  const today = new Date().toISOString().split('T')[0]
  let dtoCritical = false
  let telemetriaCritical = false

  // DTO Component (30%)
  const { data: latestDtoArr } = await supabase
    .from('dtos')
    .select('*')
    .eq('colaborador_id', colaboradorId)
    .order('data_realizacao', { ascending: false })
    .limit(1)

  const latestDto = latestDtoArr?.[0]

  let raw_dto = 0
  if (!latestDto || latestDto.status === 'ausente') {
    raw_dto = 0
  } else if (latestDto.data_validade < today) {
    const daysOverdue = Math.floor(
      (new Date(today).getTime() - new Date(latestDto.data_validade).getTime()) /
        (1000 * 60 * 60 * 24)
    )
    if (daysOverdue > 30) {
      raw_dto = 0
      dtoCritical = true
    } else {
      raw_dto = 50
    }
  } else {
    raw_dto = 100
  }
  const dto_component = raw_dto * 0.3

  // Conduta Component (40%)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data: avaliacoes } = await supabase
    .from('avaliacoes_conduta')
    .select('*')
    .eq('colaborador_id', colaboradorId)
    .gte('data', ninetyDaysAgo)

  let raw_conduta = 100
  for (const a of avaliacoes ?? []) {
    if (a.tipo === 'ato_inseguro') raw_conduta -= a.gravidade * 4
    if (a.tipo === 'condicao_insegura') raw_conduta -= a.gravidade * 2
    if (a.tipo === 'abordagem_positiva') raw_conduta += a.gravidade * 3
  }
  raw_conduta = Math.max(0, Math.min(100, raw_conduta))
  const conduta_component = raw_conduta * 0.4

  // Telemetria Component (30%) — motoristas only
  const { data: colaboradorArr } = await supabase
    .from('colaboradores')
    .select('cargo')
    .eq('id', colaboradorId)
    .limit(1)

  const colaborador = colaboradorArr?.[0]
  const isMotorista =
    colaborador && colaborador.cargo.toLowerCase() === 'motorista'

  let telemetria_component = 30
  if (isMotorista) {
    const { data: telArr } = await supabase
      .from('telemetria')
      .select('*')
      .eq('motorista_id', colaboradorId)
      .order('periodo_ref', { ascending: false })
      .limit(1)

    const latest = telArr?.[0]
    if (latest) {
      const excess_penalty = Math.min(Number(latest.qtd_excessos_velocidade) * 3, 40)
      const braking_penalty = Math.min(Number(latest.qtd_frenagens_bruscas) * 2, 30)
      const curve_penalty = Math.min(Number(latest.qtd_curvas_bruscas) * 2, 30)
      let raw_telemetria = 100 - excess_penalty - braking_penalty - curve_penalty
      raw_telemetria = Math.max(0, Math.min(100, raw_telemetria))
      if (Number(latest.qtd_excessos_velocidade) > 10) {
        raw_telemetria = Math.min(raw_telemetria, 30)
        telemetriaCritical = true
      }
      telemetria_component = raw_telemetria * 0.3
    }
  }

  const score = Math.round(dto_component + conduta_component + telemetria_component)
  const riskLevel =
    score >= 75
      ? 'baixo'
      : score >= 50
      ? 'medio'
      : score >= 25
      ? 'alto'
      : 'critico'

  return {
    score,
    riskLevel,
    components: {
      dto: Math.round(dto_component),
      conduta: Math.round(conduta_component),
      telemetria: Math.round(telemetria_component),
    },
    flags: { dtoCritical, telemetriaCritical },
  }
}

// Separate from calculateScore so GET endpoints remain side-effect-free.
// Call this only after a write operation.
export async function ensureAutoEncaminhamento(
  colaboradorId: number,
  score: number,
  supabase: SupabaseClient
): Promise<boolean> {
  if (score >= 50) return false

  const { data: existing } = await supabase
    .from('encaminhamentos')
    .select('id')
    .eq('colaborador_id', colaboradorId)
    .eq('tipo', 'encerramento_contrato')
    .limit(1)

  if (existing && existing.length > 0) return false

  const prazo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  await supabase.from('encaminhamentos').insert({
    colaborador_id: colaboradorId,
    tipo: 'encerramento_contrato',
    prazo,
    status: 'pendente',
  })

  return true
}
