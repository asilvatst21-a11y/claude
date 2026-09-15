// Tipos compartilhados do módulo de Apuração de KM. Ver regras.ts (cálculo),
// escopo.ts (filtro do indicador oficial), parser.ts (leitura do Excel),
// importacao.ts (gravação idempotente) e analises.ts (consultas).

export type RegraAplicada =
  | '0_erro_dado'
  | '1_sem_roteirizador'
  | '2_mapa_virado'
  | '3_sem_telemetria'
  | '4_telemetria_acima_maximo'
  | '5_aderencia_baixa'
  | '6_aderencia_ponderada'

export const REGRA_LABEL: Record<RegraAplicada, string> = {
  '0_erro_dado': '0 · Erro de dado (sem cálculo)',
  '1_sem_roteirizador': '1 · Sem KM do Roteirizador',
  '2_mapa_virado': '2 · Mapa virado — 50% Telemetria + 50% Roteirizador',
  '3_sem_telemetria': '3 · Sem KM de Telemetria — menor entre Roteirizador e Máximo',
  '4_telemetria_acima_maximo': '4 · Telemetria acima do Máximo — usa Máximo',
  '5_aderencia_baixa': '5 · Aderência baixa — média 50/50, limitada à telemetria',
  '6_aderencia_ponderada': '6 · Aderência ponderada — limitada à telemetria',
}

// Ordem de exibição/iteração das 7 categorias nas análises (independe de
// haver ou não viagens em cada uma no período filtrado).
export const REGRAS_EM_ORDEM: RegraAplicada[] = [
  '0_erro_dado', '1_sem_roteirizador', '2_mapa_virado', '3_sem_telemetria',
  '4_telemetria_acima_maximo', '5_aderencia_baixa', '6_aderencia_ponderada',
]

export interface ParametrosCalculoKm {
  limiteAderenciaBaixa: number
  pesoMapaViradoTelemetria: number
  custoPorKm: number
  vigenteAPartir: string // date 'YYYY-MM-DD'
}

export const PARAMETROS_KM_PADRAO: Omit<ParametrosCalculoKm, 'vigenteAPartir'> = {
  limiteAderenciaBaixa: 0.5,
  pesoMapaViradoTelemetria: 0.5,
  custoPorKm: 0,
}

// Linha normalizada, já com os campos de negócio identificados a partir do
// Excel de origem (ver parser.ts para o mapeamento real de colunas).
export interface LinhaViagemImportada {
  filial: string
  data: string // 'YYYY-MM-DD' — data final da viagem
  mapa: number | null
  placa: string | null
  saidaEm: string // ISO — obrigatório, é parte da chave natural

  cddCodigo: string | null
  cddNome: string | null
  transportadora: string | null
  regiao: string | null

  tipoEntrega: string | null
  tipoCarga: string | null
  tipoFrota: string | null
  tipoCombustivel: string | null
  classificacaoExtra: string | null

  kmRoteirizador: number | null
  kmTelemetria: number | null
  kmMaximoOrigem: number | null
  aderencia: number | null

  mapaVirado: boolean
  entregaDMais1: boolean
  carregamentoRoteirizadorEm: string | null
  carregamentoTelemetriaEm: string | null
  saidaTelemetriaEm: string | null
  entradaEm: string | null
  entradaTelemetriaEm: string | null

  entradaValida: boolean

  linhaOrigem: Record<string, unknown>
}

export interface ResultadoCalculoKm {
  kmConsiderado: number
  regraAplicada: RegraAplicada
  tetoAplicado: boolean
  kmMaximoUsado: number | null
  deltaKm: number | null
  deltaPct: number | null
}

export interface ResultadoEscopo {
  dentroDoEscopo: boolean
  motivoForaEscopo: string | null
}

// Linha "achatada" (km_trips + km_trip_results) usada pelas análises e pela
// validação de integridade — todas as funções que consomem isso são puras,
// só a busca no Supabase (analises.ts/validacao.ts) é I/O.
export interface LinhaApuracao {
  tripId: string
  data: string
  competencia: string
  mapa: number | null
  placa: string | null
  saidaEm: string
  cddCodigo: string | null
  cddNome: string | null
  transportadora: string | null

  kmRoteirizador: number | null
  kmTelemetria: number | null
  kmMaximoUsado: number | null
  aderencia: number | null

  kmConsiderado: number
  regraAplicada: RegraAplicada
  tetoAplicado: boolean
  deltaKm: number | null

  dentroDoEscopo: boolean
  motivoForaEscopo: string | null
  cddCadastrado: boolean
  entradaValida: boolean
}
