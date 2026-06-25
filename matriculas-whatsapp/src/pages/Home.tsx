import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { CalendarClock, Package, Send } from 'lucide-react'

const ATALHOS = [
  { to: '/distribuicao/tml', label: 'Carta de Controle TML', desc: 'Saídas da portaria, meta e limite do dia', icon: CalendarClock, color: 'bg-blue-50 text-blue-700' },
  { to: '/vales/reposicoes', label: 'Reposições', desc: 'Confirmações e validações de reposição', icon: Package, color: 'bg-purple-50 text-purple-700' },
  { to: '/disparos', label: 'Disparos', desc: 'Mensagens para motoristas e clientes', icon: Send, color: 'bg-brand-50 text-brand-700' },
]

export default function Home() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900">
        Olá, {usuario?.nome ?? usuario?.login}!
      </h2>
      <p className="text-gray-500 mt-1">{usuario?.filial}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 max-w-3xl">
        {ATALHOS.map(({ to, label, desc, icon: Icon, color }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-400 hover:shadow-sm transition-all"
          >
            <div className={`inline-flex p-3 rounded-lg mb-3 ${color}`}>
              <Icon size={22} />
            </div>
            <p className="font-semibold text-gray-900">{label}</p>
            <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
