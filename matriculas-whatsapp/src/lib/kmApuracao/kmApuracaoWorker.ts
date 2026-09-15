// Web Worker: parseia a planilha "Apuração de KM" fora da thread principal.
// É a única importação do projeto grande o bastante (~80MB / ~80 mil linhas)
// pra justificar isso — os demais importadores rodam o parse na thread
// principal porque terminam quase instantâneo.
//
// Tipado sem depender das libs "DOM"+"webworker" do TS ao mesmo tempo (o
// tsconfig do projeto já inclui "DOM" pra todo `src/`, e as duas libs juntas
// colidem em vários globais) — por isso o cast para `EscopoWorker` abaixo em
// vez de `/// <reference lib="webworker" />`.
import { lerPlanilha, converterLinha } from './parser'
import { TAMANHO_LOTE_PARSER, type MensagemParaWorker, type MensagemDoWorker } from './workerProtocolo'
import type { LinhaViagemImportada } from './types'

interface EscopoWorker {
  postMessage: (msg: MensagemDoWorker) => void
  onmessage: ((ev: { data: MensagemParaWorker }) => void) | null
}

const ctx = self as unknown as EscopoWorker

ctx.onmessage = (ev) => {
  const msg = ev.data
  if (msg.tipo !== 'iniciar') return
  try {
    const { linhas, colunas, header } = lerPlanilha(msg.buffer)
    const total = linhas.length
    let lote: LinhaViagemImportada[] = []
    let validas = 0

    for (let i = 0; i < total; i++) {
      const convertida = converterLinha(linhas[i], colunas, header)
      if (convertida) {
        convertida.filial = msg.filial
        lote.push(convertida)
        validas++
      }
      if (lote.length >= TAMANHO_LOTE_PARSER) {
        ctx.postMessage({ tipo: 'lote', linhas: lote })
        lote = []
      }
      if (i % 500 === 0 || i === total - 1) {
        ctx.postMessage({ tipo: 'progresso', linhasProcessadas: i + 1, totalLinhas: total })
      }
    }
    if (lote.length > 0) ctx.postMessage({ tipo: 'lote', linhas: lote })
    ctx.postMessage({ tipo: 'fim', totalLinhas: total, totalValidas: validas })
  } catch (err) {
    ctx.postMessage({ tipo: 'erro', mensagem: err instanceof Error ? err.message : String(err) })
  }
}
