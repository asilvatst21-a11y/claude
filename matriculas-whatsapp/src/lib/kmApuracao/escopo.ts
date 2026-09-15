// Escopo do indicador oficial de KM — viagens fora daqui continuam gravadas
// (com o motivo), nunca descartadas.
import type { ResultadoEscopo } from './types'

const CARGAS_NO_ESCOPO = new Set(['Roteriz', 'Extra'])

export interface EntradaEscopo {
  tipoEntrega: string | null
  tipoCarga: string | null
  tipoFrota: string | null
  tipoCombustivel: string | null
  kmConsiderado: number
}

export function avaliarEscopo(e: EntradaEscopo): ResultadoEscopo {
  if (e.tipoEntrega !== 'Rota') {
    return { dentroDoEscopo: false, motivoForaEscopo: 'tipo_entrega diferente de "Rota"' }
  }
  if (!e.tipoCarga || !CARGAS_NO_ESCOPO.has(e.tipoCarga)) {
    return { dentroDoEscopo: false, motivoForaEscopo: 'tipo_carga fora de "Roteriz"/"Extra"' }
  }
  if (e.tipoFrota !== 'Padrao') {
    return { dentroDoEscopo: false, motivoForaEscopo: 'tipo_frota diferente de "Padrao"' }
  }
  if ((e.tipoCombustivel ?? '').trim().toUpperCase() === 'ELETRICO') {
    return { dentroDoEscopo: false, motivoForaEscopo: 'tipo_combustivel elétrico' }
  }
  if (e.kmConsiderado <= 0) {
    return { dentroDoEscopo: false, motivoForaEscopo: 'km_considerado igual a zero' }
  }
  return { dentroDoEscopo: true, motivoForaEscopo: null }
}
