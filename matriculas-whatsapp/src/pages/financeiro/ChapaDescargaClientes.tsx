import { useEffect, useState } from 'react'
import { Plus, Pencil, Search, Truck, Package } from 'lucide-react'
import { listarClientes, salvarCliente, type ClienteChapaDescarga } from '@/lib/chapaDescarga'

type FormState = {
  codigo: string
  nome: string
  ativo: boolean
  chapa_habilitado: boolean
  chapa_valor_a_cada_nota: string
  chapa_valor_por_chapa: string
  descarga_habilitado: boolean
  descarga_minimo_pallets: string
  descarga_valor_por_pallet: string
}

const EMPTY: FormState = {
  codigo: '', nome: '', ativo: true,
  chapa_habilitado: false, chapa_valor_a_cada_nota: '8000', chapa_valor_por_chapa: '60',
  descarga_habilitado: false, descarga_minimo_pallets: '5', descarga_valor_por_pallet: '',
}

export default function ChapaDescargaClientesPage() {
  const [lista, setLista] = useState<ClienteChapaDescarga[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [editando, setEditando] = useState<ClienteChapaDescarga | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      setLista(await listarClientes())
    } catch (e) {
      setErro(String(e))
    }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  const filtrados = lista.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) || String(c.codigo).includes(busca)
  )

  function abrirNovo() {
    setForm(EMPTY)
    setEditando(null)
    setModal(true)
  }

  function abrirEditar(c: ClienteChapaDescarga) {
    setForm({
      codigo: String(c.codigo), nome: c.nome, ativo: c.ativo,
      chapa_habilitado: c.chapa_habilitado,
      chapa_valor_a_cada_nota: String(c.chapa_valor_a_cada_nota),
      chapa_valor_por_chapa: String(c.chapa_valor_por_chapa),
      descarga_habilitado: c.descarga_habilitado,
      descarga_minimo_pallets: String(c.descarga_minimo_pallets),
      descarga_valor_por_pallet: c.descarga_valor_por_pallet != null ? String(c.descarga_valor_por_pallet) : '',
    })
    setEditando(c)
    setModal(true)
  }

  async function salvar() {
    setErro(null)
    const codigo = parseInt(form.codigo)
    if (!codigo || !form.nome.trim()) { setErro('Informe código e nome do cliente.'); return }
    setSalvando(true)
    try {
      await salvarCliente({
        id: editando?.id,
        codigo,
        nome: form.nome.trim(),
        ativo: form.ativo,
        chapa_habilitado: form.chapa_habilitado,
        chapa_valor_a_cada_nota: parseFloat(form.chapa_valor_a_cada_nota.replace(',', '.')) || 0,
        chapa_valor_por_chapa: parseFloat(form.chapa_valor_por_chapa.replace(',', '.')) || 0,
        descarga_habilitado: form.descarga_habilitado,
        descarga_minimo_pallets: parseInt(form.descarga_minimo_pallets) || 0,
        descarga_valor_por_pallet: form.descarga_valor_por_pallet.trim()
          ? parseFloat(form.descarga_valor_por_pallet.replace(',', '.'))
          : null,
      })
      setModal(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
    setSalvando(false)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Chapa / Descarga — Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clientes habilitados para pagamento de Chapa e/ou Descarga Paletizada, com os parâmetros de cada um.
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo cliente
        </button>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por código ou nome…"
          className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {erro && <div className="text-sm text-red-700 bg-red-50 rounded-md p-3">{erro}</div>}

      <div className="rounded-lg border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Código</th>
              <th className="text-left px-3 py-2 font-medium">Nome</th>
              <th className="text-left px-3 py-2 font-medium">Chapa</th>
              <th className="text-left px-3 py-2 font-medium">Descarga</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</td></tr>
            )}
            {!carregando && filtrados.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</td></tr>
            )}
            {filtrados.map(c => (
              <tr key={c.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 font-mono">{c.codigo}</td>
                <td className="px-3 py-2">{c.nome}</td>
                <td className="px-3 py-2 text-xs">
                  {c.chapa_habilitado
                    ? <span className="inline-flex items-center gap-1 text-emerald-700"><Truck className="h-3.5 w-3.5" /> a cada R$ {c.chapa_valor_a_cada_nota.toLocaleString('pt-BR')} → R$ {c.chapa_valor_por_chapa.toLocaleString('pt-BR')}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.descarga_habilitado
                    ? <span className="inline-flex items-center gap-1 text-blue-700"><Package className="h-3.5 w-3.5" /> acima de {c.descarga_minimo_pallets} pallets → R$ {(c.descarga_valor_por_pallet ?? 0).toLocaleString('pt-BR')}/pallet</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => abrirEditar(c)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-accent rounded">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editando ? 'Editar cliente' : 'Novo cliente'}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Código *</label>
                  <input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    disabled={!!editando}
                    className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-muted/40"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                    Ativo
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.chapa_habilitado} onChange={e => setForm(f => ({ ...f, chapa_habilitado: e.target.checked }))} />
                  <Truck className="h-4 w-4 text-emerald-700" /> Chapa
                </label>
                {form.chapa_habilitado && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">A cada R$ de nota</label>
                      <input value={form.chapa_valor_a_cada_nota} onChange={e => setForm(f => ({ ...f, chapa_valor_a_cada_nota: e.target.value }))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Valor por chapa (R$)</label>
                      <input value={form.chapa_valor_por_chapa} onChange={e => setForm(f => ({ ...f, chapa_valor_por_chapa: e.target.value }))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.descarga_habilitado} onChange={e => setForm(f => ({ ...f, descarga_habilitado: e.target.checked }))} />
                  <Package className="h-4 w-4 text-blue-700" /> Descarga Paletizada
                </label>
                {form.descarga_habilitado && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Mínimo de pallets (acima de)</label>
                      <input value={form.descarga_minimo_pallets} onChange={e => setForm(f => ({ ...f, descarga_minimo_pallets: e.target.value }))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Valor por pallet (R$)</label>
                      <input value={form.descarga_valor_por_pallet} onChange={e => setForm(f => ({ ...f, descarga_valor_por_pallet: e.target.value }))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {erro && <div className="text-sm text-red-700 bg-red-50 rounded-md p-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm hover:bg-muted rounded-md">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
