import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const severityStyles = {
  critico: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500' },
  alto: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500' },
  medio: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  baixo: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-500' },
}

const typeLabels = {
  dto_critico: 'DTO Crítico',
  telemetria_critica: 'Telemetria',
  score_baixo: 'Score Baixo',
}

export default function AlertBanner({ alerts }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(new Set())

  if (!alerts || alerts.length === 0) return null

  const visible = alerts.filter((_, i) => !dismissed.has(i))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        if (dismissed.has(i)) return null
        const style = severityStyles[alert.severity] || severityStyles.medio

        return (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-xl border ${style.bg} ${style.border}`}
          >
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />
            <div
              className={`flex-1 cursor-pointer ${style.text}`}
              onClick={() => navigate(`/colaboradores/${alert.colaborador_id}`)}
            >
              <span className="font-semibold text-sm">[{typeLabels[alert.type] || alert.type}] </span>
              <span className="font-medium text-sm">{alert.colaborador_nome}</span>
              <span className="text-sm"> — {alert.message}</span>
            </div>
            <button
              onClick={() => setDismissed(prev => new Set([...prev, i]))}
              className={`flex-shrink-0 p-0.5 rounded hover:opacity-70 ${style.text}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
