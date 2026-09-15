import { describe, it, expect } from 'vitest'
import {
  montarPorRegra, montarPerdaGanho, montarFaixasAderencia, montarTopPerdas,
  montarImpactoFinanceiro, montarRankingCdd, montarMediaPorCdd,
} from '../analises'
import { linhaApuracao } from './fixtures'

describe('montarPorRegra', () => {
  it('agrupa só as viagens no escopo e soma corretamente', () => {
    const linhas = [
      linhaApuracao({ regraAplicada: '3_sem_telemetria', kmRoteirizador: 50, kmConsiderado: 40 }),
      linhaApuracao({ regraAplicada: '3_sem_telemetria', kmRoteirizador: 30, kmConsiderado: 30 }),
      linhaApuracao({ regraAplicada: '6_aderencia_ponderada', kmRoteirizador: 100, kmConsiderado: 110, dentroDoEscopo: false }),
    ]
    const r = montarPorRegra(linhas)
    const regra3 = r.find((x) => x.regra === '3_sem_telemetria')!
    expect(regra3.viagens).toBe(2)
    expect(regra3.kmRoteirizador).toBe(80)
    expect(regra3.kmConsiderado).toBe(70)
    const regra6 = r.find((x) => x.regra === '6_aderencia_ponderada')!
    expect(regra6.viagens).toBe(0) // fora do escopo, não entra
  })

  it('regras sem nenhuma viagem aparecem zeradas, não somem da lista', () => {
    const r = montarPorRegra([linhaApuracao({ regraAplicada: '6_aderencia_ponderada' })])
    const regra0 = r.find((x) => x.regra === '0_erro_dado')!
    expect(regra0.viagens).toBe(0)
    expect(regra0.mediaConsideradoPorViagem).toBe(0)
  })
})

describe('montarPerdaGanho', () => {
  it('separa perda e ganho por regra, sem compensar entre viagens', () => {
    const linhas = [
      linhaApuracao({ regraAplicada: '6_aderencia_ponderada', kmConsiderado: 80, kmRoteirizador: 100 }), // perda -20
      linhaApuracao({ regraAplicada: '6_aderencia_ponderada', kmConsiderado: 130, kmRoteirizador: 100 }), // ganho +30
    ]
    const r = montarPerdaGanho(linhas)
    const regra6 = r.find((x) => x.regra === '6_aderencia_ponderada')!
    expect(regra6.viagensComPerda).toBe(1)
    expect(regra6.kmPerdido).toBeCloseTo(-20, 6)
    expect(regra6.viagensComGanho).toBe(1)
    expect(regra6.kmGanho).toBeCloseTo(30, 6)
  })
})

describe('montarFaixasAderencia', () => {
  it('aderência ausente cai na faixa < 50%', () => {
    const r = montarFaixasAderencia([linhaApuracao({ aderencia: null })])
    expect(r[0].viagens).toBe(1)
  })

  it('separa corretamente nas bordas das faixas', () => {
    const linhas = [
      linhaApuracao({ aderencia: 0.49 }),
      linhaApuracao({ aderencia: 0.5 }),
      linhaApuracao({ aderencia: 1.1 }),
    ]
    const r = montarFaixasAderencia(linhas)
    expect(r[0].viagens).toBe(1) // < 50%
    expect(r[1].viagens).toBe(1) // 50-70% (0.5 é o limite inferior, inclusivo)
    expect(r[4].viagens).toBe(1) // >= 110%
  })
})

describe('montarTopPerdas', () => {
  it('ordena da maior perda pra menor e respeita o N', () => {
    const linhas = [
      linhaApuracao({ kmConsiderado: 90, kmRoteirizador: 100 }), // -10
      linhaApuracao({ kmConsiderado: 20, kmRoteirizador: 100 }), // -80
      linhaApuracao({ kmConsiderado: 130, kmRoteirizador: 100 }), // +30, não é perda
    ]
    const r = montarTopPerdas(linhas, 1)
    expect(r).toHaveLength(1)
    expect(r[0].deltaKm).toBeCloseTo(-80, 6)
  })
})

describe('montarImpactoFinanceiro', () => {
  it('multiplica perda/ganho/delta pelo custo por km', () => {
    const linhas = [
      linhaApuracao({ kmConsiderado: 80, kmRoteirizador: 100 }), // -20
      linhaApuracao({ kmConsiderado: 130, kmRoteirizador: 100 }), // +30
    ]
    const r = montarImpactoFinanceiro(linhas, 2)
    expect(r.kmPerdidoBruto).toBeCloseTo(-20, 6)
    expect(r.kmGanhoBruto).toBeCloseTo(30, 6)
    expect(r.deltaLiquido).toBeCloseTo(10, 6)
    expect(r.reaisPerdidoBruto).toBeCloseTo(-40, 6)
    expect(r.reaisGanhoBruto).toBeCloseTo(60, 6)
    expect(r.reaisDeltaLiquido).toBeCloseTo(20, 6)
  })
})

describe('montarRankingCdd', () => {
  it('ordena do CDD com mais perda pro com menos', () => {
    const linhas = [
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 50, kmRoteirizador: 100 }), // -50
      linhaApuracao({ cddCodigo: 'B', kmConsiderado: 90, kmRoteirizador: 100 }), // -10
    ]
    const r = montarRankingCdd(linhas)
    expect(r[0].cddCodigo).toBe('A')
    expect(r[1].cddCodigo).toBe('B')
  })
})

describe('montarMediaPorCdd — indicador oficial e reconciliação com o total', () => {
  it('a soma das médias por CDD ponderada pela contagem bate com o total geral', () => {
    const linhas = [
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 10 }),
      linhaApuracao({ cddCodigo: 'A', kmConsiderado: 30 }),
      linhaApuracao({ cddCodigo: 'B', kmConsiderado: 100 }),
    ]
    const porCdd = montarMediaPorCdd(linhas)
    const totalViagens = linhas.length
    const totalKm = linhas.reduce((a, l) => a + l.kmConsiderado, 0)
    const mediaGeral = totalKm / totalViagens

    const somaPonderada = porCdd.reduce((a, c) => a + c.kmConsideradoMedio * c.viagens, 0)
    expect(somaPonderada / totalViagens).toBeCloseTo(mediaGeral, 9)
  })
})

describe('reimportar a mesma competência não duplica nem muda o resultado', () => {
  it('duas "importações" da mesma linha (mesma chave natural) produzem o mesmo agregado que uma', () => {
    // A idempotência real é garantida pelo upsert com onConflict na chave
    // natural (filial, mapa, placa, saida_em) em importacao.ts — aqui a
    // gente só confirma que, dado o mesmo conjunto final de linhas (que é o
    // que o upsert garante existir no banco depois de reimportar), o
    // agregado não muda.
    const linhasUmaImportacao = [linhaApuracao({ mapa: 1, kmConsiderado: 40 })]
    const linhasApósReimportar = [linhaApuracao({ mapa: 1, kmConsiderado: 40 })] // upsert substitui, não soma

    expect(montarMediaPorCdd(linhasUmaImportacao)).toEqual(montarMediaPorCdd(linhasApósReimportar))
  })
})
