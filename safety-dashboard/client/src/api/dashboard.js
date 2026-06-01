import { apiFetch } from './client'

export const getDashboardSummary = () => apiFetch('/dashboard/summary')

export const getDashboardScores = (params = {}) => {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  const qs = new URLSearchParams(filtered).toString()
  return apiFetch(`/dashboard/scores${qs ? '?' + qs : ''}`)
}

export const getDashboardAlerts = () => apiFetch('/dashboard/alerts')

export const getScoreHistory = () => apiFetch('/dashboard/score-history')
