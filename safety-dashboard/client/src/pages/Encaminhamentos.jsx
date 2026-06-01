import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar from '../components/ui/FilterBar'
import StatCard from '../components/ui/StatCard'
import DataTable from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import { getEncaminhamentos, createEncaminhamento, updateEncaminhamento } from '../api/encaminhamentos'
import { getColaboradores } from '../api/colaboradores'

const today = new Date().toISOString().split('T')[0]

const tipoLabels = {
  refazer_dto: 'Refazer DTO',
  feedback: 'Feedback',
  encerramento_contrato: 'Enc. Contrato'
}

export default function Encaminhamentos() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ tipo: '', status: '', lider_responsavel: '' })
  const [data, setData] = useState([])
  const [lideres, setLideres] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ colaborador_id: '', tipo: 'feedback', prazo: '', status: 'pendente' })
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    getColaboradores({ cargo: 'Lider' }).then(setLideres).catch(() => {})
    getColaboradores().then(setColaboradores).catch(() => {})
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filters.tipo) params.tipo = filters.tipo
    if (filters.status) params.status = filters.status
    getEncaminhamentos(params)
      .then(rows => {
        let filtered = rows
        if (filters.lider_responsavel) {
          // filter by setor that matches lider
          const lider = lideres.find(l => l.nome === filters.lider_responsavel)
          if (lider) filtered = filtered.filter(r => r.setor === lider.setor)
        }
        setData(filtered)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filters.tipo, filters.status, filters.lider_responsavel])

  useEffect(() => { loadData() }, [loadData])

  // Stats
  const pendentes = data.filter(r => r.status === 'pendente').length
  const vencidos = data.filter(r => r.status === 'pendente' && r.prazo < today).length
  const thisMonth = today.substring(0, 7)
  const concluidosMes = data.filter(r => r.status === 'concluido' && r.criado_em?.startsWith(thisMonth)).length

  const handleToggle = async (row) => {
    const newStatus = row.status === 'pendente' ? 'concluido' : 'pendente'
    await updateEncaminhamento(row.id, { status: newStatus })
    loadData()
  }

  const handleSubmit = async () => {
    setFormError(null)
    try {
      await createEncaminhamento({ ...form, colaborador_id: parseInt(form.colaborador_id) })
      setModal(false)
      setForm({ colaborador_id: '', tipo: 'feedback', prazo: '', status: 'pendente' })
      loadData()
    } catch (e) {
      setFormError(e.message)
    }
  }

  const statusBadge = (v) => {
    const map = { pendente: 'bg-yellow-100 text-yellow-700', concluido: 'bg-green-100 text-green-700' }
    const labels = { pendente: 'Pendente', concluido: 'Concluído' }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[v] || 'bg-gray-100 text-gray-600'}`}>{labels[v] || v}</span>
  }

  const columns = [
    {
      key: 'colaborador_nome',
      label: 'Colaborador',
      render: (v, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/colaboradores/${row.colaborador_id}`) }}
          className="text-blue-600 hover:underline font-medium text-left"
        >
          {v}
        </button>
      )
    },
    { key: 'setor', label: 'Setor' },
    { key: 'tipo', label: 'Tipo', render: (v) => tipoLabels[v] || v },
    { key: 'prazo', label: 'Prazo', render: (v) => (
      <span className={v < today ? 'text-red-600 font-medium' : ''}>{v}</span>
    )},
    { key: 'status', label: 'Status', render: statusBadge },
    { key: 'criado_em', label: 'Criado em', render: (v) => v?.split(' ')[0] || '-' },
    {
      key: 'id',
      label: 'Ação',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(row) }}
          className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
        >
          {row.status === 'pendente' ? 'Concluir' : 'Reabrir'}
        </button>
      )
    }
  ]

  const filterDefs = [
    {
      key: 'tipo',
      label: 'Tipo',
      options: [
        { value: 'feedback', label: 'Feedback' },
        { value: 'refazer_dto', label: 'Refazer DTO' },
        { value: 'encerramento_contrato', label: 'Enc. Contrato' }
      ]
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'pendente', label: 'Pendente' },
        { value: 'concluido', label: 'Concluído' }
      ]
    },
    {
      key: 'lider_responsavel',
      label: 'Líder',
      options: lideres.map(l => ({ value: l.nome, label: l.nome }))
    }
  ]

  return (
    <div className="space-y-6">
      <FilterBar filters={filterDefs} values={filters} onChange={setFilters} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pendentes" value={pendentes} colorClass="border-yellow-500" />
        <StatCard label="Vencidos (prazo)" value={vencidos} subtitle="Com prazo passado" colorClass="border-red-500" />
        <StatCard label="Concluídos (mês)" value={concluidosMes} subtitle="Neste mês" colorClass="border-green-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Fila de Encaminhamentos</h2>
          <button
            onClick={() => setModal(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Novo Encaminhamento
          </button>
        </div>
        {loading ? (
          <div className="h-32 flex items-center justify-center text-gray-400">Carregando...</div>
        ) : (
          <DataTable columns={columns} data={data} emptyMessage="Nenhum encaminhamento encontrado." />
        )}
      </div>

      <Modal
        open={modal}
        title="Novo Encaminhamento"
        onClose={() => { setModal(false); setFormError(null) }}
        footer={
          <>
            <button onClick={() => { setModal(false); setFormError(null) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Salvar</button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador *</label>
            <select value={form.colaborador_id}
              onChange={e => setForm(f => ({ ...f, colaborador_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Selecione...</option>
              {colaboradores.map(c => (
                <option key={c.id} value={c.id}>{c.nome} ({c.cargo})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="feedback">Feedback</option>
              <option value="refazer_dto">Refazer DTO</option>
              <option value="encerramento_contrato">Encerramento de Contrato</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo *</label>
            <input type="date" value={form.prazo}
              onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
