'use client'

interface Props { score: number; large?: boolean }

export default function ScoreBadge({ score, large }: Props) {
  const color =
    score >= 75 ? 'bg-green-100 text-green-800' :
    score >= 50 ? 'bg-yellow-100 text-yellow-800' :
    score >= 25 ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
  const label =
    score >= 75 ? 'Baixo' :
    score >= 50 ? 'Médio' :
    score >= 25 ? 'Alto' : 'Crítico'

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full ${color} ${large ? 'px-4 py-2 text-base' : 'px-2.5 py-0.5 text-xs'}`}>
      <span>{score}</span>
      <span className="opacity-70">·</span>
      <span>{label}</span>
    </span>
  )
}
