import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar from '../components/ui/FilterBar'
import StatCard from '../components/ui/StatCard'
import AlertBanner from '../components/ui/AlertBanner'
import DataTable from '../components/ui/DataTable'
import ScoreBadge from '../components/ui/ScoreBadge'
import ScoreBarChart from '../components/charts/ScoreBarChart'
import { getDashboardSummary, getDashboardScores, getDashboardAlerts } from '../api/dashboard'
import { getColaboradores } from '../api/colaboradores'

const SETORES = ['Logística', 'Operações', 'Administrativo', 'Manutenção', 'Comercial']

export default function Dashboard() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ setor: '', lider_responsavel: '', risco: '' })
  const [summary, setSummary] = useState(null)
  const [scores, setScores] = useState([])
  const [alerts, setAlerts] = useState([])
  const [lideres, setLideres] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load lideres for filter options
  useEffect(() => {
    getColaboradores({ cargo: 'Lider' })
      .then(data => setLideres(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getDashboardSummary(),
      getDashboardScores(filters),
      getDashboardAlerts()
    ])
      .then(([s, sc, al]) => {
        setSummary(s)
        setScores(sc)
        setAlerts(al)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [filters.setor, filters.lider_responsavel, filters.risco])

  const filterDefs = [
    {
      key: 'setor',
      label: 'Setor',
      options: SETORES.map(s => ({ value: s, label: s }))
    },
    {
      key: 'lider_responsavel',
      label: 'Líder Responsável',
      options: lideres.map(l => ({ value: l.nome, label: l.nome }))
    },
    {
      key: 'risco',
      label: 'Nível de Risco',
      options: [
        { value: 'critico', label: 'Crítico' },
        { value: 'alto', label: 'Alto' },
        { value: 'medio', label: 'Médio' },
        { value: 'baixo', label: 'Baixo' },
      ]
    }
  ]

  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'setor', label: 'Setor' },
    {
      key: 'score',
      label: 'Score',
      render: (val) => <ScoreBadge score={val} />
    },
  ]

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p className="font-semibold">Erro ao carregar dados</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-xs text-gray-400 mt-2">Verifique se o servidor está rodando em localhost:3001</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <FilterBar
        filters={filterDefs}
        values={filters}
        onChange={setFilters}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Colaboradores Ativos"
          value={loading ? '...' : summary?.totalAtivos}
          subtitle={`${loading ? '...' : summary?.totalColaboradores} total`}
          colorClass="border-blue-500"
        />
        <StatCard
          label="DTOs Críticos"
          value={loading ? '...' : summary?.dtosCriticos}
          subtitle="Vencidos há +30 dias"
          colorClass="border-red-500"
        />
        <StatCard
          label="Score Médio"
          value={loading ? '...' : summary?.scoreMedia}
          subtitle="Média geral ativos"
          colorClass="border-green-500"
        />
        <StatCard
          label="Encaminhamentos"
          value={loading ? '...' : summary?.encaminhamentosPendentes}
          subtitle="Pendentes"
          colorClass="border-orange-500"
        />
      </div>

      {/* Alerts */}
      {!loading && alerts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">Alertas Ativos</h2>
          <AlertBanner alerts={alerts} />
        </div>
      )}

      {/* Chart + Table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Ranking de Score</h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-400">Carregando...</div>
          ) : (
            <ScoreBarChart data={scores} />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Todos os Colaboradores</h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-400">Carregando...</div>
          ) : (
            <DataTable
              columns={columns}
              data={scores}
              onRowClick={(row) => navigate(`/colaboradores/${row.id}`)}
              emptyMessage="Nenhum colaborador encontrado."
            />
          )}
        </div>
      </div>
    </div>
  )
}
