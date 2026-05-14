import { NavLink, Outlet } from 'react-router-dom'
import { Users, CreditCard, Upload, MessageSquare, BarChart2 } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart2 },
  { to: '/matriculas', label: 'Matrículas', icon: CreditCard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/disparos', label: 'Disparar Mensagens', icon: Upload },
  { to: '/historico', label: 'Histórico', icon: MessageSquare },
]

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-green-700 leading-tight">
            📋 Matrículas<br />
            <span className="text-green-500 text-sm font-medium">& WhatsApp</span>
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
