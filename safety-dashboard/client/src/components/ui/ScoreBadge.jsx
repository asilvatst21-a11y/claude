export default function ScoreBadge({ score }) {
  let bgClass, textClass, label
  if (score >= 75) {
    bgClass = 'bg-green-100'
    textClass = 'text-green-800'
    label = 'Baixo'
  } else if (score >= 50) {
    bgClass = 'bg-yellow-100'
    textClass = 'text-yellow-800'
    label = 'Médio'
  } else if (score >= 25) {
    bgClass = 'bg-orange-100'
    textClass = 'text-orange-800'
    label = 'Alto'
  } else {
    bgClass = 'bg-red-100'
    textClass = 'text-red-800'
    label = 'Crítico'
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold ${bgClass} ${textClass}`}>
      <span>{score}</span>
      <span className="text-xs font-normal opacity-75">|</span>
      <span className="text-xs">{label}</span>
    </span>
  )
}
