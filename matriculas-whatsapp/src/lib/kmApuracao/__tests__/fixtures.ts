import type { LinhaApuracao, RegraAplicada } from '../types'

let contador = 0

export function linhaApuracao(parcial: Partial<LinhaApuracao> = {}): LinhaApuracao {
  contador++
  const kmRoteirizador = parcial.kmRoteirizador ?? 100
  const kmConsiderado = parcial.kmConsiderado ?? 100
  return {
    tripId: `trip-${contador}`,
    data: '2026-08-10',
    competencia: '2026-08',
    mapa: 500000 + contador,
    placa: `ABC${contador}`,
    saidaEm: '2026-08-10T09:00:00.000Z',
    cddCodigo: 'CDD1',
    cddNome: 'CDD Um',
    transportadora: '12',
    kmRoteirizador,
    kmTelemetria: 90,
    kmMaximoUsado: 200,
    aderencia: 0.9,
    kmConsiderado,
    regraAplicada: '6_aderencia_ponderada' as RegraAplicada,
    tetoAplicado: false,
    deltaKm: kmConsiderado - kmRoteirizador,
    dentroDoEscopo: true,
    motivoForaEscopo: null,
    cddCadastrado: true,
    entradaValida: true,
    ...parcial,
  }
}
