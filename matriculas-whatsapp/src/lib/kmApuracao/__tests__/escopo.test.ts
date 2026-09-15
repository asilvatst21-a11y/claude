import { describe, it, expect } from 'vitest'
import { avaliarEscopo, type EntradaEscopo } from '../escopo'

function entrada(parcial: Partial<EntradaEscopo>): EntradaEscopo {
  return {
    tipoEntrega: 'Rota', tipoCarga: 'Roteriz', tipoFrota: 'Padrao',
    tipoCombustivel: 'DIESEL S10', kmConsiderado: 50,
    ...parcial,
  }
}

describe('avaliarEscopo', () => {
  it('viagem que atende todos os critérios está no escopo', () => {
    expect(avaliarEscopo(entrada({}))).toEqual({ dentroDoEscopo: true, motivoForaEscopo: null })
  })

  it('tipo_carga "Extra" também está no escopo', () => {
    expect(avaliarEscopo(entrada({ tipoCarga: 'Extra' })).dentroDoEscopo).toBe(true)
  })

  it('tipo_entrega diferente de "Rota" fica fora, com motivo', () => {
    const r = avaliarEscopo(entrada({ tipoEntrega: 'Administrativa' }))
    expect(r.dentroDoEscopo).toBe(false)
    expect(r.motivoForaEscopo).toMatch(/tipo_entrega/)
  })

  it('tipo_carga fora de Roteriz/Extra (ex.: Recarga) fica fora', () => {
    const r = avaliarEscopo(entrada({ tipoCarga: 'Recarga' }))
    expect(r.dentroDoEscopo).toBe(false)
    expect(r.motivoForaEscopo).toMatch(/tipo_carga/)
  })

  it('tipo_frota diferente de "Padrao" fica fora', () => {
    const r = avaliarEscopo(entrada({ tipoFrota: 'Agregado' }))
    expect(r.dentroDoEscopo).toBe(false)
    expect(r.motivoForaEscopo).toMatch(/tipo_frota/)
  })

  it('combustível elétrico fica fora', () => {
    const r = avaliarEscopo(entrada({ tipoCombustivel: 'ELETRICO' }))
    expect(r.dentroDoEscopo).toBe(false)
    expect(r.motivoForaEscopo).toMatch(/combustivel/)
  })

  it('KM Considerado igual a zero fica fora, mesmo que os outros critérios batam', () => {
    const r = avaliarEscopo(entrada({ kmConsiderado: 0 }))
    expect(r.dentroDoEscopo).toBe(false)
    expect(r.motivoForaEscopo).toMatch(/km_considerado/)
  })

  it('tipo_carga ausente fica fora', () => {
    const r = avaliarEscopo(entrada({ tipoCarga: null }))
    expect(r.dentroDoEscopo).toBe(false)
  })
})
