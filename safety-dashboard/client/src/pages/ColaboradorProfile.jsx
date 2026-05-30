import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ScoreBadge from '../components/ui/ScoreBadge'
import DataTable from '../components/ui/DataTable'
import Modal from '../components/ui/Modal'
import TrendLineChart from '../components/charts/TrendLineChart'
import { getColaborador } from '../api/colaboradores'
import { getDtos, createDto } from '../api/dtos'
import { getAvaliacoes, createAvaliacao } from '../api/avaliacoes'
import { getTelemetria } from '../api/telemetria'
import { getEncaminhamentos, updateEncaminhamento, createEncaminhamento } from '../api/encaminhamentos'

const today = new Date().toISOString().split('T')[0]

export default function ColaboradorProfile() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [col, setCol] = useState(null)
  const [dtos, setDtos] = useState([])
  const [avaliacoes, setAvaliacoes] = useState([])
  const [telemetria, setTelemetria] = useState([])
  const [encaminhamentos, setEncaminhamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal states
  const [dtoModal, setDtoModal] = useState(false)
  const [avalModal, setAvalModal] = useState(false)
  const [encModal, setEncModal] = useState(false)
  const [formError, setFormError] = useState(null)

  // DTO form
  const [dtoForm, setDtoForm] = useState({ data_realizacao: today, data_validade: '', observacoes: '' })
  // Avaliacao form
  const [avalForm, setAvalForm] = useState({ data: today, tipo: 'ato_inseguro', descricao: '', gravidade: 3, registrado_por: '' })
  // Encaminhamento form
  const [encForm, setEncForm] = useState({ tipo: 'feedback', prazo: '', })

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [c, d, a, t, e] = await Promise.all([
        getColaborador(id),
        getDtos({ colaborador_id: id }),
        getAvaliacoes({ colaborador_id: id }),
        getTelemetria({ motorista_id: id }),
        getEncaminhamentos({ colaborador_id: id })
      ])
      setCol(c)
      setDtos(d)
      setAvaliacoes(a)
      setTelemetria(t)
      setEncaminhamentos(e)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  const handleDtoSubmit = async () => {
    setFormError(null)
    try {
      await createDto({ ...dtoForm, colaborador_id: parseInt(id) })
      setDtoModal(false)
      setDtoForm({ data_realizacao: today, data_validade: '', observacoes: '' })
      loadAll()
    } catch (e) {
      setFormError(e.message)
    }
  }

  const handleAvalSubmit = async () => {
    setFormError(null)
    try {
      await createAvaliacao({ ...avalForm, colaborador_id: parseInt(id), gravidade: parseInt(avalForm.gravidade) })
      setAvalModal(false)
      setAvalForm({ data: today, tipo: 'ato_inseguro', descricao: '', gravidade: 3, registrado_por: '' })
      loadAll()
    } catch (e) {
      setFormError(e.message)
    }
  }

  const handleEncSubmit = async () => {
    setFormError(null)
    try {
      await createEncaminhamento({ ...encForm, colaborador_id: parseInt(id) })
      setEncModal(false)
      setEncForm({ tipo: 'feedback', prazo: '' })
      loadAll()
    } catch (e) {
      setFormError(e.message)
    }
  }

  const handleToggleEnc = async (enc) => {
    const newStatus = enc.status === 'pendente' ? 'concluido' : 'pendente'
    await updateEncaminhamento(enc.id, { status: newStatus })
    loadAll()
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>
  if (error) return <div className="text-center text-red-600 mt-8">{error}</div>
  if (!col) return null

  const isMotorista = col.cargo?.toLowerCase() === 'motorista'

  // Build trend data from telemetria
  const trendData = telemetria.map(t => ({
    period: t.periodo_ref,
    score: t.score_calculado != null
      ? Math.round(t.score_calculado / 0.30)
      : 50
  })).reverse()

  const statusBadge = (status) => {
    const map = {
      em_dia: 'bg-green-100 text-green-700',
      vencido: 'bg-red-100 text-red-700',
      ausente: 'bg-gray-100 text-gray-700',
      pendente: 'bg-yellow-100 text-yellow-700',
      concluido: 'bg-green-100 text-green-700',
    }
    const labels = { em_dia: 'Em dia', vencido: 'Vencido', ausente: 'Ausente', pendente: 'Pendente', concluido: 'Concluído' }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-700'}`}>{labels[status] || status}</span>
  }

  const dtoColumns = [
    { key: 'data_realizacao', label: 'Realização' },
    { key: 'data_validade', label: 'Validade' },
    { key: 'status', label: 'Status', render: (v) => statusBadge(v) },
    { key: 'observacoes', label: 'Observações', render: (v) => <span className="text-gray-500 text-xs">{v || '-'}</span> },
  ]

  const avalColumns = [
    { key: 'data', label: 'Data' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v) => {
        const map = {
          ato_inseguro: 'bg-red-100 text-red-700',
          condicao_insegura: 'bg-orange-100 text-orange-700',
          abordagem_positiva: 'bg-green-100 text-green-700'
        }
        const labels = {
          ato_inseguro: 'Ato Inseguro',
          condicao_insegura: 'Condição Insegura',
          abordagem_positiva: 'Abordagem Positiva'
        }
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[v] || ''}`}>{labels[v] || v}</span>
      }
    },
    { key: 'descricao', label: 'Descrição' },
    { key: 'gravidade', label: 'Gravidade', render: (v) => `${v}/5` },
    { key: 'registrado_por', label: 'Registrado por' },
  ]

  const telColumns = [
    { key: 'periodo_ref', label: 'Período' },
    { key: 'qtd_excessos_velocidade', label: 'Excessos Vel.' },
    { key: 'qtd_frenagens_bruscas', label: 'Frenagens' },
    { key: 'qtd_curvas_bruscas', label: 'Curvas' },
    { key: 'score_calculado', label: 'Score Tel.', render: (v) => v != null ? v.toFixed(1) : '-' },
  ]

  const encColumns = [
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v) => {
        const labels = { refazer_dto: 'Refazer DTO', feedback: 'Feedback', encerramento_contrato: 'Enc. Contrato' }
        return labels[v] || v
      }
    },
    { key: 'prazo', label: 'Prazo' },
    { key: 'status', label: 'Status', render: (v) => statusBadge(v) },
    { key: 'criado_em', label: 'Criado em', render: (v) => v?.split(' ')[0] || '-' },
    {
      key: 'id',
      label: 'Ação',
      render: (v, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleEnc(row) }}
          className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
        >
          {row.status === 'pendente' ? 'Concluir' : 'Reabrir'}
        </button>
      )
    },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{col.nome}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
              <span><span className="font-medium">Cargo:</span> {col.cargo}</span>
              <span><span className="font-medium">Setor:</span> {col.setor}</span>
              <span><span className="font-medium">Líder:</span> {col.lider_responsavel}</span>
              <span><span className="font-medium">Admissão:</span> {col.data_admissao}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${col.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {col.status === 'ativo' ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>
          <ScoreBadge score={col.score} />
        </div>

        {/* Score breakdown */}
        {col.components && (
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">DTO (30%)</p>
              <p className="text-2xl font-bold text-gray-700">{col.components.dto}</p>
              {col.flags?.dtoCritical && (
                <p className="text-xs text-red-500 mt-0.5">Crítico</p>
              )}
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">Conduta (40%)</p>
              <p className="text-2xl font-bold text-gray-700">{col.components.conduta}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">Telemetria (30%)</p>
              <p className="text-2xl font-bold text-gray-700">{col.components.telemetria}</p>
              {col.flags?.telemetriaCritical && (
                <p className="text-xs text-red-500 mt-0.5">Crítico</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* DTOs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Documentos de Treinamento (DTOs)</h2>
          <button
            onClick={() => setDtoModal(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Novo DTO
          </button>
        </div>
        <DataTable columns={dtoColumns} data={dtos} emptyMessage="Nenhum DTO registrado." />
      </div>

      {/* Condutas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Avaliações de Conduta</h2>
          <button
            onClick={() => setAvalModal(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Nova Avaliação
          </button>
        </div>
        <DataTable columns={avalColumns} data={avaliacoes} emptyMessage="Nenhuma avaliação registrada." />
      </div>

      {/* Telemetria (only for motoristas) */}
      {isMotorista && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Telemetria</h2>
          <DataTable columns={telColumns} data={telemetria} emptyMessage="Nenhum dado de telemetria." />
          {trendData.length > 0 && (
            <div className="mt-6">
              <TrendLineChart data={trendData} title="Tendência de Score de Telemetria" />
            </div>
          )}
        </div>
      )}

      {/* Encaminhamentos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Encaminhamentos</h2>
          <button
            onClick={() => setEncModal(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Novo Encaminhamento
          </button>
        </div>
        <DataTable columns={encColumns} data={encaminhamentos} emptyMessage="Nenhum encaminhamento registrado." />
      </div>

      {/* DTO Modal */}
      <Modal
        open={dtoModal}
        title="Novo DTO"
        onClose={() => { setDtoModal(false); setFormError(null) }}
        footer={
          <>
            <button onClick={() => { setDtoModal(false); setFormError(null) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleDtoSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Salvar</button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Realização</label>
            <input type="date" value={dtoForm.data_realizacao}
              onChange={e => setDtoForm(f => ({ ...f, data_realizacao: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Validade *</label>
            <input type="date" value={dtoForm.data_validade}
              onChange={e => setDtoForm(f => ({ ...f, data_validade: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea value={dtoForm.observacoes}
              onChange={e => setDtoForm(f => ({ ...f, observacoes: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </Modal>

      {/* Avaliacao Modal */}
      <Modal
        open={avalModal}
        title="Nova Avaliação de Conduta"
        onClose={() => { setAvalModal(false); setFormError(null) }}
        footer={
          <>
            <button onClick={() => { setAvalModal(false); setFormError(null) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleAvalSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Salvar</button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
            <input type="date" value={avalForm.data}
              onChange={e => setAvalForm(f => ({ ...f, data: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={avalForm.tipo}
              onChange={e => setAvalForm(f => ({ ...f, tipo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ato_inseguro">Ato Inseguro</option>
              <option value="condicao_insegura">Condição Insegura</option>
              <option value="abordagem_positiva">Abordagem Positiva</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
            <textarea value={avalForm.descricao}
              onChange={e => setAvalForm(f => ({ ...f, descricao: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gravidade (1-5)</label>
            <input type="number" min="1" max="5" value={avalForm.gravidade}
              onChange={e => setAvalForm(f => ({ ...f, gravidade: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Registrado por *</label>
            <input type="text" value={avalForm.registrado_por}
              onChange={e => setAvalForm(f => ({ ...f, registrado_por: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </Modal>

      {/* Encaminhamento Modal */}
      <Modal
        open={encModal}
        title="Novo Encaminhamento"
        onClose={() => { setEncModal(false); setFormError(null) }}
        footer={
          <>
            <button onClick={() => { setEncModal(false); setFormError(null) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleEncSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Salvar</button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={encForm.tipo}
              onChange={e => setEncForm(f => ({ ...f, tipo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="feedback">Feedback</option>
              <option value="refazer_dto">Refazer DTO</option>
              <option value="encerramento_contrato">Encerramento de Contrato</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo *</label>
            <input type="date" value={encForm.prazo}
              onChange={e => setEncForm(f => ({ ...f, prazo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
