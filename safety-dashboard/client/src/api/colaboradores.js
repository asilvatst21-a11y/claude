import { apiFetch } from './client'

export const getColaboradores = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/colaboradores${qs ? '?' + qs : ''}`)
}

export const getColaborador = (id) => apiFetch(`/colaboradores/${id}`)

export const createColaborador = (data) =>
  apiFetch('/colaboradores', { method: 'POST', body: data })

export const updateColaborador = (id, data) =>
  apiFetch(`/colaboradores/${id}`, { method: 'PUT', body: data })

export const deleteColaborador = (id) =>
  apiFetch(`/colaboradores/${id}`, { method: 'DELETE' })
