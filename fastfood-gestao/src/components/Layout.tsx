import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp,
  FileText, BarChart2, Settings, UtensilsCrossed, MoreHorizontal, Users, DollarSign
} from 'lucide-react'
import { useState } from 'react'

const navMain = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vendas',   icon: ShoppingCart,    label: 'Vendas' },
  { to: '/estoque',  icon: Package,         label: 'Estoque' },
  { to: '/caixa',    icon: DollarSign,      label: 'Caixa' },
]

const navMore = [
  { to: '/clientes',     icon: Users,      label: 'Clientes' },
  { to: '/cadastros',    icon: Settings,   label: 'Cadastros' },
  { to: '/precificacao', icon: TrendingUp, label: 'Precificação' },
  { to: '/dre',          icon: FileText,   label: 'DRE' },
  { to: '/relatorios',   icon: BarChart2,  label: 'Relatórios' },
]

const navAll = [...navMain, ...navMore]

export default function Layout() {
  const [showMore, setShowMore] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50">

      {/* Sidebar — visível só em desktop */}
      <aside className="hidden md:flex w-60 bg-orange-600 text-white flex-col shadow-lg">
        <div className="p-5 border-b border-orange-500">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={24} />
            <div>
              <p className="font-bold text-lg leading-tight">FastFood</p>
              <p className="text-orange-200 text-xs">Sistema de Gestão</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navAll.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-orange-600' : 'text-orange-100 hover:bg-orange-500'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-orange-500 text-orange-200 text-xs text-center">
          v1.0.0 · FastFood Gestão
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Header mobile */}
        <header className="md:hidden bg-orange-600 text-white px-4 py-3 flex items-center gap-2 shadow">
          <UtensilsCrossed size={20} />
          <p className="font-bold text-base">FastFood Gestão</p>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Bottom nav — só mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {navMain.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setShowMore(false)}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-orange-600' : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="mt-0.5">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Botão "Mais" */}
          <button
            onClick={() => setShowMore(v => !v)}
            className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
              showMore ? 'text-orange-600' : 'text-gray-400'
            }`}
          >
            <MoreHorizontal size={22} strokeWidth={showMore ? 2.5 : 1.8} />
            <span className="mt-0.5">Mais</span>
          </button>
        </nav>

        {/* Drawer "Mais" */}
        {showMore && (
          <>
            <div className="md:hidden fixed inset-0 z-30" onClick={() => setShowMore(false)} />
            <div className="md:hidden fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 px-2 py-3 flex gap-2"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              {navMore.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setShowMore(false)}
                  className={({ isActive }) =>
                    `flex-1 flex flex-col items-center py-2 px-1 rounded-xl text-xs font-medium transition-colors ${
                      isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                      <span className="mt-0.5 text-center leading-tight">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
