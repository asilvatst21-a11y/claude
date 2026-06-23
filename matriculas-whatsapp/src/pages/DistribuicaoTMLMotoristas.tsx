import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { parseMotoristaSalaBuffer } from '../lib/tmlParser'
import { isSalaTML, SALA_TML_LABEL } from '../lib/tml'
import type { MotoristaSalaTML } from '../types'

export default function DistribuicaoTMLMotoristas() {
  const { usuario } = useAuth()
  const [motoristas, setMotoristas] = useState<MotoristaSalaTML[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<MotoristaSalaTML | null>(null)
  const [modal, setModal] = useState(false)
  const [excluindo, setExcluindo] = useState<MotoristaSalaTML | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState('')

  const [matricula, setMatricula] = useState('')
  const [nome, setNome] = useState('')
  const [sala, setSala] = useState<'COLORADO' | 'SUB-FURIA' | ''>('')

  const inputRef = useRef<HTMLInputElement>(null)

  const fetchMotoristas = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('motoristas_sala_tml')
      .select('*')
      .eq('filial', usuario.filial)
      .order('nome')
    setMotoristas(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchMotoristas() }, [fetchMotoristas])

  function abrirCriar() {
    setEditando(null)
    setMatricula('')
    setNome('')
    setSala('')
    setErro('')
    setModal(true)
  }

  function abrirEditar(m: MotoristaSalaTML) {
    setEditando(m)
    setMatricula(String(m.matricula))
    setNome(m.nome)
    setSala(m.sala)
    setErro('')
    setModal(true)
  }

  async function handleSalvar() {
    if (!usuario || !matricula.trim() || !nome.trim() || !sala) return
    setSalvando(true)
    setErro('')
    try {
      const matriculaNum = Number(matricula.trim())
      if (!matriculaNum || isNaN(matriculaNum)) throw new Error('Matrícula inválida')

      if (editando) {
        const { error } = await supabase
          .from('motoristas_sala_tml')
          .update({ matricula: matriculaNum, nome: nome.trim(), sala })
          .eq('id', editando.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('motoristas_sala_tml')
          .upsert(
            { filial: usuario.filial, matricula: matriculaNum, nome: nome.trim(), sala, importado_em: new Date().toISOString() },
            { onConflict: 'filial,matricula' }
          )
        if (error) throw new Error(error.message)
      }
      setModal(false)
      await fetchMotoristas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir() {
    if (!excluindo) return
    setRemovendo(true)
    try {
      const { error } = await supabase.from('motoristas_sala_tml').delete().eq('id', excluindo.id)
      if (error) throw new Error(error.message)
      setExcluindo(null)
      await fetchMotoristas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setRemovendo(false)
    }
  }

  async function handleImportar(file: File) {
    if (!usuario) return
    setUploading(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const roster = parseMotoristaSalaBuffer(buffer).filter((r) => isSalaTML(r.sala))
      if (roster.length === 0) {
        throw new Error('Nenhum motorista com sala COLORADO/SUB-FURIA encontrado na planilha')
      }
      const { error } = await supabase.from('motoristas_sala_tml').upsert(
        roster.map((r) => ({
          filial: usuario.filial,
          matricula: r.matricula,
          nome: r.nome,
          sala: r.sala,
          importado_em: new Date().toISOString(),
        })),
        { onConflict: 'filial,matricula' }
      )
      if (error) throw new Error(error.message)
      alert(`${roster.length} motorista(s) importado(s)/atualizado(s).`)
      await fetchMotoristas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar relação de motoristas')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/distribuicao/tml" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">Relação de Motoristas — TML</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro fixo de motorista x sala. Atualize apenas quando um motorista novo chegar.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchMotoristas} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar planilha
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportar(file)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          <button onClick={abrirCriar} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm transition-colors">
            <Plus className="h-4 w-4" /> Novo motorista
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Lista de Motoristas</h2>
          <p className="text-xs text-muted-foreground">{motoristas.length} motorista(s) cadastrado(s)</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : motoristas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum motorista cadastrado.</p>
            <p className="text-sm mt-1">Cadastre manualmente ou importe a planilha de relação inicial.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Matrícula</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sala</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {motoristas.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono">{m.matricula}</td>
                    <td className="px-4 py-3 font-medium">{m.nome}</td>
                    <td className="px-4 py-3">{SALA_TML_LABEL[m.sala] ?? m.sala}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => abrirEditar(m)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors">
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button onClick={() => setExcluindo(m)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors">
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </button>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">{editando ? 'Editar motorista' : 'Novo motorista'}</h2>
              <button onClick={() => setModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Matrícula</label>
                <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ex: 123456" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João Silva" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sala</label>
                <select value={sala} onChange={(e) => setSala(e.target.value as 'COLORADO' | 'SUB-FURIA')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">Selecione...</option>
                  <option value="COLORADO">COLORADO (7H)</option>
                  <option value="SUB-FURIA">SUB-FURIA (8H)</option>
                </select>
              </div>
              {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(false)} disabled={salvando} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button
                onClick={handleSalvar}
                disabled={salvando || !matricula.trim() || !nome.trim() || !sala}
                className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {excluindo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Excluir motorista</h2>
              <button onClick={() => setExcluindo(null)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 text-sm">
              Tem certeza que deseja excluir <strong>{excluindo.nome}</strong>? Essa ação não pode ser desfeita.
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setExcluindo(null)} disabled={removendo} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={handleExcluir} disabled={removendo} className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors">
                {removendo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
