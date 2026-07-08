import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Usuario } from '../types'

interface AuthCtx {
  usuario: Usuario | null
  loading: boolean
  entrar: (filial: string, login: string, senha: string) => Promise<{ sucesso: boolean; erro?: string; usuario?: Usuario }>
  sair: () => void
}

const Ctx = createContext<AuthCtx | null>(null)
const STORAGE_KEY = 'pdv-critico-user'
const TOKEN_KEY = 'pdv-critico-token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try { setUsuario(JSON.parse(raw)) } catch { /* ignore */ }
    }
    setLoading(false)
  }, [])

  async function entrar(filial: string, login: string, senha: string) {
    // A validação acontece no servidor (api/login): a senha nunca volta ao
    // cliente e é migrada para hash de forma transparente. O token de sessão
    // assinado é guardado para uso nos endpoints protegidos.
    let json: { sucesso: boolean; erro?: string; usuario?: Usuario; token?: string }
    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filial, login, senha }),
      })
      json = await resp.json()
    } catch {
      return { sucesso: false, erro: 'Falha de conexão. Tente de novo.' }
    }

    if (!json.sucesso || !json.usuario) {
      return { sucesso: false, erro: json.erro ?? 'Usuário, senha ou filial inválidos' }
    }

    setUsuario(json.usuario)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json.usuario))
    if (json.token) localStorage.setItem(TOKEN_KEY, json.token)
    return { sucesso: true, usuario: json.usuario }
  }

  function sair() {
    setUsuario(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return <Ctx.Provider value={{ usuario, loading, entrar, sair }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider')
  return ctx
}
