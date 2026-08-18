import { supabase } from './supabase'

export type MotivoTrocaPlaca = 'MANUTENCAO' | 'AJUSTE_FIXACAO' | 'MUDANCA_PERFIL' | 'OUTRO'

export const MOTIVOS_TROCA_PLACA: { value: MotivoTrocaPlaca; label: string }[] = [
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'AJUSTE_FIXACAO', label: 'Ajuste de Fixação' },
  { value: 'MUDANCA_PERFIL', label: 'Mudança de Perfil' },
  { value: 'OUTRO', label: 'Outro' },
]

export interface TrocaPlaca {
  mapa: number
  data: string // yyyy-mm-dd
  placaGerado: string
  placaCarregado: string
  motivo: MotivoTrocaPlaca | null
  osNumero: string | null
  osDescricao: string | null
}

// Buscar trocas de placa do 031120 (Mapa em Gerado vs Carregado), já
// filtradas e persistidas no import (ver handleSaida em DistribuicaoTML.tsx).
export async function buscarTrocasPlacaArmazem(filial: string, dataInicio?: string, dataFim?: string): Promise<TrocaPlaca[]> {
  const PAGINA = 1000
  const trocas: TrocaPlaca[] = []

  for (let offset = 0; ; offset += PAGINA) {
    let query = supabase
      .from('frota_iv_al_trocas_placa')
      .select('mapa, data, placa_gerado, placa_carregado, motivo, os_numero, os_descricao')
      .eq('filial', filial)
      .order('data')
      .range(offset, offset + PAGINA - 1)

    if (dataInicio) query = query.gte('data', dataInicio)
    if (dataFim) query = query.lte('data', dataFim)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    if (!data?.length) break

    for (const row of data) {
      trocas.push({
        mapa: row.mapa,
        data: row.data,
        placaGerado: row.placa_gerado,
        placaCarregado: row.placa_carregado,
        motivo: (row.motivo as MotivoTrocaPlaca | null) ?? null,
        osNumero: row.os_numero ?? null,
        osDescricao: row.os_descricao ?? null,
      })
    }

    if (data.length < PAGINA) break
  }

  return trocas
}

// Classifica manualmente o motivo de uma troca já registrada. OS é
// opcional mesmo para Manutenção — nem toda troca por manutenção abre OS.
export async function salvarMotivoTroca(
  filial: string,
  mapa: number,
  motivo: MotivoTrocaPlaca,
  osNumero: string | null,
  osDescricao: string | null,
  classificadoPor: string
): Promise<void> {
  const { error } = await supabase
    .from('frota_iv_al_trocas_placa')
    .update({
      motivo,
      os_numero: osNumero,
      os_descricao: osDescricao,
      motivo_classificado_em: new Date().toISOString(),
      motivo_classificado_por: classificadoPor,
    })
    .eq('filial', filial)
    .eq('mapa', mapa)
  if (error) throw new Error(error.message)
}

// ── Ranking de placas: cada placa envolvida numa troca (seja como origem
// "Gerado" ou destino "Carregado") conta uma ocorrência, quebrada por
// motivo. Não há vínculo com motorista nessa tabela — só placa e mapa.
export interface RankingPlaca {
  placa: string
  total: number
  porMotivo: Record<MotivoTrocaPlaca, number>
  semMotivo: number
}

export function rankingPlacas(trocas: TrocaPlaca[]): RankingPlaca[] {
  const porPlaca = new Map<string, RankingPlaca>()

  function registrar(placa: string, motivo: MotivoTrocaPlaca | null) {
    if (!porPlaca.has(placa)) {
      porPlaca.set(placa, {
        placa,
        total: 0,
        porMotivo: { MANUTENCAO: 0, AJUSTE_FIXACAO: 0, MUDANCA_PERFIL: 0, OUTRO: 0 },
        semMotivo: 0,
      })
    }
    const r = porPlaca.get(placa)!
    r.total++
    if (motivo) r.porMotivo[motivo]++
    else r.semMotivo++
  }

  for (const t of trocas) {
    registrar(t.placaGerado, t.motivo)
    registrar(t.placaCarregado, t.motivo)
  }

  return [...porPlaca.values()].sort((a, b) => b.total - a.total)
}

// ── Trocas mês a mês, quebradas por motivo.
export interface MesTrocaPlaca {
  mes: string // "2026-01"
  total: number
  porMotivo: Record<MotivoTrocaPlaca, number>
  semMotivo: number
}

export function trocasPorMes(trocas: TrocaPlaca[]): MesTrocaPlaca[] {
  const porMes = new Map<string, MesTrocaPlaca>()

  for (const t of trocas) {
    const mes = t.data.slice(0, 7)
    if (!porMes.has(mes)) {
      porMes.set(mes, {
        mes,
        total: 0,
        porMotivo: { MANUTENCAO: 0, AJUSTE_FIXACAO: 0, MUDANCA_PERFIL: 0, OUTRO: 0 },
        semMotivo: 0,
      })
    }
    const m = porMes.get(mes)!
    m.total++
    if (t.motivo) m.porMotivo[t.motivo]++
    else m.semMotivo++
  }

  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}
