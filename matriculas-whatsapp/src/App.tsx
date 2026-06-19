import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import SolicitarExtra from './pages/SolicitarExtra'
import Distribuicao from './pages/Distribuicao'
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
import WhatsappConfigPage from './pages/vales/WhatsappConfig'
import ImportCatalogoPage from './pages/vales/ImportCatalogo'
import ArmazemOperador from './pages/armazem/Operador'
import ArmazemCadastro from './pages/armazem/Cadastro'
import ArmazemOperadores from './pages/armazem/Operadores'
import ArmazemDashboard from './pages/armazem/Dashboard'

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

function ArmazemOperadorRoute() {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Carregando...</div>
  if (!usuario) return <Navigate to="/login" replace />
  return <ArmazemOperador />
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
          <Route path="/solicitar-extra" element={<SolicitarExtra />} />
          <Route path="/armazem" element={<ArmazemOperadorRoute />} />
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
            <Route path="/distribuicao" element={<Distribuicao />} />
            <Route path="/armazem/cadastro" element={<ArmazemCadastro />} />
            <Route path="/armazem/operadores" element={<ArmazemOperadores />} />
            <Route path="/armazem/dashboard" element={<ArmazemDashboard />} />
            {/* Vales LOG20 */}
            <Route path="/vales" element={<ValesPage />} />
            <Route path="/vales/ajudantes" element={<AjudantesPage />} />
            <Route path="/vales/importar" element={<ImportarPage />} />
            <Route path="/vales/importacoes" element={<ImportacoesPage />} />
            <Route path="/vales/reposicoes" element={<ReposicoesPage />} />
            <Route path="/vales/whatsapp" element={<WhatsappConfigPage />} />
            <Route path="/vales/catalogo" element={<ImportCatalogoPage />} />
            <Route path="/vales/configuracoes" element={<ValesConfiguracoesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
