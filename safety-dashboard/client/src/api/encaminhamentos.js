import { apiFetch } from './client'

export const getEncaminhamentos = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/encaminhamentos${qs ? '?' + qs : ''}`)
}

export const getEncaminhamento = (id) => apiFetch(`/encaminhamentos/${id}`)

export const createEncaminhamento = (data) =>
  apiFetch('/encaminhamentos', { method: 'POST', body: data })

export const updateEncaminhamento = (id, data) =>
  apiFetch(`/encaminhamentos/${id}`, { method: 'PUT', body: data })
