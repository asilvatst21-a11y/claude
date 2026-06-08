import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Matriculas from './pages/Matriculas'
import Clientes from './pages/Clientes'
import Disparos from './pages/Disparos'
import Historico from './pages/Historico'
import Admin from './pages/Admin'
import Gsdpq from './pages/Gsdpq'
import Dto from './pages/Dto'
import Prontuario from './pages/Prontuario'
import Relatos from './pages/Relatos'
import Telemetria from './pages/Telemetria'
import Jornada from './pages/Jornada'
import FluxoPunitivo from './pages/FluxoPunitivo'

function ProtectedRoutes() {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Carregando...</div>
  if (!usuario) return <Navigate to="/login" replace />
  return <Layout />
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
            <Route path="/disparos" element={<Disparos />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/gsdpq" element={<Gsdpq />} />
            <Route path="/dto" element={<Dto />} />
            <Route path="/prontuario" element={<Prontuario />} />
            <Route path="/relatos" element={<Relatos />} />
            <Route path="/telemetria" element={<Telemetria />} />
            <Route path="/jornada" element={<Jornada />} />
            <Route path="/fluxo"   element={<FluxoPunitivo />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
