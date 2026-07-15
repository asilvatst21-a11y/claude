import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  AlertTriangle, ArrowLeft, BarChart2, Building2, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Loader2, Settings, Target, TrendingUp, Truck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  META_DU, farolDu, calcularDuPorDia, calcularDuAcumulado, calcularDuMeses, vucStatusNoDia,
  rankingMotivosVucMes, rankingVucAusenciaMes, calcularProjecaoDu, placasAtivasFiltro,
  type DuDia,
} from '../lib/frota'
import type { FrotaDisponibilidade, FrotaPlaca, FrotaIVTratativa } from '../types'

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function farolClasses(farol: 'verde' | 'amarelo' | 'vermelho') {
  return farol === 'verde'
    ? { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', bar: 'bg-green-500' }
    : farol === 'amarelo'
      ? { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500' }
      : { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', bar: 'bg-red-500' }
}

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof Truck; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="border rounded-xl bg-white p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

export default function FrotaIV() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'visao-geral' | 'tratativa'>('visao-geral')
  const [registros, setRegistros] = useState<FrotaDisponibilidade[]>([])
  const [placas, setPlacas] = useState<FrotaPlaca[]>([])
  const [tratativas, setTratativas] = useState<FrotaIVTratativa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [projecaoAberta, setProjecaoAberta] = useState(true)
  const [motivosAberto, setMotivosAberto] = useState(true)
  const hoje = new Date()
  const [mesSel, setMesSel] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })
  const [diaTratativa, setDiaTratativa] = useState<string>('')

  const carregarDados = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    const [{ data }, { data: dataPlacas }, { data: dataTratativas }] = await Promise.all([
      supabase.from('frota_disponibilidade').select('*').eq('filial', usuario.filial).order('data', { ascending: true }),
      supabase.from('frota_placas').select('*').eq('filial', usuario.filial),
      supabase.from('frota_iv_tratativas').select('*').eq('filial', usuario.filial),
    ])
    setRegistros((data ?? []) as FrotaDisponibilidade[])
    setPlacas((dataPlacas ?? []) as FrotaPlaca[])
    setTratativas((dataTratativas ?? []) as FrotaIVTratativa[])
    setCarregando(false)
  }, [usuario])

  useEffect(() => { carregarDados() }, [carregarDados])

  const registrosAtivos = useMemo(() => placasAtivasFiltro(registros, placas), [registros, placas])
  const duPorDia = useMemo(() => calcularDuPorDia(registrosAtivos, placas), [registrosAtivos, placas])
  const ultimoDia: DuDia | null = duPorDia[duPorDia.length - 1] ?? null
  const acumuladoMesAtual = useMemo(() => calcularDuAcumulado(duPorDia, mesSel.ano, mesSel.mes), [duPorDia, mesSel])
  const evolucaoMeses = useMemo(() => calcularDuMeses(duPorDia, 6), [duPorDia])
  const duDiarioMes = useMemo(() => {
    const prefixo = `${mesSel.ano}-${String(mesSel.mes).padStart(2, '0')}`
    return duPorDia.filter(d => d.data.startsWith(prefixo)).map(d => ({ data: formatarDataBR(d.data), percentual: d.percentual }))
  }, [duPorDia, mesSel])
  const rankingMotivos = useMemo(() => rankingMotivosVucMes(registrosAtivos, placas, mesSel.ano, mesSel.mes, tratativas), [registrosAtivos, placas, mesSel, tratativas])
  const rankingAusencia = useMemo(() => rankingVucAusenciaMes(registrosAtivos, placas, mesSel.ano, mesSel.mes), [registrosAtivos, placas, mesSel])

  const diaSel = diaTratativa || ultimoDia?.data || ''
  const statusVucsDia = useMemo(() => vucStatusNoDia(registrosAtivos, placas, diaSel, tratativas), [registrosAtivos, placas, diaSel, tratativas])
  const indisponiveisDia = statusVucsDia.filter(v => !v.disponivel)
  const duDiaSel = useMemo(() => duPorDia.find(d => d.data === diaSel) ?? null, [duPorDia, diaSel])

  const projecao = useMemo(
    () => calcularProjecaoDu(ultimoDia, ultimoDia ? vucStatusNoDia(registrosAtivos, placas, ultimoDia.data, tratativas) : [], tratativas),
    [ultimoDia, registrosAtivos, placas, tratativas],
  )

  const previsoesVencidas = useMemo(() => {
    if (!ultimoDia) return []
    return indisponiveisDia.filter(v => v.tratativa?.previsao_retorno && v.tratativa.previsao_retorno < ultimoDia.data)
  }, [indisponiveisDia, ultimoDia])

  async function salvarTratativa(placa: string, data: string, campos: Partial<Pick<FrotaIVTratativa, 'motivo_tratativa' | 'previsao_retorno' | 'observacao'>>) {
    if (!usuario) return
    const existente = tratativas.find(t => t.placa === placa && t.data === data)
    const payload = {
      filial: usuario.filial,
      placa,
      data,
      motivo_tratativa: existente?.motivo_tratativa ?? null,
      previsao_retorno: existente?.previsao_retorno ?? null,
      observacao: existente?.observacao ?? null,
      ...campos,
      updated_at: new Date().toISOString(),
    }
    const { data: salvo, error } = await supabase
      .from('frota_iv_tratativas')
      .upsert(payload, { onConflict: 'filial,placa,data' })
      .select()
      .single()
    if (error || !salvo) return
    setTratativas(ts => {
      const i = ts.findIndex(t => t.placa === placa && t.data === data)
      if (i === -1) return [...ts, salvo as FrotaIVTratativa]
      const copia = [...ts]
      copia[i] = salvo as FrotaIVTratativa
      return copia
    })
  }

  const farolMes = farolDu(acumuladoMesAtual.mediaPercentual)
  const farolHoje = ultimoDia ? farolDu(ultimoDia.percentual) : null
  const corFarolMes = farolClasses(farolMes)

  const datasDisponiveis = useMemo(() => Array.from(new Set(duPorDia.map(d => d.data))).sort((a, b) => b.localeCompare(a)), [duPorDia])

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/frota" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            IV da Frota — DU
            <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Disponibilidade de VUC</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            {usuario && <><Building2 size={12} /> {usuario.filial} ·</>} % de atingimento da meta de disponibilidade de VUCs (meta: {META_DU}% dos VUCs disponíveis = 100%)
          </p>
        </div>
        <Link to="/frota/placas" className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
          <Settings size={14} /> Cadastro de placas
        </Link>
      </div>

      <div className="flex gap-4 mb-4 border-b border-gray-200">
        <button onClick={() => setAba('visao-geral')} className={`text-sm font-medium px-3 py-2 border-b-2 flex items-center gap-1 ${aba === 'visao-geral' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <BarChart2 size={14} /> Visão Geral
        </button>
        <button onClick={() => setAba('tratativa')} className={`text-sm font-medium px-3 py-2 border-b-2 flex items-center gap-1 ${aba === 'tratativa' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <CalendarClock size={14} /> Tratativa do Dia
        </button>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
        </div>
      ) : duPorDia.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Truck size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum VUC ativo com dado de disponibilidade ainda. Cadastre placas como "VUC" em /frota/placas e importe o relatório diário em /frota.</p>
        </div>
      ) : aba === 'visao-geral' ? (
        <div className="space-y-5">
          {/* Navegação de mês */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMesSel(m => { const d = new Date(m.ano, m.mes - 2, 1); return { ano: d.getFullYear(), mes: d.getMonth() + 1 } })}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800 capitalize min-w-[110px] text-center">
              {new Date(mesSel.ano, mesSel.mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setMesSel(m => { const d = new Date(m.ano, m.mes, 1); return { ano: d.getFullYear(), mes: d.getMonth() + 1 } })}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <Card
              icon={Truck}
              label="DU hoje"
              value={ultimoDia ? `${ultimoDia.percentual}%` : '—'}
              hint={ultimoDia ? `${ultimoDia.disponiveis}/${ultimoDia.totalVuc} VUCs · ${formatarDataBR(ultimoDia.data)}` : undefined}
              accent={farolHoje === 'verde' ? 'text-green-700 bg-green-50' : farolHoje === 'amarelo' ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'}
            />
            <Card
              icon={Target}
              label="DU acumulado no mês"
              value={`${acumuladoMesAtual.mediaPercentual}%`}
              hint={`${acumuladoMesAtual.diasComDado} dia(s) com dado`}
              accent={farolMes === 'verde' ? 'text-green-700 bg-green-50' : farolMes === 'amarelo' ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'}
            />
            <Card icon={AlertTriangle} label="VUCs indisponíveis hoje" value={ultimoDia ? String(ultimoDia.totalVuc - ultimoDia.disponiveis) : '—'} accent="text-red-700 bg-red-50" />
            <Card icon={CheckCircle2} label="Meta" value="100%" hint={acumuladoMesAtual.mediaPercentual >= 100 ? 'Meta atingida' : `Faltam ${100 - acumuladoMesAtual.mediaPercentual} p.p. de atingimento`} accent="text-accent-600 bg-accent/40" />
          </div>

          {/* Progresso vs meta */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Acumulado do mês vs meta (100%)</h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${corFarolMes.bg} ${corFarolMes.text} ${corFarolMes.border}`}>
                {acumuladoMesAtual.mediaPercentual}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden relative">
              <div className={`h-full ${corFarolMes.bar} transition-all`} style={{ width: `${Math.min(acumuladoMesAtual.mediaPercentual, 100)}%` }} />
              <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-500" style={{ left: '100%' }} title="Meta 100%" />
            </div>
          </div>

          {/* % DU dia a dia */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">% DU dia a dia</h3>
            {duDiarioMes.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nenhum dado de DU neste mês.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={duDiarioMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, (dataMax: number) => Math.max(100, dataMax)]} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Meta 100%', fontSize: 10, fill: '#64748b', position: 'insideTopLeft' }} />
                  <Line type="monotone" dataKey="percentual" name="% DU" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Evolução mês x mês */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolução mês x mês</h3>
            {evolucaoMeses.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Sem dados suficientes ainda.</p>
            ) : (
              <div className="flex items-end gap-3 h-44">
                {evolucaoMeses.map(m => {
                  const farol = farolDu(m.acumulado.mediaPercentual)
                  const cor = farol === 'verde' ? 'bg-green-500' : farol === 'amarelo' ? 'bg-amber-500' : 'bg-red-500'
                  return (
                    <div key={`${m.ano}-${m.mes}`} className="flex-1 flex flex-col items-center justify-end h-full">
                      <span className="text-xs font-bold text-gray-700 mb-1">{m.acumulado.mediaPercentual}%</span>
                      <div className="w-full rounded-t-md relative" style={{ height: `${Math.min(Math.max(m.acumulado.mediaPercentual, 2), 100)}%` }}>
                        <div className={`absolute inset-0 rounded-t-md ${cor}`} />
                      </div>
                      <span className="text-xs text-gray-500 mt-1.5">{MESES_PT[m.mes - 1]}/{String(m.ano).slice(2)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {previsoesVencidas.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> Previsão de retorno vencida</h3>
              <div className="space-y-1">
                {previsoesVencidas.map(v => (
                  <p key={v.placa} className="text-xs text-red-700">
                    <span className="font-bold">{v.placa}</span> — previsto para {formatarDataBR(v.tratativa!.previsao_retorno!)}, ainda indisponível ({v.motivo ?? '—'})
                  </p>
                ))}
              </div>
            </div>
          )}

          {projecao.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <button onClick={() => setProjecaoAberta(v => !v)} className="w-full flex items-center gap-1.5 text-left mb-3">
                {projecaoAberta ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><TrendingUp size={14} /> Projeção de DU (conforme previsões de retorno registradas)</h3>
              </button>
              {projecaoAberta && <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="text-left py-2 font-medium">Data</th>
                    <th className="text-center py-2 font-medium">VUCs retornando</th>
                    <th className="text-center py-2 font-medium">Disponíveis projetado</th>
                    <th className="text-right py-2 font-medium">% DU projetado</th>
                  </tr>
                </thead>
                <tbody>
                  {projecao.map(p => {
                    const farol = farolDu(p.percentualProjetado)
                    const cor = farol === 'verde' ? 'text-green-700' : farol === 'amarelo' ? 'text-amber-600' : 'text-red-600'
                    return (
                      <tr key={p.data} className="border-b border-gray-50">
                        <td className="py-2 text-gray-900 font-medium">{formatarDataBR(p.data)}</td>
                        <td className="py-2 text-center text-gray-600">+{p.retornamPrevistos}</td>
                        <td className="py-2 text-center text-gray-600">{p.disponiveisProjetado}/{p.totalVuc}</td>
                        <td className={`py-2 text-right font-bold ${cor}`}>{p.percentualProjetado}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <button onClick={() => setMotivosAberto(v => !v)} className="w-full flex items-center gap-1.5 text-left mb-3">
                {motivosAberto ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                <h3 className="text-sm font-semibold text-gray-700">Principais motivos de indisponibilidade (mês)</h3>
              </button>
              {motivosAberto && (rankingMotivos.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhum VUC indisponível no mês.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-left py-2 font-medium">Motivo</th>
                      <th className="text-right py-2 font-medium">Ocorrências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingMotivos.map(m => (
                      <tr key={m.motivo} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700">{m.motivo}</td>
                        <td className="py-2 text-right font-medium text-gray-900">{m.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">VUCs com mais indisponibilidade (mês)</h3>
              {rankingAusencia.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhuma indisponibilidade registrada no mês.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto -mx-1">
                  <div className="space-y-1.5 px-1">
                    {rankingAusencia.slice(0, 20).map(r => {
                      const sev = r.percentualIndisponibilidade >= 50 ? 'red' : r.percentualIndisponibilidade >= 25 ? 'amber' : 'gray'
                      const sevClasses = sev === 'red' ? 'bg-red-50 text-red-700 border-red-200' : sev === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                      return (
                        <div key={r.placa} className="flex items-center gap-3 px-2.5 py-2 rounded-lg border border-gray-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">{r.placa}</p>
                            <p className="text-xs text-gray-500">{r.diasIndisponivel} dia(s) indisponível</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full border shrink-0 ${sevClasses}`}>{r.percentualIndisponibilidade}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Dia:</label>
            <select
              value={diaSel}
              onChange={e => setDiaTratativa(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {datasDisponiveis.map(d => <option key={d} value={d}>{formatarDataBR(d)}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-2">
              {indisponiveisDia.length} VUC(s) indisponível(is) de {statusVucsDia.length}
            </span>
            {duDiaSel && (() => {
              const farol = farolDu(duDiaSel.percentual)
              const cor = farolClasses(farol)
              return (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ml-auto ${cor.bg} ${cor.text} ${cor.border}`}>
                  Aderência do dia: {duDiaSel.percentual}% ({duDiaSel.disponiveis}/{duDiaSel.totalVuc})
                </span>
              )
            })()}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Placa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Motivo (relatório)</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-48">Motivo da tratativa</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Previsão de retorno</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-56">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {statusVucsDia.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">Nenhum VUC ativo cadastrado.</td></tr>
                )}
                {statusVucsDia.map(v => (
                  <tr key={v.placa} className={`hover:bg-muted/30 ${v.disponivel ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{v.placa}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${v.disponivel ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{v.motivo ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={v.tratativa?.motivo_tratativa ?? ''}
                        placeholder="—"
                        disabled={v.disponivel}
                        onBlur={e => {
                          const val = e.target.value.trim()
                          if (val !== (v.tratativa?.motivo_tratativa ?? '')) salvarTratativa(v.placa, diaSel, { motivo_tratativa: val || null })
                        }}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="date"
                        defaultValue={v.tratativa?.previsao_retorno ?? ''}
                        disabled={v.disponivel}
                        onChange={e => {
                          const val = e.target.value
                          if (val !== (v.tratativa?.previsao_retorno ?? '')) salvarTratativa(v.placa, diaSel, { previsao_retorno: val || null })
                        }}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={v.tratativa?.observacao ?? ''}
                        placeholder="—"
                        disabled={v.disponivel}
                        onBlur={e => {
                          const val = e.target.value.trim()
                          if (val !== (v.tratativa?.observacao ?? '')) salvarTratativa(v.placa, diaSel, { observacao: val || null })
                        }}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
