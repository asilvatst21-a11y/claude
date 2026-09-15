// Busca paginada de km_trips + km_trip_results, compartilhada por
// validacao.ts e analises.ts — mesmo padrão de PAGINA=1000 usado no resto do
// projeto (ex.: variavelArmazem.ts) pra não esbarrar no limite padrão de
// 1000 linhas do PostgREST.
import { supabase } from '../supabase'
import type { LinhaApuracao } from './types'

const PAGINA = 1000

interface LinhaBruta {
  km_considerado: number
  regra_aplicada: LinhaApuracao['regraAplicada']
  teto_aplicado: boolean
  km_maximo_usado: number | null
  delta_km: number | null
  dentro_do_escopo: boolean
  motivo_fora_escopo: string | null
  cdd_cadastrado: boolean
  km_trips: {
    id: string; data: string; competencia: string; mapa: number | null; placa: string | null
    saida_em: string; cdd_codigo: string | null; cdd_nome: string | null; transportadora: string | null
    km_roteirizador: number | null; km_telemetria: number | null; aderencia: number | null
    entrada_valida: boolean
  }
}

export async function buscarLinhasApuracao(
  filial: string, competencia: string, cddCodigo?: string
): Promise<LinhaApuracao[]> {
  const out: LinhaApuracao[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    let query = supabase
      .from('km_trip_results')
      .select(`
        km_considerado, regra_aplicada, teto_aplicado, km_maximo_usado, delta_km,
        dentro_do_escopo, motivo_fora_escopo, cdd_cadastrado,
        km_trips!inner (
          id, data, competencia, mapa, placa, saida_em, cdd_codigo, cdd_nome, transportadora,
          km_roteirizador, km_telemetria, aderencia, entrada_valida, filial
        )
      `)
      .eq('km_trips.filial', filial)
      .eq('km_trips.competencia', competencia)
      .range(inicio, inicio + PAGINA - 1)
    if (cddCodigo) query = query.eq('km_trips.cdd_codigo', cddCodigo)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as LinhaBruta[]) {
      const t = r.km_trips
      out.push({
        tripId: t.id, data: t.data, competencia: t.competencia, mapa: t.mapa, placa: t.placa,
        saidaEm: t.saida_em, cddCodigo: t.cdd_codigo, cddNome: t.cdd_nome, transportadora: t.transportadora,
        kmRoteirizador: t.km_roteirizador, kmTelemetria: t.km_telemetria, aderencia: t.aderencia,
        kmMaximoUsado: r.km_maximo_usado, kmConsiderado: r.km_considerado, regraAplicada: r.regra_aplicada,
        tetoAplicado: r.teto_aplicado, deltaKm: r.delta_km, dentroDoEscopo: r.dentro_do_escopo,
        motivoForaEscopo: r.motivo_fora_escopo, cddCadastrado: r.cdd_cadastrado, entradaValida: t.entrada_valida,
      })
    }
    if (!data || data.length < PAGINA) break
  }
  return out
}
