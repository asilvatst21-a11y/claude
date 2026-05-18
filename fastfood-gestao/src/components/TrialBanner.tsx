import { Link } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { useProfile, trialDaysLeft, isPlanActive } from '../store/ProfileContext'

export default function TrialBanner() {
  const profile = useProfile()
  const [dismissed, setDismissed] = useState(false)

  if (!profile || dismissed) return null
  if (profile.plan !== 'trial') return null

  const days = trialDaysLeft(profile)
  const active = isPlanActive(profile)

  if (!active) return null // expired → shown via ExpiredScreen in App

  const urgent = days <= 2

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 text-xs font-medium ${
      urgent ? 'bg-red-500 text-white' : 'bg-[#F5C542] text-[#0F0F0F]'
    }`}>
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1">
        {days === 0
          ? 'Seu período de teste termina hoje!'
          : `Período de teste: ${days} dia${days > 1 ? 's' : ''} restante${days > 1 ? 's' : ''}.`}
        {' '}
        <Link to="/planos" className="underline font-bold hover:no-underline">
          Escolher plano
        </Link>
      </span>
      <button onClick={() => setDismissed(true)} className="shrink-0 opacity-80 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}
