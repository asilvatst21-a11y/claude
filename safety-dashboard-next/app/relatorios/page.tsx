'use client'
import { useState, useEffect } from 'react'
import DataTable from '@/components/ui/DataTable'
import FilterBar from '@/components/ui/FilterBar'
import ScoreBadge from '@/components/ui/ScoreBadge'

const SETORES = ['Distribuição', 'Armazém']
const today = new Date().toISOString().split('T')[0]
const firstOfYear = `${new Date().getFullYear()}-01-01`

export default function RelatoriosPage() {
  const [filters, setFilters] = useState<Record<string, string>>({ setor: '', risco: '' })
  const [dateRange, setDateRange] = useState({ data_inicio: firstOfYear, data_fim: today })
  const [scores, setScores] = useState<Record<string,unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v)))
    fetch(`/api/dashboard/scores?${params}`).then(r => r.json())
      .then(d => { setScores(d); setLoading(false) })
  }, [filters.setor, filters.risco])

  const handleExportCsv = async () => {
    setExportLoading(true)
    const params = new URLSearchParams(Object.fromEntries(
      Object.entries({ ...filters, ...dateRange }).filter(([,v]) => v)
    ))
    const res = await fetch(`/api/reports/csv?${params}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `safety-report-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
  }

  const filterDefs = [
    { key: 'setor', label: 'Setor', options: SETORES.map(s => ({ value: s, label: s })) },
    { key: 'risco', label: 'Risco', options: [
      { value: 'critico', label: 'Crítico' }, { value: 'alto', label: 'Alto' },
      { value: 'medio', label: 'Médio' }, { value: 'baixo', label: 'Baixo' },
    ]},
  ]

  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'setor', label: 'Setor' },
    { key: 'score', label: 'Score', render: (v: unknown) => <ScoreBadge score={v as number} /> },
    { key: 'riskLevel', label: 'Risco', render: (v: unknown) => {
      const labels: Record<string,string> = { baixo:'Baixo', medio:'Médio', alto:'Alto', critico:'Crítico' }
      return labels[v as string] || v as string
    }},
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Exportação por período e filtros</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Período</h2>
        <div className="flex flex-wrap gap-4 items-end">
          {(['data_inicio', 'data_fim'] as const).map(key => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {key === 'data_inicio' ? 'De' : 'Até'}
              </label>
              <input type="date" value={dateRange[key]}
                onChange={e => setDateRange(r => ({ ...r, [key]: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
        </div>
      </div>

      <FilterBar filters={filterDefs} values={filters} onChange={setFilters} />

      <div className="flex gap-3 print:hidden">
        <button onClick={handleExportCsv} disabled={exportLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 text-sm font-medium">
          {exportLoading ? 'Exportando...' : '↓ Exportar CSV'}
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">
          🖨 Imprimir PDF
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Preview — {scores.length} colaboradores</h2>
        {loading
          ? <div className="h-24 flex items-center justify-center text-gray-400">Carregando...</div>
          : <DataTable columns={columns} data={scores} emptyMessage="Nenhum colaborador encontrado." />}
      </div>
    </div>
  )
}
