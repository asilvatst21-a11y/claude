import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Users, CreditCard, Upload, MessageSquare, BarChart2, LogOut, Building2, Shield, ClipboardList, Activity, FileText } from 'lucide-react'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart2 },
  { to: '/matriculas', label: 'Matrículas', icon: CreditCard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/disparos', label: 'Disparar Mensagens', icon: Upload },
  { to: '/historico', label: 'Histórico', icon: MessageSquare },
  { to: '/gsdpq', label: 'Análise GSDPQ', icon: ClipboardList },
  { to: '/dto', label: 'Análise DTO', icon: Activity },
  { to: '/prontuario', label: 'Prontuário', icon: FileText },
]
const adminItems = [
  { to: '/admin', label: 'Administração', icon: Shield },
]

export default function Layout() {
  const { usuario, sair } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    sair()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-brand-700 flex flex-col">
        <div className="px-6 py-5 border-b border-brand-600">
          <div className="bg-white rounded-lg p-2 mb-3">
            <img src="/logo.png" alt="LOG20" className="h-10 w-full object-contain" />
          </div>
          <h1 className="text-white text-lg font-bold tracking-tight">PDV Crítico</h1>
          <p className="text-brand-200 text-xs">Sistema de Disparos</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-500 text-white'
                    : 'text-brand-100 hover:bg-brand-600 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          {usuario?.admin && (
            <>
              <div className="pt-3 pb-1 px-3 text-xs uppercase tracking-wider text-brand-300">Admin</div>
              {adminItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-accent-500 text-white'
                        : 'text-brand-100 hover:bg-brand-600 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-3 border-t border-brand-600">
          {usuario && (
            <div className="mb-3 px-3 py-2 bg-brand-800 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-brand-200 mb-0.5">
                <Building2 size={12} /> {usuario.filial}
              </div>
              <p className="text-white text-sm font-medium truncate">{usuario.nome ?? usuario.login}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-100 hover:bg-brand-600 hover:text-white rounded-lg transition-colors"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
