import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Users, CreditCard, MessageSquare, BarChart2, LogOut, Building2,
  Shield, ClipboardList, Activity, FileText, Flag, Gauge, Clock, GitBranch, CalendarClock,
  UserCheck, Upload, FileSpreadsheet, Package, Settings, ChevronLeft, ChevronRight, ChevronDown,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../lib/auth'

const segItems = [
  { to: '/',                  label: 'Dashboard',        icon: BarChart2,    end: true },
  { to: '/matriculas',        label: 'Matrículas',        icon: CreditCard             },
  { to: '/clientes',          label: 'Clientes',          icon: Users                  },
  { to: '/historico',         label: 'Histórico',         icon: MessageSquare          },
  { to: '/gsdpq',             label: 'Análise GSDPQ',     icon: ClipboardList          },
  { to: '/dto',               label: 'Análise DTO',       icon: Activity               },
  { to: '/dto-gerenciador',   label: 'Gerenciador DTO',   icon: CalendarClock          },
  { to: '/prontuario',        label: 'Prontuário',        icon: FileText               },
  { to: '/relatos',           label: 'Relatos',           icon: Flag                   },
  { to: '/telemetria',        label: 'Telemetria',        icon: Gauge                  },
]

const genteItems = [
  { to: '/jornada', label: 'Controle de Jornada', icon: Clock },
]

const financeiroItems = [
  { to: '/vales',               label: 'Vales',             icon: FileText,       end: true },
  { to: '/vales/ajudantes',     label: 'Ajudantes',         icon: UserCheck                 },
  { to: '/vales/importar',      label: 'Importar Planilha', icon: Upload                    },
  { to: '/vales/importacoes',   label: 'Importações',       icon: FileSpreadsheet           },
  { to: '/vales/reposicoes',    label: 'Reposições',        icon: Package                   },
  { to: '/vales/configuracoes', label: 'Config. Vales',     icon: Settings                  },
]

const adminItems = [
  { to: '/fluxo', label: 'Fluxo Punitivo', icon: GitBranch },
  { to: '/admin', label: 'Administração',  icon: Shield    },
]

type NavItemDef = { to: string; label: string; icon: React.ElementType; end?: boolean }

function NavItem({ to, label, icon: Icon, end, collapsed }: NavItemDef & { collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
        ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
        ${isActive ? 'bg-accent-500 text-white' : 'text-brand-100 hover:bg-brand-600 hover:text-white'}`
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && label}
    </NavLink>
  )
}

interface SectionProps {
  label: string
  icon: React.ElementType
  items: NavItemDef[]
  open: boolean
  onToggle: () => void
  collapsed: boolean
}

function Section({ label, icon: SectionIcon, items, open, onToggle, collapsed }: SectionProps) {
  const { pathname } = useLocation()
  const hasActive = items.some(item =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  )

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5 pt-3">
        <div className="w-8 border-t border-brand-600 mb-1" />
        {items.map(({ to, label: l, icon, end }) => (
          <NavItem key={to} to={to} label={l} icon={icon} end={end} collapsed />
        ))}
      </div>
    )
  }

  return (
    <div className="pt-2">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest font-bold transition-colors
          ${hasActive ? 'text-accent-400' : 'text-brand-300 hover:text-brand-100'}`}
      >
        <span className="flex items-center gap-2">
          <SectionIcon size={13} className="shrink-0" />
          {label}
        </span>
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {items.map(({ to, label: l, icon, end }) => (
            <NavItem key={to} to={to} label={l} icon={icon} end={end} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { usuario, sair } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sections, setSections] = useState({ seguranca: true, gente: true, financeiro: true, admin: true })

  function toggleSection(key: keyof typeof sections) {
    setSections(s => ({ ...s, [key]: !s[key] }))
  }

  function handleLogout() {
    sair()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside
        className={`bg-brand-700 flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-200
          ${sidebarOpen ? 'w-64' : 'w-16'}`}
      >
        {/* Header */}
        <div className={`border-b border-brand-600 bg-white flex items-center ${sidebarOpen ? 'px-6 py-5' : 'px-2 py-4 justify-center'}`}>
          {sidebarOpen ? (
            <div className="flex-1 min-w-0">
              <img src="/logo.png" alt="LOG20" className="h-12 w-full object-contain mb-3" />
              <h1 className="text-brand-700 text-lg font-bold tracking-tight">Painel Analítico</h1>
              <p className="text-brand-400 text-xs">LOG20 Logística</p>
            </div>
          ) : (
            <img src="/logo.png" alt="LOG20" className="h-8 w-8 object-contain" />
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="absolute -right-3 top-16 z-10 bg-brand-700 border border-brand-500 rounded-full p-0.5 text-brand-200 hover:text-white transition-colors"
          title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto ${sidebarOpen ? 'p-3 space-y-0.5' : 'px-2 py-3'}`}>
          <Section
            label="Segurança"
            icon={Shield}
            items={segItems}
            open={sections.seguranca}
            onToggle={() => toggleSection('seguranca')}
            collapsed={!sidebarOpen}
          />
          <Section
            label="Gente"
            icon={Users}
            items={genteItems}
            open={sections.gente}
            onToggle={() => toggleSection('gente')}
            collapsed={!sidebarOpen}
          />
          <Section
            label="Financeiro"
            icon={Wallet}
            items={financeiroItems}
            open={sections.financeiro}
            onToggle={() => toggleSection('financeiro')}
            collapsed={!sidebarOpen}
          />
          {usuario?.admin && (
            <Section
              label="Admin"
              icon={Shield}
              items={adminItems}
              open={sections.admin}
              onToggle={() => toggleSection('admin')}
              collapsed={!sidebarOpen}
            />
          )}
        </nav>

        {/* Footer */}
        <div className={`border-t border-brand-600 ${sidebarOpen ? 'p-3' : 'px-2 py-3'}`}>
          {usuario && sidebarOpen && (
            <div className="mb-3 px-3 py-2 bg-brand-800 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-brand-200 mb-0.5">
                <Building2 size={12} /> {usuario.filial}
              </div>
              <p className="text-white text-sm font-medium truncate">{usuario.nome ?? usuario.login}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={!sidebarOpen ? 'Sair' : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-100 hover:bg-brand-600 hover:text-white rounded-lg transition-colors
              ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <LogOut size={16} />
            {sidebarOpen && 'Sair'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
