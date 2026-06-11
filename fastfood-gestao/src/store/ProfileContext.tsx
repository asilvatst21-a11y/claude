import { createContext, useContext } from 'react'

export type Plan = 'trial' | 'starter' | 'pro' | 'rede' | 'expired'

export type Profile = {
  plan: Plan
  trial_ends_at: string
  plan_expires_at: string | null
}

export const ProfileContext = createContext<Profile | null>(null)

export function useProfile() {
  return useContext(ProfileContext)
}

export function trialDaysLeft(profile: Profile): number {
  const ends = new Date(profile.trial_ends_at).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((ends - now) / (1000 * 60 * 60 * 24)))
}

export function isPlanActive(profile: Profile): boolean {
  if (profile.plan === 'trial') {
    return trialDaysLeft(profile) > 0
  }
  if (profile.plan === 'expired') return false
  if (profile.plan_expires_at) {
    return new Date(profile.plan_expires_at).getTime() > Date.now()
  }
  return true
}
