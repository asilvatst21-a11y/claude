import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../types'
import { Plus, Pencil, Trash2, Search, Upload, Image } from 'lucide-react'

const EMPTY: Omit<Cliente, 'id' | 'created_at' | 'foto_url'> = {
  codigo: '',
  nome: '',
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
    c.codigo.toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNovo() {
    setForm(EMPTY)
    setEditId(null)
    setFotoFile(null)
    setFotoPreview(null)
    setModal(true)
  }

  function abrirEditar(c: Cliente) {
    setForm({ codigo: c.codigo, nome: c.nome, observacoes: c.observacoes ?? '' })
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
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Foto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Observações</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">Nenhum cliente encontrado</td>
              </tr>
            )}
            {filtrados.map(c => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-gray-900">{c.codigo}</td>
                <td className="px-4 py-3 text-gray-700">{c.nome}</td>
                <td className="px-4 py-3">
                  {c.foto_url
                    ? <img src={c.foto_url} alt="foto" className="w-10 h-10 rounded object-cover border border-gray-200" />
                    : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                        <Image size={16} className="text-gray-400" />
                      </div>
                  }
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{c.observacoes || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => abrirEditar(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(c)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
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
              {editId ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código do Cliente *</label>
                <input
                  value={form.codigo}
                  onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Ex: CLI-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Nome do cliente"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Foto de referência
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Foto enviada junto com a mensagem de disparo (ex: foto da entrada, escada, etc.)
                </p>
                <div
                  onClick={() => inputFoto.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-colors"
                >
                  {fotoPreview
                    ? <img src={fotoPreview} alt="preview" className="max-h-40 rounded object-contain" />
                    : <>
                        <Upload size={24} className="text-gray-400" />
                        <span className="text-sm text-gray-500">Clique para selecionar foto</span>
                      </>
                  }
                </div>
                <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={selecionarFoto} />
                {fotoPreview && (
                  <button
                    onClick={() => { setFotoFile(null); setFotoPreview(null) }}
                    className="text-xs text-red-500 hover:text-red-700 mt-1"
                  >
                    Remover foto
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações / Instruções</label>
                <textarea
                  value={form.observacoes ?? ''}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Ex: Subir a escada à direita da entrada principal"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={loading || !form.nome || !form.codigo}
                className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
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
