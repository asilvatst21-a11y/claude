import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import SolicitarExtra from './pages/SolicitarExtra'
import MatinalTML from './pages/MatinalTML'
import Treinamentos from './pages/Treinamentos'
import FechamentoDia from './pages/FechamentoDia'
import Distribuicao from './pages/Distribuicao'
import DistribuicaoTML from './pages/DistribuicaoTML'
import DistribuicaoTMLSupervisores from './pages/DistribuicaoTMLSupervisores'
import DistribuicaoTMLMotoristas from './pages/DistribuicaoTMLMotoristas'
import DistribuicaoTMLAnalise from './pages/DistribuicaoTMLAnalise'
import DistribuicaoTMLDeslocamento from './pages/DistribuicaoTMLDeslocamento'
import DistribuicaoTMLDeslocamentoCorrecoes from './pages/DistribuicaoTMLDeslocamentoCorrecoes'
import DistribuicaoTMLWhatsappConfig from './pages/DistribuicaoTMLWhatsappConfig'
import DistribuicaoTMLParametros from './pages/DistribuicaoTMLParametros'
import DtoDistribuicao from './pages/DtoDistribuicao'
import JornadaRota from './pages/JornadaRota'
import DistribuicaoFarolCriticos from './pages/DistribuicaoFarolCriticos'
import ConferenciaDigital from './pages/ConferenciaDigital'
import DistribuicaoConferencia from './pages/DistribuicaoConferencia'
import Frota from './pages/Frota'
import FrotaIV from './pages/FrotaIV'
import FrotaPlacas from './pages/FrotaPlacas'
import FrotaLeve from './pages/FrotaLeve'
import RoteirizacaoTerritorio from './pages/RoteirizacaoTerritorio'
import Home from './pages/Home'
import Disparos from './pages/Disparos'
import Matriculas from './pages/Matriculas'
import Clientes from './pages/Clientes'
import Historico from './pages/Historico'
import Admin from './pages/Admin'
import Gsdpq from './pages/Gsdpq'
import EnviosBloqueados from './pages/EnviosBloqueados'
import GsdpqSupervisores from './pages/GsdpqSupervisores'
import Dto from './pages/Dto'
import DtoGerenciador from './pages/DtoGerenciador'
import Prontuario from './pages/Prontuario'
import Relatos from './pages/Relatos'
import Telemetria from './pages/Telemetria'
import SegurancaExcessoPeso from './pages/SegurancaExcessoPeso'
import SegurancaPdvCritico from './pages/SegurancaPdvCritico'
import PdvCriticoVisitaPublica from './pages/PdvCriticoVisitaPublica'
import CentralTestes from './pages/CentralTestes'
import SegurancaExcessoPesoMatriz from './pages/SegurancaExcessoPesoMatriz'
import SegurancaExcessoPesoFotos from './pages/SegurancaExcessoPesoFotos'
import Jornada from './pages/Jornada'
import Colaboradores from './pages/Colaboradores'
import FluxoPunitivo from './pages/FluxoPunitivo'
import ValesPage from './pages/vales/Vales'
import AjudantesPage from './pages/vales/Ajudantes'
import ImportarPage from './pages/vales/Importar'
import ImportacoesPage from './pages/vales/Importacoes'
import ReposicoesPage from './pages/vales/Reposicoes'
import ValesConfiguracoesPage from './pages/vales/Configuracoes'
import WhatsappConfigPage from './pages/vales/WhatsappConfig'
import ImportCatalogoPage from './pages/vales/ImportCatalogo'
import ChapaDescargaPage from './pages/financeiro/ChapaDescarga'
import ChapaDescargaClientesPage from './pages/financeiro/ChapaDescargaClientes'
import ArmazemOperador from './pages/armazem/Operador'
import ArmazemCadastro from './pages/armazem/Cadastro'
import ArmazemOperadores from './pages/armazem/Operadores'
import ArmazemDashboard from './pages/armazem/Dashboard'
import ArmazemVariavel from './pages/armazem/Variavel'
import ArmazemLayoutPatio from './pages/armazem/LayoutPatio'
import ColaboradoresArmazem from './pages/armazem/ColaboradoresArmazem'
import VariavelTurnoConferente, { LoginConferente } from './pages/armazem/VariavelTurnoConferente'
import VariavelTotem from './pages/VariavelTotem'
import ConsultaPendencias from './pages/ConsultaPendencias'

function ProtectedRoutes() {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Carregando...</div>
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.cargo) return <Navigate to="/armazem" replace />
  return <Layout />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return null
  if (!usuario?.admin) return <Navigate to="/" replace />
  return <>{children}</>
}

// Central de Testes: liberada pra qualquer usuário com pelo menos 1 sessão
// habilitada (não só admin) — dá pra mostrar em auditoria sem conta admin.
// permissoes null = sem restrição (acesso total, não "zero"); [] = bloqueado.
function AlgumaPermissaoRoute({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return null
  const pode = !!usuario?.admin || usuario?.permissoes == null || usuario.permissoes.length > 0
  if (!pode) return <Navigate to="/" replace />
  return <>{children}</>
}

// O /armazem é um ponto de entrada independente para o operador: se não
// estiver logado, mostra a tela de login aqui mesmo (sem redirecionar para a
// rota do supervisor) e, ao autenticar, permanece direto no app de atividades.
function ArmazemOperadorRoute() {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Carregando...</div>
  if (!usuario) return <Login />
  return <ArmazemOperador />
}

// Ponto de entrada independente do conferente, igual /armazem: se não
// estiver logado, mostra o login próprio dessa tela (sem redirecionar pro
// login geral nem pro /armazem do operador) e, ao autenticar, fica direto
// no fechamento de turno.
function ArmazemTurnoRoute() {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Carregando...</div>
  if (!usuario) return <LoginConferente />
  return <VariavelTurnoConferente />
}

function PublicLogin() {
  const { usuario } = useAuth()
  if (usuario) return <Navigate to={usuario.cargo ? '/armazem' : '/'} replace />
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicLogin />} />
          <Route path="/solicitar-extra" element={<SolicitarExtra />} />
          <Route path="/matinal-tml" element={<MatinalTML />} />
          <Route path="/conferencia" element={<ConferenciaDigital />} />
          <Route path="/variavel-armazem" element={<VariavelTotem />} />
          <Route path="/consulta-pendencias" element={<ConsultaPendencias />} />
          <Route path="/pdv-critico/visita" element={<PdvCriticoVisitaPublica />} />
          <Route path="/armazem" element={<ArmazemOperadorRoute />} />
          <Route path="/armazem/turno" element={<ArmazemTurnoRoute />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<Home />} />
            <Route path="/matriculas" element={<Matriculas />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/disparos" element={<Disparos />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/central-testes" element={<AlgumaPermissaoRoute><CentralTestes /></AlgumaPermissaoRoute>} />
            <Route path="/fluxo" element={<AdminRoute><FluxoPunitivo /></AdminRoute>} />
            <Route path="/envios-bloqueados" element={<AdminRoute><EnviosBloqueados /></AdminRoute>} />
            <Route path="/gsdpq" element={<Gsdpq />} />
            <Route path="/gsdpq/supervisores" element={<GsdpqSupervisores />} />
            <Route path="/dto" element={<Dto />} />
            <Route path="/dto-gerenciador" element={<DtoGerenciador />} />
            <Route path="/prontuario" element={<Prontuario />} />
            <Route path="/relatos" element={<Relatos />} />
            <Route path="/telemetria" element={<Telemetria />} />
            <Route path="/seguranca/excesso-peso" element={<SegurancaExcessoPeso />} />
            <Route path="/seguranca/excesso-peso/matriz" element={<SegurancaExcessoPesoMatriz />} />
            <Route path="/seguranca/excesso-peso/fotos-tara" element={<SegurancaExcessoPesoFotos />} />
            <Route path="/seguranca/pdv-critico" element={<SegurancaPdvCritico />} />
            <Route path="/jornada" element={<Jornada />} />
            <Route path="/colaboradores" element={<Colaboradores />} />
            <Route path="/distribuicao" element={<Distribuicao />} />
            <Route path="/distribuicao/tml" element={<DistribuicaoTML />} />
            <Route path="/distribuicao/tml/supervisores" element={<DistribuicaoTMLSupervisores />} />
            <Route path="/distribuicao/tml/motoristas" element={<DistribuicaoTMLMotoristas />} />
            <Route path="/distribuicao/tml/analise" element={<DistribuicaoTMLAnalise />} />
            <Route path="/distribuicao/tml/deslocamento" element={<DistribuicaoTMLDeslocamento />} />
            <Route path="/distribuicao/tml/deslocamento/correcoes" element={<DistribuicaoTMLDeslocamentoCorrecoes />} />
            <Route path="/distribuicao/tml/whatsapp" element={<DistribuicaoTMLWhatsappConfig />} />
            <Route path="/distribuicao/tml/parametros" element={<DistribuicaoTMLParametros />} />
            <Route path="/distribuicao/dto" element={<DtoDistribuicao />} />
            <Route path="/distribuicao/jornada-rota" element={<JornadaRota />} />
            <Route path="/distribuicao/farol-criticos" element={<DistribuicaoFarolCriticos />} />
            <Route path="/distribuicao/conferencia" element={<DistribuicaoConferencia />} />
            <Route path="/distribuicao/treinamentos" element={<Treinamentos />} />
            <Route path="/distribuicao/fechamento-dia" element={<FechamentoDia />} />
            <Route path="/frota" element={<Frota />} />
            <Route path="/frota/iv" element={<FrotaIV />} />
            <Route path="/frota/placas" element={<FrotaPlacas />} />
            <Route path="/frota/leve" element={<FrotaLeve />} />
            <Route path="/frota/roteirizacao" element={<RoteirizacaoTerritorio />} />
            <Route path="/armazem/cadastro" element={<ArmazemCadastro />} />
            <Route path="/armazem/operadores" element={<ArmazemOperadores />} />
            <Route path="/armazem/dashboard" element={<ArmazemDashboard />} />
            <Route path="/armazem/variavel" element={<ArmazemVariavel />} />
            <Route path="/armazem/layout-patio" element={<ArmazemLayoutPatio />} />
            <Route path="/armazem/colaboradores" element={<ColaboradoresArmazem />} />
            {/* Vales LOG20 */}
            <Route path="/vales" element={<ValesPage />} />
            <Route path="/vales/ajudantes" element={<AjudantesPage />} />
            <Route path="/vales/importar" element={<ImportarPage />} />
            <Route path="/vales/importacoes" element={<ImportacoesPage />} />
            <Route path="/vales/reposicoes" element={<ReposicoesPage />} />
            <Route path="/vales/whatsapp" element={<WhatsappConfigPage />} />
            <Route path="/vales/catalogo" element={<ImportCatalogoPage />} />
            <Route path="/vales/configuracoes" element={<ValesConfiguracoesPage />} />
            <Route path="/financeiro/chapa-descarga" element={<ChapaDescargaPage />} />
            <Route path="/financeiro/chapa-descarga/clientes" element={<ChapaDescargaClientesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
