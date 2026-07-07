import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Upload, Loader2, Plus, Pencil, Trash2, AlertTriangle, ArrowLeft, Search, X } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import {
  buscarColaboradores, parseColaboradoresBuffer, importarColaboradores,
  salvarColaborador, removerColaborador, type ColaboradorArmazem,
} from '../../lib/variavelArmazem'

function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '').padEnd(11, '•')
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

export default function ColaboradoresArmazem() {
  const { usuario } = useAuth()
  const [lista, setLista] = useState<ColaboradorArmazem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [salvando, setSalvando] = useState(false)

  const fetch = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    try { setLista(await buscarColaboradores(usuario.filial)) }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao carregar colaboradores.') }
    finally { setLoading(false) }
  }, [usuario])

  useEffect(() => { fetch() }, [fetch])

  async function handleImportar(file: File) {
    if (!usuario) return
    setUploading(true); setErro('')
    try {
      const itens = parseColaboradoresBuffer(await file.arrayBuffer())
      if (itens.length === 0) throw new Error('Planilha sem colunas reconhecidas. Precisa ter "Nome" e "CPF".')
      const n = await importarColaboradores(usuario.filial, itens)
      await fetch()
      alert(`${n} colaborador(es) cadastrado(s)/atualizado(s).`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar.')
    } finally {
      setUploading(false)
    }
  }

  function abrirNovo() { setEditId(null); setNome(''); setCpf(''); setErro(''); setModal(true) }
  function abrirEditar(c: ColaboradorArmazem) { setEditId(c.id); setNome(c.nome); setCpf(c.cpf); setErro(''); setModal(true) }

  async function salvar() {
    if (!usuario) return
    setSalvando(true); setErro('')
    try {
      await salvarColaborador(usuario.filial, nome, cpf, editId ?? undefined)
      setModal(false); await fetch()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(c: ColaboradorArmazem) {
    if (!confirm(`Excluir ${c.nome}?`)) return
    try { await removerColaborador(c.id); await fetch() }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao excluir.') }
  }

  const filtrados = lista.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()) || c.cpf.includes(busca.replace(/\D/g, '')))

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/armazem/variavel" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar pra Variável</Link>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-accent-600" /> Colaboradores do Armazém</h1>
          <p className="text-sm text-muted-foreground mt-1">Nome + CPF. É o CPF que liga o colaborador à consulta no totem.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar planilha
          </button>
          <button onClick={abrirNovo} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm transition-colors"><Plus className="h-4 w-4" /> Novo</button>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportar(f); if (inputRef.current) inputRef.current.value = '' }} />
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b"><h2 className="text-sm font-semibold">{lista.length} colaborador(es)</h2></div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{lista.length === 0 ? 'Nenhum colaborador. Importe uma planilha ou cadastre manualmente.' : 'Nenhum resultado pra essa busca.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">CPF</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{formatarCpf(c.cpf)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => abrirEditar(c)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                        <button onClick={() => excluir(c)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">{editId ? 'Editar colaborador' : 'Novo colaborador'}</h2>
              <button onClick={() => setModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">CPF</label>
                <input value={cpf} onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder="Só números" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm tabular-nums" />
              </div>
              {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(false)} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !nome.trim() || cpf.length !== 11} className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors flex items-center gap-2">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
