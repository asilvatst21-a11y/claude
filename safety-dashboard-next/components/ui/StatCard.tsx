interface Props {
  label: string
  value: number | string | undefined
  subtitle?: string
  colorClass?: string
}

export default function StatCard({ label, value, subtitle, colorClass = 'border-blue-500' }: Props) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${colorClass} border border-gray-200 shadow-sm p-5`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value ?? '—'}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  )
}
