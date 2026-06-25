import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Users, CreditCard, MessageSquare, BarChart2, LogOut, Building2,
  Shield, ClipboardList, Activity, FileText, Flag, Gauge, Clock, GitBranch, CalendarClock,
  UserCheck, Upload, FileSpreadsheet, Package, Settings, ChevronLeft, ChevronRight, ChevronDown,
  Wallet, Menu, X, Truck, Boxes, LineChart, Timer, Home, Send,
} from 'lucide-react'
import { useAuth } from '../lib/auth'

const segItems = [
  { permKey: 'dashboard',       to: '/',                label: 'Início',          icon: Home,         end: true },
  { permKey: 'matriculas',      to: '/matriculas',      label: 'Matrículas',      icon: CreditCard             },
  { permKey: 'clientes',        to: '/clientes',        label: 'Clientes',        icon: Users                  },
  { permKey: 'disparos',        to: '/disparos',        label: 'Disparos',        icon: Send                   },
  { permKey: 'historico',       to: '/historico',       label: 'Histórico',       icon: MessageSquare          },
  { permKey: 'gsdpq',           to: '/gsdpq',           label: 'Análise GSDPQ',   icon: ClipboardList          },
  { permKey: 'dto',             to: '/dto',             label: 'Análise DTO',     icon: Activity               },
  { permKey: 'dto-gerenciador', to: '/dto-gerenciador', label: 'Gerenciador DTO', icon: CalendarClock          },
  { permKey: 'prontuario',      to: '/prontuario',      label: 'Prontuário',      icon: FileText               },
  { permKey: 'relatos',         to: '/relatos',         label: 'Relatos',         icon: Flag                   },
  { permKey: 'telemetria',      to: '/telemetria',      label: 'Telemetria',      icon: Gauge                  },
]

const genteItems = [
  { permKey: 'jornada',      to: '/jornada',      label: 'Controle de Jornada', icon: Clock },
  { permKey: 'distribuicao', to: '/distribuicao', label: 'Solicitação Extra',   icon: Truck, end: true },
]

// Os itens de monitoramento de reposições (Reposições, Catálogo/Vendas e
// Config. WhatsApp) também são liberados pela permissão 'reposicoes', usada
// para perfis que só acompanham o fluxo de reposições (ex.: monitpet).
const REPOS = ['financeiro', 'reposicoes']
const financeiroItems = [
  { permKey: 'financeiro', to: '/vales',               label: 'Vales',             icon: FileText,      end: true },
  { permKey: 'financeiro', to: '/vales/ajudantes',     label: 'Ajudantes',         icon: UserCheck               },
  { permKey: 'financeiro', to: '/vales/importar',      label: 'Importar Planilha', icon: Upload                  },
  { permKey: 'financeiro', to: '/vales/importacoes',   label: 'Importações',       icon: FileSpreadsheet         },
  { permKey: REPOS,        to: '/vales/reposicoes',    label: 'Reposições',        icon: Package                 },
  { permKey: REPOS,        to: '/vales/catalogo',      label: 'Catálogo / Vendas', icon: FileSpreadsheet         },
  { permKey: REPOS,        to: '/vales/whatsapp',      label: 'Config. WhatsApp',  icon: MessageSquare           },
  { permKey: 'financeiro', to: '/vales/configuracoes', label: 'Config. Vales',     icon: Settings                },
]

const distribuicaoItems = [
  { permKey: 'distribuicao', to: '/distribuicao/tml',       label: 'Carta de Controle TML', icon: CalendarClock, end: true },
  { permKey: 'distribuicao', to: '/distribuicao/tml/analise', label: 'Análise TML',         icon: BarChart2        },
  { permKey: 'distribuicao', to: '/distribuicao/tml/deslocamento', label: 'Tempo de Deslocamento', icon: Timer  },
  { permKey: 'distribuicao', to: '/distribuicao/tml/whatsapp', label: 'Config. WhatsApp TML', icon: MessageSquare },
]

const armazemItems = [
  { permKey: 'armazem-supervisor', to: '/armazem/cadastro',   label: 'Cadastro de Atividades', icon: Boxes },
  { permKey: 'armazem-supervisor', to: '/armazem/operadores', label: 'Operadores',             icon: UserCheck },
  { permKey: 'armazem-supervisor', to: '/armazem/dashboard',  label: 'Dashboard',              icon: Gauge },
]

const gerenciaItems = [
  { permKey: 'gerencia', to: '/gerencia',           label: 'Painel DRE',        icon: LineChart,   end: true },
  { permKey: 'gerencia', to: '/gerencia/importar',  label: 'Importar Planilha', icon: Upload                 },
]

const adminItems = [
  { permKey: 'fluxo', to: '/fluxo', label: 'Fluxo Punitivo', icon: GitBranch },
  { permKey: 'admin', to: '/admin', label: 'Administração',  icon: Shield    },
]

function temAcesso(permissoes: string[] | null | undefined, permKey: string | string[]): boolean {
  if (!permissoes) return true
  const keys = Array.isArray(permKey) ? permKey : [permKey]
  return keys.some(k => permissoes.includes(k))
}

type NavItemDef = { to: string; label: string; icon: React.ElementType; end?: boolean }
type NavItemWithPerm = NavItemDef & { permKey: string | string[] }

function NavItem({ to, label, icon: Icon, end, collapsed, onNavigate }: NavItemDef & { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
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
  items: NavItemWithPerm[]
  open: boolean
  onToggle: () => void
  collapsed: boolean
  onNavigate?: () => void
}

function Section({ label, icon: SectionIcon, items, open, onToggle, collapsed, onNavigate }: SectionProps) {
  const { pathname } = useLocation()
  const hasActive = items.some(item =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  )

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5 pt-3">
        <div className="w-8 border-t border-brand-600 mb-1" />
        {items.map(({ to, label: l, icon, end }) => (
          <NavItem key={to} to={to} label={l} icon={icon} end={end} collapsed onNavigate={onNavigate} />
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
            <NavItem key={to} to={to} label={l} icon={icon} end={end} collapsed={false} onNavigate={onNavigate} />
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sections, setSections] = useState({ seguranca: false, gente: false, financeiro: false, distribuicao: false, armazem: false, gerencia: false, admin: false })
  const fecharMobile = () => setMobileOpen(false)

  function toggleSection(key: keyof typeof sections) {
    setSections(s => ({ ...s, [key]: !s[key] }))
  }

  function handleLogout() {
    sair()
    navigate('/login')
  }

  const p = usuario?.admin ? null : usuario?.permissoes
  const seg = segItems.filter(i => temAcesso(p, i.permKey))
  const gente = genteItems.filter(i => temAcesso(p, i.permKey))
  const financeiro = financeiroItems.filter(i => temAcesso(p, i.permKey))
  const distribuicao = distribuicaoItems.filter(i => temAcesso(p, i.permKey))
  const armazem = armazemItems.filter(i => temAcesso(p, i.permKey))
  const gerencia = gerenciaItems.filter(i => temAcesso(p, i.permKey))

  return (
    <div className="min-h-dvh flex bg-gray-50">
      {/* Overlay do drawer no mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={fecharMobile} />
      )}

      <aside
        className={`bg-brand-700 flex flex-col z-40 transition-transform duration-200
          fixed inset-y-0 left-0 h-dvh md:sticky md:top-0 shrink-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          ${sidebarOpen ? 'w-64' : 'w-64 md:w-16'}`}
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
          className="hidden md:block absolute -right-3 top-16 z-10 bg-brand-700 border border-brand-500 rounded-full p-0.5 text-brand-200 hover:text-white transition-colors"
          title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Fechar drawer no mobile */}
        <button
          onClick={fecharMobile}
          className="md:hidden absolute right-2 top-2 z-10 text-brand-200 hover:text-white p-1"
          title="Fechar menu"
        >
          <X size={20} />
        </button>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto ${sidebarOpen ? 'p-3 space-y-0.5' : 'px-2 py-3'}`}>
          {seg.length > 0 && (
            <Section
              label="Segurança"
              icon={Shield}
              items={seg}
              open={sections.seguranca}
              onToggle={() => toggleSection('seguranca')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
            />
          )}
          {gente.length > 0 && (
            <Section
              label="Gente"
              icon={Users}
              items={gente}
              open={sections.gente}
              onToggle={() => toggleSection('gente')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
            />
          )}
          {financeiro.length > 0 && (
            <Section
              label="Financeiro"
              icon={Wallet}
              items={financeiro}
              open={sections.financeiro}
              onToggle={() => toggleSection('financeiro')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
            />
          )}
          {distribuicao.length > 0 && (
            <Section
              label="Distribuição"
              icon={Truck}
              items={distribuicao}
              open={sections.distribuicao}
              onToggle={() => toggleSection('distribuicao')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
            />
          )}
          {armazem.length > 0 && (
            <Section
              label="Armazém"
              icon={Boxes}
              items={armazem}
              open={sections.armazem}
              onToggle={() => toggleSection('armazem')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
            />
          )}
          {gerencia.length > 0 && (
            <Section
              label="Gerência"
              icon={LineChart}
              items={gerencia}
              open={sections.gerencia}
              onToggle={() => toggleSection('gerencia')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
            />
          )}
          {usuario?.admin && (
            <Section
              label="Admin"
              icon={Shield}
              items={adminItems}
              open={sections.admin}
              onToggle={() => toggleSection('admin')}
              collapsed={!sidebarOpen}
              onNavigate={fecharMobile}
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

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra superior (somente mobile) */}
        <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 border-b bg-white px-4 py-3">
          <button onClick={() => setMobileOpen(true)} className="p-1 -ml-1 text-brand-700" title="Abrir menu">
            <Menu size={22} />
          </button>
          <img src="/logo.png" alt="LOG20" className="h-7 object-contain" />
          <span className="text-brand-700 font-semibold text-sm truncate">Painel Analítico</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
