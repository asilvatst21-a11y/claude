import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, Upload, Loader2, RefreshCw, AlertTriangle, Users, Coins, Trophy, TrendingUp, Link2, ExternalLink, Settings,
  CalendarDays, BarChart3, ChevronDown, ChevronUp, ArrowDownUp, Medal, X, UserSearch, Download, Copy, ArrowUpCircle,
  ArrowDownCircle, Sparkles, ShieldAlert,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useAuth } from '../../lib/auth'
import {
  buscarResumoDia, buscarHistoricoMes, buscarRankingColaboradores, buscarExtratoColaborador,
  buscarComparativoDesempenho, buscarMigracaoClusters, mesAnteriorDe, importarPontuacao, formatarBRL,
  vincularCpfsPendentes, listarColaboradoresComHistorico, buscarHistoricoMensal, buscarTabelaoMensal,
  type ResumoVariavel, type HistoricoMes, type ColaboradorRanking, type ExtratoColaborador,
  type ComparativoColaborador, type MigracaoColaborador, type ColaboradorComHistorico, type HistoricoMensalColaborador,
  type MesHistorico, type TabelaoMensal,
} from '../../lib/variavelArmazem'
import { formatarDataBR } from '../../lib/utils'
import { buscarTrocasPlacaArmazem, type TrocaPlaca } from '../../lib/trocaPlacaManutenco'
import VariavelTurnoAdmin from './VariavelTurnoAdmin'

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
  { key: 'faltas', label: 'Faltas (sem lançar)' },
] as const
type CriterioRank = typeof CRITERIOS_RANK[number]['key']

function variacaoBadge(pct: number | null): { texto: string; cor: string } {
  if (pct == null) return { texto: '—', cor: 'text-muted-foreground' }
  const sinal = pct > 0 ? '+' : ''
  const cor = pct > 0.5 ? 'text-green-700' : pct < -0.5 ? 'text-red-600' : 'text-muted-foreground'
  return { texto: `${sinal}${pct.toFixed(0)}%`, cor }
}

function baixarCSV(nomeArquivo: string, linhas: (string | number)[][]) {
  const csv = linhas.map((l) => l.map((c) => String(c).replace(/;/g, ',')).join(';')).join('\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}

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

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
function rotuloMes(mesISO: string): string {
  const [ano, mes] = mesISO.split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`
}

type Metrica = 'pontos' | 'valor'
type Agregacao = 'media' | 'total'

function valorDoMes(m: Pick<MesHistorico, 'valorTotal' | 'pontuacaoTotal' | 'pontuacaoMedia' | 'diasLancados'>, metrica: Metrica, agregacao: Agregacao): number {
  if (metrica === 'pontos') return agregacao === 'total' ? m.pontuacaoTotal : m.pontuacaoMedia
  if (agregacao === 'total') return m.valorTotal
  return m.diasLancados > 0 ? m.valorTotal / m.diasLancados : 0
}

function fmtMetrica(v: number, metrica: Metrica): string {
  return metrica === 'valor' ? formatarBRL(v) : Math.round(v).toLocaleString('pt-BR')
}

function fmtMetricaCompacta(v: number, metrica: Metrica): string {
  return metrica === 'valor' ? brlCompacto(v) : ptsCompacto(v)
}

function SeletorMetrica({ metrica, onMetrica, agregacao, onAgregacao }: {
  metrica: Metrica; onMetrica: (v: Metrica) => void; agregacao: Agregacao; onAgregacao: (v: Agregacao) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
        <button onClick={() => onMetrica('pontos')} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${metrica === 'pontos' ? 'bg-white shadow-sm text-accent-700' : 'text-muted-foreground'}`}>Pontuação</button>
        <button onClick={() => onMetrica('valor')} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${metrica === 'valor' ? 'bg-white shadow-sm text-accent-700' : 'text-muted-foreground'}`}>Valor RV</button>
      </div>
      <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
        <button onClick={() => onAgregacao('media')} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${agregacao === 'media' ? 'bg-white shadow-sm text-accent-700' : 'text-muted-foreground'}`}>Média</button>
        <button onClick={() => onAgregacao('total')} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${agregacao === 'total' ? 'bg-white shadow-sm text-accent-700' : 'text-muted-foreground'}`}>Total</button>
      </div>
    </div>
  )
}

function HistoricoMensalTab({
  colaboradores, chave, onChave, dados, loading,
}: {
  colaboradores: ColaboradorComHistorico[]
  chave: string
  onChave: (v: string) => void
  dados: HistoricoMensalColaborador | null
  loading: boolean
}) {
  const [metrica, setMetrica] = useState<Metrica>('valor')
  const [agregacao, setAgregacao] = useState<Agregacao>('total')

  const meses = dados?.meses ?? []
  const valorMes = (m: MesHistorico) => valorDoMes(m, metrica, agregacao)
  const mesAtual = meses[meses.length - 1] ?? null
  const mesAnterior = meses[meses.length - 2] ?? null
  const pctVsAnterior = mesAtual && mesAnterior && valorMes(mesAnterior) > 0
    ? ((valorMes(mesAtual) - valorMes(mesAnterior)) / valorMes(mesAnterior)) * 100
    : null
  const badgeVsAnterior = variacaoBadge(pctVsAnterior)

  const ultimos6 = meses.slice(-6)
  const media6 = ultimos6.length > 0 ? ultimos6.reduce((s, m) => s + valorMes(m), 0) / ultimos6.length : 0
  const melhorMes = meses.reduce<typeof meses[number] | null>((melhor, m) => (!melhor || valorMes(m) > valorMes(melhor) ? m : melhor), null)

  const mediaSemUltimo = meses.length > 1
    ? meses.slice(0, -1).reduce((s, m) => s + valorMes(m), 0) / (meses.length - 1)
    : null
  const tendencia = mediaSemUltimo == null || !mesAtual ? null
    : valorMes(mesAtual) > mediaSemUltimo * 1.05 ? 'up'
    : valorMes(mesAtual) < mediaSemUltimo * 0.95 ? 'down'
    : 'flat'

  const maxValor = Math.max(1, ...meses.map(valorMes))

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1">Colaborador</label>
          <select
            value={chave}
            onChange={(e) => onChave(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm min-w-[260px] focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            {colaboradores.length === 0 && <option value="">Nenhum colaborador com histórico</option>}
            {colaboradores.map((c) => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
          </select>
        </div>
        <div className="ml-auto">
          <SeletorMetrica metrica={metrica} onMetrica={setMetrica} agregacao={agregacao} onAgregacao={setAgregacao} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : meses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sem histórico pra esse colaborador ainda.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Mês atual{mesAtual ? ` (${rotuloMes(mesAtual.mes)})` : ''}</div>
              <div className="text-lg font-bold tabular-nums">{fmtMetrica(mesAtual ? valorMes(mesAtual) : 0, metrica)}</div>
              {pctVsAnterior != null && <div className={`text-xs font-semibold ${badgeVsAnterior.cor}`}>{badgeVsAnterior.texto} vs {mesAnterior ? rotuloMes(mesAnterior.mes) : ''}</div>}
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Média (até 6 meses)</div>
              <div className="text-lg font-bold tabular-nums">{fmtMetrica(media6, metrica)}</div>
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Melhor mês</div>
              <div className="text-lg font-bold tabular-nums text-green-700">{fmtMetrica(melhorMes ? valorMes(melhorMes) : 0, metrica)}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums">{melhorMes ? rotuloMes(melhorMes.mes) : '—'}</div>
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Tendência</div>
              <div className={`text-lg font-bold ${tendencia === 'up' ? 'text-green-700' : tendencia === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                {tendencia === 'up' ? 'Evoluindo' : tendencia === 'down' ? 'Caindo' : tendencia === 'flat' ? 'Estável' : '—'}
              </div>
            </div>
          </div>

          <div className="border rounded-lg bg-white p-4">
            <div className="flex items-end gap-3" style={{ height: 180 }}>
              {meses.map((m) => (
                <div key={m.mes} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-[10px] font-semibold tabular-nums mb-1">{fmtMetricaCompacta(valorMes(m), metrica)}</div>
                  <div
                    className="w-full max-w-[46px] rounded-t-md bg-accent-500"
                    style={{ height: `${Math.max(4, (valorMes(m) / maxValor) * 130)}px` }}
                    title={`${rotuloMes(m.mes)} · ${fmtMetrica(valorMes(m), metrica)}`}
                  />
                  <div className="text-[11px] text-muted-foreground mt-2 font-medium">{rotuloMes(m.mes)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mês</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">{metrica === 'valor' ? 'Valor RV' : 'Pontuação'}</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Dias lançados</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...meses].reverse().map((m, i, arr) => {
                  const anterior = arr[i + 1]
                  const pct = anterior && valorMes(anterior) > 0 ? ((valorMes(m) - valorMes(anterior)) / valorMes(anterior)) * 100 : null
                  const badge = variacaoBadge(pct)
                  return (
                    <tr key={m.mes} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium">{rotuloMes(m.mes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMetrica(valorMes(m), metrica)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.diasLancados}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${badge.cor}`}>{badge.texto}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function TabelaoMensalTab({ dados, loading }: { dados: TabelaoMensal | null; loading: boolean }) {
  const [metrica, setMetrica] = useState<Metrica>('valor')
  const [agregacao, setAgregacao] = useState<Agregacao>('total')
  const [mesesVisiveis, setMesesVisiveis] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [diasMinimos, setDiasMinimos] = useState(5)
  // Substituições manuais por nome — força mostrar/esconder independente do
  // mínimo de dias (ex.: ajudante do turno C que só bate ponto ocasional
  // aqui, mas quer ver de propósito num mês específico; ou o contrário).
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [painelColabAberto, setPainelColabAberto] = useState(false)

  const todosMeses = dados?.meses ?? []

  useEffect(() => {
    if (todosMeses.length > 0) setMesesVisiveis(new Set(todosMeses))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados])

  function toggleMes(mes: string) {
    setMesesVisiveis((prev) => {
      const novo = new Set(prev)
      if (novo.has(mes)) novo.delete(mes); else novo.add(mes)
      return novo
    })
  }

  // Alterna o estado exibido (padrão do mínimo de dias, ou já substituído
  // manualmente antes) e grava como substituição manual.
  function toggleOverride(nome: string, padrao: boolean) {
    setOverrides((prev) => {
      const novo = new Map(prev)
      const atual = novo.has(nome) ? novo.get(nome)! : padrao
      novo.set(nome, !atual)
      return novo
    })
  }

  const mesesOrdenados = todosMeses.filter((m) => mesesVisiveis.has(m))

  const valorCelula = (porMes: TabelaoMensal['linhas'][number]['porMes'], mes: string): number | null => {
    const v = porMes[mes]
    if (!v) return null
    return valorDoMes(v, metrica, agregacao)
  }

  function diasNoPeriodo(l: TabelaoMensal['linhas'][number]): number {
    return mesesOrdenados.reduce((s, mes) => s + (l.porMes[mes]?.diasLancados ?? 0), 0)
  }

  function visivelPorPadrao(l: TabelaoMensal['linhas'][number]): boolean {
    return diasNoPeriodo(l) >= diasMinimos
  }

  function estaVisivel(l: TabelaoMensal['linhas'][number]): boolean {
    return overrides.has(l.nome) ? overrides.get(l.nome)! : visivelPorPadrao(l)
  }

  // Some da lista quem não tem nenhum lançamento em NENHUM dos meses
  // visíveis no momento — troca o filtro de mês e a lista se ajusta sozinha,
  // em vez de mostrar uma linha inteira de "—". Também some quem fica
  // abaixo do mínimo de dias (ajudante esporádico de outro turno), a menos
  // que tenha sido forçado a aparecer manualmente.
  const todasLinhas = dados?.linhas ?? []
  const linhas = todasLinhas
    .filter((l) => l.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter((l) => mesesOrdenados.some((mes) => l.porMes[mes] != null))
    .filter((l) => estaVisivel(l))

  const mediaFrotaPorMes = mesesOrdenados.map((mes) => {
    const valores = linhas.map((l) => valorCelula(l.porMes, mes)).filter((v): v is number => v != null)
    return valores.length > 0 ? valores.reduce((s, v) => s + v, 0) / valores.length : null
  })

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center flex-wrap gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase mr-1">Meses visíveis</label>
          {todosMeses.map((mes) => (
            <button
              key={mes}
              onClick={() => toggleMes(mes)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${mesesVisiveis.has(mes) ? 'bg-accent-500 border-accent-500 text-white' : 'bg-white border text-muted-foreground'}`}
            >
              {rotuloMes(mes)}
            </button>
          ))}
        </div>
        <div className="flex items-center flex-wrap gap-3">
          <SeletorMetrica metrica={metrica} onMetrica={setMetrica} agregacao={agregacao} onAgregacao={setAgregacao} />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Dias mín. no período</label>
            <input
              type="number" min={0} value={diasMinimos}
              onChange={(e) => setDiasMinimos(Math.max(0, Number(e.target.value)))}
              className="border rounded-md px-2 py-1.5 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔍 Buscar ajudante..."
            className="border rounded-md px-3 py-2 text-sm min-w-[220px] focus:outline-none focus:ring-2 focus:ring-accent-500 ml-auto"
          />
        </div>
        <div className="border-t pt-2">
          <button onClick={() => setPainelColabAberto((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            {painelColabAberto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Colaboradores ({linhas.length} de {todasLinhas.length} visíveis)
            {overrides.size > 0 && <span className="text-accent-700">· {overrides.size} substituição(ões) manual(is)</span>}
          </button>
          {painelColabAberto && (
            <div className="mt-2 max-h-64 overflow-y-auto border rounded-md divide-y">
              {[...todasLinhas].sort((a, b) => a.nome.localeCompare(b.nome)).map((l) => {
                const padrao = visivelPorPadrao(l)
                const visivel = estaVisivel(l)
                const substituido = overrides.has(l.nome)
                return (
                  <label key={l.nome} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 cursor-pointer">
                    <input type="checkbox" checked={visivel} onChange={() => toggleOverride(l.nome, padrao)} className="accent-accent-500" />
                    <span className="flex-1">{l.nome}</span>
                    <span className="text-xs text-muted-foreground">{diasNoPeriodo(l)}d</span>
                    {substituido && <span className="text-[10px] font-semibold text-accent-700 uppercase">manual</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : linhas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum colaborador encontrado.</div>
      ) : mesesOrdenados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Selecione ao menos um mês pra ver a tabela.</div>
      ) : (
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="sticky left-0 bg-muted/50 text-left px-3 py-2 font-medium text-muted-foreground min-w-[220px]">Ajudante</th>
                  {mesesOrdenados.map((mes) => (
                    <th key={mes} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{rotuloMes(mes)}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tendência</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l) => {
                  const primeiro = valorCelula(l.porMes, mesesOrdenados[0])
                  const ultimo = valorCelula(l.porMes, mesesOrdenados[mesesOrdenados.length - 1])
                  const pct = primeiro != null && primeiro > 0 && ultimo != null ? ((ultimo - primeiro) / primeiro) * 100 : null
                  const badge = variacaoBadge(pct)
                  return (
                    <tr key={l.nome} className="hover:bg-muted/30 transition-colors">
                      <td className="sticky left-0 bg-white px-3 py-2 font-semibold border-r">{l.nome}</td>
                      {mesesOrdenados.map((mes) => {
                        const v = valorCelula(l.porMes, mes)
                        return (
                          <td key={mes} className="px-3 py-2 text-right tabular-nums font-semibold">
                            {v == null ? <span className="text-gray-300">—</span> : fmtMetrica(v, metrica)}
                          </td>
                        )
                      })}
                      <td className={`px-3 py-2 text-right font-semibold ${badge.cor}`}>{badge.texto}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="sticky left-0 bg-muted/50 px-3 py-2 font-bold border-r">Média da frota</td>
                  {mediaFrotaPorMes.map((v, i) => (
                    <td key={mesesOrdenados[i]} className="px-3 py-2 text-right font-bold tabular-nums bg-muted/50">{v == null ? '—' : fmtMetrica(v, metrica)}</td>
                  ))}
                  <td className="bg-muted/50" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-t">"—" indica mês sem lançamento pra esse ajudante. Tendência compara o último mês visível com o primeiro.</div>
        </div>
      )}
    </div>
  )
}

export default function ArmazemVariavel() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'pontuacao' | 'turno' | 'historico' | 'tabelao' | 'trocas'>('pontuacao')
  const [data, setData] = useState(ontemISO)
  const [resumo, setResumo] = useState<ResumoVariavel | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [rvDobrada, setRvDobrada] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Histórico mensal (dashboard). Começa no mês da data selecionada (D-1).
  const [mesHist, setMesHist] = useState(() => ontemISO().slice(0, 7))
  const [historico, setHistorico] = useState<HistoricoMes | null>(null)
  const [historicoAnterior, setHistoricoAnterior] = useState<HistoricoMes | null>(null)
  const [loadingHist, setLoadingHist] = useState(true)

  // Histórico Mensal (aba própria): evolução mês a mês de UM colaborador,
  // juntando o que já foi importado dia a dia com o histórico de planilhas
  // antigas (inserido direto na mesma tabela, sem tela de import própria).
  const [colaboradoresHistorico, setColaboradoresHistorico] = useState<ColaboradorComHistorico[]>([])
  const [chaveHistorico, setChaveHistorico] = useState('')
  const [evolucaoMensal, setEvolucaoMensal] = useState<HistoricoMensalColaborador | null>(null)
  const [loadingEvolucao, setLoadingEvolucao] = useState(false)

  // Tabelão Mensal (aba própria): todos os ajudantes lado a lado, mês a mês.
  const [tabelaoMensal, setTabelaoMensal] = useState<TabelaoMensal | null>(null)
  const [loadingTabelao, setLoadingTabelao] = useState(false)

  // Trocas de Placa por Manutenção (IV armazém)
  const [trocasPlaca, setTrocasPlaca] = useState<TrocaPlaca[]>([])
  const [loadingTrocas, setLoadingTrocas] = useState(false)

  // Ranking de colaboradores num intervalo de datas específico. O usuário
  // escolhe por qual métrica ordenar (média, total, valor, dias, faltas) e a direção.
  const [rankIni, setRankIni] = useState(() => inicioMesDe(ontemISO()))
  const [rankFim, setRankFim] = useState(ontemISO)
  const [ranking, setRanking] = useState<ColaboradorRanking[] | null>(null)
  const [diasPeriodoRank, setDiasPeriodoRank] = useState(0)
  const [loadingRank, setLoadingRank] = useState(true)
  const [criterioRank, setCriterioRank] = useState<CriterioRank>('pontuacaoMedia')
  const [ordemRank, setOrdemRank] = useState<'desc' | 'asc'>('desc')

  // Extrato (estratificação) de um colaborador específico, no mesmo período
  // selecionado no ranking.
  const [extratoAlvo, setExtratoAlvo] = useState<{ chave: string; nome: string } | null>(null)
  const [extrato, setExtrato] = useState<ExtratoColaborador | null>(null)
  const [loadingExtrato, setLoadingExtrato] = useState(false)

  // Queda/alta de desempenho vs. período anterior equivalente (mesma janela
  // do ranking, comparada com a janela imediatamente anterior).
  const [comparativo, setComparativo] = useState<ComparativoColaborador[] | null>(null)
  const [loadingComparativo, setLoadingComparativo] = useState(true)

  // Migração de cluster mês a mês (usa o mesmo seletor de mês do histórico).
  const [migracao, setMigracao] = useState<MigracaoColaborador[] | null>(null)
  const [loadingMigracao, setLoadingMigracao] = useState(true)

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
      const [atual, anterior] = await Promise.all([
        buscarHistoricoMes(usuario.filial, mesHist),
        buscarHistoricoMes(usuario.filial, mesAnteriorDe(mesHist)),
      ])
      setHistorico(atual)
      setHistoricoAnterior(anterior)
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
      const { colaboradores, diasComLancamentoPeriodo } = await buscarRankingColaboradores(usuario.filial, rankIni, rankFim)
      setRanking(colaboradores)
      setDiasPeriodoRank(diasComLancamentoPeriodo)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar o ranking.')
    } finally {
      setLoadingRank(false)
    }
  }, [usuario, rankIni, rankFim])

  const fetchComparativo = useCallback(async () => {
    if (!usuario) return
    setLoadingComparativo(true)
    try {
      setComparativo(await buscarComparativoDesempenho(usuario.filial, rankIni, rankFim))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar o comparativo de desempenho.')
    } finally {
      setLoadingComparativo(false)
    }
  }, [usuario, rankIni, rankFim])

  useEffect(() => { fetchComparativo() }, [fetchComparativo])

  const fetchMigracao = useCallback(async () => {
    if (!usuario) return
    setLoadingMigracao(true)
    try {
      setMigracao(await buscarMigracaoClusters(usuario.filial, mesHist))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar a migração de cluster.')
    } finally {
      setLoadingMigracao(false)
    }
  }, [usuario, mesHist])

  useEffect(() => { fetchMigracao() }, [fetchMigracao])

  useEffect(() => { fetchRanking() }, [fetchRanking])

  useEffect(() => {
    if (!usuario || !extratoAlvo) { setExtrato(null); return }
    setLoadingExtrato(true)
    buscarExtratoColaborador(usuario.filial, rankIni, rankFim, extratoAlvo.chave)
      .then(setExtrato)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar o extrato.'))
      .finally(() => setLoadingExtrato(false))
  }, [usuario, extratoAlvo, rankIni, rankFim])

  useEffect(() => {
    if (!usuario || aba !== 'historico') return
    listarColaboradoresComHistorico(usuario.filial)
      .then((lista) => {
        setColaboradoresHistorico(lista)
        setChaveHistorico((atual) => atual || lista[0]?.chave || '')
      })
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar os colaboradores.'))
  }, [usuario, aba])

  useEffect(() => {
    if (!usuario || !chaveHistorico) { setEvolucaoMensal(null); return }
    setLoadingEvolucao(true)
    buscarHistoricoMensal(usuario.filial, chaveHistorico)
      .then(setEvolucaoMensal)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar o histórico mensal.'))
      .finally(() => setLoadingEvolucao(false))
  }, [usuario, chaveHistorico])

  useEffect(() => {
    if (!usuario || aba !== 'tabelao' || tabelaoMensal) return
    setLoadingTabelao(true)
    buscarTabelaoMensal(usuario.filial)
      .then(setTabelaoMensal)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar o tabelão mensal.'))
      .finally(() => setLoadingTabelao(false))
  }, [usuario, aba, tabelaoMensal])

  // Trocas de Placa por Manutenção
  useEffect(() => {
    if (!usuario || aba !== 'trocas' || trocasPlaca.length > 0) return
    setLoadingTrocas(true)
    buscarTrocasPlacaArmazem(usuario.filial)
      .then(setTrocasPlaca)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar trocas de placa.'))
      .finally(() => setLoadingTrocas(false))
  }, [usuario, aba, trocasPlaca.length])

  const [vinculando, setVinculando] = useState(false)

  async function handleVincularCpfs() {
    if (!usuario) return
    setVinculando(true); setErro('')
    try {
      const { atualizados, semVinculo } = await vincularCpfsPendentes(usuario.filial)
      if (atualizados > 0) {
        await fetchRanking()
      }
      alert(
        atualizados > 0
          ? `✅ ${atualizados} registro(s) vinculado(s) ao cadastro.` +
            (semVinculo > 0 ? `\n⚠️ ${semVinculo} ainda sem cadastro correspondente.` : '')
          : semVinculo > 0
            ? `⚠️ Nenhum vinculado: ${semVinculo} registro(s) sem cadastro correspondente.`
            : 'Nenhum registro pendente de vínculo encontrado.'
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao vincular CPFs.')
    } finally {
      setVinculando(false)
    }
  }

  async function handleImportar(file: File) {
    if (!usuario) return
    setUploading(true); setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const { linhas, semCadastro } = await importarPontuacao(usuario.filial, data, buffer, rvDobrada)
      await fetchResumo()
      await fetchHistorico()
      await fetchRanking()
      await fetchComparativo()
      await fetchMigracao()
      alert(
        `Relatório importado: ${linhas} colaborador(es).` +
        (rvDobrada ? '\n\n🔥 RV Dobrada aplicada — valores deste dia em dobro.' : '') +
        (semCadastro > 0 ? `\n\n⚠️ ${semCadastro} sem cadastro (nome não bateu) — aparecem no painel, mas não conseguem consultar no totem até serem cadastrados.` : '')
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o relatório.')
    } finally {
      setUploading(false)
    }
  }

  const maxCluster = useMemo(() => Math.max(1, ...(resumo?.porCluster.map((c) => c.qtd) ?? [1])), [resumo])
  const semCadastro = useMemo(
    () => (resumo?.linhas ?? []).filter((l) => !l.temCadastro).map((l) => l.nome).sort(),
    [resumo]
  )

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

  // Variação do mês selecionado vs. mês anterior (usada nos dois históricos).
  const variacaoValorMes = useMemo(() => {
    if (!historico || !historicoAnterior || historicoAnterior.totalMes <= 0) return null
    return ((historico.totalMes - historicoAnterior.totalMes) / historicoAnterior.totalMes) * 100
  }, [historico, historicoAnterior])

  const variacaoPontuacaoMes = useMemo(() => {
    if (!historico || !historicoAnterior || historicoAnterior.mediaPontuacaoMes <= 0) return null
    return ((historico.mediaPontuacaoMes - historicoAnterior.mediaPontuacaoMes) / historicoAnterior.mediaPontuacaoMes) * 100
  }, [historico, historicoAnterior])

  // Quedas de desempenho: só quem teve período anterior para comparar,
  // ordenado da maior queda para a maior alta.
  const quedasOrdenadas = useMemo(() => {
    if (!comparativo) return []
    return [...comparativo]
      .filter((c) => c.variacaoPct != null)
      .sort((a, b) => (a.variacaoPct ?? 0) - (b.variacaoPct ?? 0))
  }, [comparativo])

  const migracaoRelevante = useMemo(() => {
    if (!migracao) return []
    const peso = { desceu: 0, subiu: 1, novo: 2, saiu: 3, igual: 4 }
    return [...migracao]
      .filter((m) => m.direcao === 'subiu' || m.direcao === 'desceu')
      .sort((a, b) => peso[a.direcao] - peso[b.direcao])
  }, [migracao])

  function exportarRankingCSV() {
    const linhas: (string | number)[][] = [
      ['Posição', 'Colaborador', 'Dias lançados', 'Faltas', 'Pontuação média', 'Pontuação total', 'Valor total'],
      ...rankingOrdenado.map((c, i) => [
        i + 1, c.nome, c.diasLancados, c.faltas,
        Math.round(c.pontuacaoMedia), c.pontuacaoTotal, c.valorTotal.toFixed(2),
      ]),
    ]
    baixarCSV(`ranking-variavel_${rankIni}_a_${rankFim}.csv`, linhas)
  }

  function copiarResumoRanking() {
    const top = rankingOrdenado.slice(0, 5)
    let texto = `📊 *Ranking Variável* — ${formatarDataBR(rankIni)} a ${formatarDataBR(rankFim)}\n\n`
    top.forEach((c, i) => {
      texto += `${i + 1}. ${c.nome} — ${Math.round(c.pontuacaoMedia).toLocaleString('pt-BR')} pts (méd.) · ${formatarBRL(c.valorTotal)}\n`
    })
    navigator.clipboard.writeText(texto)
      .then(() => alert('Resumo copiado! Cole no WhatsApp.'))
      .catch(() => alert('Não foi possível copiar. Tente novamente.'))
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Armazém</p>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5 text-accent-600" /> Variável</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {aba === 'pontuacao'
              ? 'Suba o relatório de pontuação do dia — o valor é calculado por cluster e o painel atualiza na hora.'
              : aba === 'historico'
              ? 'Evolução mês a mês por colaborador.'
              : aba === 'tabelao'
              ? 'Todos os ajudantes lado a lado, mês a mês.'
              : 'Atividades com meta por turno, fechadas pelo conferente ou lançadas direto aqui — RV individual por colaborador.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/armazem/colaboradores" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors"><Settings className="h-4 w-4" /> Colaboradores</Link>
          <button onClick={handleVincularCpfs} disabled={vinculando} title="Vincula lançamentos retroativos que ficaram sem CPF por não encontrar o colaborador no cadastro na época da importação." className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50"><UserSearch className={`h-4 w-4 ${vinculando ? 'animate-pulse' : ''}`} /> {vinculando ? 'Vinculando...' : 'Vincular CPFs'}</button>
          {aba === 'pontuacao' && (
            <button onClick={fetchResumo} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setAba('pontuacao')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'pontuacao' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Pontuação
        </button>
        <button
          onClick={() => setAba('turno')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'turno' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Atividades por Turno
        </button>
        <button
          onClick={() => setAba('historico')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'historico' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Histórico Mensal
        </button>
        <button
          onClick={() => setAba('tabelao')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'tabelao' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Tabelão Mensal
        </button>
        <button
          onClick={() => setAba('trocas')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${aba === 'trocas' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <ArrowDownUp className="h-4 w-4" />
          Trocas de Placa
        </button>
      </div>

      {aba === 'turno' ? (
        <div className="space-y-4">
          {usuario && <VariavelTurnoAdmin filial={usuario.filial} />}
        </div>
      ) : aba === 'historico' ? (
        <HistoricoMensalTab
          colaboradores={colaboradoresHistorico}
          chave={chaveHistorico}
          onChave={setChaveHistorico}
          dados={evolucaoMensal}
          loading={loadingEvolucao}
        />
      ) : aba === 'tabelao' ? (
        <TabelaoMensalTab dados={tabelaoMensal} loading={loadingTabelao} />
      ) : aba === 'trocas' ? (
        <div className="space-y-4">
          {loadingTrocas ? (
            <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Carregando trocas de placa...</div>
          ) : trocasPlaca.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma troca de placa encontrada no histórico.</div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="border rounded-lg bg-white p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total de Trocas</p>
                  <p className="text-2xl font-bold text-accent-700">{trocasPlaca.length}</p>
                </div>
                <div className="border rounded-lg bg-white p-4">
                  <p className="text-xs text-muted-foreground mb-1">Período</p>
                  <p className="text-sm font-semibold">{formatarDataBR(trocasPlaca[0]?.data)} a {formatarDataBR(trocasPlaca[trocasPlaca.length - 1]?.data)}</p>
                </div>
                <div className="border rounded-lg bg-white p-4">
                  <p className="text-xs text-muted-foreground mb-1">Dias Únicos</p>
                  <p className="text-2xl font-bold text-accent-700">{new Set(trocasPlaca.map(t => t.data)).size}</p>
                </div>
              </div>
              <div className="border rounded-lg bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Data</th>
                      <th className="px-4 py-2 text-left font-semibold">Mapa</th>
                      <th className="px-4 py-2 text-left font-semibold">Placa Gerado</th>
                      <th className="px-4 py-2 text-center font-semibold">→</th>
                      <th className="px-4 py-2 text-left font-semibold">Placa Carregado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trocasPlaca.map((troca, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/30'}>
                        <td className="px-4 py-2 text-muted-foreground">{formatarDataBR(troca.data)}</td>
                        <td className="px-4 py-2 font-semibold text-foreground">{troca.mapa}</td>
                        <td className="px-4 py-2"><code className="text-xs bg-muted px-2 py-1 rounded font-semibold">{troca.placaGerado}</code></td>
                        <td className="px-4 py-2 text-center text-muted-foreground">→</td>
                        <td className="px-4 py-2"><code className="text-xs bg-muted px-2 py-1 rounded font-semibold">{troca.placaCarregado}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border rounded-lg bg-blue-50 border-blue-200 p-3 text-xs text-blue-700 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Analisando OS...</p>
                  <p>Correlacione com as OS noturnas (22h-06h) para vincular a manutenção. Download dos dados: <code className="text-[11px] bg-white px-1 rounded">trocas_placa_gerado_carregado.csv</code></p>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
      <>

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
          <label className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${rvDobrada ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="checkbox" checked={rvDobrada} onChange={(e) => setRvDobrada(e.target.checked)} className="accent-orange-500" />
            <span className={`text-sm font-medium ${rvDobrada ? 'text-orange-700' : 'text-gray-700'}`}>🔥 RV Dobrada neste dia</span>
          </label>
          {rvDobrada && <p className="text-xs text-orange-600 mt-1">O valor pago de {formatarDataBR(data)} sairá em dobro para todos os colaboradores importados.</p>}
        </div>
        <div className="border rounded-lg bg-white p-4">
          <label className="text-sm font-medium block mb-1.5">Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div key={k.l} className={`border rounded-lg bg-white p-4 relative ${i === 0 && resumo?.rvDobrada ? 'border-orange-300 bg-orange-50/50' : ''}`}>
            {i === 0 && resumo?.rvDobrada && (
              <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white bg-orange-500 px-2 py-0.5 rounded-full shadow-sm">
                🔥 RV Dobrada
              </span>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><k.icon className="h-4 w-4" /> {k.l}</div>
            <div className={`text-xl sm:text-2xl font-bold tabular-nums ${k.money ? 'text-green-700' : ''}`}>{k.v}</div>
            <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{k.s}</div>
          </div>
        ))}
      </div>

      {!loading && semCadastro.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <UserSearch className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {semCadastro.length} nome(s) do relatório sem cadastro correspondente
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                O relatório de RV não traz CPF — o casamento é só pelo nome, então esses nomes provavelmente ainda
                não foram cadastrados (ou o nome no relatório está diferente do cadastrado). Cadastre-os em{' '}
                <Link to="/armazem/colaboradores" className="underline font-medium">Colaboradores</Link> usando
                exatamente o nome abaixo pra bater da próxima importação.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {semCadastro.map((nome) => (
                  <span key={nome} className="text-xs font-medium bg-white border border-amber-200 text-amber-900 px-2 py-1 rounded-md">{nome}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <h3 className="text-sm font-semibold">Ranking — {formatarDataBR(data)}</h3>
              {resumo.rvDobrada && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-orange-700 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-full">
                  🔥 RV Dobrada
                </span>
              )}
            </div>
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
                <div className={`text-[11px] tabular-nums mt-0.5 ${variacaoBadge(variacaoValorMes).cor}`}>{variacaoBadge(variacaoValorMes).texto} vs. mês anterior</div>
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
                    <tr key={d.data} className={`hover:bg-muted/30 transition-colors cursor-pointer ${d.rvDobrada ? 'bg-orange-50/60' : ''}`} onClick={() => setData(d.data)} title="Clique para ver o dia no ranking acima">
                      <td className="px-3 py-2 font-medium">
                        {formatarDataBR(d.data)}
                        {d.rvDobrada && <span className="ml-1.5 text-[10px] font-bold uppercase text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full" title="RV Dobrada neste dia">🔥 2x</span>}
                      </td>
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
                <div className={`text-[11px] tabular-nums mt-0.5 ${variacaoBadge(variacaoPontuacaoMes).cor}`}>{variacaoBadge(variacaoPontuacaoMes).texto} vs. mês anterior</div>
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
            <button onClick={exportarRankingCSV} disabled={rankingOrdenado.length === 0} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm hover:bg-accent transition-colors disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={copiarResumoRanking} disabled={rankingOrdenado.length === 0} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm hover:bg-accent transition-colors disabled:opacity-40">
              <Copy className="h-3.5 w-3.5" /> Copiar resumo
            </button>
          </div>
        }
      >
        {loadingRank ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : rankingOrdenado.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma pontuação no período selecionado.</div>
        ) : (
          <div>
            <p className="px-4 pt-3 text-[11px] text-muted-foreground">Filial teve lançamento em {diasPeriodoRank} dia(s) no período — "faltas" é comparado com esse total, não com os dias corridos.</p>
            <div className="overflow-x-auto p-4 pt-2">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className={`text-right px-3 py-2 font-medium ${criterioRank === 'diasLancados' ? 'text-accent-700' : 'text-muted-foreground'}`}>Dias lançados</th>
                    <th className={`text-right px-3 py-2 font-medium ${criterioRank === 'faltas' ? 'text-accent-700' : 'text-muted-foreground'}`}>Faltas</th>
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
                      <td className={`px-3 py-2 text-right tabular-nums ${criterioRank === 'faltas' ? 'font-bold' : c.faltas > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>{c.faltas}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${criterioRank === 'pontuacaoMedia' ? 'font-bold' : ''}`}>{Math.round(c.pontuacaoMedia).toLocaleString('pt-BR')} pts</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${criterioRank === 'pontuacaoTotal' ? 'font-bold' : 'text-muted-foreground'}`}>{c.pontuacaoTotal.toLocaleString('pt-BR')} pts</td>
                      <td className={`px-3 py-2 text-right tabular-nums text-green-700 ${criterioRank === 'valorTotal' ? 'font-bold' : ''}`}>{formatarBRL(c.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Colapsavel>

      {/* Queda/alta de desempenho vs. período anterior equivalente */}
      <Colapsavel titulo="Queda de Desempenho" icon={ShieldAlert}>
        {loadingComparativo ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : quedasOrdenadas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Sem período anterior comparável para esta janela de datas.</div>
        ) : (
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-3">Compara a pontuação média de {formatarDataBR(rankIni)} a {formatarDataBR(rankFim)} com o período imediatamente anterior de mesma duração.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Período anterior</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Período atual</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Variação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quedasOrdenadas.map((c) => {
                    const badge = variacaoBadge(c.variacaoPct)
                    return (
                      <tr key={c.chave} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-medium">{c.nome}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Math.round(c.mediaAnterior ?? 0).toLocaleString('pt-BR')} pts</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{Math.round(c.mediaAtual).toLocaleString('pt-BR')} pts</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${badge.cor}`}>{badge.texto}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Colapsavel>

      {/* Migração de cluster mês a mês */}
      <Colapsavel
        titulo="Migração de Cluster"
        icon={Sparkles}
        extra={
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input type="month" value={mesHist} onChange={(e) => setMesHist(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </label>
        }
      >
        {loadingMigracao ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : migracaoRelevante.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Ninguém mudou de faixa entre este mês e o anterior.</div>
        ) : (
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-3">Compara a faixa (cluster) indicada pela média mensal de cada colaborador entre {formatarDataBR(mesAnteriorDe(mesHist) + '-01')} e {formatarDataBR(mesHist + '-01')}.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Faixa mês anterior</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Faixa mês atual</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Direção</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {migracaoRelevante.map((m) => (
                    <tr key={m.chave} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium">{m.nome}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.valorPor1000Anterior != null ? `${formatarBRL(m.valorPor1000Anterior)}/1k` : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{m.valorPor1000Atual != null ? `${formatarBRL(m.valorPor1000Atual)}/1k` : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {m.direcao === 'subiu' && <span className="inline-flex items-center gap-1 text-green-700 font-medium"><ArrowUpCircle className="h-4 w-4" /> Subiu</span>}
                        {m.direcao === 'desceu' && <span className="inline-flex items-center gap-1 text-red-600 font-medium"><ArrowDownCircle className="h-4 w-4" /> Desceu</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Colapsavel>
      </>
      )}

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
                        <tr key={d.data} className={d.rvDobrada ? 'bg-orange-50/60' : ''}>
                          <td className="px-3 py-2 font-medium">
                            {formatarDataBR(d.data)}
                            {d.rvDobrada && <span className="ml-1.5 text-[10px] font-bold uppercase text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full" title="RV Dobrada neste dia">🔥 2x</span>}
                          </td>
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
