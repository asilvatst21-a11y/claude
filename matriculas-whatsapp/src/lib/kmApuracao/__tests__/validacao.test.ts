import { describe, it, expect } from 'vitest'
import { avaliarIntegridade, diferencaReconciliacaoMediaPorCdd } from '../validacao'
import { linhaApuracao } from './fixtures'

describe('avaliarIntegridade', () => {
  it('sem nenhuma pendência quando tudo bate', () => {
    const linhas = [linhaApuracao({}), linhaApuracao({})]
    const r = avaliarIntegridade(linhas, 2, 2)
    expect(r.ok).toBe(true)
    expect(r.pendencias).toEqual([])
  })

  it('acusa linhas ignoradas no parser (sem saída/data)', () => {
    const r = avaliarIntegridade([linhaApuracao({})], 5, 3) // 5 importadas, só 3 viraram linha válida
    expect(r.ok).toBe(false)
    expect(r.pendencias.find((p) => p.codigo === 'linhas_sem_saida_ou_data')?.quantidade).toBe(2)
  })

  it('acusa entrada inválida (erro de dado na origem)', () => {
    const linhas = [linhaApuracao({ entradaValida: false }), linhaApuracao({})]
    const r = avaliarIntegridade(linhas, 2, 2)
    expect(r.pendencias.find((p) => p.codigo === 'entrada_invalida')?.quantidade).toBe(1)
  })

  it('acusa viagem no escopo sem KM Máximo vigente', () => {
    const linhas = [linhaApuracao({ dentroDoEscopo: true, kmMaximoUsado: null }), linhaApuracao({})]
    const r = avaliarIntegridade(linhas, 2, 2)
    expect(r.pendencias.find((p) => p.codigo === 'sem_km_maximo_vigente')?.quantidade).toBe(1)
  })

  it('NÃO acusa sem KM Máximo quando a viagem está fora do escopo', () => {
    const linhas = [linhaApuracao({ dentroDoEscopo: false, kmMaximoUsado: null })]
    const r = avaliarIntegridade(linhas, 1, 1)
    expect(r.pendencias.find((p) => p.codigo === 'sem_km_maximo_vigente')).toBeUndefined()
  })

  it('acusa viagem no escopo com CDD/transportadora fora do cadastro — a causa raiz da divergência de hoje', () => {
    const linhas = [linhaApuracao({ dentroDoEscopo: true, cddCadastrado: false }), linhaApuracao({})]
    const r = avaliarIntegridade(linhas, 2, 2)
    expect(r.pendencias.find((p) => p.codigo === 'cdd_nao_cadastrado')?.quantidade).toBe(1)
    // e mesmo assim a viagem continua computada, não é descartada:
    expect(linhas[0].dentroDoEscopo).toBe(true)
  })
})

describe('diferencaReconciliacaoMediaPorCdd', () => {
  it('a soma das médias por CDD ponderada pela contagem bate com a média geral', () => {
    const linhas = [
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 10 }),
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 20 }),
      linhaApuracao({ cddCodigo: 'B', kmConsiderado: 100 }),
    ]
    expect(diferencaReconciliacaoMediaPorCdd(linhas)).toBeCloseTo(0, 9)
  })

  it('ignora viagens fora do escopo na reconciliação', () => {
    const linhas = [
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 10, dentroDoEscopo: true }),
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 99999, dentroDoEscopo: false }),
    ]
    expect(diferencaReconciliacaoMediaPorCdd(linhas)).toBeCloseTo(0, 9)
  })
})
