import { describe, it, expect } from 'vitest'
import { chaveTrip, pareceTimeout } from '../importacao'

describe('chaveTrip — casar viagem gravada com resultado calculado', () => {
  it('bate mesmo quando o saida_em volta do Postgres num formato diferente do toISOString()', () => {
    // Bug real: 0 viagens gravadas mesmo com linhas válidas, porque a
    // chave comparava a string crua e o Postgres reformata o timestamptz.
    const local = chaveTrip(520152, 'ABC1234', '2026-08-14T06:42:00.000Z')
    const doPostgres = chaveTrip(520152, 'ABC1234', '2026-08-14T06:42:00+00:00')
    expect(local).toBe(doPostgres)
  })

  it('bate com ou sem milissegundos', () => {
    expect(chaveTrip(1, 'X', '2026-08-14T06:42:00.000Z')).toBe(chaveTrip(1, 'X', '2026-08-14T06:42:00Z'))
  })

  it('viagens diferentes geram chaves diferentes', () => {
    expect(chaveTrip(1, 'ABC', '2026-08-14T06:42:00.000Z'))
      .not.toBe(chaveTrip(1, 'ABC', '2026-08-14T06:43:00.000Z'))
    expect(chaveTrip(1, 'ABC', '2026-08-14T06:42:00.000Z'))
      .not.toBe(chaveTrip(2, 'ABC', '2026-08-14T06:42:00.000Z'))
    expect(chaveTrip(1, 'ABC', '2026-08-14T06:42:00.000Z'))
      .not.toBe(chaveTrip(1, 'DEF', '2026-08-14T06:42:00.000Z'))
  })
})

describe('pareceTimeout', () => {
  it('reconhece a mensagem real do Postgres', () => {
    expect(pareceTimeout('canceling statement due to statement timeout')).toBe(true)
  })

  it('reconhece pelo código 57014', () => {
    expect(pareceTimeout('server error: 57014')).toBe(true)
  })

  it('não confunde com outros erros', () => {
    expect(pareceTimeout('duplicate key value violates unique constraint')).toBe(false)
    expect(pareceTimeout('null value in column "mapa" violates not-null constraint')).toBe(false)
  })
})
