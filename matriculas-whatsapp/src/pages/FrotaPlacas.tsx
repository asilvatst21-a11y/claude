import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Image, Loader2, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import type { FrotaPlaca } from '../types'

const PERFIS = ['VUC', 'Toco', 'Truck', 'Carreta']

export default function FrotaPlacas() {
  const { usuario } = useAuth()
  const [placas, setPlacas] = useState<FrotaPlaca[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  // Grupo de WhatsApp que recebe a imagem-resumo da Disponibilidade (botão
  // manual na aba Disponibilidade de /distribuicao/frota).
  const [grupoFrota, setGrupoFrota] = useState('')
  const [grupoOriginal, setGrupoOriginal] = useState('')
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroBuscaGrupos, setErroBuscaGrupos] = useState<string | null>(null)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [grupoSalvo, setGrupoSalvo] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const fetchPlacas = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data }, { data: filialRow }] = await Promise.all([
      supabase.from('frota_placas').select('*').eq('filial', usuario.filial).order('placa'),
      supabase.from('filiais').select('grupo_frota_whatsapp').eq('nome', usuario.filial).maybeSingle(),
    ])
    setPlacas((data ?? []) as FrotaPlaca[])
    const g = filialRow?.grupo_frota_whatsapp ?? ''
    setGrupoFrota(g)
    setGrupoOriginal(g)
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchPlacas() }, [fetchPlacas])

  async function buscarGrupos() {
    setBuscandoGrupos(true)
    setErroBuscaGrupos(null)
    const { grupos: gs, erro: e } = await listarGrupos()
    setBuscandoGrupos(false)
    if (e) { setErroBuscaGrupos(e); return }
    if (gs.length === 0) { setErroBuscaGrupos('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvarGrupo() {
    if (!usuario) return
    setSalvandoGrupo(true)
    setGrupoSalvo(false)
    await supabase.from('filiais').update({ grupo_frota_whatsapp: grupoFrota.trim() || null }).eq('nome', usuario.filial)
    setGrupoOriginal(grupoFrota.trim())
    setSalvandoGrupo(false)
    setGrupoSalvo(true)
    setTimeout(() => setGrupoSalvo(false), 2500)
  }

  async function copiarGrupo(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const grupoAlterado = grupoFrota.trim() !== grupoOriginal

  async function atualizar(id: string, campos: Partial<Pick<FrotaPlaca, 'ativo' | 'perfil' | 'matricula_motorista'>>) {
    setPlacas(ps => ps.map(p => (p.id === id ? { ...p, ...campos } : p)))
    await supabase.from('frota_placas').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id)
  }

  const buscaNorm = busca.trim().toUpperCase()
  const placasFiltradas = buscaNorm ? placas.filter(p => p.placa.toUpperCase().includes(buscaNorm)) : placas
  const ativas = placas.filter(p => p.ativo).length

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/distribuicao/frota" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">Placas da Frota</h1>
          <p className="text-sm text-muted-foreground">
            Ative/desative placas, classifique o perfil do veículo (VUC, Toco, Truck, Carreta) e registre a matrícula do
            motorista fixado na placa (usada na fixação de motorista). Placas inativas saem dos cálculos de disponibilidade,
            ranking e território. A lista é alimentada automaticamente a cada importação do relatório diário (03.11.49.03) ou
            do Histórico.
          </p>
        </div>
        <button onClick={fetchPlacas} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors shrink-0">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Image className="h-4 w-4" /> Grupo de WhatsApp — Disponibilidade</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recebe a imagem-resumo da Disponibilidade quando você clicar em "Enviar resumo para o grupo" na aba Disponibilidade.
            </p>
          </div>
          <button
            onClick={buscarGrupos}
            disabled={buscandoGrupos}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
          >
            {buscandoGrupos ? <Loader2 className="h-4 w-4 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {buscandoGrupos ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
          </button>
        </div>
        <div className="p-4 space-y-3">
          {erroBuscaGrupos && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-all">{erroBuscaGrupos}</span>
            </div>
          )}
          <GroupPicker
            label="Grupo da Disponibilidade da Frota"
            value={grupoFrota}
            onChange={setGrupoFrota}
            grupos={grupos}
            onCopy={copiarGrupo}
            copiado={copiado}
          />
          <div className="flex items-center justify-end gap-3">
            {grupoSalvo && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Salvo!</span>}
            <button
              onClick={salvarGrupo}
              disabled={salvandoGrupo || !grupoAlterado}
              className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              {salvandoGrupo ? 'Salvando…' : 'Salvar grupo'}
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-sm">Lista de Placas</h2>
            <p className="text-xs text-muted-foreground">{placas.length} placa(s) cadastrada(s) · {ativas} ativa(s)</p>
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
            <p>Nenhuma placa encontrada.</p>
            <p className="text-sm mt-1">As placas são cadastradas automaticamente a cada importação de Disponibilidade na tela Frota.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Perfil</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Matrícula do motorista</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {placasFiltradas.map(p => (
                  <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${!p.ativo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-medium">{p.placa}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={p.perfil ?? ''}
                        onChange={e => atualizar(p.id, { perfil: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="">— sem perfil —</option>
                        {PERFIS.map(perfil => <option key={perfil} value={perfil}>{perfil}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={p.matricula_motorista ?? ''}
                        placeholder="—"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (p.matricula_motorista ?? '')) atualizar(p.id, { matricula_motorista: v || null })
                        }}
                        className="w-32 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input type="checkbox" checked={p.ativo} onChange={e => atualizar(p.id, { ativo: e.target.checked })} className="accent-brand-700" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
