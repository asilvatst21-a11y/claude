// Validação de integridade da importação — checagens puras sobre as linhas
// já calculadas (buscarLinhasParaValidacao é o único ponto de I/O). Uma
// competência com qualquer pendência é marcada "com_pendencias" no
// km_import_batches (ver importacao.ts), e o motivo fica consultável aqui.
import type { LinhaApuracao } from './types'
import { buscarLinhasApuracao } from './consultas'

export interface ItemPendenciaKm {
  codigo: string
  descricao: string
  quantidade: number
}

export interface ResultadoValidacaoKm {
  ok: boolean
  pendencias: ItemPendenciaKm[]
}

export async function buscarLinhasParaValidacao(filial: string, competencia: string): Promise<LinhaApuracao[]> {
  return buscarLinhasApuracao(filial, competencia)
}

export function avaliarIntegridade(
  linhas: LinhaApuracao[],
  totalLinhasImportadas: number,
  totalLinhasValidas: number
): ResultadoValidacaoKm {
  const pendencias: ItemPendenciaKm[] = []

  const ignoradasNoParser = totalLinhasImportadas - totalLinhasValidas
  if (ignoradasNoParser > 0) {
    pendencias.push({
      codigo: 'linhas_sem_saida_ou_data',
      descricao: 'Linhas da planilha sem saída ou data preenchida (não formam chave válida)',
      quantidade: ignoradasNoParser,
    })
  }

  const entradaInvalida = linhas.filter((l) => !l.entradaValida).length
  if (entradaInvalida > 0) {
    pendencias.push({
      codigo: 'entrada_invalida',
      descricao: 'Viagens com KM Roteirizador, Telemetria, Máximo ou Aderência ilegível na origem',
      quantidade: entradaInvalida,
    })
  }

  const semKmMaximoVigente = linhas.filter((l) => l.dentroDoEscopo && l.kmMaximoUsado == null).length
  if (semKmMaximoVigente > 0) {
    pendencias.push({
      codigo: 'sem_km_maximo_vigente',
      descricao: 'Viagens no escopo sem KM Máximo vigente cadastrado para a data',
      quantidade: semKmMaximoVigente,
    })
  }

  const cddNaoCadastrado = linhas.filter((l) => l.dentroDoEscopo && !l.cddCadastrado).length
  if (cddNaoCadastrado > 0) {
    pendencias.push({
      codigo: 'cdd_nao_cadastrado',
      descricao: 'Viagens no escopo com CDD/transportadora fora do cadastro',
      quantidade: cddNaoCadastrado,
    })
  }

  const diffReconciliacao = diferencaReconciliacaoMediaPorCdd(linhas)
  if (Math.abs(diffReconciliacao) > 0.01) {
    pendencias.push({
      codigo: 'reconciliacao_media_cdd',
      descricao: 'Total apurado não bate com a soma das médias por CDD ponderada pela contagem',
      quantidade: 1,
    })
  }

  return { ok: pendencias.length === 0, pendencias }
}

// Soma(contagem_cdd × média_cdd) / soma(contagem_cdd) deve ser exatamente a
// média geral — serve de guarda de regressão pras consultas de analises.ts
// (não é uma checagem de dado de negócio, é uma checagem da própria query).
export function diferencaReconciliacaoMediaPorCdd(linhas: LinhaApuracao[]): number {
  const noEscopo = linhas.filter((l) => l.dentroDoEscopo)
  if (noEscopo.length === 0) return 0
  const mediaGeral = noEscopo.reduce((acc, l) => acc + l.kmConsiderado, 0) / noEscopo.length

  const porCdd = new Map<string, { soma: number; n: number }>()
  for (const l of noEscopo) {
    const chave = l.cddCodigo ?? 's/cdd'
    const acc = porCdd.get(chave) ?? { soma: 0, n: 0 }
    acc.soma += l.kmConsiderado
    acc.n += 1
    porCdd.set(chave, acc)
  }
  const somaPonderada = [...porCdd.values()].reduce((acc, c) => acc + (c.soma / c.n) * c.n, 0)
  const totalContagem = [...porCdd.values()].reduce((acc, c) => acc + c.n, 0)
  const mediaReconstruida = somaPonderada / totalContagem

  return mediaReconstruida - mediaGeral
}
