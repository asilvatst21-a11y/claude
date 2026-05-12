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

// Baixa todos os dados do Supabase e popula o localStorage
export async function pullFromCloud(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from('ff_sync')
      .select('entity_type, entity_id, data, deleted')
      .eq('business_id', getBusinessId())
      .eq('deleted', false)

    if (error || !data || data.length === 0) return false

    const grouped: Record<string, unknown[]> = {}
    for (const row of data) {
      if (!grouped[row.entity_type]) grouped[row.entity_type] = []
      grouped[row.entity_type].push(row.data)
    }

    for (const [entityType, items] of Object.entries(grouped)) {
      const localKey = ENTITY_KEYS[entityType]
      if (localKey) localStorage.setItem(localKey, JSON.stringify(items))
    }

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
