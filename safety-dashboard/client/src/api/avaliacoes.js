import { apiFetch } from './client'

export const getAvaliacoes = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/avaliacoes${qs ? '?' + qs : ''}`)
}

export const getAvaliacao = (id) => apiFetch(`/avaliacoes/${id}`)

export const createAvaliacao = (data) =>
  apiFetch('/avaliacoes', { method: 'POST', body: data })

export const updateAvaliacao = (id, data) =>
  apiFetch(`/avaliacoes/${id}`, { method: 'PUT', body: data })

export const deleteAvaliacao = (id) =>
  apiFetch(`/avaliacoes/${id}`, { method: 'DELETE' })
