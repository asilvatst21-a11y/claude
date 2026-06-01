'use client'
import { useState } from 'react'

interface Alert {
  type: string
  message: string
  colaborador_nome?: string
  severity: 'critico' | 'alto' | 'medio'
}

export default function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  const active = alerts.filter((_, i) => !dismissed.has(i))
  if (active.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        if (dismissed.has(i)) return null
        const color = alert.severity === 'critico' ? 'bg-red-50 border-red-300 text-red-800' :
          alert.severity === 'alto' ? 'bg-orange-50 border-orange-300 text-orange-800' :
          'bg-yellow-50 border-yellow-300 text-yellow-800'
        return (
          <div key={i} className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm ${color}`}>
            <span>
              <strong>{alert.colaborador_nome}</strong> — {alert.message}
            </span>
            <button onClick={() => setDismissed(prev => { const s = new Set(prev); s.add(i); return s })}
              className="ml-4 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
          </div>
        )
      })}
    </div>
  )
}
