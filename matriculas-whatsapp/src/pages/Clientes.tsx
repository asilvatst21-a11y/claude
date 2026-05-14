import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../types'
import { Plus, Pencil, Trash2, Search, Upload, User } from 'lucide-react'

const EMPTY: Omit<Cliente, 'id' | 'created_at' | 'foto_url'> = {
  nome: '',
  cpf: '',
  email: '',
  observacoes: '',
}

export default function Clientes() {
  const [lista, setLista] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputFoto = useRef<HTMLInputElement>(null)

  async function carregar() {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('nome')
    setLista(data ?? [])
  }

  useEffect(() => { carregar() }, [])

  const filtrados = lista.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.cpf ?? '').includes(busca) ||
    (c.email ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNovo() {
    setForm(EMPTY)
    setEditId(null)
    setFotoFile(null)
    setFotoPreview(null)
    setModal(true)
  }

  function abrirEditar(c: Cliente) {
    setForm({ nome: c.nome, cpf: c.cpf ?? '', email: c.email ?? '', observacoes: c.observacoes ?? '' })
    setEditId(c.id)
    setFotoFile(null)
    setFotoPreview(c.foto_url)
    setModal(true)
  }

  function selecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  async function salvar() {
    setLoading(true)
    let foto_url: string | null = fotoPreview ?? null

    if (fotoFile) {
      const ext = fotoFile.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { data: upload } = await supabase.storage
        .from('fotos-clientes')
        .upload(path, fotoFile, { upsert: true })

      if (upload) {
        const { data: urlData } = supabase.storage
          .from('fotos-clientes')
          .getPublicUrl(upload.path)
        foto_url = urlData.publicUrl
      }
    }

    const payload = { ...form, foto_url }

    if (editId) {
      await supabase.from('clientes').update(payload).eq('id', editId)
    } else {
      await supabase.from('clientes').insert(payload)
    }

    setLoading(false)
    setModal(false)
    carregar()
  }

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente ${c.nome}?`)) return
    if (c.foto_url) {
      const path = c.foto_url.split('/fotos-clientes/')[1]
      if (path) await supabase.storage.from('fotos-clientes').remove([path])
    }
    await supabase.from('clientes').delete().eq('id', c.id)
    carregar()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF ou e-mail..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.length === 0 && (
          <p className="col-span-3 text-center py-10 text-gray-400">Nenhum cliente encontrado</p>
        )}
        {filtrados.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
            <div className="shrink-0">
              {c.foto_url
                ? <img src={c.foto_url} alt={c.nome} className="w-14 h-14 rounded-full object-cover" />
                : <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                    <User size={24} className="text-gray-400" />
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{c.nome}</p>
              {c.cpf && <p className="text-xs text-gray-500">CPF: {c.cpf}</p>}
              {c.email && <p className="text-xs text-gray-500 truncate">{c.email}</p>}
              {c.observacoes && <p className="text-xs text-gray-400 mt-1 truncate">{c.observacoes}</p>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => abrirEditar(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                <Pencil size={14} />
              </button>
              <button onClick={() => excluir(c)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editId ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>
            <div className="flex flex-col items-center mb-4">
              <div
                onClick={() => inputFoto.current?.click()}
                className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-green-400 overflow-hidden"
              >
                {fotoPreview
                  ? <img src={fotoPreview} alt="preview" className="w-full h-full object-cover" />
                  : <div className="flex flex-col items-center text-gray-400 text-xs text-center">
                      <Upload size={20} />
                      <span className="mt-1">Foto</span>
                    </div>
                }
              </div>
              <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={selecionarFoto} />
              <p className="text-xs text-gray-400 mt-1">Clique para selecionar foto</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                <input
                  value={form.cpf ?? ''}
                  onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email ?? ''}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={form.observacoes ?? ''}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={loading || !form.nome}
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
