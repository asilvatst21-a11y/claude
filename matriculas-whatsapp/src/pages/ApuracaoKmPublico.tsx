import { useEffect, useMemo, useState } from 'react'
import { Loader2, Route, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  buscarFiliais, buscarCompetenciasDisponiveis, buscarLinhasApuracao, buscarCustoPorKmVigente,
  type LoteImportacaoKm,
} from '../lib/kmApuracao/consultas'
import {
  montarPorRegra, montarPerdaGanho, montarFaixasAderencia, montarTopPerdas,
  montarImpactoFinanceiro, montarRankingCdd, montarMediaPorCdd,
} from '../lib/kmApuracao/analises'
import { REGRA_LABEL, type LinhaApuracao } from '../lib/kmApuracao/types'
import { formatarDataBR } from '../lib/utils'

function competenciaLabel(competencia: string): string {
  const [ano, mes] = competencia.split('-')
  return `${mes}/${ano}`
}

function numero(v: number, casas = 0): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_LABEL: Record<LoteImportacaoKm['status'], string> = {
  processando: 'Processando', concluido: 'Sem pendências', com_pendencias: 'Com pendências', erro: 'Erro',
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-l-4 border-accent-500 pl-3">
      <h2 className="text-base font-bold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function Kpi({ label, valor, sub, cor }: { label: string; valor: string; sub?: string; cor?: 'pos' | 'neg' }) {
  return (
    <div className="border rounded-xl bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cor === 'pos' ? 'text-green-700' : cor === 'neg' ? 'text-red-700' : ''}`}>{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function ApuracaoKmPublico() {
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [lotes, setLotes] = useState<LoteImportacaoKm[]>([])
  const [competencia, setCompetencia] = useState('')
  const [cdd, setCdd] = useState('TODOS')
  const [linhas, setLinhas] = useState<LinhaApuracao[]>([])
  const [custoPorKm, setCustoPorKm] = useState(0)
  const [carregandoLotes, setCarregandoLotes] = useState(false)
  const [carregandoLinhas, setCarregandoLinhas] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    buscarFiliais().then((f) => { setFiliais(f); if (f.length > 0) setFilial(f[0]) }).catch(() => setErro('Não foi possível carregar as filiais.'))
  }, [])

  useEffect(() => {
    if (!filial) return
    setCarregandoLotes(true)
    setCompetencia('')
    setLinhas([])
    buscarCompetenciasDisponiveis(filial)
      .then((l) => { setLotes(l); if (l.length > 0) setCompetencia(l[0].competencia) })
      .catch(() => setErro('Não foi possível carregar as competências.'))
      .finally(() => setCarregandoLotes(false))
  }, [filial])

  useEffect(() => {
    if (!filial || !competencia) return
    setCarregandoLinhas(true)
    setErro('')
    setCdd('TODOS')
    Promise.all([
      buscarLinhasApuracao(filial, competencia),
      buscarCustoPorKmVigente(filial, `${competencia}-01`),
    ])
      .then(([l, custo]) => { setLinhas(l); setCustoPorKm(custo) })
      .catch(() => setErro('Não foi possível carregar os dados dessa competência.'))
      .finally(() => setCarregandoLinhas(false))
  }, [filial, competencia])

  const loteAtual = lotes.find((l) => l.competencia === competencia) ?? null

  const cdds = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const l of linhas) if (l.cddCodigo) mapa.set(l.cddCodigo, l.cddNome ?? l.cddCodigo)
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [linhas])

  const linhasFiltradas = useMemo(
    () => (cdd === 'TODOS' ? linhas : linhas.filter((l) => l.cddCodigo === cdd)),
    [linhas, cdd]
  )

  const porRegra = useMemo(() => montarPorRegra(linhasFiltradas), [linhasFiltradas])
  const perdaGanho = useMemo(() => montarPerdaGanho(linhasFiltradas), [linhasFiltradas])
  const faixas = useMemo(() => montarFaixasAderencia(linhasFiltradas), [linhasFiltradas])
  const topPerdas = useMemo(() => montarTopPerdas(linhasFiltradas, 20), [linhasFiltradas])
  const financeiro = useMemo(() => montarImpactoFinanceiro(linhasFiltradas, custoPorKm), [linhasFiltradas, custoPorKm])
  const rankingCdd = useMemo(() => montarRankingCdd(linhas), [linhas]) // sempre todos os CDDs, não filtrado
  const mediaPorCdd = useMemo(() => montarMediaPorCdd(linhasFiltradas), [linhasFiltradas])

  const total = porRegra.reduce((acc, r) => ({
    viagens: acc.viagens + r.viagens, kmRot: acc.kmRot + r.kmRoteirizador, kmCons: acc.kmCons + r.kmConsiderado,
  }), { viagens: 0, kmRot: 0, kmCons: 0 })
  const deltaTotal = total.kmCons - total.kmRot
  const deltaPctTotal = total.kmRot !== 0 ? deltaTotal / total.kmRot : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-accent/40 text-accent-700 flex items-center justify-center shrink-0">
          <Route className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Apuração de KM</h1>
          <p className="text-xs text-muted-foreground">Visualização pública — só leitura</p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <Card>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="block text-xs font-semibold text-muted-foreground mb-1">Filial</span>
              <select value={filial} onChange={(e) => setFilial(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[10rem]">
                {filiais.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold text-muted-foreground mb-1">Competência</span>
              <select
                value={competencia} onChange={(e) => setCompetencia(e.target.value)}
                disabled={carregandoLotes || lotes.length === 0}
                className="border rounded-lg px-3 py-1.5 text-sm min-w-[9rem]"
              >
                {lotes.length === 0 && <option value="">Nenhuma disponível</option>}
                {lotes.map((l) => <option key={l.competencia} value={l.competencia}>{competenciaLabel(l.competencia)}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold text-muted-foreground mb-1">CDD</span>
              <select value={cdd} onChange={(e) => setCdd(e.target.value)} disabled={cdds.length === 0} className="border rounded-lg px-3 py-1.5 text-sm min-w-[10rem]">
                <option value="TODOS">Todos</option>
                {cdds.map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
              </select>
            </label>
          </div>
        </Card>

        {erro && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
          </div>
        )}

        {carregandoLinhas ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : linhas.length === 0 ? (
          <Card><p className="text-sm text-muted-foreground text-center py-8">Nenhum dado importado para essa competência.</p></Card>
        ) : (
          <>
            {loteAtual && (
              <div className={`flex items-center gap-2 text-sm rounded-lg border p-3 ${loteAtual.status === 'concluido' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                {loteAtual.status === 'concluido' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span className="font-semibold">{STATUS_LABEL[loteAtual.status]}</span>
                {loteAtual.pendencias.length > 0 && (
                  <span className="text-xs">— {loteAtual.pendencias.map((p) => `${p.descricao} (${p.quantidade})`).join(' · ')}</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi label="Viagens no escopo" valor={numero(total.viagens)} />
              <Kpi label="KM Roteirizador" valor={numero(total.kmRot)} />
              <Kpi label="KM Considerado" valor={numero(total.kmCons)} />
              <Kpi
                label="Delta líquido" valor={`${deltaTotal >= 0 ? '+' : ''}${numero(deltaTotal)} km`}
                sub={`${deltaPctTotal >= 0 ? '+' : ''}${numero(deltaPctTotal * 100, 1)}%`}
                cor={deltaTotal >= 0 ? 'pos' : 'neg'}
              />
            </div>

            <div className="space-y-3">
              <SectionTitle title="Por regra aplicada" />
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase border-b">
                      <th className="py-2 pr-3">Regra</th>
                      <th className="py-2 px-3 text-right">Viagens</th>
                      <th className="py-2 px-3 text-right">KM Roteirizador</th>
                      <th className="py-2 px-3 text-right">KM Considerado</th>
                      <th className="py-2 px-3 text-right">Delta</th>
                      <th className="py-2 px-3 text-right">Delta %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porRegra.map((r) => (
                      <tr key={r.regra} className="border-b last:border-0">
                        <td className="py-2 pr-3">{REGRA_LABEL[r.regra]}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{numero(r.viagens)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{numero(r.kmRoteirizador, 2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{numero(r.kmConsiderado, 2)}</td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${r.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {r.delta >= 0 ? '+' : ''}{numero(r.delta, 2)}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums ${r.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {r.deltaPct != null ? `${r.deltaPct >= 0 ? '+' : ''}${numero(r.deltaPct * 100, 1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <SectionTitle title="Perda bruta × ganho bruto" />
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted-foreground uppercase border-b">
                        <th className="py-2 pr-3">Regra</th>
                        <th className="py-2 px-3 text-right">Perda</th>
                        <th className="py-2 px-3 text-right">Ganho</th>
                        <th className="py-2 px-3 text-right">% perda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perdaGanho.filter((p) => p.viagensComPerda + p.viagensComGanho > 0).map((p) => (
                        <tr key={p.regra} className="border-b last:border-0">
                          <td className="py-2 pr-3">{REGRA_LABEL[p.regra]}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-700">{numero(p.kmPerdido, 2)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-green-700">+{numero(p.kmGanho, 2)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{numero(p.pctDaPerdaDoTotal * 100, 1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              <div className="space-y-3">
                <SectionTitle title="Impacto financeiro" />
                <Card>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-[11px] text-muted-foreground font-semibold uppercase">Perda bruta</p><p className="text-lg font-bold tabular-nums text-red-700">{moeda(financeiro.reaisPerdidoBruto)}</p></div>
                    <div><p className="text-[11px] text-muted-foreground font-semibold uppercase">Ganho bruto</p><p className="text-lg font-bold tabular-nums text-green-700">{moeda(financeiro.reaisGanhoBruto)}</p></div>
                    <div><p className="text-[11px] text-muted-foreground font-semibold uppercase">Delta líquido</p><p className="text-lg font-bold tabular-nums">{moeda(financeiro.reaisDeltaLiquido)}</p></div>
                    <div><p className="text-[11px] text-muted-foreground font-semibold uppercase">Por viagem afetada</p><p className="text-lg font-bold tabular-nums text-red-700">{moeda(financeiro.reaisPerdidoPorViagemAfetada)}</p></div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle title="Faixas de aderência" />
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase border-b">
                      <th className="py-2 pr-3">Faixa</th>
                      <th className="py-2 px-3 text-right">Viagens</th>
                      <th className="py-2 px-3 text-right">Delta médio/viagem</th>
                      <th className="py-2 px-3 text-right">Perda bruta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faixas.map((f) => (
                      <tr key={f.faixa.rotulo} className="border-b last:border-0">
                        <td className="py-2 pr-3">{f.faixa.rotulo}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{numero(f.viagens)}</td>
                        <td className={`py-2 px-3 text-right tabular-nums ${f.deltaMedioPorViagem >= 0 ? 'text-green-700' : 'text-red-700'}`}>{f.deltaMedioPorViagem >= 0 ? '+' : ''}{numero(f.deltaMedioPorViagem, 2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-red-700">{numero(f.kmPerdidoBruto, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            <div className="space-y-3">
              <SectionTitle title="Maiores perdas de KM" subtitle={`top ${topPerdas.length}`} />
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase border-b">
                      <th className="py-2 pr-3">Saída</th>
                      <th className="py-2 px-3">Placa</th>
                      <th className="py-2 px-3 text-right">Mapa</th>
                      <th className="py-2 px-3">CDD</th>
                      <th className="py-2 px-3 text-right">Aderência</th>
                      <th className="py-2 px-3 text-right">Considerado</th>
                      <th className="py-2 px-3 text-right">Perda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPerdas.map((l) => (
                      <tr key={l.tripId} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatarDataBR(l.saidaEm)}</td>
                        <td className="py-2 px-3">{l.placa ?? '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{l.mapa ?? '—'}</td>
                        <td className="py-2 px-3">{l.cddNome ?? l.cddCodigo ?? '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{l.aderencia != null ? `${numero(l.aderencia * 100, 0)}%` : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{numero(l.kmConsiderado, 2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-red-700 font-semibold">{numero(l.deltaKm ?? 0, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <SectionTitle title="Ranking de CDD por perda" />
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted-foreground uppercase border-b">
                        <th className="py-2 pr-3">CDD</th>
                        <th className="py-2 px-3 text-right">Perda bruta</th>
                        <th className="py-2 px-3 text-right">Delta líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingCdd.map((r) => (
                        <tr key={r.cddCodigo} className="border-b last:border-0">
                          <td className="py-2 pr-3">{r.cddNome ?? r.cddCodigo}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-700">{numero(r.kmPerdidoBruto, 2)}</td>
                          <td className={`py-2 px-3 text-right tabular-nums ${r.deltaLiquido >= 0 ? 'text-green-700' : 'text-red-700'}`}>{r.deltaLiquido >= 0 ? '+' : ''}{numero(r.deltaLiquido, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              <div className="space-y-3">
                <SectionTitle title="Média de KM por viagem por CDD" />
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted-foreground uppercase border-b">
                        <th className="py-2 pr-3">CDD</th>
                        <th className="py-2 px-3 text-right">Viagens</th>
                        <th className="py-2 px-3 text-right">KM médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mediaPorCdd.map((m) => (
                        <tr key={m.cddCodigo} className="border-b last:border-0">
                          <td className="py-2 pr-3">{m.cddNome ?? m.cddCodigo}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{numero(m.viagens)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">{numero(m.kmConsideradoMedio, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
