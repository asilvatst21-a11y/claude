import { supabase, getBusinessId, ENTITY_KEYS } from './supabase'
import type { Customer } from '../types'

// Salva cliente diretamente para um business_id específico (usado no cadastro público)
export async function pushCustomerPublic(businessId: string, customer: Customer): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('ff_sync').upsert({
      id: `customers_${customer.id}`,
      business_id: businessId,
      entity_type: 'customers',
      entity_id: customer.id,
      data: customer,
      deleted: false,
      synced_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

// Envia um registro para o Supabase (fire-and-forget)
export async function pushRecord(entityType: string, entityId: string, data: unknown) {
  if (!supabase) return
  try {
    await supabase.from('ff_sync').upsert({
      id: `${entityType}_${entityId}`,
      business_id: getBusinessId(),
      entity_type: entityType,
      entity_id: entityId,
      data,
      deleted: false,
      synced_at: new Date().toISOString(),
    })
  } catch { /* silencioso — dados já salvos no localStorage */ }
}

// Marca um registro como deletado no Supabase
export async function deleteRecord(entityType: string, entityId: string) {
  if (!supabase) return
  try {
    await supabase.from('ff_sync').upsert({
      id: `${entityType}_${entityId}`,
      business_id: getBusinessId(),
      entity_type: entityType,
      entity_id: entityId,
      data: {},
      deleted: true,
      synced_at: new Date().toISOString(),
    })
  } catch { /* silencioso */ }
}

// Verifica se há dados novos no Supabase desde a última sincronização
export async function hasNewData(): Promise<boolean> {
  if (!supabase) return false
  try {
    const lastPull = localStorage.getItem('ff_last_pull') || new Date(0).toISOString()
    const { data } = await supabase
      .from('ff_sync')
      .select('id')
      .eq('business_id', getBusinessId())
      .gt('synced_at', lastPull)
      .limit(1)
    return (data?.length ?? 0) > 0
  } catch {
    return false
  }
}

// Baixa todos os dados do Supabase e popula o localStorage
export async function pullFromCloud(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from('ff_sync')
      .select('entity_type, entity_id, data, deleted')
      .eq('business_id', getBusinessId())
      .eq('deleted', false)

    if (error) return false

    const grouped: Record<string, unknown[]> = {}
    for (const row of (data ?? [])) {
      if (!grouped[row.entity_type]) grouped[row.entity_type] = []
      grouped[row.entity_type].push(row.data)
    }

    // Sobrescreve o localStorage com os dados da nuvem.
    // Chaves ausentes na nuvem são explicitamente limpas — nuvem é fonte de verdade.
    for (const [entityType, localKey] of Object.entries(ENTITY_KEYS)) {
      if (grouped[entityType]) {
        localStorage.setItem(localKey, JSON.stringify(grouped[entityType]))
      } else {
        localStorage.removeItem(localKey)
      }
    }

    localStorage.setItem('ff_last_pull', new Date().toISOString())
    return true
  } catch {
    return false
  }
}

// Envia todos os dados locais para o Supabase (usado no primeiro sync)
export async function pushAllToCloud() {
  if (!supabase) return
  for (const [entityType, localKey] of Object.entries(ENTITY_KEYS)) {
    try {
      const items = JSON.parse(localStorage.getItem(localKey) || '[]') as Array<{ id: string }>
      for (const item of items) {
        await pushRecord(entityType, item.id, item)
      }
    } catch { /* silencioso */ }
  }
}
