import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-semibold text-gray-700">{label}</p>
        <p className="text-blue-600 font-bold">Score: {payload[0].value}</p>
      </div>
    )
  }
  return null
}

export default function TrendLineChart({ data, title }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Nenhum dado de tendência disponível
      </div>
    )
  }

  return (
    <div>
      {title && <p className="text-sm font-medium text-gray-600 mb-3">{title}</p>}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}`} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'Bom', position: 'right', fontSize: 10, fill: '#22c55e' }} />
          <ReferenceLine y={50} stroke="#eab308" strokeDasharray="4 4" label={{ value: 'Alerta', position: 'right', fontSize: 10, fill: '#eab308' }} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
