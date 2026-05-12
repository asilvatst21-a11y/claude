import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Vendas from './pages/Vendas'
import Estoque from './pages/Estoque'
import Precificacao from './pages/Precificacao'
import DRE from './pages/DRE'
import Relatorios from './pages/Relatorios'
import Cadastros from './pages/Cadastros'
import Clientes from './pages/Clientes'
import CadastroPublico from './pages/CadastroPublico'
import SyncSetup from './components/SyncSetup'
import { pullFromCloud } from './store/sync'
import { supabase } from './store/supabase'

export default function App() {
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (!supabase) { setSynced(true); return }
    pullFromCloud().finally(() => setSynced(true))
  }, [])

  if (!synced) {
    return (
      <div className="h-screen flex items-center justify-center bg-orange-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Sincronizando dados...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <SyncSetup />
      <Routes>
        <Route path="/cadastro" element={<CadastroPublico />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="precificacao" element={<Precificacao />} />
          <Route path="dre" element={<DRE />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="cadastros" element={<Cadastros />} />
          <Route path="clientes" element={<Clientes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
