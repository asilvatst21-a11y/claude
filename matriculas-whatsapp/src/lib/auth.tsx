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
const ATIVIDADE_KEY = 'pdv-critico-atividade'

// Desloga após X sem interação (mouse/tecla/toque). Protege sessões deixadas
// abertas em PC compartilhado ou celular perdido.
// TESTE: 1 min. Voltar para 30 * 60 * 1000 depois de validar.
const LIMITE_INATIVIDADE_MS = 1 * 60 * 1000
const INTERVALO_CHECAGEM_MS = 10 * 1000

// Vencimento absoluto: lê o `exp` do token assinado emitido pelo api/login
// (12h). Falha "aberta" (retorna false) se não conseguir ler — a inatividade
// continua protegendo de qualquer forma.
function tokenExpirado(token: string | null): boolean {
  if (!token) return false
  try {
    const b64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    return typeof payload.exp === 'number' && Date.now() > payload.exp
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    const token = localStorage.getItem(TOKEN_KEY)
    const ativRaw = localStorage.getItem(ATIVIDADE_KEY)
    const ultima = ativRaw ? parseInt(ativRaw, 10) : 0
    const inativoDemais = ultima > 0 && Date.now() - ultima > LIMITE_INATIVIDADE_MS

    if (raw && !inativoDemais && !tokenExpirado(token)) {
      try { setUsuario(JSON.parse(raw)) } catch { /* ignore */ }
      localStorage.setItem(ATIVIDADE_KEY, String(Date.now()))
    } else if (raw) {
      // Sessão vencida (inatividade ou exp do token): limpa antes de montar.
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(ATIVIDADE_KEY)
    }
    setLoading(false)
  }, [])

  // Enquanto houver usuário logado: registra atividade e checa inatividade.
  useEffect(() => {
    if (!usuario) return

    let ultimoRegistro = 0
    const marcar = () => {
      const agora = Date.now()
      // Throttle: grava no máximo a cada 5s (mousemove dispara demais).
      if (agora - ultimoRegistro > 5000) {
        ultimoRegistro = agora
        localStorage.setItem(ATIVIDADE_KEY, String(agora))
      }
    }
    marcar()

    const eventos: (keyof WindowEventMap)[] = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }))

    const id = window.setInterval(() => {
      const ativRaw = localStorage.getItem(ATIVIDADE_KEY)
      const ultima = ativRaw ? parseInt(ativRaw, 10) : Date.now()
      const token = localStorage.getItem(TOKEN_KEY)
      if (Date.now() - ultima > LIMITE_INATIVIDADE_MS || tokenExpirado(token)) {
        sair()
      }
    }, INTERVALO_CHECAGEM_MS)

    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar))
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

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
    localStorage.setItem(ATIVIDADE_KEY, String(Date.now()))
    if (json.token) localStorage.setItem(TOKEN_KEY, json.token)
    return { sucesso: true, usuario: json.usuario }
  }

  function sair() {
    setUsuario(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ATIVIDADE_KEY)
  }

  return <Ctx.Provider value={{ usuario, loading, entrar, sair }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider')
  return ctx
}
