import { describe, it, expect } from 'vitest'
import { parseNumero, serialParaDataLocal, converterLinha } from '../parser'

describe('parseNumero', () => {
  it('aceita número puro', () => {
    expect(parseNumero(42.5)).toEqual({ valor: 42.5, valido: true })
  })

  it('aceita formato BR (vírgula decimal, ponto de milhar)', () => {
    expect(parseNumero('1.234,56')).toEqual({ valor: 1234.56, valido: true })
  })

  it('célula vazia é ausente, não inválida', () => {
    expect(parseNumero(null)).toEqual({ valor: null, valido: true })
    expect(parseNumero('')).toEqual({ valor: null, valido: true })
  })

  it('texto ilegível é marcado como inválido (erro de dado)', () => {
    const r = parseNumero('abc')
    expect(r.valido).toBe(false)
    expect(r.valor).toBeNull()
  })

  it('NaN/Infinity numérico é inválido', () => {
    expect(parseNumero(NaN).valido).toBe(false)
  })
})

describe('serialParaDataLocal', () => {
  it('converte serial do Excel pra data/hora esperada', () => {
    // 46248 = 14/08/2026 00:00 no sistema de datas do Excel (Windows 1900)
    const d = serialParaDataLocal(46248)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // agosto = índice 7
    expect(d.getDate()).toBe(14)
  })

  it('a fração do serial vira hora/minuto', () => {
    const d = serialParaDataLocal(46248 + 6 / 24 + 42 / 1440) // 06:42
    expect(d.getHours()).toBe(6)
    expect(d.getMinutes()).toBe(42)
  })
})

describe('converterLinha — data/hora como texto (arquivo mensal completo)', () => {
  const colunas = {
    mapa: 0, placa: 1, codFilial: -1, nomeCdd: -1, transportadora: -1, geo: -1,
    entrega: -1, cargaAtual: -1, frota: -1, tipoCombustivel: -1, classificacaoExtra: -1,
    kmRoteirizador: -1, kmTelemetria: -1, kmMax: -1, aderencia: -1, mapaVirado: -1, dMais1: -1,
    data: 2, hrCarregRot: -1, hrCarregTel: -1, hrSaiRot: 3, hrSaiTel: -1, hrEntrRot: -1, hrEntrTel: -1,
  }
  const header = ['mapa', 'placa', 'data', 'hr_sai_2artq']

  it('aceita data em texto ISO ("2026-08-14")', () => {
    const r = converterLinha([520152, 'ABC1234', '2026-08-14', '2026-08-14 06:42:00'], colunas, header)
    expect(r).not.toBeNull()
    expect(r!.data).toBe('2026-08-14')
    expect(r!.saidaEm.startsWith('2026-08-14')).toBe(true)
  })

  it('aceita data em texto BR ("14/08/2026")', () => {
    const r = converterLinha([520152, 'ABC1234', '14/08/2026', '14/08/2026 06:42:00'], colunas, header)
    expect(r).not.toBeNull()
    expect(r!.data).toBe('2026-08-14')
  })

  it('data em texto ilegível continua retornando null (linha ignorada, não é erro de dado)', () => {
    expect(converterLinha([520152, 'ABC1234', 'N/D', '2026-08-14 06:42:00'], colunas, header)).toBeNull()
  })
})

describe('converterLinha', () => {
  const colunas = {
    mapa: 0, placa: 1, codFilial: -1, nomeCdd: -1, transportadora: -1, geo: -1,
    entrega: -1, cargaAtual: -1, frota: -1, tipoCombustivel: -1, classificacaoExtra: -1,
    kmRoteirizador: -1, kmTelemetria: -1, kmMax: -1, aderencia: -1, mapaVirado: -1, dMais1: -1,
    data: 2, hrCarregRot: -1, hrCarregTel: -1, hrSaiRot: 3, hrSaiTel: -1, hrEntrRot: -1, hrEntrTel: -1,
  }
  const header = ['mapa', 'placa', 'data', 'hr_sai_2artq']

  it('retorna null quando falta saída ou data (não forma chave natural)', () => {
    expect(converterLinha([520152, 'ABC1234', null, 46248.28], colunas, header)).toBeNull()
    expect(converterLinha([520152, 'ABC1234', 46248, null], colunas, header)).toBeNull()
  })

  it('converte uma linha válida', () => {
    const r = converterLinha([520152, 'ABC1234', 46248, 46248.28], colunas, header)
    expect(r).not.toBeNull()
    expect(r!.mapa).toBe(520152)
    expect(r!.placa).toBe('ABC1234')
    expect(r!.data).toBe('2026-08-14')
    expect(r!.entradaValida).toBe(true)
  })
})
