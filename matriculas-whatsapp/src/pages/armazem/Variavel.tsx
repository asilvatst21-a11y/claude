import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, Upload, Loader2, RefreshCw, AlertTriangle, Users, Coins, Trophy, TrendingUp, Link2, ExternalLink, Settings,
  CalendarDays, BarChart3, ChevronDown, ChevronUp, ArrowDownUp, Medal, X, UserSearch,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useAuth } from '../../lib/auth'
import {
  buscarResumoDia, buscarHistoricoMes, buscarRankingColaboradores, buscarExtratoColaborador, importarPontuacao, formatarBRL,
  type ResumoVariavel, type HistoricoMes, type ColaboradorRanking, type ExtratoColaborador,
} from '../../lib/variavelArmazem'
import { formatarDataBR } from '../../lib/utils'

// A importação é sempre referente a D-1 (dia anterior); a data já vem
// pré-selecionada em ontem.
function ontemISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioMesDe(diaISO: string): string {
  return `${diaISO.slice(0, 7)}-01`
}

const CORES_CLUSTER = ['#f3ddc0', '#eecba0', '#e6b479', '#dc9b53', '#cf8231', '#b6661a']
const CHART_TOOLTIP = { borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,.08)' }

function brlCompacto(v: number): string {
  return v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${Math.round(v)}`
}

function ptsCompacto(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`
}

const CRITERIOS_RANK = [
  { key: 'pontuacaoMedia', label: 'Pontuação média' },
  { key: 'pontuacaoTotal', label: 'Pontuação total' },
  { key: 'valorTotal', label: 'Valor total' },
  { key: 'diasLancados', label: 'Dias lançados' },
] as const
type CriterioRank = typeof CRITERIOS_RANK[number]['key']

// Seção recolhível — mesmo padrão usado no histórico de valor e no de
// pontuação média, para o painel não ficar longo demais por padrão.
function Colapsavel({
  titulo, icon: Icon, aberto: abertoInicial = true, extra, children,
}: {
  titulo: string
  icon: React.ElementType
  aberto?: boolean
  extra?: ReactNode
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  return (
    <div className="border rounded-lg bg-white">
      <div className="px-4 py-3 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button onClick={() => setAberto((a) => !a)} className="flex items-center gap-2 text-sm font-semibold hover:text-accent-700 transition-colors">
          {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          <Icon className="h-4 w-4 text-accent-600" /> {titulo}
        </button>
        {extra}
      </div>
      {aberto && children}
    </div>
  )
}

export default function ArmazemVariavel() {
  const { usuario } = useAuth()
  const [data, setData] = useState(ontemISO)
  const [resumo, setResumo] = useState<ResumoVariavel | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Histórico mensal (dashboard). Começa no mês da data selecionada (D-1).
  const [mesHist, setMesHist] = useState(() => ontemISO().slice(0, 7))
  const [historico, setHistorico] = useState<HistoricoMes | null>(null)
  const [loadingHist, setLoadingHist] = useState(true)

  // Ranking de colaboradores num intervalo de datas específico. O usuário
  // escolhe por qual métrica ordenar (média, total, valor, dias) e a direção.
  const [rankIni, setRankIni] = useState(() => inicioMesDe(ontemISO()))
  const [rankFim, setRankFim] = useState(ontemISO)
  const [ranking, setRanking] = useState<ColaboradorRanking[] | null>(null)
  const [loadingRank, setLoadingRank] = useState(true)
  const [criterioRank, setCriterioRank] = useState<CriterioRank>('pontuacaoMedia')
  const [ordemRank, setOrdemRank] = useState<'desc' | 'asc'>('desc')

  // Extrato (estratificação) de um colaborador específico, no mesmo período
  // selecionado no ranking.
  const [extratoAlvo, setExtratoAlvo] = useState<{ chave: string; nome: string } | null>(null)
  const [extrato, setExtrato] = useState<ExtratoColaborador | null>(null)
  const [loadingExtrato, setLoadingExtrato] = useState(false)

  const linkTotem = `${window.location.origin}/variavel-armazem`

  const fetchResumo = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    try {
      setResumo(await buscarResumoDia(usuario.filial, data))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar o dashboard.')
    } finally {
      setLoading(false)
    }
  }, [usuario, data])

  useEffect(() => { fetchResumo() }, [fetchResumo])

  const fetchHistorico = useCallback(async () => {
    if (!usuario) return
    setLoadingHist(true)
    try {
      setHistorico(await buscarHistoricoMes(usuario.filial, mesHist))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar o histórico.')
    } finally {
      setLoadingHist(false)
    }
  }, [usuario, mesHist])

  useEffect(() => { fetchHistorico() }, [fetchHistorico])

  const fetchRanking = useCallback(async () => {
    if (!usuario) return
    setLoadingRank(true)
    try {
      setRanking(await buscarRankingColaboradores(usuario.filial, rankIni, rankFim))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar o ranking.')
    } finally {
      setLoadingRank(false)
    }
  }, [usuario, rankIni, rankFim])

  useEffect(() => { fetchRanking() }, [fetchRanking])

  useEffect(() => {
    if (!usuario || !extratoAlvo) { setExtrato(null); return }
    setLoadingExtrato(true)
    buscarExtratoColaborador(usuario.filial, rankIni, rankFim, extratoAlvo.chave)
      .then(setExtrato)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar o extrato.'))
      .finally(() => setLoadingExtrato(false))
  }, [usuario, extratoAlvo, rankIni, rankFim])

  async function handleImportar(file: File) {
    if (!usuario) return
    setUploading(true); setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const { linhas, semCadastro } = await importarPontuacao(usuario.filial, data, buffer)
      await fetchResumo()
      await fetchHistorico()
      await fetchRanking()
      alert(
        `Relatório importado: ${linhas} colaborador(es).` +
        (semCadastro > 0 ? `\n\n⚠️ ${semCadastro} sem cadastro (nome não bateu) — aparecem no painel, mas não conseguem consultar no totem até serem cadastrados.` : '')
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o relatório.')
    } finally {
      setUploading(false)
    }
  }

  const maxCluster = useMemo(() => Math.max(1, ...(resumo?.porCluster.map((c) => c.qtd) ?? [1])), [resumo])

  const kpis = resumo ? [
    { l: 'Total a pagar (dia)', v: formatarBRL(resumo.totalPagar), s: `mês: ${formatarBRL(resumo.acumuladoMes)}`, icon: Coins, money: true },
    { l: 'Colaboradores', v: String(resumo.colaboradores), s: 'com pontuação hoje', icon: Users, money: false },
    // Prioriza a média (é o número que representa o desempenho do dia); o
    // total agregado vira o dado secundário.
    { l: 'Pontuação média', v: resumo.colaboradores > 0 ? `${Math.round(resumo.pontuacaoTotal / resumo.colaboradores).toLocaleString('pt-BR')} pts` : '—', s: `total ${resumo.pontuacaoTotal.toLocaleString('pt-BR')} pts`, icon: TrendingUp, money: false },
    { l: 'Ticket médio', v: formatarBRL(resumo.ticketMedio), s: `maior ${formatarBRL(resumo.maior)} · menor ${formatarBRL(resumo.menor)}`, icon: Trophy, money: true },
  ] : []

  const rankingOrdenado = useMemo(() => {
    if (!ranking) return []
    const arr = [...ranking].sort((a, b) => a[criterioRank] - b[criterioRank])
    return ordemRank === 'desc' ? arr.reverse() : arr
  }, [ranking, criterioRank, ordemRank])

  const pontuacaoTotalMes = useMemo(
    () => historico?.dias.reduce((s, d) => s + d.pontuacaoTotal, 0) ?? 0,
    [historico]
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Armazém</p>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5 text-accent-600" /> Variável</h1>
          <p className="text-sm text-muted-foreground mt-1">Suba o relatório de pontuação do dia — o valor é calculado por cluster e o painel atualiza na hora.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/armazem/colaboradores" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors"><Settings className="h-4 w-4" /> Colaboradores</Link>
          <button onClick={fetchResumo} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

      <div className="bg-accent-50 border border-accent-200 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link2 className="h-4 w-4 text-accent-600 shrink-0" />
        <span className="text-sm text-accent-900">Link do totem (colaborador consulta pelo CPF):</span>
        <a href="/variavel-armazem" target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent-700 underline flex items-center gap-1">{linkTotem} <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="border rounded-lg bg-white p-4">
          <h3 className="text-sm font-semibold">Relatório de Remuneração Variável</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Colunas: Usuário · Créditos · Débitos · Total. Reimportar o mesmo dia atualiza os valores.</p>
          <div className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors" onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-7 w-7 mx-auto mb-1.5 animate-spin text-accent-500" /> : <Upload className="h-7 w-7 mx-auto mb-1.5 text-muted-foreground" />}
            <p className="text-sm font-medium">{uploading ? 'Processando...' : 'Clique para importar (.csv / .xlsx)'}</p>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportar(f); if (inputRef.current) inputRef.current.value = '' }} />
        </div>
        <div className="border rounded-lg bg-white p-4">
          <label className="text-sm font-medium block mb-1.5">Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.l} className="border rounded-lg bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><k.icon className="h-4 w-4" /> {k.l}</div>
            <div className={`text-xl sm:text-2xl font-bold tabular-nums ${k.money ? 'text-green-700' : ''}`}>{k.v}</div>
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{k.s}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
      ) : !resumo || resumo.linhas.length === 0 ? (
        <div className="border rounded-lg bg-white text-center py-12 text-muted-foreground text-sm">Nenhuma pontuação nesta data. Importe o relatório acima.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Distribuição por cluster */}
          <div className="border rounded-lg bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Distribuição por cluster</h3>
            <div className="space-y-2.5">
              {resumo.porCluster.map((c, i) => (
                <div key={i} className="grid grid-cols-[96px_1fr_24px] items-center gap-2 text-xs">
                  <div className="text-muted-foreground tabular-nums leading-tight">
                    {c.pontMin.toLocaleString('pt-BR')}–{c.pontMax.toLocaleString('pt-BR')}
                    <div className="text-[10px] text-gray-400">{formatarBRL(c.valorPor1000)} /1k</div>
                  </div>
                  <div className="h-5 rounded bg-gray-100 overflow-hidden">
                    <div className="h-full rounded flex items-center pl-2 text-[11px] font-bold text-white" style={{ width: `${Math.max(4, (c.qtd / maxCluster) * 100)}%`, background: CORES_CLUSTER[i] ?? '#b6661a' }}>{c.qtd > 0 ? c.qtd : ''}</div>
                  </div>
                  <div className="text-right font-bold tabular-nums">{c.qtd}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Ranking */}
          <div className="border rounded-lg bg-white">
            <div className="px-4 py-3 border-b"><h3 className="text-sm font-semibold">Ranking — {formatarDataBR(data)}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pontos</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">/1k</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resumo.linhas.map((l) => (
                    <tr key={l.nome} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <span className="font-medium">{l.nome}</span>
                        {!l.temCadastro && <span title="Sem cadastro — não aparece no totem" className="ml-1.5 text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">sem CPF</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.total.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.valorPor1000 != null ? formatarBRL(l.valorPor1000) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-green-700">{formatarBRL(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Histórico do mês — Valor */}
      <Colapsavel
        titulo="Histórico do mês — Valor pago"
        icon={BarChart3}
        extra={
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input type="month" value={mesHist} onChange={(e) => setMesHist(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </label>
        }
      >
        {loadingHist ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : !historico || historico.dias.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum lançamento neste mês.</div>
        ) : (
          <div className="p-4 space-y-5">
            {/* KPIs do mês */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Total no mês</div>
                <div className="text-lg font-bold tabular-nums text-green-700">{formatarBRL(historico.totalMes)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Média por dia</div>
                <div className="text-lg font-bold tabular-nums">{formatarBRL(historico.mediaDiaria)}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Dias com lançamento</div>
                <div className="text-lg font-bold tabular-nums">{historico.diasComLancamento}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Maior dia</div>
                <div className="text-lg font-bold tabular-nums text-green-700">{formatarBRL(historico.maiorDia?.totalPago ?? 0)}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{historico.maiorDia?.rotulo ?? '—'}</div>
              </div>
            </div>

            {/* Gráfico dia a dia */}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={historico.dias} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradVar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#15803d" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={56} tickFormatter={brlCompacto} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => [formatarBRL(Number(v)), 'Total pago']}
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Bar dataKey="totalPago" name="Total pago" fill="url(#gradVar)" radius={[6, 6, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabela dia a dia */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dia</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Colaboradores</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pontuação</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ticket médio</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historico.dias.map((d) => (
                    <tr key={d.data} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setData(d.data)} title="Clique para ver o dia no ranking acima">
                      <td className="px-3 py-2 font-medium">{formatarDataBR(d.data)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.colaboradores}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.pontuacaoTotal.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatarBRL(d.ticketMedio)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-green-700">{formatarBRL(d.totalPago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Colapsavel>

      {/* Histórico do mês — Pontuação média */}
      <Colapsavel
        titulo="Histórico do mês — Pontuação média"
        icon={TrendingUp}
        extra={
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input type="month" value={mesHist} onChange={(e) => setMesHist(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </label>
        }
      >
        {loadingHist ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : !historico || historico.dias.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum lançamento neste mês.</div>
        ) : (
          <div className="p-4 space-y-5">
            {/* KPIs do mês */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Pontuação média do mês</div>
                <div className="text-lg font-bold tabular-nums">{Math.round(historico.mediaPontuacaoMes).toLocaleString('pt-BR')} pts</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Pontuação total do mês</div>
                <div className="text-lg font-bold tabular-nums text-muted-foreground">{pontuacaoTotalMes.toLocaleString('pt-BR')} pts</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Dias com lançamento</div>
                <div className="text-lg font-bold tabular-nums">{historico.diasComLancamento}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">Maior média diária</div>
                <div className="text-lg font-bold tabular-nums">{Math.round(historico.maiorDiaPontuacao?.pontuacaoMedia ?? 0).toLocaleString('pt-BR')} pts</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{historico.maiorDiaPontuacao?.rotulo ?? '—'}</div>
              </div>
            </div>

            {/* Gráfico dia a dia */}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={historico.dias} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e6b479" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#b6661a" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={ptsCompacto} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => [`${Math.round(Number(v)).toLocaleString('pt-BR')} pts`, 'Pontuação média']}
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Bar dataKey="pontuacaoMedia" name="Pontuação média" fill="url(#gradPts)" radius={[6, 6, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabela dia a dia */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dia</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Colaboradores</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pontuação média</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pontuação total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historico.dias.map((d) => (
                    <tr key={d.data} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setData(d.data)} title="Clique para ver o dia no ranking acima">
                      <td className="px-3 py-2 font-medium">{formatarDataBR(d.data)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.colaboradores}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{Math.round(d.pontuacaoMedia).toLocaleString('pt-BR')} pts</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.pontuacaoTotal.toLocaleString('pt-BR')} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Colapsavel>

      {/* Ranking de colaboradores por intervalo de datas */}
      <Colapsavel
        titulo="Ranking de Colaboradores"
        icon={Medal}
        extra={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={rankIni} onChange={(e) => setRankIni(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" value={rankFim} onChange={(e) => setRankFim(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Ordenar por</span>
              <select value={criterioRank} onChange={(e) => setCriterioRank(e.target.value as CriterioRank)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                {CRITERIOS_RANK.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <button
              onClick={() => setOrdemRank((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm hover:bg-accent transition-colors"
            >
              <ArrowDownUp className="h-3.5 w-3.5" /> {ordemRank === 'desc' ? 'Maiores primeiro' : 'Menores primeiro'}
            </button>
          </div>
        }
      >
        {loadingRank ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : rankingOrdenado.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma pontuação no período selecionado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                  <th className={`text-right px-3 py-2 font-medium ${criterioRank === 'diasLancados' ? 'text-accent-700' : 'text-muted-foreground'}`}>Dias lançados</th>
                  <th className={`text-right px-3 py-2 font-medium ${criterioRank === 'pontuacaoMedia' ? 'text-accent-700' : 'text-muted-foreground'}`}>Pontuação média</th>
                  <th className={`text-right px-3 py-2 font-medium ${criterioRank === 'pontuacaoTotal' ? 'text-accent-700' : 'text-muted-foreground'}`}>Pontuação total</th>
                  <th className={`text-right px-3 py-2 font-medium ${criterioRank === 'valorTotal' ? 'text-accent-700' : 'text-muted-foreground'}`}>Valor total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rankingOrdenado.map((c, i) => (
                  <tr key={c.chave} className={`hover:bg-muted/30 transition-colors ${i === 0 && ordemRank === 'desc' ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setExtratoAlvo({ chave: c.chave, nome: c.nome })} className="font-medium text-left hover:text-accent-700 hover:underline flex items-center gap-1.5">
                        <UserSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {c.nome}
                      </button>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${criterioRank === 'diasLancados' ? 'font-bold' : 'text-muted-foreground'}`}>{c.diasLancados}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${criterioRank === 'pontuacaoMedia' ? 'font-bold' : ''}`}>{Math.round(c.pontuacaoMedia).toLocaleString('pt-BR')} pts</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${criterioRank === 'pontuacaoTotal' ? 'font-bold' : 'text-muted-foreground'}`}>{c.pontuacaoTotal.toLocaleString('pt-BR')} pts</td>
                    <td className={`px-3 py-2 text-right tabular-nums text-green-700 ${criterioRank === 'valorTotal' ? 'font-bold' : ''}`}>{formatarBRL(c.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Colapsavel>

      {/* Modal de extrato do colaborador */}
      {extratoAlvo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setExtratoAlvo(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-base font-bold">{extratoAlvo.nome}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Extrato de {formatarDataBR(rankIni)} até {formatarDataBR(rankFim)}</p>
              </div>
              <button onClick={() => setExtratoAlvo(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
            </div>

            {loadingExtrato ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
            ) : !extrato || extrato.dias.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">Nenhum lançamento no período.</div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground mb-0.5">Pontuação média</div>
                    <div className="text-lg font-bold tabular-nums">{Math.round(extrato.pontuacaoMedia).toLocaleString('pt-BR')} pts</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground mb-0.5">Dias lançados</div>
                    <div className="text-lg font-bold tabular-nums">{extrato.diasLancados}</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-[11px] text-muted-foreground mb-0.5">Valor total</div>
                    <div className="text-lg font-bold tabular-nums text-green-700">{formatarBRL(extrato.valorTotal)}</div>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dia</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pontos</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">/1k</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {extrato.dias.map((d) => (
                        <tr key={d.data}>
                          <td className="px-3 py-2 font-medium">{formatarDataBR(d.data)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.pontuacaoTotal.toLocaleString('pt-BR')}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.valorPor1000 != null ? formatarBRL(d.valorPor1000) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-green-700">{formatarBRL(d.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
