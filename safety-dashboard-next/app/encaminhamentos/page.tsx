'use client'
import { useState, useEffect } from 'react'
import DataTable from '@/components/ui/DataTable'
import FilterBar from '@/components/ui/FilterBar'
import StatCard from '@/components/ui/StatCard'

export default function EncaminhamentosPage() {
  const [encs, setEncs] = useState<Record<string,unknown>[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({ tipo: '', status: '' })
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v))).toString()
    fetch(`/api/encaminhamentos${qs ? '?' + qs : ''}`)
      .then(r => r.json()).then(d => { setEncs(d); setLoading(false) })
  }

  useEffect(() => { load() }, [filters.tipo, filters.status])

  const toggleStatus = async (enc: Record<string,unknown>) => {
    const newStatus = enc.status === 'pendente' ? 'concluido' : 'pendente'
    await fetch(`/api/encaminhamentos/${enc.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    })
    load()
  }

  const pendentes = encs.filter(e => e.status === 'pendente').length
  const concluidos = encs.filter(e => e.status === 'concluido').length
  const today = new Date().toISOString().split('T')[0]
  const vencidos = encs.filter(e => e.status === 'pendente' && (e.prazo as string) < today).length

  const filterDefs = [
    { key: 'tipo', label: 'Tipo', options: [
      { value: 'refazer_dto', label: 'Refazer DTO' },
      { value: 'feedback', label: 'Feedback' },
      { value: 'encerramento_contrato', label: 'Encerramento' },
    ]},
    { key: 'status', label: 'Status', options: [
      { value: 'pendente', label: 'Pendente' },
      { value: 'concluido', label: 'Concluído' },
    ]},
  ]

  const tipoLabels: Record<string,string> = {
    refazer_dto: 'Refazer DTO', feedback: 'Feedback', encerramento_contrato: 'Encerramento'
  }

  const columns = [
    { key: 'colaboradores', label: 'Colaborador', render: (_: unknown, row: Record<string,unknown>) => {
      const c = row.colaboradores as {nome?:string;cargo?:string}|null
      return <span>{c?.nome || '—'}<span className="text-xs text-gray-400 ml-1">({c?.cargo})</span></span>
    }},
    { key: 'tipo', label: 'Tipo', render: (v: unknown) => tipoLabels[v as string] || v as string },
    { key: 'prazo', label: 'Prazo', render: (v: unknown) => {
      const overdue = (v as string) < today
      return <span className={overdue ? 'text-red-600 font-medium' : ''}>{v as string}</span>
    }},
    { key: 'status', label: 'Status', render: (v: unknown, row: Record<string,unknown>) => (
      <button onClick={e => { e.stopPropagation(); toggleStatus(row) }}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer
          ${v === 'pendente' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
        {v === 'pendente' ? 'Pendente' : 'Concluído'}
      </button>
    )},
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Gestão de Encaminhamentos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Fila de ações por colaborador</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pendentes" value={pendentes} colorClass="border-l-orange-500" />
        <StatCard label="Prazo Vencido" value={vencidos} colorClass="border-l-red-500" />
        <StatCard label="Concluídos" value={concluidos} colorClass="border-l-green-500" />
      </div>

      <FilterBar filters={filterDefs} values={filters} onChange={setFilters} />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Encaminhamentos ({encs.length})</h2>
        {loading
          ? <div className="h-24 flex items-center justify-center text-gray-400">Carregando...</div>
          : <DataTable columns={columns} data={encs} emptyMessage="Nenhum encaminhamento encontrado." />}
      </div>
    </div>
  )
}
