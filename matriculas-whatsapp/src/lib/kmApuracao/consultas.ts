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

export interface LoteImportacaoKm {
  id: string
  filial: string
  competencia: string
  arquivoNome: string | null
  totalLinhas: number
  totalCalculadas: number
  status: 'processando' | 'concluido' | 'com_pendencias' | 'erro'
  pendencias: { codigo: string; descricao: string; quantidade: number }[]
  importadoPor: string | null
  importadoEm: string
}

function mapearLote(r: {
  id: string; filial: string; competencia: string; arquivo_nome: string | null
  total_linhas: number; total_calculadas: number; status: string
  pendencias: unknown; importado_por: string | null; importado_em: string
}): LoteImportacaoKm {
  return {
    id: r.id, filial: r.filial, competencia: r.competencia, arquivoNome: r.arquivo_nome,
    totalLinhas: r.total_linhas, totalCalculadas: r.total_calculadas,
    status: r.status as LoteImportacaoKm['status'],
    pendencias: (r.pendencias as LoteImportacaoKm['pendencias']) ?? [],
    importadoPor: r.importado_por, importadoEm: r.importado_em,
  }
}

// Histórico de importações de uma filial (tela de upload).
export async function buscarLotesImportacao(filial: string): Promise<LoteImportacaoKm[]> {
  const { data, error } = await supabase
    .from('km_import_batches')
    .select('id, filial, competencia, arquivo_nome, total_linhas, total_calculadas, status, pendencias, importado_por, importado_em')
    .eq('filial', filial)
    .order('competencia', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapearLote)
}

// Competências com dado importado pra uma filial — usado no seletor da
// página pública (sem exigir login, então não dá pra saber de antemão o que
// já foi importado).
export async function buscarCompetenciasDisponiveis(filial: string): Promise<LoteImportacaoKm[]> {
  return buscarLotesImportacao(filial)
}

// Custo por km vigente na data de referência (config configurável em
// km_rules_config) — usado só pra exibir o impacto financeiro; sem cadastro
// ainda, o custo é 0 (o painel mostra os km, sem valor em R$).
export async function buscarCustoPorKmVigente(filial: string, dataReferencia: string): Promise<number> {
  const { data, error } = await supabase
    .from('km_rules_config')
    .select('custo_por_km, vigente_a_partir')
    .eq('filial', filial)
    .lte('vigente_a_partir', dataReferencia)
    .order('vigente_a_partir', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.custo_por_km ?? 0
}

export async function buscarFiliais(): Promise<string[]> {
  const { data, error } = await supabase.from('filiais').select('nome').order('nome')
  if (error) throw new Error(error.message)
  return (data ?? []).map((f) => f.nome)
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
