import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProfile } from '../store/ProfileContext'
import { canAccess, FEATURE_MIN_PLAN, PLAN_LABELS } from '../store/permissions'
import type { Feature } from '../store/permissions'

const FEATURE_LABELS: Record<Feature, string> = {
  caixa:        'Controle de Caixa',
  clientes:     'Clientes',
  relatorios:   'Relatórios',
  dre:          'DRE',
  precificacao: 'Precificação',
  delivery:     'Delivery / Pedido Online',
}

export default function FeatureGate({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const profile = useProfile()

  if (!profile || canAccess(profile.plan, feature)) {
    return <>{children}</>
  }

  const requiredPlan = FEATURE_MIN_PLAN[feature]

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Lock size={28} className="text-[#F5C542]" />
        </div>
        <h2 className="text-xl font-black text-gray-900 mb-2">
          {FEATURE_LABELS[feature]}
        </h2>
        <p className="text-sm text-gray-500 mb-2">
          Disponível a partir do plano <span className="font-bold text-[#c49a20]">{PLAN_LABELS[requiredPlan]}</span>.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Seu plano atual: <span className="font-semibold">{PLAN_LABELS[profile.plan]}</span>
        </p>
        <Link
          to="/planos"
          target="_blank"
          className="inline-flex items-center gap-2 bg-[#F5C542] hover:bg-[#d4a72c] text-[#0F0F0F] font-bold px-6 py-3 rounded-xl text-sm transition-colors shadow-md"
        >
          Fazer upgrade →
        </Link>
      </div>
    </div>
  )
}
