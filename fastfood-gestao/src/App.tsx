import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Vendas from './pages/Vendas'
import Estoque from './pages/Estoque'
import Precificacao from './pages/Precificacao'
import DRE from './pages/DRE'
import Relatorios from './pages/Relatorios'
import Cadastros from './pages/Cadastros'
import Clientes from './pages/Clientes'
import Caixa from './pages/Caixa'
import Ajuda from './pages/Ajuda'
import CadastroPublico from './pages/CadastroPublico'
import Planos from './pages/Planos'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import SyncSetup from './components/SyncSetup'
import { pullFromCloud, hasNewData } from './store/sync'
import { supabase, setBusinessId } from './store/supabase'

type AppState = 'loading' | 'ready'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [isRecovery, setIsRecovery] = useState(false)

  // Public registration page never needs auth
  const isPublicRoute = ['/cadastro', '/planos'].includes(window.location.pathname)

  useEffect(() => {
    if (isPublicRoute) { setAppState('ready'); return }

    if (!supabase) {
      // No Supabase configured: run fully offline
      setAppState('ready')
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      setSession(s)

      if (s) {
        // Use the auth user's ID as the business_id for consistent cross-device data
        setBusinessId(s.user.id)
        pullFromCloud().finally(() => setAppState('ready'))
      } else {
        setAppState('ready')
      }
    })

    // Listen for auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(s)
        setIsRecovery(true)
        setAppState('ready')
        return
      }
      setSession(s)
      if (s) {
        setBusinessId(s.user.id)
        pullFromCloud()
      }
    })

    return () => subscription.unsubscribe()
  }, [isPublicRoute])

  // Realtime subscription — only when logged in
  useEffect(() => {
    if (!supabase || !session) return

    const businessId = session.user.id
    const channel = supabase
      .channel('ff_sync_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ff_sync', filter: `business_id=eq.${businessId}` },
        () => {
          pullFromCloud().then(ok => { if (ok) window.location.reload() })
        }
      )
      .subscribe()

    return () => { supabase!.removeChannel(channel) }
  }, [session])

  // Fallback: sync when tab becomes visible (covers non-realtime cases)
  useEffect(() => {
    if (!supabase || !session) return
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      hasNewData().then(hasNew => {
        if (hasNew) pullFromCloud().then(() => window.location.reload())
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [session])

  if (appState === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-orange-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (isRecovery) {
    return <ResetPassword onDone={() => setIsRecovery(false)} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cadastro" element={<CadastroPublico />} />
        <Route path="/planos" element={<Planos />} />
        <Route
          path="/*"
          element={
            supabase && !session ? (
              <Login />
            ) : (
              <>
                <SyncSetup session={session} />
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="vendas" element={<Vendas />} />
                    <Route path="estoque" element={<Estoque />} />
                    <Route path="precificacao" element={<Precificacao />} />
                    <Route path="dre" element={<DRE />} />
                    <Route path="relatorios" element={<Relatorios />} />
                    <Route path="cadastros" element={<Cadastros />} />
                    <Route path="clientes" element={<Clientes />} />
                    <Route path="caixa" element={<Caixa />} />
                    <Route path="ajuda" element={<Ajuda />} />
                    <Route path="planos" element={<Planos />} />
                  </Route>
                </Routes>
              </>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
