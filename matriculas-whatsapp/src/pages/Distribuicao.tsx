import { useCallback, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Truck, RefreshCw, FileSpreadsheet, Plus, X, Building2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { SolicitacaoExtra } from '../types'

const TIPOS_SOLICITACAO = ['Finalizar Rota', 'Entrega/Recolha de Materiais', 'Outros'] as const
const SOLICITANTES_AMBEV = ['Isabela Kimel', 'Takasi Augusto', 'Roberta Soares', 'Outro']

function formatDate(str: string) {
  return new Date(str + 'T00:00:00').toLocaleDateString('pt-BR')
}

function formatCurrency(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Distribuicao() {
  const { usuario } = useAuth()
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoExtra[]>([])
  const [colaboradores, setColaboradores] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [nomeSolicitante, setNomeSolicitante] = useState('')
  const [dataSolicitacao, setDataSolicitacao] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoSolicitacao, setTipoSolicitacao] = useState<typeof TIPOS_SOLICITACAO[number] | ''>('')
  const [descricao, setDescricao] = useState('')
  const [mapa, setMapa] = useState('')
  const [local, setLocal] = useState('')
  const [solicitanteAmbev, setSolicitanteAmbev] = useState('')
  const [solicitanteAmbevOutro, setSolicitanteAmbevOutro] = useState('')
  const [motoristaNome, setMotoristaNome] = useState('')
  const [ajudante1Nome, setAjudante1Nome] = useState('')
  const [ajudante2Nome, setAjudante2Nome] = useState('')
  const [valorAcordado, setValorAcordado] = useState('')

  const fetchSolicitacoes = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('solicitacoes_extra')
      .select('*')
      .eq('filial', usuario.filial)
      .order('created_at', { ascending: false })
    setSolicitacoes(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchSolicitacoes() }, [fetchSolicitacoes])

  useEffect(() => {
    if (!usuario) return
    supabase.from('colaboradores').select('nome').eq('filial', usuario.filial).order('nome')
      .then(({ data }) => setColaboradores((data ?? []).map((c: { nome: string }) => c.nome)))
  }, [usuario])

  function abrirModal() {
    setNomeSolicitante('')
    setDataSolicitacao(new Date().toISOString().slice(0, 10))
    setTipoSolicitacao('')
    setDescricao('')
    setMapa('')
    setLocal('')
    setSolicitanteAmbev('')
    setSolicitanteAmbevOutro('')
    setMotoristaNome('')
    setAjudante1Nome('')
    setAjudante2Nome('')
    setValorAcordado('')
    setErro('')
    setModal(true)
  }

  async function handleSalvar() {
    if (!usuario) return
    setErro('')
    if (!nomeSolicitante.trim() || !tipoSolicitacao) {
      setErro('Preencha nome do solicitante e tipo de solicitação.')
      return
    }
    if (tipoSolicitacao === 'Finalizar Rota' && !mapa.trim()) {
      setErro('Informe o mapa para finalizar a rota.')
      return
    }
    if (tipoSolicitacao === 'Entrega/Recolha de Materiais' && !local.trim()) {
      setErro('Informe o local da entrega/recolha.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.from('solicitacoes_extra').insert({
      filial: usuario.filial,
      nome_solicitante: nomeSolicitante.trim(),
      data_solicitacao: dataSolicitacao,
      tipo_solicitacao: tipoSolicitacao,
      descricao: descricao.trim() || null,
      mapa: tipoSolicitacao === 'Finalizar Rota' ? mapa.trim() : null,
      local: tipoSolicitacao === 'Entrega/Recolha de Materiais' ? local.trim() : null,
      solicitante_ambev: solicitanteAmbev === 'Outro' ? (solicitanteAmbevOutro.trim() || null) : (solicitanteAmbev || null),
      motorista_nome: motoristaNome || null,
      ajudante1_nome: ajudante1Nome || null,
      ajudante2_nome: ajudante2Nome || null,
      valor_acordado: valorAcordado ? Number(valorAcordado) : null,
    })
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setModal(false)
    await fetchSolicitacoes()
  }

  function exportExcel() {
    if (!solicitacoes.length) return
    const rows = solicitacoes.map(s => ({
      'Data': formatDate(s.data_solicitacao),
      'Solicitante': s.nome_solicitante,
      'Tipo': s.tipo_solicitacao,
      'Descrição': s.descricao ?? '',
      'Mapa': s.mapa ?? '',
      'Local': s.local ?? '',
      'Solicitante Ambev': s.solicitante_ambev ?? '',
      'Motorista': s.motorista_nome ?? '',
      'Ajudante 1': s.ajudante1_nome ?? '',
      'Ajudante 2': s.ajudante2_nome ?? '',
      'Valor Acordado': s.valor_acordado ?? '',
      'Criado em': new Date(s.created_at).toLocaleString('pt-BR'),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Distribuição')
    XLSX.writeFile(wb, `distribuicao_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Distribuição</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Building2 size={14} /> {usuario?.filial} · Solicitações extras (finalização de rota, entrega/recolha e outros)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchSolicitacoes} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Atualizar</span>
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <FileSpreadsheet className="h-4 w-4" />Excel
          </button>
          <button onClick={abrirModal} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm transition-colors">
            <Plus className="h-4 w-4" />Nova solicitação
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">Carregando...</div>
      ) : solicitacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Truck className="h-10 w-10 opacity-20 mb-3" />
          <p>Nenhuma solicitação registrada</p>
        </div>
      ) : (
        <>
        {/* Desktop: tabela */}
        <div className="border rounded-lg overflow-hidden hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Solicitante</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mapa / Local</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Equipe</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Solicitante Ambev</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {solicitacoes.map(s => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.data_solicitacao)}</td>
                  <td className="px-4 py-3">{s.nome_solicitante}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.tipo_solicitacao}</span>
                    {s.descricao && <div className="text-xs text-muted-foreground mt-1 max-w-xs">{s.descricao}</div>}
                  </td>
                  <td className="px-4 py-3">{s.mapa ?? s.local ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div>{s.motorista_nome ?? '—'}</div>
                    {(s.ajudante1_nome || s.ajudante2_nome) && (
                      <div className="text-xs text-muted-foreground">{[s.ajudante1_nome, s.ajudante2_nome].filter(Boolean).join(' / ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{s.solicitante_ambev ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(s.valor_acordado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: cartões */}
        <div className="md:hidden space-y-3">
          {solicitacoes.map(s => (
            <div key={s.id} className="border rounded-lg bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{formatDate(s.data_solicitacao)}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.tipo_solicitacao}</span>
              </div>
              <div className="font-medium text-sm">{s.nome_solicitante}</div>
              {s.descricao && <div className="text-xs text-muted-foreground">{s.descricao}</div>}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-xs text-muted-foreground block">Mapa/Local</span>{s.mapa ?? s.local ?? '—'}</div>
                <div><span className="text-xs text-muted-foreground block">Valor</span>{formatCurrency(s.valor_acordado)}</div>
                <div className="col-span-2"><span className="text-xs text-muted-foreground block">Motorista</span>{s.motorista_nome ?? '—'}</div>
                {(s.ajudante1_nome || s.ajudante2_nome) && (
                  <div className="col-span-2"><span className="text-xs text-muted-foreground block">Ajudantes</span>{[s.ajudante1_nome, s.ajudante2_nome].filter(Boolean).join(' / ')}</div>
                )}
                <div className="col-span-2"><span className="text-xs text-muted-foreground block">Solicitante Ambev</span>{s.solicitante_ambev ?? '—'}</div>
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Nova solicitação extra</h2>
              <button onClick={() => setModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do solicitante</label>
                  <input value={nomeSolicitante} onChange={e => setNomeSolicitante(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Data</label>
                  <input type="date" value={dataSolicitacao} onChange={e => setDataSolicitacao(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Solicitação</label>
                <select value={tipoSolicitacao} onChange={e => setTipoSolicitacao(e.target.value as typeof tipoSolicitacao)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">Selecione...</option>
                  {TIPOS_SOLICITACAO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descreva a solicitação</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>

              {tipoSolicitacao === 'Finalizar Rota' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Mapa</label>
                  <input value={mapa} onChange={e => setMapa(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              )}

              {tipoSolicitacao === 'Entrega/Recolha de Materiais' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Local</label>
                  <input value={local} onChange={e => setLocal(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Solicitante Ambev</label>
                <select value={solicitanteAmbev} onChange={e => setSolicitanteAmbev(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">Selecione...</option>
                  {SOLICITANTES_AMBEV.map(s => <option key={s}>{s}</option>)}
                </select>
                {solicitanteAmbev === 'Outro' && (
                  <input value={solicitanteAmbevOutro} onChange={e => setSolicitanteAmbevOutro(e.target.value)} placeholder="Nome do solicitante Ambev" className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Motorista</label>
                  <select value={motoristaNome} onChange={e => setMotoristaNome(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ajudante 1</label>
                  <select value={ajudante1Nome} onChange={e => setAjudante1Nome(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ajudante 2</label>
                  <select value={ajudante2Nome} onChange={e => setAjudante2Nome(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor acordado</label>
                <input type="number" step="0.01" value={valorAcordado} onChange={e => setValorAcordado(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>

              {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(false)} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={handleSalvar} disabled={salvando} className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
