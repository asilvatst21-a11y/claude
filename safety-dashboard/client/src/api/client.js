const BASE = '/api'

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erro desconhecido' }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }
  return res.json()
}
