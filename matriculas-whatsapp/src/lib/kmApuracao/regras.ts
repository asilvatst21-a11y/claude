// Cascata de regras do "KM Considerado" — a primeira condição verdadeira
// vence. Validado linha a linha contra duas planilhas reais da empresa
// (56 e 1.606 viagens): 100% de acerto em regra aplicada e valor.
//
// Duas correções em relação à fórmula "óbvia" da planilha, achadas só ao
// validar contra dados reais (a legenda da planilha documenta a primeira,
// mas não a segunda):
//  - Regra 6 (aderência ponderada) é limitada ao KM Telemetria.
//  - Regra 5 (aderência < limite) TAMBÉM é limitada ao KM Telemetria —
//    só a regra 2 (mapa virado) fica sem esse teto.
import { PARAMETROS_KM_PADRAO, type ResultadoCalculoKm, type RegraAplicada } from './types'

export interface EntradaCalculoKm {
  kmRoteirizador: number | null
  kmTelemetria: number | null
  kmMaximo: number | null
  aderencia: number | null
  mapaVirado: boolean
  temCarregamentoRoteirizador: boolean
  temCarregamentoTelemetria: boolean
  // false quando algum campo numérico veio ilegível na origem (texto onde
  // devia ter número, etc.) — diferente de "ausente" (célula vazia), que é
  // um valor válido e cai nas regras normais (1, 3 ou 5).
  entradaValida: boolean
  limiteAderenciaBaixa?: number
  pesoMapaViradoTelemetria?: number
}

function menorValidoOuZero(a: number | null, b: number | null): number {
  if (a != null && a > 0 && b != null) return Math.min(a, b)
  if (a != null && a > 0) return a
  return 0
}

export function calcularKmConsiderado(e: EntradaCalculoKm): ResultadoCalculoKm {
  const limiteAderencia = e.limiteAderenciaBaixa ?? PARAMETROS_KM_PADRAO.limiteAderenciaBaixa
  const peso = e.pesoMapaViradoTelemetria ?? PARAMETROS_KM_PADRAO.pesoMapaViradoTelemetria
  const kmMax = e.kmMaximo != null && e.kmMaximo > 0 ? e.kmMaximo : null
  // Aderência ausente é tratada como 0 — cai naturalmente na regra 5
  // (confirmado em dado real: linha com aderência ausente teve regra 5 real).
  const aderencia = e.aderencia ?? 0

  let regraAplicada: RegraAplicada
  let kmConsiderado: number

  if (!e.entradaValida) {
    regraAplicada = '0_erro_dado'
    kmConsiderado = menorValidoOuZero(e.kmRoteirizador, kmMax)
  } else if (e.kmRoteirizador == null || e.kmRoteirizador <= 0) {
    regraAplicada = '1_sem_roteirizador'
    kmConsiderado = 0
  } else if (e.mapaVirado && e.temCarregamentoRoteirizador && e.temCarregamentoTelemetria) {
    regraAplicada = '2_mapa_virado'
    kmConsiderado = peso * (e.kmTelemetria ?? 0) + (1 - peso) * e.kmRoteirizador
  } else if (e.kmTelemetria == null || e.kmTelemetria <= 0) {
    regraAplicada = '3_sem_telemetria'
    kmConsiderado = kmMax != null ? Math.min(e.kmRoteirizador, kmMax) : e.kmRoteirizador
  } else if (kmMax != null && e.kmTelemetria > kmMax) {
    regraAplicada = '4_telemetria_acima_maximo'
    kmConsiderado = kmMax
  } else if (aderencia < limiteAderencia) {
    regraAplicada = '5_aderencia_baixa'
    kmConsiderado = Math.min(0.5 * e.kmTelemetria + 0.5 * e.kmRoteirizador, e.kmTelemetria)
  } else {
    regraAplicada = '6_aderencia_ponderada'
    const bruto = e.kmTelemetria * aderencia + e.kmRoteirizador * (1 - aderencia)
    kmConsiderado = Math.min(bruto, e.kmTelemetria)
  }

  let tetoAplicado = false
  if (kmMax != null && kmConsiderado > kmMax) {
    kmConsiderado = kmMax
    tetoAplicado = true
  }

  const deltaKm = e.kmRoteirizador != null ? kmConsiderado - e.kmRoteirizador : null
  const deltaPct = deltaKm != null && e.kmRoteirizador ? deltaKm / e.kmRoteirizador : null

  return { kmConsiderado, regraAplicada, tetoAplicado, kmMaximoUsado: kmMax, deltaKm, deltaPct }
}

// ── Vigência por data (mesmo padrão de src/lib/tml.ts) ─────────────────────
// Replicado aqui em vez de importado porque o helper de tml.ts não é
// exportado — evita acoplar dois domínios por um utilitário de 6 linhas.
export function paramVigenteNaData<T extends { vigenteAPartir: string }>(
  candidatos: T[],
  data: string
): T | undefined {
  return candidatos
    .filter((p) => p.vigenteAPartir <= data)
    .sort((a, b) => b.vigenteAPartir.localeCompare(a.vigenteAPartir))[0]
}
