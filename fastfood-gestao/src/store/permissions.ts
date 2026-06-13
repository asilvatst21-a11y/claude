import type { Plan } from './ProfileContext'

export type Feature = 'caixa' | 'clientes' | 'relatorios' | 'dre' | 'precificacao' | 'delivery'

const PLAN_RANK: Record<Plan, number> = {
  expired: -1,
  trial:    0,
  starter:  1,
  pro:      2,
  rede:     3,
}

export const FEATURE_MIN_PLAN: Record<Feature, Plan> = {
  caixa:       'pro',
  clientes:    'pro',
  relatorios:  'pro',
  dre:         'rede',
  precificacao:'rede',
  delivery:    'pro',
}

export const PLAN_LABELS: Record<Plan, string> = {
  expired: 'Expirado',
  trial:   'Trial',
  starter: 'Starter',
  pro:     'Pro',
  rede:    'Rede',
}

export function canAccess(plan: Plan, feature: Feature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]]
}
