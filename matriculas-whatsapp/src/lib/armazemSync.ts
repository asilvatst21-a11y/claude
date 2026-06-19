import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from './supabase'
import { armazemDb, type FilaItem } from './armazemDb'

let sincronizando = false

async function enviarItem(item: FilaItem): Promise<boolean> {
  try {
    const resultado = item.acao === 'upsert'
      ? await supabase.from(item.tabela).upsert(item.payload, { onConflict: 'id' })
      : await supabase.from(item.tabela).update(item.payload).eq('id', item.registroId)
    return !resultado.error
  } catch {
    return false
  }
}

// Processa a fila em ordem (preserva causalidade: ex. criar a execução antes
// de atualizar seu status). Para no primeiro erro de rede e tenta de novo na
// próxima chamada — itens já enviados não são reenviados.
export async function processarFilaArmazem(): Promise<void> {
  if (sincronizando || !navigator.onLine) return
  sincronizando = true
  try {
    const itens = await armazemDb.fila.orderBy('criadoEm').toArray()
    for (const item of itens) {
      const sucesso = await enviarItem(item)
      if (!sucesso) break
      await armazemDb.fila.delete(item.id)
    }
  } finally {
    sincronizando = false
  }
}

export function useArmazemSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const pendentes = useLiveQuery(() => armazemDb.fila.count(), [], 0)

  useEffect(() => {
    function aoFicarOnline() { setOnline(true); processarFilaArmazem() }
    function aoFicarOffline() { setOnline(false) }
    window.addEventListener('online', aoFicarOnline)
    window.addEventListener('offline', aoFicarOffline)
    processarFilaArmazem()
    const intervalo = setInterval(() => { if (navigator.onLine) processarFilaArmazem() }, 20000)
    return () => {
      window.removeEventListener('online', aoFicarOnline)
      window.removeEventListener('offline', aoFicarOffline)
      clearInterval(intervalo)
    }
  }, [])

  return { online, pendentes: pendentes ?? 0, sincronizarAgora: processarFilaArmazem }
}
