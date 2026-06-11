'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Entry { nome: string; score: number; riskLevel: string }

function getColor(score: number) {
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#eab308'
  if (score >= 25) return '#f97316'
  return '#ef4444'
}

export default function ScoreBarChart({ data }: { data: Entry[] }) {
  const top = data.slice(0, 15)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={top} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="nome" width={140}
          tick={{ fontSize: 11 }} tickFormatter={v => v.split(' ')[0] + ' ' + (v.split(' ')[1] || '')} />
        <Tooltip formatter={(v: number) => [v, 'Score']} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {top.map((entry, i) => (
            <Cell key={i} fill={getColor(entry.score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
