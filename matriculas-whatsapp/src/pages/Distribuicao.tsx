import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Truck, RefreshCw, FileSpreadsheet, Plus, X, Building2, CalendarDays, Check, Pencil, Loader2, MapPin, Route } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { SolicitacaoExtra } from '../types'
import PessoaValorCard from '../components/PessoaValorCard'
import { formatarDataBR } from '../lib/utils'
import { calcularKmIdaVolta } from '../lib/calcularKm'

const TIPOS_SOLICITACAO = ['Finalizar Rota', 'Entrega/Recolha de Materiais', 'Outros'] as const
const SOLICITANTES_AMBEV = ['Isabela Kimel', 'Takasi Augusto', 'Roberta Soares', 'Outro']

function formatDate(str: string) {
  return formatarDataBR(str + 'T00:00:00')
}

function formatCurrency(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Competência de pagamento: 'YYYY-MM'. Quando a solicitação não tem competência
// definida, cai no mês da própria solicitação.
function compDe(s: SolicitacaoExtra): string {
  return s.competencia_pagamento ?? s.data_solicitacao.slice(0, 7)
}
function compLabel(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${mes}/${ano}`
}

export default function Distribuicao() {
  const { usuario } = useAuth()
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoExtra[]>([])
  const [colaboradores, setColaboradores] = useState<string[]>([])
  const [filtroComp, setFiltroComp] = useState('todas')
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
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [calculandoKm, setCalculandoKm] = useState(false)
  const [kmPrevisto, setKmPrevisto] = useState<number | null>(null)
  const [kmErro, setKmErro] = useState('')
  const [solicitanteAmbev, setSolicitanteAmbev] = useState('')
  const [solicitanteAmbevOutro, setSolicitanteAmbevOutro] = useState('')
  const [motoristaNome, setMotoristaNome] = useState('')
  const [ajudante1Nome, setAjudante1Nome] = useState('')
  const [ajudante2Nome, setAjudante2Nome] = useState('')
  const [valorUnico, setValorUnico] = useState(false)
  const [valorAcordado, setValorAcordado] = useState('')
  const [valorMotorista, setValorMotorista] = useState('')
  const [valorAjudante1, setValorAjudante1] = useState('')
  const [valorAjudante2, setValorAjudante2] = useState('')

  const [editando, setEditando] = useState<SolicitacaoExtra | null>(null)
  const [editValorMotorista, setEditValorMotorista] = useState('')
  const [editValorAjudante1, setEditValorAjudante1] = useState('')
  const [editValorAjudante2, setEditValorAjudante2] = useState('')
  const [salvandoEdit, setSalvandoEdit] = useState(false)

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

  // Opções de competência: mês atual ± alguns, mais as competências já
  // presentes nos dados — ordenadas da mais recente para a mais antiga.
  const competenciasOpcoes = useMemo(() => {
    const set = new Set<string>()
    const hoje = new Date()
    for (let i = -6; i <= 2; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    for (const s of solicitacoes) set.add(compDe(s))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [solicitacoes])

  const solicitacoesFiltradas = useMemo(
    () => (filtroComp === 'todas' ? solicitacoes : solicitacoes.filter((s) => compDe(s) === filtroComp)),
    [solicitacoes, filtroComp],
  )

  async function marcarPago(s: SolicitacaoExtra) {
    const novo = !s.pago
    const pagoEm = novo ? new Date().toISOString() : null
    setSolicitacoes((prev) => prev.map((x) => (x.id === s.id ? { ...x, pago: novo, pago_em: pagoEm } : x)))
    const { error } = await supabase.from('solicitacoes_extra').update({ pago: novo, pago_em: pagoEm }).eq('id', s.id)
    if (error) { setErro(error.message); fetchSolicitacoes() }
  }

  async function mudarCompetencia(s: SolicitacaoExtra, comp: string) {
    setSolicitacoes((prev) => prev.map((x) => (x.id === s.id ? { ...x, competencia_pagamento: comp } : x)))
    const { error } = await supabase.from('solicitacoes_extra').update({ competencia_pagamento: comp }).eq('id', s.id)
    if (error) { setErro(error.message); fetchSolicitacoes() }
  }

  function abrirEdicaoValor(s: SolicitacaoExtra) {
    setEditando(s)
    setEditValorMotorista(s.valor_motorista != null ? String(s.valor_motorista) : '')
    setEditValorAjudante1(s.valor_ajudante1 != null ? String(s.valor_ajudante1) : '')
    setEditValorAjudante2(s.valor_ajudante2 != null ? String(s.valor_ajudante2) : '')
  }

  async function salvarEdicaoValor() {
    if (!editando) return
    setSalvandoEdit(true)
    const vMotorista = editValorMotorista ? Number(editValorMotorista) : null
    const vAjudante1 = editValorAjudante1 ? Number(editValorAjudante1) : null
    const vAjudante2 = editValorAjudante2 ? Number(editValorAjudante2) : null
    const vTotal = [vMotorista, vAjudante1, vAjudante2].some(v => v != null)
      ? [vMotorista, vAjudante1, vAjudante2].reduce((soma: number, v) => soma + (v ?? 0), 0)
      : null
    const { error } = await supabase.from('solicitacoes_extra').update({
      valor_motorista: vMotorista,
      valor_ajudante1: vAjudante1,
      valor_ajudante2: vAjudante2,
      valor_acordado: vTotal,
    }).eq('id', editando.id)
    setSalvandoEdit(false)
    if (error) { setErro(error.message); return }
    setSolicitacoes((prev) => prev.map((x) => (x.id === editando.id
      ? { ...x, valor_motorista: vMotorista, valor_ajudante1: vAjudante1, valor_ajudante2: vAjudante2, valor_acordado: vTotal }
      : x)))
    setEditando(null)
  }

  function abrirModal() {
    setNomeSolicitante('')
    setDataSolicitacao(new Date().toISOString().slice(0, 10))
    setTipoSolicitacao('')
    setDescricao('')
    setMapa('')
    setLocal('')
    setEnderecoEntrega('')
    setKmPrevisto(null)
    setKmErro('')
    setSolicitanteAmbev('')
    setSolicitanteAmbevOutro('')
    setMotoristaNome('')
    setAjudante1Nome('')
    setAjudante2Nome('')
    setValorUnico(false)
    setValorAcordado('')
    setValorMotorista('')
    setValorAjudante1('')
    setValorAjudante2('')
    setErro('')
    setModal(true)
  }

  async function calcularKm() {
    if (!enderecoEntrega.trim()) {
      setKmErro('Digite o endereço antes de calcular.')
      return
    }
    setKmErro('')
    setKmPrevisto(null)
    setCalculandoKm(true)
    const resultado = await calcularKmIdaVolta(enderecoEntrega.trim())
    setCalculandoKm(false)
    if ('erro' in resultado) {
      setKmErro(resultado.erro)
      return
    }
    setKmPrevisto(resultado.kmIdaVolta)
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
    if (tipoSolicitacao === 'Entrega/Recolha de Materiais' && !enderecoEntrega.trim()) {
      setErro('Informe o endereço da entrega/recolha.')
      return
    }
    setSalvando(true)
    // "Valor único para todos" é o valor POR PESSOA — o total é esse valor
    // multiplicado pela quantidade de pessoas com nome preenchido (motorista
    // + ajudantes), não o valor digitado direto como total da solicitação.
    const vPorPessoa = valorUnico && valorAcordado ? Number(valorAcordado) : null
    const vMotorista = valorUnico
      ? (vPorPessoa != null && motoristaNome ? vPorPessoa : null)
      : (valorMotorista ? Number(valorMotorista) : null)
    const vAjudante1 = valorUnico
      ? (vPorPessoa != null && ajudante1Nome ? vPorPessoa : null)
      : (valorAjudante1 ? Number(valorAjudante1) : null)
    const vAjudante2 = valorUnico
      ? (vPorPessoa != null && ajudante2Nome ? vPorPessoa : null)
      : (valorAjudante2 ? Number(valorAjudante2) : null)
    const vTotal = [vMotorista, vAjudante1, vAjudante2].some(v => v != null)
      ? [vMotorista, vAjudante1, vAjudante2].reduce((soma: number, v) => soma + (v ?? 0), 0)
      : null
    const { error } = await supabase.from('solicitacoes_extra').insert({
      filial: usuario.filial,
      nome_solicitante: nomeSolicitante.trim(),
      data_solicitacao: dataSolicitacao,
      tipo_solicitacao: tipoSolicitacao,
      descricao: descricao.trim() || null,
      mapa: tipoSolicitacao === 'Finalizar Rota' ? mapa.trim() : null,
      local: tipoSolicitacao === 'Entrega/Recolha de Materiais' ? local.trim() : null,
      endereco_entrega: tipoSolicitacao === 'Entrega/Recolha de Materiais' ? enderecoEntrega.trim() : null,
      km_previsto: tipoSolicitacao === 'Entrega/Recolha de Materiais' ? kmPrevisto : null,
      solicitante_ambev: solicitanteAmbev === 'Outro' ? (solicitanteAmbevOutro.trim() || null) : (solicitanteAmbev || null),
      motorista_nome: motoristaNome || null,
      ajudante1_nome: ajudante1Nome || null,
      ajudante2_nome: ajudante2Nome || null,
      valor_acordado: vTotal,
      valor_motorista: vMotorista,
      valor_ajudante1: vAjudante1,
      valor_ajudante2: vAjudante2,
      competencia_pagamento: dataSolicitacao.slice(0, 7),
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
    if (!solicitacoesFiltradas.length) return
    const rows = solicitacoesFiltradas.map(s => ({
      'Data': formatDate(s.data_solicitacao),
      'Competência': compLabel(compDe(s)),
      'Pago': s.pago ? 'Sim' : 'Não',
      'Solicitante': s.nome_solicitante,
      'Tipo': s.tipo_solicitacao,
      'Descrição': s.descricao ?? '',
      'Mapa': s.mapa ?? '',
      'Local': s.local ?? '',
      'Endereço Entrega/Recolha': s.endereco_entrega ?? '',
      'KM Previsto (ida+volta)': s.km_previsto ?? '',
      'Solicitante Ambev': s.solicitante_ambev ?? '',
      'Motorista': s.motorista_nome ?? '',
      'Valor Motorista': s.valor_motorista ?? '',
      'Ajudante 1': s.ajudante1_nome ?? '',
      'Valor Ajudante 1': s.valor_ajudante1 ?? '',
      'Ajudante 2': s.ajudante2_nome ?? '',
      'Valor Ajudante 2': s.valor_ajudante2 ?? '',
      'Valor Total': s.valor_acordado ?? '',
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
        <div className="flex gap-2 flex-wrap items-center">
          <label className="flex items-center gap-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <select value={filtroComp} onChange={e => setFiltroComp(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-sm bg-white">
              <option value="todas">Todas as competências</option>
              {competenciasOpcoes.map(c => <option key={c} value={c}>{compLabel(c)}</option>)}
            </select>
          </label>
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
      ) : solicitacoesFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Truck className="h-10 w-10 opacity-20 mb-3" />
          <p>{filtroComp === 'todas' ? 'Nenhuma solicitação registrada' : `Nenhuma solicitação na competência ${compLabel(filtroComp)}`}</p>
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Competência</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {solicitacoesFiltradas.map(s => {
                const risco = s.pago ? 'line-through' : ''
                return (
                <tr key={s.id} className={`hover:bg-muted/30 transition-colors align-top ${s.pago ? 'bg-green-50/40 text-muted-foreground' : ''}`}>
                  <td className={`px-4 py-3 whitespace-nowrap ${risco}`}>{formatDate(s.data_solicitacao)}</td>
                  <td className={`px-4 py-3 ${risco}`}>{s.nome_solicitante}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ${risco}`}>{s.tipo_solicitacao}</span>
                    {s.descricao && <div className={`text-xs text-muted-foreground mt-1 max-w-xs ${risco}`}>{s.descricao}</div>}
                  </td>
                  <td className={`px-4 py-3 ${risco}`}>
                    {s.mapa ?? s.local ?? '—'}
                    {s.km_previsto != null && (
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{s.km_previsto.toLocaleString('pt-BR')} km (ida+volta)
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${risco}`}>
                    <div>{s.motorista_nome ?? '—'}{s.valor_motorista != null && <span className="text-xs text-muted-foreground"> ({formatCurrency(s.valor_motorista)})</span>}</div>
                    {s.ajudante1_nome && (
                      <div className="text-xs text-muted-foreground">{s.ajudante1_nome}{s.valor_ajudante1 != null && ` (${formatCurrency(s.valor_ajudante1)})`}</div>
                    )}
                    {s.ajudante2_nome && (
                      <div className="text-xs text-muted-foreground">{s.ajudante2_nome}{s.valor_ajudante2 != null && ` (${formatCurrency(s.valor_ajudante2)})`}</div>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${risco}`}>{s.solicitante_ambev ?? '—'}</td>
                  <td className={`px-4 py-3 text-right ${risco}`}>
                    <div className="flex items-center justify-end gap-1.5">
                      {formatCurrency(s.valor_acordado)}
                      <button onClick={() => abrirEdicaoValor(s)} title="Editar valor" className="text-muted-foreground hover:text-accent-600 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={compDe(s)}
                      onChange={e => mudarCompetencia(s, e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white"
                    >
                      {competenciasOpcoes.map(c => <option key={c} value={c}>{compLabel(c)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => marcarPago(s)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${s.pago ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-accent-500 hover:text-white'}`}
                      title={s.pago ? 'Clique para desmarcar' : 'Marcar como pago'}
                    >
                      <Check className="h-3.5 w-3.5" /> {s.pago ? 'Pago' : 'Marcar pago'}
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* Mobile: cartões */}
        <div className="md:hidden space-y-3">
          {solicitacoesFiltradas.map(s => (
            <div key={s.id} className={`border rounded-lg bg-white p-3 space-y-2 ${s.pago ? 'bg-green-50/40' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs text-muted-foreground ${s.pago ? 'line-through' : ''}`}>{formatDate(s.data_solicitacao)}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ${s.pago ? 'line-through' : ''}`}>{s.tipo_solicitacao}</span>
              </div>
              <div className={`font-medium text-sm ${s.pago ? 'line-through text-muted-foreground' : ''}`}>{s.nome_solicitante}</div>
              {s.descricao && <div className={`text-xs text-muted-foreground ${s.pago ? 'line-through' : ''}`}>{s.descricao}</div>}
              <div className={`grid grid-cols-2 gap-x-4 gap-y-1 text-sm ${s.pago ? 'line-through text-muted-foreground' : ''}`}>
                <div>
                  <span className="text-xs text-muted-foreground block">Mapa/Local</span>{s.mapa ?? s.local ?? '—'}
                  {s.km_previsto != null && <span className="text-xs text-muted-foreground"> · {s.km_previsto.toLocaleString('pt-BR')} km</span>}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Valor</span>
                  <span className="inline-flex items-center gap-1.5">
                    {formatCurrency(s.valor_acordado)}
                    <button onClick={() => abrirEdicaoValor(s)} title="Editar valor" className="text-muted-foreground hover:text-accent-600 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground block">Motorista</span>
                  {s.motorista_nome ?? '—'}{s.valor_motorista != null && ` (${formatCurrency(s.valor_motorista)})`}
                </div>
                {s.ajudante1_nome && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground block">Ajudante 1</span>
                    {s.ajudante1_nome}{s.valor_ajudante1 != null && ` (${formatCurrency(s.valor_ajudante1)})`}
                  </div>
                )}
                {s.ajudante2_nome && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground block">Ajudante 2</span>
                    {s.ajudante2_nome}{s.valor_ajudante2 != null && ` (${formatCurrency(s.valor_ajudante2)})`}
                  </div>
                )}
                <div className="col-span-2"><span className="text-xs text-muted-foreground block">Solicitante Ambev</span>{s.solicitante_ambev ?? '—'}</div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Competência</span>
                  <select value={compDe(s)} onChange={e => mudarCompetencia(s, e.target.value)} className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white">
                    {competenciasOpcoes.map(c => <option key={c} value={c}>{compLabel(c)}</option>)}
                  </select>
                </label>
                <button
                  onClick={() => marcarPago(s)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold ${s.pago ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  <Check className="h-3.5 w-3.5" /> {s.pago ? 'Pago' : 'Marcar pago'}
                </button>
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
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Local</label>
                    <input value={local} onChange={e => setLocal(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Endereço da Entrega/Recolha</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          value={enderecoEntrega}
                          onChange={e => { setEnderecoEntrega(e.target.value); setKmPrevisto(null); setKmErro('') }}
                          placeholder="Rua, número, bairro, cidade"
                          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={calcularKm}
                        disabled={calculandoKm || !enderecoEntrega.trim()}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-50 text-accent-700 hover:bg-accent-100 disabled:opacity-40 transition-colors"
                      >
                        {calculandoKm ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
                        Calcular KM
                      </button>
                    </div>
                    {kmErro && <p className="text-xs text-red-600 mt-1.5">{kmErro}</p>}
                    {kmPrevisto != null && (
                      <p className="text-xs text-green-700 mt-1.5">KM previsto (ida + volta): <span className="font-bold">{kmPrevisto.toLocaleString('pt-BR')} km</span></p>
                    )}
                  </div>
                </>
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

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={valorUnico}
                    onChange={e => setValorUnico(e.target.checked)}
                    className="rounded text-brand-700"
                  />
                  Valor único para todos
                </label>

                <PessoaValorCard
                  label="Motorista"
                  nome={motoristaNome}
                  onNomeChange={setMotoristaNome}
                  colaboradores={colaboradores}
                  valor={valorMotorista}
                  onValorChange={setValorMotorista}
                  mostrarValor={!valorUnico}
                />
                <PessoaValorCard
                  label="Ajudante 1"
                  nome={ajudante1Nome}
                  onNomeChange={setAjudante1Nome}
                  colaboradores={colaboradores}
                  valor={valorAjudante1}
                  onValorChange={setValorAjudante1}
                  mostrarValor={!valorUnico}
                />
                <PessoaValorCard
                  label="Ajudante 2"
                  nome={ajudante2Nome}
                  onNomeChange={setAjudante2Nome}
                  colaboradores={colaboradores}
                  valor={valorAjudante2}
                  onValorChange={setValorAjudante2}
                  mostrarValor={!valorUnico}
                />

                {valorUnico && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor por pessoa</label>
                    <input type="number" step="0.01" value={valorAcordado} onChange={e => setValorAcordado(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    {valorAcordado && Number(valorAcordado) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Total: {formatCurrency(
                          Number(valorAcordado) * [motoristaNome, ajudante1Nome, ajudante2Nome].filter(Boolean).length
                        )}{' '}
                        ({[motoristaNome, ajudante1Nome, ajudante2Nome].filter(Boolean).length} pessoa(s))
                      </p>
                    )}
                  </div>
                )}
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

      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Editar valor — {editando.nome_solicitante}</h2>
              <button onClick={() => setEditando(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(editando.data_solicitacao)} · {editando.local ?? editando.mapa ?? '—'}
            </p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground block mb-1">Motorista{editando.motorista_nome ? ` — ${editando.motorista_nome}` : ''}</span>
                <input type="number" step="0.01" value={editValorMotorista} onChange={e => setEditValorMotorista(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" disabled={!editando.motorista_nome} />
              </label>
              {editando.ajudante1_nome && (
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground block mb-1">Ajudante 1 — {editando.ajudante1_nome}</span>
                  <input type="number" step="0.01" value={editValorAjudante1} onChange={e => setEditValorAjudante1(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              )}
              {editando.ajudante2_nome && (
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground block mb-1">Ajudante 2 — {editando.ajudante2_nome}</span>
                  <input type="number" step="0.01" value={editValorAjudante2} onChange={e => setEditValorAjudante2(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              )}
              <p className="text-sm font-medium">
                Total: {formatCurrency(
                  [editValorMotorista, editValorAjudante1, editValorAjudante2].some(v => v)
                    ? [editValorMotorista, editValorAjudante1, editValorAjudante2].reduce((soma, v) => soma + (v ? Number(v) : 0), 0)
                    : null
                )}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={salvarEdicaoValor} disabled={salvandoEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors">
                {salvandoEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
