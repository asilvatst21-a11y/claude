// As 7 análises da apuração de KM — funções puras sobre LinhaApuracao[], só
// a busca (buscarLinhasApuracao) toca o Supabase. Todas as análises usam
// somente as viagens dentro do escopo oficial, igual ao "TOTAL DO CDD" da
// planilha de origem.
import { REGRAS_EM_ORDEM, type LinhaApuracao, type RegraAplicada } from './types'
import { buscarLinhasApuracao } from './consultas'

export { buscarLinhasApuracao }

function soEscopo(linhas: LinhaApuracao[]): LinhaApuracao[] {
  return linhas.filter((l) => l.dentroDoEscopo)
}

// ── 1. Por regra aplicada ───────────────────────────────────────────────
export interface LinhaPorRegra {
  regra: RegraAplicada
  viagens: number
  kmRoteirizador: number
  kmConsiderado: number
  delta: number
  deltaPct: number | null
  mediaRoteirizadorPorViagem: number
  mediaConsideradoPorViagem: number
}

export function montarPorRegra(linhas: LinhaApuracao[]): LinhaPorRegra[] {
  const escopo = soEscopo(linhas)
  return REGRAS_EM_ORDEM.map((regra) => {
    const grupo = escopo.filter((l) => l.regraAplicada === regra)
    const kmRot = grupo.reduce((a, l) => a + (l.kmRoteirizador ?? 0), 0)
    const kmCons = grupo.reduce((a, l) => a + l.kmConsiderado, 0)
    return {
      regra, viagens: grupo.length, kmRoteirizador: kmRot, kmConsiderado: kmCons,
      delta: kmCons - kmRot, deltaPct: kmRot !== 0 ? (kmCons - kmRot) / kmRot : null,
      mediaRoteirizadorPorViagem: grupo.length > 0 ? kmRot / grupo.length : 0,
      mediaConsideradoPorViagem: grupo.length > 0 ? kmCons / grupo.length : 0,
    }
  })
}

// ── 2. Perda bruta x ganho bruto (não compensado) ───────────────────────
export interface LinhaPerdaGanho {
  regra: RegraAplicada
  viagensComPerda: number
  kmPerdido: number
  viagensComGanho: number
  kmGanho: number
  pctDaPerdaDoTotal: number
  viagensComTeto: number
}

export function montarPerdaGanho(linhas: LinhaApuracao[]): LinhaPerdaGanho[] {
  const escopo = soEscopo(linhas)
  const kmPerdidoTotal = Math.abs(escopo.filter((l) => (l.deltaKm ?? 0) < 0).reduce((a, l) => a + (l.deltaKm ?? 0), 0))
  return REGRAS_EM_ORDEM.map((regra) => {
    const grupo = escopo.filter((l) => l.regraAplicada === regra)
    const perdas = grupo.filter((l) => (l.deltaKm ?? 0) < 0)
    const ganhos = grupo.filter((l) => (l.deltaKm ?? 0) > 0)
    const kmPerdido = perdas.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
    const kmGanho = ganhos.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
    return {
      regra, viagensComPerda: perdas.length, kmPerdido, viagensComGanho: ganhos.length, kmGanho,
      pctDaPerdaDoTotal: kmPerdidoTotal > 0 ? Math.abs(kmPerdido) / kmPerdidoTotal : 0,
      viagensComTeto: grupo.filter((l) => l.tetoAplicado).length,
    }
  })
}

// ── 3. Faixas de aderência ───────────────────────────────────────────────
export interface FaixaAderencia { limiteInferior: number; limiteSuperior: number; rotulo: string }
export const FAIXAS_ADERENCIA_PADRAO: FaixaAderencia[] = [
  { limiteInferior: 0, limiteSuperior: 0.5, rotulo: 'Aderência < 50%' },
  { limiteInferior: 0.5, limiteSuperior: 0.7, rotulo: '50% a 70%' },
  { limiteInferior: 0.7, limiteSuperior: 0.9, rotulo: '70% a 90%' },
  { limiteInferior: 0.9, limiteSuperior: 1.1, rotulo: '90% a 110%' },
  { limiteInferior: 1.1, limiteSuperior: Infinity, rotulo: 'Aderência ≥ 110%' },
]

export interface LinhaFaixaAderencia {
  faixa: FaixaAderencia
  viagens: number
  kmRoteirizador: number
  kmConsiderado: number
  delta: number
  deltaMedioPorViagem: number
  kmPerdidoBruto: number
  viagensComPerda: number
}

export function montarFaixasAderencia(
  linhas: LinhaApuracao[], faixas: FaixaAderencia[] = FAIXAS_ADERENCIA_PADRAO
): LinhaFaixaAderencia[] {
  const escopo = soEscopo(linhas)
  return faixas.map((faixa) => {
    const grupo = escopo.filter((l) => {
      const a = l.aderencia ?? 0 // ausente cai na faixa < 50%, mesma regra do cálculo
      return a >= faixa.limiteInferior && a < faixa.limiteSuperior
    })
    const kmRot = grupo.reduce((a, l) => a + (l.kmRoteirizador ?? 0), 0)
    const kmCons = grupo.reduce((a, l) => a + l.kmConsiderado, 0)
    const perdas = grupo.filter((l) => (l.deltaKm ?? 0) < 0)
    return {
      faixa, viagens: grupo.length, kmRoteirizador: kmRot, kmConsiderado: kmCons, delta: kmCons - kmRot,
      deltaMedioPorViagem: grupo.length > 0 ? (kmCons - kmRot) / grupo.length : 0,
      kmPerdidoBruto: perdas.reduce((a, l) => a + (l.deltaKm ?? 0), 0), viagensComPerda: perdas.length,
    }
  })
}

// ── 4. Top viagens com maior perda ──────────────────────────────────────
export function montarTopPerdas(linhas: LinhaApuracao[], n = 20): LinhaApuracao[] {
  return soEscopo(linhas)
    .filter((l) => (l.deltaKm ?? 0) < 0)
    .sort((a, b) => (a.deltaKm ?? 0) - (b.deltaKm ?? 0))
    .slice(0, n)
}

// ── 5. Impacto financeiro ───────────────────────────────────────────────
export interface ImpactoFinanceiroKm {
  kmPerdidoBruto: number
  kmGanhoBruto: number
  deltaLiquido: number
  viagensAfetadasPerda: number
  reaisPerdidoBruto: number
  reaisGanhoBruto: number
  reaisDeltaLiquido: number
  reaisPerdidoPorViagemAfetada: number
}

export function montarImpactoFinanceiro(linhas: LinhaApuracao[], custoPorKm: number): ImpactoFinanceiroKm {
  const escopo = soEscopo(linhas)
  const perdas = escopo.filter((l) => (l.deltaKm ?? 0) < 0)
  const ganhos = escopo.filter((l) => (l.deltaKm ?? 0) > 0)
  const kmPerdidoBruto = perdas.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
  const kmGanhoBruto = ganhos.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
  const deltaLiquido = escopo.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
  return {
    kmPerdidoBruto, kmGanhoBruto, deltaLiquido, viagensAfetadasPerda: perdas.length,
    reaisPerdidoBruto: kmPerdidoBruto * custoPorKm, reaisGanhoBruto: kmGanhoBruto * custoPorKm,
    reaisDeltaLiquido: deltaLiquido * custoPorKm,
    reaisPerdidoPorViagemAfetada: perdas.length > 0 ? (kmPerdidoBruto * custoPorKm) / perdas.length : 0,
  }
}

// ── 6. Ranking de CDD por perda ─────────────────────────────────────────
export interface LinhaRankingCdd {
  cddCodigo: string
  cddNome: string | null
  viagens: number
  kmPerdidoBruto: number
  deltaLiquido: number
  perdaPorViagemAfetada: number
  pctDoConsiderado: number
}

export function montarRankingCdd(linhas: LinhaApuracao[]): LinhaRankingCdd[] {
  const escopo = soEscopo(linhas)
  const porCdd = new Map<string, LinhaApuracao[]>()
  for (const l of escopo) {
    const chave = l.cddCodigo ?? 's/cdd'
    const lista = porCdd.get(chave) ?? []
    lista.push(l)
    porCdd.set(chave, lista)
  }
  return [...porCdd.entries()].map(([cddCodigo, grupo]) => {
    const perdas = grupo.filter((l) => (l.deltaKm ?? 0) < 0)
    const kmPerdidoBruto = perdas.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
    const deltaLiquido = grupo.reduce((a, l) => a + (l.deltaKm ?? 0), 0)
    const kmConsideradoTotal = grupo.reduce((a, l) => a + l.kmConsiderado, 0)
    return {
      cddCodigo, cddNome: grupo[0]?.cddNome ?? null, viagens: grupo.length, kmPerdidoBruto, deltaLiquido,
      perdaPorViagemAfetada: perdas.length > 0 ? kmPerdidoBruto / perdas.length : 0,
      pctDoConsiderado: kmConsideradoTotal > 0 ? Math.abs(kmPerdidoBruto) / kmConsideradoTotal : 0,
    }
  }).sort((a, b) => a.kmPerdidoBruto - b.kmPerdidoBruto)
}

// ── 7. Média de KM por viagem por CDD (indicador oficial hoje) ─────────
export interface LinhaMediaPorCdd {
  cddCodigo: string
  cddNome: string | null
  viagens: number
  kmConsideradoMedio: number
}

export function montarMediaPorCdd(linhas: LinhaApuracao[]): LinhaMediaPorCdd[] {
  const escopo = soEscopo(linhas)
  const porCdd = new Map<string, LinhaApuracao[]>()
  for (const l of escopo) {
    const chave = l.cddCodigo ?? 's/cdd'
    const lista = porCdd.get(chave) ?? []
    lista.push(l)
    porCdd.set(chave, lista)
  }
  return [...porCdd.entries()].map(([cddCodigo, grupo]) => ({
    cddCodigo, cddNome: grupo[0]?.cddNome ?? null, viagens: grupo.length,
    kmConsideradoMedio: grupo.reduce((a, l) => a + l.kmConsiderado, 0) / grupo.length,
  })).sort((a, b) => b.viagens - a.viagens)
}
