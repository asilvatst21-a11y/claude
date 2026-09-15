// Protocolo de mensagens entre importacao.ts (thread principal) e
// kmApuracaoWorker.ts (Web Worker) — mantido num arquivo à parte pra não
// duplicar os tipos nos dois lados.
import type { LinhaViagemImportada } from './types'

export const TAMANHO_LOTE_PARSER = 2000

export interface MensagemParaWorker {
  tipo: 'iniciar'
  buffer: ArrayBuffer
  filial: string
}

export type MensagemDoWorker =
  | { tipo: 'progresso'; linhasProcessadas: number; totalLinhas: number }
  | { tipo: 'lote'; linhas: LinhaViagemImportada[] }
  | { tipo: 'fim'; totalLinhas: number; totalValidas: number }
  | { tipo: 'erro'; mensagem: string }
