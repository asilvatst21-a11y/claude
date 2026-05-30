import { useState, useEffect } from 'react'
import { getColaboradores } from '../api/colaboradores'
import { getDashboardScores } from '../api/dashboard'
import { downloadCsv } from '../api/reports'
import FilterBar from '../components/ui/FilterBar'
import ScoreBadge from '../components/ui/ScoreBadge'
import DataTable from '../components/ui/DataTable'

const today = new Date().toISOString().split('T')[0]
const firstOfYear = `${new Date().getFullYear()}-01-01`

const SETORES = ['Logística', 'Operações', 'Administrativo', 'Manutenção', 'Comercial']

export default function Reports() {
  const [filters, setFilters] = useState({
    setor: '',
    lider_responsavel: '',
    risco: '',
  })
  const [dateRange, setDateRange] = useState({ data_inicio: firstOfYear, data_fim: today })
  const [scores, setScores] = useState([])
  const [lideres, setLideres] = useState([])
  const [loading, setLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    getColaboradores({ cargo: 'Lider' }).then(setLideres).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    getDashboardScores({ setor: filters.setor, lider_responsavel: filters.lider_responsavel, risco: filters.risco })
      .then(data => {
        setScores(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filters.setor, filters.lider_responsavel, filters.risco])

  const handleExportCsv = async () => {
    setExportLoading(true)
    try {
      await downloadCsv({
        ...dateRange,
        setor: filters.setor,
        lider_responsavel: filters.lider_responsavel,
        risco: filters.risco
      })
    } catch (e) {
      alert('Erro ao exportar: ' + e.message)
    } finally {
      setExportLoading(false)
    }
  }

  const handlePrint = () => window.print()

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
    { key: 'score', label: 'Score', render: (v) => <ScoreBadge score={v} /> },
  ]

  const printColumns = [
    { key: 'nome', label: 'Nome' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'setor', label: 'Setor' },
    { key: 'score', label: 'Score' },
    { key: 'riskLevel', label: 'Risco', render: (v) => {
      const labels = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico' }
      return labels[v] || v
    }},
  ]

  return (
    <div>
      {/* Print Header - only shown on print */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Safety Dashboard - Relatório</h1>
        <p className="text-sm text-gray-600">Gerado em: {today}</p>
        <p className="text-sm text-gray-600">
          Período: {dateRange.data_inicio} a {dateRange.data_fim}
          {filters.setor && ` | Setor: ${filters.setor}`}
          {filters.lider_responsavel && ` | Líder: ${filters.lider_responsavel}`}
        </p>
        <hr className="my-3" />
      </div>

      {/* Screen content */}
      <div className="no-print space-y-6">
        {/* Date range */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Período do Relatório</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data Início</label>
              <input
                type="date"
                value={dateRange.data_inicio}
                onChange={e => setDateRange(r => ({ ...r, data_inicio: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data Fim</label>
              <input
                type="date"
                value={dateRange.data_fim}
                onChange={e => setDateRange(r => ({ ...r, data_fim: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        <FilterBar filters={filterDefs} values={filters} onChange={setFilters} />

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleExportCsv}
            disabled={exportLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exportLoading ? 'Exportando...' : 'Exportar CSV'}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir PDF
          </button>
        </div>

        {/* Preview table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">
              Preview — {scores.length} colaboradores
            </h2>
          </div>
          {loading ? (
            <div className="h-32 flex items-center justify-center text-gray-400">Carregando...</div>
          ) : (
            <DataTable
              columns={columns}
              data={scores}
              emptyMessage="Nenhum colaborador encontrado com os filtros aplicados."
            />
          )}
        </div>
      </div>

      {/* Printable section - only shown on print */}
      <div className="hidden print:block">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {printColumns.map(col => (
                <th key={col.key} className="border border-gray-300 px-3 py-2 bg-gray-100 text-left font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {printColumns.map(col => (
                  <td key={col.key} className="border border-gray-300 px-3 py-2">
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-4">Total: {scores.length} registros</p>
      </div>
    </div>
  )
}
