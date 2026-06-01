import { apiFetch } from './client'

export const getDtos = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/dtos${qs ? '?' + qs : ''}`)
}

export const getDto = (id) => apiFetch(`/dtos/${id}`)

export const createDto = (data) =>
  apiFetch('/dtos', { method: 'POST', body: data })

export const updateDto = (id, data) =>
  apiFetch(`/dtos/${id}`, { method: 'PUT', body: data })
