import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp,
  FileText, BarChart2, Settings, UtensilsCrossed
} from 'lucide-react'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vendas', icon: ShoppingCart, label: 'Vendas' },
  { to: '/estoque', icon: Package, label: 'Estoque' },
  { to: '/precificacao', icon: TrendingUp, label: 'Precificação' },
  { to: '/dre', icon: FileText, label: 'DRE' },
  { to: '/relatorios', icon: BarChart2, label: 'Relatórios' },
  { to: '/cadastros', icon: Settings, label: 'Cadastros' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-orange-600 text-white flex flex-col shadow-lg">
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
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-orange-600'
                    : 'text-orange-100 hover:bg-orange-500'
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
