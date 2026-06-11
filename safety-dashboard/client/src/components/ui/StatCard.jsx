export default function StatCard({ label, value, subtitle, colorClass = 'border-blue-500' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${colorClass} p-5`}>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value ?? '-'}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  )
}
