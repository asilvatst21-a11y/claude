import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Matriculas from './pages/Matriculas'
import Clientes from './pages/Clientes'
import Historico from './pages/Historico'
import Admin from './pages/Admin'
import Gsdpq from './pages/Gsdpq'
import Dto from './pages/Dto'
import DtoGerenciador from './pages/DtoGerenciador'
import Prontuario from './pages/Prontuario'
import Relatos from './pages/Relatos'
import Telemetria from './pages/Telemetria'
import Jornada from './pages/Jornada'
import FluxoPunitivo from './pages/FluxoPunitivo'
import ValesPage from './pages/vales/Vales'
import AjudantesPage from './pages/vales/Ajudantes'
import ImportarPage from './pages/vales/Importar'
import ImportacoesPage from './pages/vales/Importacoes'
import ReposicoesPage from './pages/vales/Reposicoes'
import ValesConfiguracoesPage from './pages/vales/Configuracoes'

function ProtectedRoutes() {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Carregando...</div>
  if (!usuario) return <Navigate to="/login" replace />
  return <Layout />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return null
  if (!usuario?.admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function PublicLogin() {
  const { usuario } = useAuth()
  if (usuario) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicLogin />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/matriculas" element={<Matriculas />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/fluxo" element={<AdminRoute><FluxoPunitivo /></AdminRoute>} />
            <Route path="/gsdpq" element={<Gsdpq />} />
            <Route path="/dto" element={<Dto />} />
            <Route path="/dto-gerenciador" element={<DtoGerenciador />} />
            <Route path="/prontuario" element={<Prontuario />} />
            <Route path="/relatos" element={<Relatos />} />
            <Route path="/telemetria" element={<Telemetria />} />
            <Route path="/jornada" element={<Jornada />} />
            {/* Vales LOG20 */}
            <Route path="/vales" element={<ValesPage />} />
            <Route path="/vales/ajudantes" element={<AjudantesPage />} />
            <Route path="/vales/importar" element={<ImportarPage />} />
            <Route path="/vales/importacoes" element={<ImportacoesPage />} />
            <Route path="/vales/reposicoes" element={<ReposicoesPage />} />
            <Route path="/vales/configuracoes" element={<ValesConfiguracoesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
