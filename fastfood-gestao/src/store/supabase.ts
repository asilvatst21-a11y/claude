import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = url && key ? createClient(url, key) : null

export function getBusinessId(): string {
  // Prefer auth user ID (set on login), fall back to legacy random ID
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

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) return { error: 'Supabase não configurado' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message || null }
}

export async function signUpWithEmail(email: string, password: string, businessName: string) {
  if (!supabase) return { error: 'Supabase não configurado' }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { business_name: businessName } },
  })
  return { error: error?.message || null }
}

export async function signInWithGoogle() {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export async function verifyAccountPassword(password: string) {
  if (!supabase) return { error: 'Supabase não configurado' }
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email
  if (!email) return { error: 'Usuário não autenticado' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message || null }
}

export async function sendPasswordReset(email: string) {
  if (!supabase) return { error: 'Supabase não configurado' }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  return { error: error?.message || null }
}

export async function updatePassword(newPassword: string) {
  if (!supabase) return { error: 'Supabase não configurado' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return { error: error?.message || null }
}

export async function resendConfirmation(email: string) {
  if (!supabase) return { error: 'Supabase não configurado' }
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  return { error: error?.message || null }
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  // Clear auth-derived business_id so next session starts fresh
  localStorage.removeItem('ff_auth_uid')
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export const ENTITY_KEYS: Record<string, string> = {
  products:    'ff_products',
  ingredients: 'ff_ingredients',
  suppliers:   'ff_suppliers',
  purchases:   'ff_purchases',
  sales:       'ff_sales',
  fixed_costs: 'ff_fixed_costs',
  dre:         'ff_dre',
  customers:      'ff_customers',
  cash_sessions:  'ff_cash_sessions',
  variable_costs: 'ff_variable_costs',
}
