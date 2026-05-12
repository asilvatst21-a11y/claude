import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = url && key ? createClient(url, key) : null

export function getBusinessId(): string {
  let bid = localStorage.getItem('ff_business_id')
  if (!bid) {
    bid = crypto.randomUUID()
    localStorage.setItem('ff_business_id', bid)
  }
  return bid
}

export function setBusinessId(bid: string) {
  localStorage.setItem('ff_business_id', bid)
}

export const ENTITY_KEYS: Record<string, string> = {
  products:    'ff_products',
  ingredients: 'ff_ingredients',
  suppliers:   'ff_suppliers',
  purchases:   'ff_purchases',
  sales:       'ff_sales',
  fixed_costs: 'ff_fixed_costs',
  dre:         'ff_dre',
  customers:   'ff_customers',
}
