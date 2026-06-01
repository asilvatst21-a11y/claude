'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StatCard from '@/components/ui/StatCard'
import AlertBanner from '@/components/ui/AlertBanner'
import FilterBar from '@/components/ui/FilterBar'
import DataTable from '@/components/ui/DataTable'
import ScoreBadge from '@/components/ui/ScoreBadge'
import ScoreBarChart from '@/components/charts/ScoreBarChart'
import TrendLineChart from '@/components/charts/TrendLineChart'

const SETORES = ['Distribuição', 'Armazém', 'Logística', 'Operações', 'Administrativo', 'Manutenção', 'Comercial']

export default function DashboardPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Record<string, string>>({ setor: '', lider_responsavel: '', risco: '' })
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [scores, setScores] = useState<Record<string, unknown>[]>([])
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([])
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [lideres, setLideres] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/colaboradores?cargo=Supervisor')
      .then(r => r.json()).then(setLideres).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v))).toString()
    Promise.all([
      fetch('/api/dashboard/summary').then(r => r.json()),
      fetch(`/api/dashboard/scores${qs ? '?' + qs : ''}`).then(r => r.json()),
      fetch('/api/dashboard/alerts').then(r => r.json()),
      fetch('/api/dashboard/score-history').then(r => r.json()),
    ]).then(([s, sc, al, h]) => {
      setSummary(s); setScores(sc); setAlerts(al); setHistory(h)
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [filters.setor, filters.lider_responsavel, filters.risco])

  const filterDefs = [
    { key: 'setor', label: 'Setor', options: SETORES.map(s => ({ value: s, label: s })) },
    { key: 'lider_responsavel', label: 'Líder', options: (lideres as {nome:string}[]).map(l => ({ value: l.nome, label: l.nome })) },
    { key: 'risco', label: 'Risco', options: [
      { value: 'critico', label: 'Crítico' }, { value: 'alto', label: 'Alto' },
      { value: 'medio', label: 'Médio' }, { value: 'baixo', label: 'Baixo' },
    ]}
  ]

  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'setor', label: 'Setor' },
    { key: 'score', label: 'Score', render: (v: unknown) => <ScoreBadge score={v as number} /> },
  ]

  if (error) return (
    <div className="p-8 text-center text-red-600">
      <p className="font-semibold">Erro ao carregar dados</p>
      <p className="text-sm mt-1">{error}</p>
      <p className="text-xs text-gray-400 mt-2">Verifique as variáveis de ambiente do Supabase.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard de Segurança</h1>
        <p className="text-sm text-gray-500 mt-0.5">CDD Petropolis — LOG20</p>
      </div>

      <FilterBar filters={filterDefs} values={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Colaboradores Ativos" value={loading ? '...' : summary?.totalAtivos} subtitle={`${summary?.totalColaboradores ?? '—'} total`} colorClass="border-l-blue-500" />
        <StatCard label="DTOs Críticos" value={loading ? '...' : summary?.dtosCriticos} subtitle="Vencidos há +30 dias" colorClass="border-l-red-500" />
        <StatCard label="Score Médio" value={loading ? '...' : summary?.scoreMedia} subtitle="Média geral" colorClass="border-l-green-500" />
        <StatCard label="Encaminhamentos" value={loading ? '...' : summary?.encaminhamentosPendentes} subtitle="Pendentes" colorClass="border-l-orange-500" />
      </div>

      {!loading && alerts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">Alertas Ativos</h2>
          <AlertBanner alerts={alerts as unknown as Parameters<typeof AlertBanner>[0]['alerts']} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Tendência de Score (6 meses)</h2>
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400">Carregando...</div>
            : <TrendLineChart data={history as {period:string;score:number}[]} />}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Ranking de Score</h2>
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400">Carregando...</div>
            : <ScoreBarChart data={scores as {nome:string;score:number;riskLevel:string}[]} />}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Todos os Colaboradores ({scores.length})</h2>
        {loading ? <div className="h-24 flex items-center justify-center text-gray-400">Carregando...</div>
          : <DataTable columns={columns} data={scores}
              onRowClick={row => router.push(`/colaboradores/${row.id}`)}
              emptyMessage="Nenhum colaborador encontrado." />}
      </div>
    </div>
  )
}
