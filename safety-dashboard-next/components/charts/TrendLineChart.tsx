'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Entry { period: string; score: number }

export default function TrendLineChart({ data }: { data: Entry[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ left: 0, right: 16 }}>
        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => [v, 'Score médio']} />
        <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '50', fontSize: 10, fill: '#ef4444' }} />
        <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 2" label={{ value: '75', fontSize: 10, fill: '#22c55e' }} />
        <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
