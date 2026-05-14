import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Matricula } from '../types'
import { Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight } from 'lucide-react'

const EMPTY: Omit<Matricula, 'id' | 'created_at'> = {
  numero: '',
  whatsapp: '',
  nome: '',
  ativo: true,
}

export default function Matriculas() {
  const [lista, setLista] = useState<Matricula[]>([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function carregar() {
    const { data } = await supabase
      .from('matriculas')
      .select('*')
      .order('created_at', { ascending: false })
    setLista(data ?? [])
  }

  useEffect(() => { carregar() }, [])

  const filtrados = lista.filter(m =>
    m.numero.toLowerCase().includes(busca.toLowerCase()) ||
    (m.nome ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    m.whatsapp.includes(busca)
  )

  function abrirNovo() {
    setForm(EMPTY)
    setEditId(null)
    setModal(true)
  }

  function abrirEditar(m: Matricula) {
    setForm({ numero: m.numero, whatsapp: m.whatsapp, nome: m.nome ?? '', ativo: m.ativo })
    setEditId(m.id)
    setModal(true)
  }

  async function salvar() {
    setLoading(true)
    if (editId) {
      await supabase.from('matriculas').update(form).eq('id', editId)
    } else {
      await supabase.from('matriculas').insert(form)
    }
    setLoading(false)
    setModal(false)
    carregar()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir esta matrícula?')) return
    await supabase.from('matriculas').delete().eq('id', id)
    carregar()
  }

  async function toggleAtivo(m: Matricula) {
    await supabase.from('matriculas').update({ ativo: !m.ativo }).eq('id', m.id)
    carregar()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Matrículas</h2>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nova Matrícula
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por número, nome ou WhatsApp..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Matrícula</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  Nenhuma matrícula encontrada
                </td>
              </tr>
            )}
            {filtrados.map(m => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-gray-900">{m.numero}</td>
                <td className="px-4 py-3 text-gray-700">{m.nome || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{m.whatsapp}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleAtivo(m)} className="flex items-center gap-1 text-xs">
                    {m.ativo
                      ? <><ToggleRight size={18} className="text-green-500" /><span className="text-green-600">Ativo</span></>
                      : <><ToggleLeft size={18} className="text-gray-400" /><span className="text-gray-500">Inativo</span></>
                    }
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => abrirEditar(m)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(m.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editId ? 'Editar Matrícula' : 'Nova Matrícula'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número da Matrícula *</label>
                <input
                  value={form.numero}
                  onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ex: 12345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome (opcional)</label>
                <input
                  value={form.nome ?? ''}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Nome do titular"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                <input
                  value={form.whatsapp}
                  onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ex: 11999998888"
                />
                <p className="text-xs text-gray-400 mt-1">Apenas números com DDD, sem traços ou parênteses</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Matrícula ativa</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={loading || !form.numero || !form.whatsapp}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
