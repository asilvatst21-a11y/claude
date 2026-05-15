import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Usuario } from '../types'

interface AuthCtx {
  usuario: Usuario | null
  loading: boolean
  entrar: (filial: string, login: string, senha: string) => Promise<{ sucesso: boolean; erro?: string }>
  sair: () => void
}

const Ctx = createContext<AuthCtx | null>(null)
const STORAGE_KEY = 'pdv-critico-user'

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
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('filial', filial)
      .eq('login', login)
      .eq('senha', senha)
      .maybeSingle()

    if (error) return { sucesso: false, erro: error.message }
    if (!data) return { sucesso: false, erro: 'Usuário, senha ou filial inválidos' }

    setUsuario(data)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return { sucesso: true }
  }

  function sair() {
    setUsuario(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return <Ctx.Provider value={{ usuario, loading, entrar, sair }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider')
  return ctx
}
