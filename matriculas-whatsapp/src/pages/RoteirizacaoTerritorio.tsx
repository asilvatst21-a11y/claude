import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { DiaSemanaRoteirizacao, FrotaPlaca, RoteirizacaoPlacaDia, SetorRoteirizacao } from '../types'

const DIAS: { chave: DiaSemanaRoteirizacao; label: string }[] = [
  { chave: 'SEG', label: 'Segunda' },
  { chave: 'TER', label: 'Terça' },
  { chave: 'QUA', label: 'Quarta' },
  { chave: 'QUI', label: 'Quinta' },
  { chave: 'SEX', label: 'Sexta' },
  { chave: 'SAB', label: 'Sábado' },
]

export default function RoteirizacaoTerritorio() {
  const { usuario } = useAuth()
  const [placas, setPlacas] = useState<FrotaPlaca[]>([])
  const [setores, setSetores] = useState<SetorRoteirizacao[]>([])
  const [territorios, setTerritorios] = useState<RoteirizacaoPlacaDia[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  const [novoSetor, setNovoSetor] = useState('')
  const [salvandoSetor, setSalvandoSetor] = useState(false)
  const [erroSetor, setErroSetor] = useState('')

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data: placasData }, { data: setoresData }, { data: territoriosData }] = await Promise.all([
      supabase.from('frota_placas').select('*').eq('filial', usuario.filial).eq('ativo', true).order('placa'),
      supabase.from('setores_roteirizacao').select('*').eq('filial', usuario.filial).order('nome'),
      supabase.from('roteirizacao_placa_dia').select('*').eq('filial', usuario.filial),
    ])
    setPlacas((placasData ?? []) as FrotaPlaca[])
    setSetores((setoresData ?? []) as SetorRoteirizacao[])
    setTerritorios((territoriosData ?? []) as RoteirizacaoPlacaDia[])
    setLoading(false)
  }, [usuario])

  useEffect(() => { carregar() }, [carregar])

  // Mapa placa|dia -> território, pra achar o valor de cada célula da grade sem percorrer o array toda hora.
  const mapaTerritorios = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const t of territorios) {
      if (t.territorio) mapa.set(`${t.placa}|${t.dia_semana}`, t.territorio)
    }
    return mapa
  }, [territorios])

  const setoresAtivos = useMemo(() => setores.filter(s => s.ativo), [setores])

  // Quantidade de placas cadastradas em cada território, por dia da semana —
  // resumo derivado da própria grade acima, sem precisar de outra tabela.
  const contagemPorSetorDia = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const t of territorios) {
      if (!t.territorio) continue
      const chave = `${t.territorio}|${t.dia_semana}`
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
    }
    return mapa
  }, [territorios])

  const totaisPorDia = useMemo(() => {
    const totais: Record<DiaSemanaRoteirizacao, number> = { SEG: 0, TER: 0, QUA: 0, QUI: 0, SEX: 0, SAB: 0 }
    for (const d of DIAS) {
      for (const s of setoresAtivos) totais[d.chave] += contagemPorSetorDia.get(`${s.nome}|${d.chave}`) ?? 0
    }
    return totais
  }, [contagemPorSetorDia, setoresAtivos])

  const buscaNorm = busca.trim().toUpperCase()
  const placasFiltradas = buscaNorm ? placas.filter(p => p.placa.toUpperCase().includes(buscaNorm)) : placas

  async function definirTerritorio(placa: string, dia: DiaSemanaRoteirizacao, territorio: string) {
    if (!usuario) return
    const chave = `${placa}|${dia}`
    setSalvando(chave)
    const valor = territorio || null
    setTerritorios(prev => {
      const semEssa = prev.filter(t => !(t.placa === placa && t.dia_semana === dia))
      return [...semEssa, { id: 0, filial: usuario.filial, placa, dia_semana: dia, territorio: valor, updated_at: new Date().toISOString() }]
    })
    await supabase.from('roteirizacao_placa_dia').upsert(
      { filial: usuario.filial, placa, dia_semana: dia, territorio: valor, updated_at: new Date().toISOString() },
      { onConflict: 'filial,placa,dia_semana' }
    )
    setSalvando(null)
  }

  async function adicionarSetor() {
    if (!usuario) return
    const nome = novoSetor.trim()
    if (!nome) return
    setSalvandoSetor(true)
    setErroSetor('')
    const { error } = await supabase.from('setores_roteirizacao').insert({ filial: usuario.filial, nome })
    setSalvandoSetor(false)
    if (error) {
      setErroSetor(error.message.includes('unico') || error.message.includes('duplicate') ? 'Esse setor já existe.' : error.message)
      return
    }
    setNovoSetor('')
    await carregar()
  }

  async function alternarSetorAtivo(setor: SetorRoteirizacao) {
    setSetores(prev => prev.map(s => (s.id === setor.id ? { ...s, ativo: !s.ativo } : s)))
    await supabase.from('setores_roteirizacao').update({ ativo: !setor.ativo }).eq('id', setor.id)
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/frota" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">Roteirização — Território por Placa</h1>
          <p className="text-sm text-muted-foreground">
            Defina em qual território cada placa roda em cada dia da semana (segunda a sábado). Essa definição
            alimenta a Previsão de Volume por Território.
          </p>
        </div>
        <button onClick={carregar} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors shrink-0">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="border rounded-lg bg-white">
        <button
          onClick={() => setGerenciarAberto(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold">Gerenciar setores ({setores.length})</span>
          {gerenciarAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {gerenciarAberto && (
          <div className="border-t p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Inclua aqui um setor novo caso ele não esteja na lista (a lista já vem com os territórios usados hoje
              na Previsão de Volume). Desative um setor para tirá-lo das opções sem apagar o histórico já lançado.
            </p>
            <div className="flex gap-2">
              <input
                value={novoSetor}
                onChange={e => setNovoSetor(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') adicionarSetor() }}
                placeholder="Ex.: 260 - Bairro Novo"
                className="flex-1 px-3 py-2 border rounded-md text-sm"
              />
              <button
                onClick={adicionarSetor}
                disabled={salvandoSetor || !novoSetor.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
              >
                {salvandoSetor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </button>
            </div>
            {erroSetor && <p className="text-xs text-red-600">{erroSetor}</p>}
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {setores.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">Nenhum setor cadastrado ainda.</p>
              ) : (
                setores.map(s => (
                  <div key={s.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${!s.ativo ? 'opacity-50' : ''}`}>
                    <span>{s.nome}</span>
                    <button
                      onClick={() => alternarSetorAtivo(s)}
                      title={s.ativo ? 'Desativar setor' : 'Reativar setor'}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-accent transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {s.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-sm">Grade de território por dia</h2>
            <p className="text-xs text-muted-foreground">{placas.length} placa(s) ativa(s)</p>
          </div>
          <div className="relative shrink-0">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar placa..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md w-40 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : placasFiltradas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhuma placa ativa encontrada.</p>
            <p className="text-sm mt-1">Cadastre/ative placas em Frota → Cadastro de placas.</p>
          </div>
        ) : setoresAtivos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum setor cadastrado ainda.</p>
            <p className="text-sm mt-1">Abra "Gerenciar setores" acima para cadastrar o primeiro território.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground sticky left-0 bg-muted/50">Placa</th>
                  {DIAS.map(d => (
                    <th key={d.chave} className="text-left px-3 py-3 font-medium text-muted-foreground">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {placasFiltradas.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-white">{p.placa}</td>
                    {DIAS.map(d => {
                      const chave = `${p.placa}|${d.chave}`
                      const valor = mapaTerritorios.get(chave) ?? ''
                      return (
                        <td key={d.chave} className="px-2 py-2">
                          <select
                            value={valor}
                            onChange={e => definirTerritorio(p.placa, d.chave, e.target.value)}
                            disabled={salvando === chave}
                            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                          >
                            <option value="">— sem território —</option>
                            {setoresAtivos.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Quantidade de placas por território</h2>
          <p className="text-xs text-muted-foreground">Quantas placas estão cadastradas em cada setor, em cada dia da semana — somando as escolhas feitas na grade acima.</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : setoresAtivos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum setor cadastrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground sticky left-0 bg-muted/50">Território</th>
                  {DIAS.map(d => (
                    <th key={d.chave} className="text-center px-3 py-3 font-medium text-muted-foreground">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {setoresAtivos.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-white">{s.nome}</td>
                    {DIAS.map(d => {
                      const qtd = contagemPorSetorDia.get(`${s.nome}|${d.chave}`) ?? 0
                      return (
                        <td key={d.chave} className="px-3 py-2.5 text-center">
                          {qtd > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold text-xs">
                              {qtd}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="px-4 py-2.5 font-semibold sticky left-0 bg-white">Total</td>
                  {DIAS.map(d => (
                    <td key={d.chave} className="px-3 py-2.5 text-center font-semibold">{totaisPorDia[d.chave]}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
