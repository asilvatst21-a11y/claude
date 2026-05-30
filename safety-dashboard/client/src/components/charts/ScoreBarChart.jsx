import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'

function getBarColor(score) {
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#eab308'
  if (score >= 25) return '#f97316'
  return '#ef4444'
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const { nome, score, riskLevel } = payload[0].payload
    const riskLabels = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico' }
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold text-gray-800">{nome}</p>
        <p className="text-gray-600">Score: <span className="font-bold" style={{ color: getBarColor(score) }}>{score}</span></p>
        <p className="text-gray-500">Risco: {riskLabels[riskLevel] || riskLevel}</p>
      </div>
    )
  }
  return null
}

export default function ScoreBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Nenhum dado disponível
      </div>
    )
  }

  // Show top 10 lowest (most at risk) for readability
  const chartData = [...data].slice(0, 15)

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          tickFormatter={v => `${v}`}
        />
        <YAxis
          type="category"
          dataKey="nome"
          width={140}
          tick={{ fontSize: 11 }}
          tickFormatter={v => v.length > 18 ? v.substring(0, 18) + '…' : v}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={getBarColor(entry.score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
