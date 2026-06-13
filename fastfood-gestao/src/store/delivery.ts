import { supabase, getBusinessId } from './supabase'
import { pushRecord } from './sync'
import type { DeliveryConfig, OnlineOrder, Product } from '../types'

const CONFIG_KEY = 'ff_delivery_config'
const CONFIG_ENTITY_ID = 'config' // registro único por estabelecimento

export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  enabled: false,
  storeName: '',
  whatsapp: '',
  pixKey: '',
  pixName: '',
  pixCity: '',
  zones: [],
  minOrder: 0,
  notice: '',
}

// ---- Config (lado do estabelecimento) ----

export function getDeliveryConfigLocal(): DeliveryConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_DELIVERY_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_DELIVERY_CONFIG }
}

export function saveDeliveryConfig(cfg: DeliveryConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  pushRecord('delivery_config', CONFIG_ENTITY_ID, cfg).catch(() => {})
}

// Busca a config da nuvem (para sincronizar entre dispositivos do estabelecimento)
export async function fetchDeliveryConfigCloud(): Promise<DeliveryConfig | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('ff_sync')
      .select('data')
      .eq('business_id', getBusinessId())
      .eq('entity_type', 'delivery_config')
      .eq('deleted', false)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return { ...DEFAULT_DELIVERY_CONFIG, ...(data.data as DeliveryConfig) }
  } catch {
    return null
  }
}

// ---- Leitura pública (lado do cliente, site de pedidos) ----

export async function fetchPublicMenu(businessId: string): Promise<{ config: DeliveryConfig | null; products: Product[] }> {
  if (!supabase) return { config: null, products: [] }
  try {
    const { data, error } = await supabase
      .from('ff_sync')
      .select('entity_type, data')
      .eq('business_id', businessId)
      .eq('deleted', false)
      .in('entity_type', ['delivery_config', 'products'])

    if (error) return { config: null, products: [] }

    let config: DeliveryConfig | null = null
    const products: Product[] = []
    for (const row of data ?? []) {
      if (row.entity_type === 'delivery_config') {
        config = { ...DEFAULT_DELIVERY_CONFIG, ...(row.data as DeliveryConfig) }
      } else if (row.entity_type === 'products') {
        products.push(row.data as Product)
      }
    }
    return { config, products: products.filter(p => p.active) }
  } catch {
    return { config: null, products: [] }
  }
}

// ---- Pedidos online ----

// Cliente envia pedido (escrita pública, business_id explícito)
export async function submitOnlineOrder(businessId: string, order: OnlineOrder): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('ff_sync').upsert({
      id: `online_orders_${order.id}`,
      business_id: businessId,
      entity_type: 'online_orders',
      entity_id: order.id,
      data: order,
      deleted: false,
      synced_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

// Busca pedidos online por status para o estabelecimento atual
export async function fetchOnlineOrders(status?: OnlineOrder['status']): Promise<OnlineOrder[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('ff_sync')
      .select('data')
      .eq('business_id', getBusinessId())
      .eq('entity_type', 'online_orders')
      .eq('deleted', false)
    if (error) return []
    const orders = (data ?? []).map(r => r.data as OnlineOrder)
    const filtered = status ? orders.filter(o => o.status === status) : orders
    return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

// Marca pedido como aceito (continua visível na fila)
export async function acceptOnlineOrder(order: OnlineOrder): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('ff_sync').upsert({
      id: `online_orders_${order.id}`,
      business_id: getBusinessId(),
      entity_type: 'online_orders',
      entity_id: order.id,
      data: { ...order, status: 'accepted' },
      deleted: false,
      synced_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

// Remove pedido online (recusado ou já finalizado) — soft delete
export async function removeOnlineOrder(orderId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('ff_sync').upsert({
      id: `online_orders_${orderId}`,
      business_id: getBusinessId(),
      entity_type: 'online_orders',
      entity_id: orderId,
      data: {},
      deleted: true,
      synced_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

// Assina mudanças em pedidos online em tempo real
export function subscribeOnlineOrders(businessId: string, onChange: () => void) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('online_orders_watch_' + Math.random().toString(36).slice(2))
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ff_sync', filter: `business_id=eq.${businessId}` },
      (payload) => {
        const et = (payload.new as { entity_type?: string })?.entity_type
          ?? (payload.old as { entity_type?: string })?.entity_type
        if (et === 'online_orders') onChange()
      }
    )
    .subscribe()
  return () => { supabase!.removeChannel(channel) }
}
