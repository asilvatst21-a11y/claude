// Importação idempotente da planilha "Apuração de KM". Reimportar a mesma
// competência não duplica nem multiplica resultado — tudo é upsert pela
// chave natural de km_trips (filial, mapa, placa, saida_em).
import { supabase } from '../supabase'
import { calcularKmConsiderado, paramVigenteNaData } from './regras'
import { avaliarEscopo } from './escopo'
import { avaliarIntegridade, buscarLinhasParaValidacao } from './validacao'
import { PARAMETROS_KM_PADRAO, type LinhaViagemImportada, type ParametrosCalculoKm } from './types'
import { TAMANHO_LOTE_PARSER, type MensagemDoWorker } from './workerProtocolo'

const LOTE_GRAVACAO = 500

// saida_em volta do Postgres reformatado (ex.: "2026-08-14T06:42:00+00:00")
// — diferente do toISOString() usado localmente ("...T06:42:00.000Z"). Usar
// o instante (epoch ms) em vez da string crua pra casar viagem gravada com
// resultado calculado, senão toda linha fica "órfã" por divergência só de
// formatação (bug real: zerou a importação inteira sem nenhum erro).
export function chaveTrip(mapa: unknown, placa: unknown, saidaEm: string): string {
  return `${mapa}|${placa}|${new Date(saidaEm).getTime()}`
}

export interface ProgressoImportacaoKm {
  fase: 'lendo' | 'gravando'
  processados: number
  total: number
}
export type OnProgressoKm = (p: ProgressoImportacaoKm) => void

export interface ResultadoImportacaoKm {
  batchId: string
  competencia: string
  totalLinhas: number
  totalValidas: number
  totalGravadas: number
  status: 'concluido' | 'com_pendencias'
  pendencias: { codigo: string; descricao: string; quantidade: number }[]
}

interface KmMaxCadastro { mapa: number; kmMaximo: number; vigenteAPartir: string }

async function buscarKmMaxPorMapa(filial: string): Promise<Map<number, KmMaxCadastro[]>> {
  const { data, error } = await supabase
    .from('km_max')
    .select('mapa, km_maximo, vigente_a_partir')
    .eq('filial', filial)
    .limit(20000)
  if (error) throw new Error(error.message)
  const porMapa = new Map<number, KmMaxCadastro[]>()
  for (const r of data ?? []) {
    const lista = porMapa.get(r.mapa) ?? []
    lista.push({ mapa: r.mapa, kmMaximo: r.km_maximo, vigenteAPartir: r.vigente_a_partir })
    porMapa.set(r.mapa, lista)
  }
  return porMapa
}

async function buscarRulesConfig(filial: string): Promise<ParametrosCalculoKm[]> {
  const { data, error } = await supabase
    .from('km_rules_config')
    .select('limite_aderencia_baixa, peso_mapa_virado_telemetria, custo_por_km, vigente_a_partir')
    .eq('filial', filial)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    limiteAderenciaBaixa: r.limite_aderencia_baixa,
    pesoMapaViradoTelemetria: r.peso_mapa_virado_telemetria,
    custoPorKm: r.custo_por_km,
    vigenteAPartir: r.vigente_a_partir,
  }))
}

async function buscarCddCadastrado(filial: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('km_cdd_catalog')
    .select('cdd_codigo, transportadora')
    .eq('filial', filial)
    .eq('ativo', true)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => `${r.cdd_codigo}|${r.transportadora}`))
}

function competenciaMaisFrequente(linhas: { data: string }[]): string {
  const contagem = new Map<string, number>()
  for (const l of linhas) {
    const comp = l.data.slice(0, 7)
    contagem.set(comp, (contagem.get(comp) ?? 0) + 1)
  }
  let melhor = ''; let max = -1
  for (const [comp, n] of contagem) if (n > max) { melhor = comp; max = n }
  return melhor
}

export async function importarKmApuracao(
  filial: string,
  arquivo: File,
  usuarioEmail: string | null,
  onProgress?: OnProgressoKm
): Promise<ResultadoImportacaoKm> {
  const [kmMaxPorMapa, rulesConfig, cddCadastrado] = await Promise.all([
    buscarKmMaxPorMapa(filial), buscarRulesConfig(filial), buscarCddCadastrado(filial),
  ])

  const buffer = await arquivo.arrayBuffer()
  const worker = new Worker(new URL('./kmApuracaoWorker.ts', import.meta.url), { type: 'module' })

  let totalLinhas = 0
  let totalValidas = 0
  let gravadas = 0
  const competencias: string[] = []
  let cadeiaGravacao: Promise<void> = Promise.resolve()

  // Duas linhas diferentes da planilha com o mesmo mapa+placa+saída colidem
  // na chave natural — o upsert simplesmente sobrescreve, sem erro nenhum.
  // Conta quantas ficaram "perdidas" assim, pra não ser um sumiço silencioso.
  const contagemChaveNatural = new Map<string, number>()

  async function processarLote(linhas: LinhaViagemImportada[]): Promise<void> {
    for (const l of linhas) {
      competencias.push(l.data.slice(0, 7))
      const chave = chaveTrip(l.mapa, l.placa, l.saidaEm)
      contagemChaveNatural.set(chave, (contagemChaveNatural.get(chave) ?? 0) + 1)
    }

    for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO) {
      const sublote = linhas.slice(i, i + LOTE_GRAVACAO)
      const linhasComCalculo = sublote.map((l) => {
        const candidatosMax = l.mapa != null ? kmMaxPorMapa.get(l.mapa) ?? [] : []
        const vigenteMax = paramVigenteNaData(candidatosMax, l.data)
        const kmMaximo = vigenteMax?.kmMaximo ?? l.kmMaximoOrigem ?? null

        const config = paramVigenteNaData(rulesConfig, l.data) ?? { ...PARAMETROS_KM_PADRAO, vigenteAPartir: l.data }

        const calculo = calcularKmConsiderado({
          kmRoteirizador: l.kmRoteirizador,
          kmTelemetria: l.kmTelemetria,
          kmMaximo,
          aderencia: l.aderencia,
          mapaVirado: l.mapaVirado,
          temCarregamentoRoteirizador: !!l.carregamentoRoteirizadorEm,
          temCarregamentoTelemetria: !!l.carregamentoTelemetriaEm,
          entradaValida: l.entradaValida,
          limiteAderenciaBaixa: config.limiteAderenciaBaixa,
          pesoMapaViradoTelemetria: config.pesoMapaViradoTelemetria,
        })
        const escopo = avaliarEscopo({
          tipoEntrega: l.tipoEntrega, tipoCarga: l.tipoCarga, tipoFrota: l.tipoFrota,
          tipoCombustivel: l.tipoCombustivel, kmConsiderado: calculo.kmConsiderado,
        })
        const cddOk = l.cddCodigo != null && l.transportadora != null
          ? cddCadastrado.has(`${l.cddCodigo}|${l.transportadora}`)
          : false

        return { linha: l, calculo, escopo, cddOk, kmMaximoVigenteEncontrado: !!vigenteMax }
      })

      const tripRows = linhasComCalculo.map(({ linha }) => ({
        filial: linha.filial, competencia: linha.data.slice(0, 7), data: linha.data,
        mapa: linha.mapa, placa: linha.placa, saida_em: linha.saidaEm,
        cdd_codigo: linha.cddCodigo, cdd_nome: linha.cddNome, transportadora: linha.transportadora, regiao: linha.regiao,
        tipo_entrega: linha.tipoEntrega, tipo_carga: linha.tipoCarga, tipo_frota: linha.tipoFrota,
        tipo_combustivel: linha.tipoCombustivel, classificacao_extra: linha.classificacaoExtra,
        km_roteirizador: linha.kmRoteirizador, km_telemetria: linha.kmTelemetria,
        km_maximo_origem: linha.kmMaximoOrigem, aderencia: linha.aderencia,
        mapa_virado: linha.mapaVirado, entrega_d_mais_1: linha.entregaDMais1,
        carregamento_roteirizador_em: linha.carregamentoRoteirizadorEm,
        carregamento_telemetria_em: linha.carregamentoTelemetriaEm,
        saida_telemetria_em: linha.saidaTelemetriaEm,
        entrada_em: linha.entradaEm, entrada_telemetria_em: linha.entradaTelemetriaEm,
        entrada_valida: linha.entradaValida, linha_origem: linha.linhaOrigem,
      }))

      const { data: tripsGravados, error: eTrips } = await supabase
        .from('km_trips')
        .upsert(tripRows, { onConflict: 'filial,mapa,placa,saida_em' })
        .select('id, mapa, placa, saida_em')
      if (eTrips) throw new Error(eTrips.message)

      const idPorChave = new Map<string, string>()
      for (const t of tripsGravados ?? []) idPorChave.set(chaveTrip(t.mapa, t.placa, t.saida_em), t.id)

      const resultRows = linhasComCalculo.flatMap(({ linha, calculo, escopo, cddOk, kmMaximoVigenteEncontrado }) => {
        const tripId = idPorChave.get(chaveTrip(linha.mapa, linha.placa, linha.saidaEm))
        if (!tripId) return []
        return [{
          trip_id: tripId,
          km_considerado: calculo.kmConsiderado,
          regra_aplicada: calculo.regraAplicada,
          teto_aplicado: calculo.tetoAplicado,
          km_maximo_usado: kmMaximoVigenteEncontrado ? calculo.kmMaximoUsado : null,
          delta_km: calculo.deltaKm,
          delta_pct: calculo.deltaPct,
          dentro_do_escopo: escopo.dentroDoEscopo,
          motivo_fora_escopo: escopo.motivoForaEscopo,
          cdd_cadastrado: cddOk,
          entradas_calculo: {
            kmRoteirizador: linha.kmRoteirizador, kmTelemetria: linha.kmTelemetria,
            kmMaximo: calculo.kmMaximoUsado, aderencia: linha.aderencia, mapaVirado: linha.mapaVirado,
          },
        }]
      })

      const { error: eResults } = await supabase
        .from('km_trip_results')
        .upsert(resultRows, { onConflict: 'trip_id' })
      if (eResults) throw new Error(eResults.message)

      gravadas += resultRows.length
      onProgress?.({ fase: 'gravando', processados: gravadas, total: totalLinhas || totalValidas })
    }
  }

  await new Promise<void>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<MensagemDoWorker>) => {
      const msg = ev.data
      if (msg.tipo === 'progresso') {
        totalLinhas = msg.totalLinhas
        onProgress?.({ fase: 'lendo', processados: msg.linhasProcessadas, total: msg.totalLinhas })
      } else if (msg.tipo === 'lote') {
        totalValidas += msg.linhas.length
        cadeiaGravacao = cadeiaGravacao.then(() => processarLote(msg.linhas))
      } else if (msg.tipo === 'fim') {
        totalLinhas = msg.totalLinhas
        cadeiaGravacao.then(resolve).catch(reject)
      } else if (msg.tipo === 'erro') {
        reject(new Error(msg.mensagem))
      }
    }
    worker.onerror = (ev) => reject(new Error(ev.message))
    worker.postMessage({ tipo: 'iniciar', buffer, filial }, [buffer])
  }).finally(() => worker.terminate())

  const competencia = competenciaMaisFrequente(competencias.map((c) => ({ data: `${c}-01` })))

  const linhasValidacao = await buscarLinhasParaValidacao(filial, competencia)
  const validacao = avaliarIntegridade(linhasValidacao, totalLinhas, totalValidas)

  const colisoesChaveNatural = [...contagemChaveNatural.values()].reduce((acc, n) => acc + Math.max(0, n - 1), 0)
  if (colisoesChaveNatural > 0) {
    validacao.pendencias.push({
      codigo: 'chave_natural_duplicada',
      descricao: 'Linhas com o mesmo mapa+placa+saída na planilha — só a última de cada grupo foi gravada',
      quantidade: colisoesChaveNatural,
    })
    validacao.ok = false
  }

  const { data: batch, error: eBatch } = await supabase
    .from('km_import_batches')
    .upsert({
      filial, competencia, arquivo_nome: arquivo.name,
      total_linhas: totalLinhas, total_calculadas: gravadas,
      status: validacao.ok ? 'concluido' : 'com_pendencias',
      pendencias: validacao.pendencias,
      importado_por: usuarioEmail, importado_em: new Date().toISOString(),
    }, { onConflict: 'filial,competencia' })
    .select('id')
    .single()
  if (eBatch) throw new Error(eBatch.message)

  return {
    batchId: batch.id, competencia, totalLinhas, totalValidas, totalGravadas: gravadas,
    status: validacao.ok ? 'concluido' : 'com_pendencias', pendencias: validacao.pendencias,
  }
}

// Só pra deixar explícito que o tamanho de lote do parser (worker) e o de
// gravação são propositalmente diferentes — o do parser é maior porque só
// serializa mensagem entre threads, o de gravação é menor por causa do
// limite de payload do PostgREST.
export { TAMANHO_LOTE_PARSER, LOTE_GRAVACAO as TAMANHO_LOTE_GRAVACAO }
