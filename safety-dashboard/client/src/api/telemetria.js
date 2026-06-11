import { apiFetch } from './client'

export const getTelemetria = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/telemetria${qs ? '?' + qs : ''}`)
}

export const getTelemetriaById = (id) => apiFetch(`/telemetria/${id}`)

export const createTelemetria = (data) =>
  apiFetch('/telemetria', { method: 'POST', body: data })

export const updateTelemetria = (id, data) =>
  apiFetch(`/telemetria/${id}`, { method: 'PUT', body: data })
