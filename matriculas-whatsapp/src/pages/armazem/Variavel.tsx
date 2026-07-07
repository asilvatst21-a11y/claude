import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, Upload, Loader2, RefreshCw, AlertTriangle, Users, Coins, Trophy, TrendingUp, Link2, ExternalLink, Settings,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { buscarResumoDia, importarPontuacao, formatarBRL, type ResumoVariavel } from '../../lib/variavelArmazem'
import { formatarDataBR } from '../../lib/utils'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const CORES_CLUSTER = ['#f3ddc0', '#eecba0', '#e6b479', '#dc9b53', '#cf8231', '#b6661a']

export default function ArmazemVariavel() {
  const { usuario } = useAuth()
  const [data, setData] = useState(hojeISO)
  const [resumo, setResumo] = useState<ResumoVariavel | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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

  async function handleImportar(file: File) {
    if (!usuario) return
    setUploading(true); setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const { linhas, semCadastro } = await importarPontuacao(usuario.filial, data, buffer)
      await fetchResumo()
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
    { l: 'Pontuação total', v: resumo.pontuacaoTotal.toLocaleString('pt-BR'), s: resumo.colaboradores > 0 ? `média ${Math.round(resumo.pontuacaoTotal / resumo.colaboradores).toLocaleString('pt-BR')} pts` : '—', icon: TrendingUp, money: false },
    { l: 'Ticket médio', v: formatarBRL(resumo.ticketMedio), s: `maior ${formatarBRL(resumo.maior)} · menor ${formatarBRL(resumo.menor)}`, icon: Trophy, money: true },
  ] : []

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
    </div>
  )
}
