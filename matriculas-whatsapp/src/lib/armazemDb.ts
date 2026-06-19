import Dexie, { type Table } from 'dexie'
import type { ArmazemAtividadeTipo, ArmazemExecucao, ArmazemExecucaoPausa } from '../types'

// Fila de operações pendentes de sincronização com o Supabase. Cada item
// representa uma única gravação (criar ou atualizar uma linha) que precisa
// ser replicada quando a conexão voltar. Os ids das linhas são gerados no
// cliente (crypto.randomUUID), então reenviar um item já sincronizado (ex:
// depois de uma falha de rede no meio do envio) é seguro: usamos upsert por
// id nas criações e update por id nas atualizações.
export type FilaTabela = 'armazem_execucoes' | 'armazem_execucoes_pausas'
export type FilaAcao = 'upsert' | 'update'

export interface FilaItem {
  id: string
  tabela: FilaTabela
  acao: FilaAcao
  registroId: string
  payload: object
  criadoEm: number
}

class ArmazemDb extends Dexie {
  atividades!: Table<ArmazemAtividadeTipo, string>
  execucaoAtual!: Table<ArmazemExecucao, string>
  pausas!: Table<ArmazemExecucaoPausa, string>
  fila!: Table<FilaItem, string>

  constructor() {
    super('armazem-db')
    this.version(1).stores({
      atividades: 'id, filial',
      execucaoAtual: 'id, colaborador_id',
      pausas: 'id, execucao_id',
      fila: 'id, criadoEm',
    })
  }
}

export const armazemDb = new ArmazemDb()

export async function cacheAtividades(filial: string, atividades: ArmazemAtividadeTipo[]) {
  await armazemDb.atividades.where('filial').equals(filial).delete()
  await armazemDb.atividades.bulkPut(atividades)
}

export async function atividadesEmCache(filial: string): Promise<ArmazemAtividadeTipo[]> {
  return armazemDb.atividades.where('filial').equals(filial).sortBy('nome')
}

export async function enfileirar(item: Omit<FilaItem, 'id' | 'criadoEm'>) {
  await armazemDb.fila.add({ ...item, id: crypto.randomUUID(), criadoEm: Date.now() })
}
