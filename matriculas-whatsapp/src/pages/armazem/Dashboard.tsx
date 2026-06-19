import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock, Gauge, Loader2, Octagon, Users, X } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import type { ArmazemExecucao, ArmazemExecucaoPausa } from '../../types'

const LIMIAR_PAUSA_LONGA_MIN = 20

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR')
}

interface MetaPorAtividade { [atividadeNome: string]: number | null }

export default function ArmazemDashboard() {
  const { usuario } = useAuth()
  const [execucoes, setExecucoes] = useState<ArmazemExecucao[]>([])
  const [pausas, setPausas] = useState<ArmazemExecucaoPausa[]>([])
  const [metas, setMetas] = useState<MetaPorAtividade>({})
  const [loading, setLoading] = useState(true)
  const [encerrarId, setEncerrarId] = useState<string | null>(null)
  const [motivoEncerramento, setMotivoEncerramento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const desde = new Date()
    desde.setDate(desde.getDate() - 7)

    const [execRes, tiposRes] = await Promise.all([
      supabase
        .from('armazem_execucoes')
        .select('*')
        .eq('filial', usuario.filial)
        .gte('created_at', desde.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('armazem_atividades_tipo').select('nome, meta_tempo_minutos').eq('filial', usuario.filial),
    ])

    const execs: ArmazemExecucao[] = execRes.data ?? []
    setExecucoes(execs)
    const metaMap: MetaPorAtividade = {}
    for (const t of tiposRes.data ?? []) metaMap[t.nome] = t.meta_tempo_minutos
    setMetas(metaMap)

    const ativasIds = execs.filter(e => e.status === 'em_andamento' || e.status === 'pausada').map(e => e.id)
    if (ativasIds.length > 0) {
      const { data: pausasData } = await supabase.from('armazem_execucoes_pausas').select('*').in('execucao_id', ativasIds)
      setPausas(pausasData ?? [])
    } else {
      setPausas([])
    }

    setLoading(false)
  }, [usuario])

  useEffect(() => { carregar() }, [carregar])

  const ativas = useMemo(() => execucoes.filter(e => e.status === 'em_andamento' || e.status === 'pausada'), [execucoes])
  const concluidas = useMemo(() => execucoes.filter(e => e.status === 'concluida'), [execucoes])
  const comAnomalia = useMemo(() => execucoes.filter(e => e.houve_anomalia), [execucoes])

  const tempoMedioPorAtividade = useMemo(() => {
    const grupos: Record<string, number[]> = {}
    for (const e of concluidas) {
      if (e.duracao_minutos == null) continue
      grupos[e.atividade_nome] ??= []
      grupos[e.atividade_nome].push(e.duracao_minutos)
    }
    return Object.entries(grupos).map(([nome, duracoes]) => ({
      nome,
      media: Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length),
      meta: metas[nome] ?? null,
      qtd: duracoes.length,
    }))
  }, [concluidas, metas])

  const rankingColaboradores = useMemo(() => {
    const grupos: Record<string, { qtd: number; anomalias: number }> = {}
    for (const e of concluidas) {
      grupos[e.colaborador_nome] ??= { qtd: 0, anomalias: 0 }
      grupos[e.colaborador_nome].qtd += 1
      if (e.houve_anomalia) grupos[e.colaborador_nome].anomalias += 1
    }
    return Object.entries(grupos).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 10)
  }, [concluidas])

  const pausasLongasAbertas = useMemo(() => {
    return pausas
      .filter(p => !p.pausa_fim)
      .map(p => ({ pausa: p, minutos: Math.round((agora - new Date(p.pausa_inicio).getTime()) / 60000) }))
      .filter(p => p.minutos >= LIMIAR_PAUSA_LONGA_MIN)
  }, [pausas, agora])

  function execucaoDaPausa(execucaoId: string) {
    return execucoes.find(e => e.id === execucaoId)
  }

  async function confirmarEncerramento() {
    if (!encerrarId || !usuario || !motivoEncerramento.trim()) return
    setSalvando(true)
    await supabase
      .from('armazem_execucoes')
      .update({
        status: 'cancelada',
        hora_fim: new Date().toISOString(),
        encerrada_manualmente_por: usuario.nome ?? usuario.login,
        encerrada_manualmente_motivo: motivoEncerramento.trim(),
      })
      .eq('id', encerrarId)
    setSalvando(false)
    setEncerrarId(null)
    setMotivoEncerramento('')
    carregar()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-700 flex items-center gap-2">
          <Gauge size={24} /> Dashboard Armazém
        </h1>
        <p className="text-sm text-gray-500 mt-1">Últimos 7 dias · {usuario?.filial}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Em andamento</p>
          <p className="text-3xl font-bold text-brand-700 mt-1">{ativas.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Concluídas</p>
          <p className="text-3xl font-bold text-brand-700 mt-1">{concluidas.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Com anomalia</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{comAnomalia.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pausas longas agora</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{pausasLongasAbertas.length}</p>
        </div>
      </div>

      {/* Pausas longas */}
      {pausasLongasAbertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <h2 className="font-semibold text-amber-800 flex items-center gap-2 mb-2"><AlertTriangle size={18} /> Pausas longas em aberto (≥ {LIMIAR_PAUSA_LONGA_MIN} min)</h2>
          <div className="space-y-1.5">
            {pausasLongasAbertas.map(({ pausa, minutos }) => {
              const exec = execucaoDaPausa(pausa.execucao_id)
              return (
                <p key={pausa.id} className="text-sm text-amber-900">
                  <span className="font-medium">{exec?.colaborador_nome ?? '—'}</span> · {exec?.atividade_nome ?? '—'} · pausado há <span className="font-semibold">{minutos} min</span>
                </p>
              )
            })}
          </div>
        </div>
      )}

      {/* Atividades em andamento / travadas */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Clock size={18} /> Atividades em andamento</h2>
        {ativas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma atividade em andamento.</p>
        ) : (
          <div className="grid gap-2">
            {ativas.map(e => (
              <div key={e.id} className="bg-white border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{e.colaborador_nome} <span className="text-gray-400">· {e.cargo}</span></p>
                  <p className="text-sm text-gray-500">{e.atividade_nome} · iniciada em {formatarData(e.hora_inicio)} · {e.status === 'pausada' ? 'pausada' : 'em andamento'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setEncerrarId(e.id); setMotivoEncerramento('') }}>
                  <Octagon size={14} /> Forçar encerramento
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tempo médio x meta */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Gauge size={18} /> Tempo médio por atividade vs. meta</h2>
        {tempoMedioPorAtividade.length === 0 ? (
          <p className="text-sm text-gray-400">Sem atividades concluídas no período.</p>
        ) : (
          <div className="grid gap-2">
            {tempoMedioPorAtividade.map(a => {
              const acimaDaMeta = a.meta != null && a.media > a.meta
              return (
                <div key={a.nome} className="bg-white border rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{a.nome}</p>
                    <p className="text-sm text-gray-500">{a.qtd} execução(ões)</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${acimaDaMeta ? 'text-red-600' : 'text-green-600'}`}>{a.media} min</p>
                    {a.meta != null && <p className="text-xs text-gray-400">meta: {a.meta} min</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ranking colaboradores */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Users size={18} /> Ranking de produtividade</h2>
        {rankingColaboradores.length === 0 ? (
          <p className="text-sm text-gray-400">Sem dados no período.</p>
        ) : (
          <div className="bg-white border rounded-xl divide-y">
            {rankingColaboradores.map(([nome, stats], i) => (
              <div key={nome} className="flex items-center justify-between px-4 py-3">
                <p className="font-medium text-gray-800">{i + 1}. {nome}</p>
                <p className="text-sm text-gray-500">{stats.qtd} atividades {stats.anomalias > 0 && <span className="text-red-600">· {stats.anomalias} anomalia(s)</span>}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de encerramento forçado */}
      {encerrarId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEncerrarId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-800">Forçar encerramento</h2>
              <button onClick={() => setEncerrarId(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Informe o motivo. Isso fica registrado para auditoria.</p>
            <textarea
              autoFocus
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500"
              placeholder="Ex: colaborador esqueceu o app aberto, atividade encerrada manualmente."
              value={motivoEncerramento}
              onChange={e => setMotivoEncerramento(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEncerrarId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmarEncerramento} disabled={!motivoEncerramento.trim() || salvando}>
                {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar encerramento'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
