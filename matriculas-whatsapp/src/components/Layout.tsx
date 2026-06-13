import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Users, CreditCard, MessageSquare, BarChart2, LogOut, Building2,
  Shield, ClipboardList, Activity, FileText, Flag, Gauge, Clock, GitBranch, CalendarClock,
} from 'lucide-react'
import { useAuth } from '../lib/auth'

const segItems = [
  { key: 'dashboard',       to: '/',                 label: 'Dashboard',       icon: BarChart2,     end: true },
  { key: 'matriculas',      to: '/matriculas',       label: 'Matrículas',      icon: CreditCard           },
  { key: 'clientes',        to: '/clientes',         label: 'Clientes',        icon: Users                },
  { key: 'historico',       to: '/historico',        label: 'Histórico',       icon: MessageSquare        },
  { key: 'gsdpq',           to: '/gsdpq',            label: 'Análise GSDPQ',   icon: ClipboardList        },
  { key: 'dto',             to: '/dto',              label: 'Análise DTO',      icon: Activity             },
  { key: 'dto-gerenciador', to: '/dto-gerenciador',  label: 'Gerenciador DTO', icon: CalendarClock        },
  { key: 'prontuario',      to: '/prontuario',       label: 'Prontuário',      icon: FileText             },
  { key: 'relatos',         to: '/relatos',          label: 'Relatos',         icon: Flag                 },
  { key: 'telemetria',      to: '/telemetria',       label: 'Telemetria',      icon: Gauge                },
]

const genteItems = [
  { key: 'jornada', to: '/jornada', label: 'Controle de Jornada', icon: Clock },
]

const adminItems = [
  { key: 'fluxo', to: '/fluxo',  label: 'Fluxo Punitivo', icon: GitBranch },
  { key: 'admin', to: '/admin',  label: 'Administração',  icon: Shield    },
]

/** Retorna true se o usuário tem acesso à seção */
function temAcesso(permissoes: string[] | null | undefined, key: string): boolean {
  if (!permissoes) return true   // sem restrição (usuários legados)
  return permissoes.includes(key)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-4 pb-1 px-3 text-[10px] uppercase tracking-widest font-bold text-brand-300">
      {children}
    </div>
  )
}

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: React.ElementType; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
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
  )
}

export default function Layout() {
  const { usuario, sair } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    sair()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-brand-700 flex flex-col h-screen sticky top-0 shrink-0">
        <div className="px-6 py-5 border-b border-brand-600 bg-white">
          <img src="/logo.png" alt="LOG20" className="h-12 w-full object-contain mb-3" />
          <h1 className="text-brand-700 text-lg font-bold tracking-tight">Painel Analítico</h1>
          <p className="text-brand-400 text-xs">LOG20 Logística</p>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
          {(() => {
            const p = usuario?.admin ? null : usuario?.permissoes
            const seg = segItems.filter(i => temAcesso(p, i.key))
            const gente = genteItems.filter(i => temAcesso(p, i.key))
            return (
              <>
                {seg.length > 0 && (
                  <>
                    <SectionLabel>Segurança</SectionLabel>
                    {seg.map(({ to, label, icon, end }) => (
                      <NavItem key={to} to={to} label={label} icon={icon} end={end} />
                    ))}
                  </>
                )}
                {gente.length > 0 && (
                  <>
                    <SectionLabel>Gente</SectionLabel>
                    {gente.map(({ to, label, icon }) => (
                      <NavItem key={to} to={to} label={label} icon={icon} />
                    ))}
                  </>
                )}
                {usuario?.admin && (
                  <>
                    <SectionLabel>Admin</SectionLabel>
                    {adminItems.map(({ to, label, icon }) => (
                      <NavItem key={to} to={to} label={label} icon={icon} />
                    ))}
                  </>
                )}
              </>
            )
          })()}
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
