import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Upload, Loader2, ShieldAlert, Settings2, ChevronDown, BarChart2, CalendarClock } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  listarNiveisSubgrupo, salvarNivelSubgrupo, semearNiveisPadrao,
  importarRelatosPdv, listarRelatos, marcarNaoCritico, encerrarComDataRetroativa,
  carregarRelatosAnalise, calcularEstatisticasPdvCritico,
  NIVEL_LABEL, STATUS_LABEL, PRAZO_DIAS,
  type NivelSubgrupo, type NivelCriticidade, type RelatoLinha, type ResultadoImportRelatos,
  type LinhaAnaliseRelato, type EstatisticasPdvCritico,
} from '../lib/pdvSeguranca'

const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const NIVEL_CSS: Record<NivelCriticidade, string> = {
  alto: 'bg-red-50 text-red-700 border-red-200',
  medio: 'bg-amber-50 text-amber-700 border-amber-200',
  leve: 'bg-slate-100 text-slate-700 border-slate-200',
}
const STATUS_CSS: Record<string, string> = {
  aguardando_triagem: 'bg-slate-100 text-slate-700',
  agendado: 'bg-amber-50 text-amber-700',
  preenchido: 'bg-amber-50 text-amber-700',
  aprovado: 'bg-green-50 text-green-700',
  nao_critico: 'bg-slate-100 text-slate-500',
  encerrado_historico: 'bg-slate-100 text-slate-500',
  cancelado: 'bg-slate-100 text-slate-400 line-through',
}
// Status BEES = coluna "status" da própria planilha de relatos (ex.:
// "CANCELED"). O vocabulário vem da fonte, não é fixo — colore por
// palavra-chave em vez de mapear valor por valor.
function statusBeesCss(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('cancel')) return 'bg-slate-100 text-slate-500 line-through'
  if (s.includes('conclu') || s.includes('resolv') || s.includes('finaliz')) return 'bg-green-50 text-green-700'
  return 'bg-blue-50 text-blue-700'
}

function diasRestantes(prazoISO: string | null): number | null {
  if (!prazoISO) return null
  const hoje = new Date().toISOString().slice(0, 10)
  const ms = new Date(`${prazoISO}T00:00:00Z`).getTime() - new Date(`${hoje}T00:00:00Z`).getTime()
  return Math.round(ms / (24 * 3600 * 1000))
}

function PrazoBadge({ prazo }: { prazo: string | null }) {
  if (!prazo) return <span className="text-muted-foreground text-xs">—</span>
  const dias = diasRestantes(prazo)
  if (dias === null) return <span className="text-muted-foreground text-xs">—</span>
  const vencido = dias < 0
  const texto = vencido ? `Venceu há ${Math.abs(dias)}d` : dias === 0 ? 'Vence hoje' : `Vence em ${dias}d`
  const cor = vencido || dias <= 1 ? 'text-red-600' : dias <= 3 ? 'text-amber-600' : 'text-muted-foreground'
  return (
    <div>
      <span className={`text-xs font-semibold ${cor}`}>{texto}</span>
      <div className="text-[10px] text-muted-foreground">prazo: {formatarDataBR(prazo)}</div>
    </div>
  )
}

function NaoCriticoModal({ onConfirmar, onFechar }: { onConfirmar: (justificativa: string) => void; onFechar: () => void }) {
  const [texto, setTexto] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-1">Marcar como não crítico</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Encerra o caso sem gerar visita e sem avisar o motorista. A justificativa é obrigatória e fica salva no histórico.
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Por que esse PDV não é crítico?"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onFechar} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-accent">Cancelar</button>
          <button
            disabled={!texto.trim()}
            onClick={() => onConfirmar(texto.trim())}
            className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
          >
            Confirmar — não crítico
          </button>
        </div>
      </div>
    </div>
  )
}

function EncerrarHistoricoModal({ onConfirmar, onFechar }: { onConfirmar: (dataFechamento: string) => void; onFechar: () => void }) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-1">Encerrar (já resolvido)</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Pra caso que chegou aberto/em andamento na origem mas já foi resolvido na prática antes de entrar no
          fluxo — encerra sem checklist de visita. Pode escolher uma data retroativa.
        </p>
        <label className="block text-xs text-muted-foreground mb-1">Data de fechamento</label>
        <input
          type="date"
          value={data}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setData(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onFechar} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-accent">Cancelar</button>
          <button
            disabled={!data}
            onClick={() => onConfirmar(data)}
            className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
          >
            Confirmar encerramento
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SegurancaPdvCritico() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'painel' | 'analise'>('painel')
  const [niveis, setNiveis] = useState<NivelSubgrupo[]>([])
  const [carregandoNiveis, setCarregandoNiveis] = useState(true)
  const [configAberta, setConfigAberta] = useState(false)

  const [relatos, setRelatos] = useState<RelatoLinha[]>([])
  const [carregandoRelatos, setCarregandoRelatos] = useState(true)
  const [importando, setImportando] = useState(false)
  const [msgImport, setMsgImport] = useState('')
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [modalNaoCritico, setModalNaoCritico] = useState<string | null>(null)
  const [modalEncerrar, setModalEncerrar] = useState<string | null>(null)

  const [analiseLinhas, setAnaliseLinhas] = useState<LinhaAnaliseRelato[] | null>(null)
  const [carregandoAnalise, setCarregandoAnalise] = useState(false)
  const [filtroAno, setFiltroAno] = useState<number | null>(null)
  const [filtroMes, setFiltroMes] = useState<number | null>(null)

  const carregarNiveis = useCallback(async () => {
    if (!usuario) return
    setCarregandoNiveis(true)
    await semearNiveisPadrao(usuario.filial)
    setNiveis(await listarNiveisSubgrupo(usuario.filial))
    setCarregandoNiveis(false)
  }, [usuario])

  const carregarRelatos = useCallback(async () => {
    if (!usuario) return
    setCarregandoRelatos(true)
    setRelatos(await listarRelatos(usuario.filial))
    setCarregandoRelatos(false)
  }, [usuario])

  const carregarAnalise = useCallback(async () => {
    if (!usuario) return
    setCarregandoAnalise(true)
    setAnaliseLinhas(await carregarRelatosAnalise(usuario.filial))
    setCarregandoAnalise(false)
  }, [usuario])

  useEffect(() => { carregarNiveis() }, [carregarNiveis])
  useEffect(() => { carregarRelatos() }, [carregarRelatos])
  useEffect(() => { if (aba === 'analise' && !analiseLinhas) carregarAnalise() }, [aba, analiseLinhas, carregarAnalise])

  const estatisticas = useMemo(
    () => analiseLinhas ? calcularEstatisticasPdvCritico(analiseLinhas, { ano: filtroAno, mes: filtroMes }) : null,
    [analiseLinhas, filtroAno, filtroMes]
  )

  async function handleMudarNivel(subgrupo: string, nivel: NivelCriticidade) {
    if (!usuario) return
    setNiveis((prev) => prev.map((n) => (n.subgrupo === subgrupo ? { ...n, nivel } : n)))
    await salvarNivelSubgrupo(usuario.filial, subgrupo, nivel)
  }

  async function handleImportar(file: File) {
    if (!usuario) return
    setImportando(true)
    setMsgImport('')
    setErro('')
    try {
      const r: ResultadoImportRelatos = await importarRelatosPdv(file, usuario.filial)
      setMsgImport(
        `✅ ${r.seguranca} relato(s) de Segurança processado(s): ${r.ativos} novo(s) na fila de triagem` +
        (r.fechadosHistorico ? `, ${r.fechadosHistorico} já vieram fechado(s) na origem (viram registro histórico, sem triagem)` : '') +
        (r.canceladosNaOrigem ? `, ${r.canceladosNaOrigem} já vieram cancelado(s) na origem (só registro de análise)` : '') +
        (r.reincidencias ? `. ${r.reincidencias} reincidência(s) — criticidade escalada automaticamente` : '') +
        `. ${r.outrasAreas} de outras áreas ignorado(s) (não entram nesse fluxo). ` +
        `${r.jaExistiam} já existiam (Status BEES atualizado quando mudou; resto do caso preservado).` +
        (r.semData ? ` ${r.semData} sem data reconhecida, ignorado(s).` : '')
      )
      if (r.erroAtualizacao) setErro(`Erro ao reclassificar caso(s) já existente(s): ${r.erroAtualizacao}`)
      await carregarRelatos()
      setAnaliseLinhas(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao importar relatos')
    }
    setImportando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleNaoCritico(id: string, justificativa: string) {
    if (!usuario) return
    const { error } = await marcarNaoCritico(id, justificativa, usuario.nome ?? usuario.login)
    if (error) { setErro(error); return }
    setModalNaoCritico(null)
    await carregarRelatos()
  }

  async function handleEncerrar(id: string, dataFechamento: string) {
    if (!usuario) return
    const { error } = await encerrarComDataRetroativa(id, dataFechamento, usuario.nome ?? usuario.login)
    if (error) { setErro(error); return }
    setModalEncerrar(null)
    await carregarRelatos()
    setAnaliseLinhas(null)
  }

  function handleAgendar() {
    alert(
      'Agendamento com escolha de supervisor e envio automático de WhatsApp ainda está sendo construído — ' +
      'é a próxima etapa deste módulo.'
    )
  }

  if (!usuario) return null

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> PDV Crítico
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Relato do motorista (categoria Segurança) → criticidade pelo subgrupo → visita do supervisor → finalização.
        </p>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      <div className="flex gap-1 border-b">
        {([
          { valor: 'painel' as const, label: 'Painel operacional' },
          { valor: 'analise' as const, label: 'Análise' },
        ]).map((t) => (
          <button
            key={t.valor}
            onClick={() => setAba(t.valor)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              aba === t.valor ? 'border-accent-500 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'analise' ? (
        <AnaliseTab
          estatisticas={estatisticas}
          carregando={carregandoAnalise}
          filtroAno={filtroAno}
          filtroMes={filtroMes}
          onFiltroAno={setFiltroAno}
          onFiltroMes={setFiltroMes}
        />
      ) : (
      <>
      {/* ── Config: nível por subgrupo ─────────────────────────────── */}
      <div className="border rounded-lg bg-white">
        <button
          onClick={() => setConfigAberta((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b text-left hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-sm">Criticidade inicial por subgrupo</h2>
              <p className="text-xs text-muted-foreground">Define a fila e o prazo da visita — o checklist da visita é quem decide a criticidade real.</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${configAberta ? 'rotate-180' : ''}`} />
        </button>
        {configAberta && (
          carregandoNiveis ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-accent-500" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Subgrupo</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Nível inicial</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Prazo da visita</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {niveis.map((n) => (
                    <tr key={n.id}>
                      <td className="px-4 py-2">{n.subgrupo}</td>
                      <td className="px-4 py-2">
                        <select
                          value={n.nivel}
                          onChange={(e) => handleMudarNivel(n.subgrupo, e.target.value as NivelCriticidade)}
                          className={`text-xs font-semibold px-2 py-1 rounded-md border ${NIVEL_CSS[n.nivel]}`}
                        >
                          <option value="alto">NC Alto</option>
                          <option value="medio">NC Médio</option>
                          <option value="leve">NC Leve</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{PRAZO_DIAS[n.nivel]} dias</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Upload de relatos ──────────────────────────────────────── */}
      <div className="border rounded-lg bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">Importar relatos</h2>
            <p className="text-xs text-muted-foreground">Planilha de relatos do motorista — só a categoria Segurança vira caso aqui.</p>
          </div>
          <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
            {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importando ? 'Importando...' : 'Escolher planilha'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importando}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportar(f) }}
            />
          </label>
        </div>
        {msgImport && <p className="text-xs text-green-700 mt-3">{msgImport}</p>}
      </div>

      {/* ── Painel de relatos ──────────────────────────────────────── */}
      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Relatos recebidos</h2>
          <p className="text-xs text-muted-foreground">Priorizados por prazo — o mais urgente primeiro.</p>
        </div>
        {carregandoRelatos ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : relatos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto opacity-20 mb-3" />
            <p>Nenhum relato de Segurança importado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">PDV</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Subgrupo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Criticidade</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Motorista</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prazo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status BEES</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {relatos.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {r.codigoPdv}
                      {r.reincidente && (
                        <span
                          title={`${r.numeroOcorrencia}ª vez que esse PDV+subgrupo é relatado — reincidiu depois de um caso já aprovado`}
                          className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold align-middle"
                        >
                          🔁 {r.numeroOcorrencia}ª vez
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">{r.subgrupo}</td>
                    <td className="px-3 py-2">
                      {r.nivel ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${NIVEL_CSS[r.nivel]}`}>
                          {NIVEL_LABEL[r.nivel]}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">{r.codigoMotorista ?? '—'}</td>
                    <td className="px-3 py-2"><PrazoBadge prazo={r.prazoVisita} /></td>
                    <td className="px-3 py-2">
                      {r.statusBees ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBeesCss(r.statusBees)}`}>
                          {r.statusBees}
                        </span>
                      ) : <span className="text-muted-foreground">sem dado</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CSS[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.status === 'aguardando_triagem' && (
                        <div className="flex flex-col gap-1 items-end">
                          <button onClick={handleAgendar} className="text-[11px] font-semibold px-2 py-1 rounded-md border hover:bg-accent whitespace-nowrap">
                            Agendar
                          </button>
                          <button onClick={() => setModalNaoCritico(r.id)} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                            Não crítico
                          </button>
                          <button onClick={() => setModalEncerrar(r.id)} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                            Encerrar (já resolvido)
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalNaoCritico && (
        <NaoCriticoModal
          onFechar={() => setModalNaoCritico(null)}
          onConfirmar={(justificativa) => handleNaoCritico(modalNaoCritico, justificativa)}
        />
      )}
      {modalEncerrar && (
        <EncerrarHistoricoModal
          onFechar={() => setModalEncerrar(null)}
          onConfirmar={(dataFechamento) => handleEncerrar(modalEncerrar, dataFechamento)}
        />
      )}
      </>
      )}
    </div>
  )
}

function BarraHorizontal({ label, total, max }: { label: string; total: number; max: number }) {
  const pct = max > 0 ? Math.round((total / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate text-muted-foreground" title={label}>{label}</span>
      <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
        <div className="h-full bg-accent-500 rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{total}</span>
    </div>
  )
}

function AnaliseTab({
  estatisticas, carregando, filtroAno, filtroMes, onFiltroAno, onFiltroMes,
}: {
  estatisticas: EstatisticasPdvCritico | null
  carregando: boolean
  filtroAno: number | null
  filtroMes: number | null
  onFiltroAno: (ano: number | null) => void
  onFiltroMes: (mes: number | null) => void
}) {
  const filtros = (
    <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Ano</label>
        <select
          value={filtroAno ?? ''}
          onChange={(e) => onFiltroAno(e.target.value ? Number(e.target.value) : null)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">Todos</option>
          {(estatisticas?.anosDisponiveis ?? []).map((ano) => <option key={ano} value={ano}>{ano}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Mês</label>
        <select
          value={filtroMes ?? ''}
          onChange={(e) => onFiltroMes(e.target.value ? Number(e.target.value) : null)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">Todos</option>
          {MES_LABEL.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
        </select>
      </div>
      {(filtroAno != null || filtroMes != null) && (
        <button
          onClick={() => { onFiltroAno(null); onFiltroMes(null) }}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Limpar filtro
        </button>
      )}
    </div>
  )

  const [statusEscolhido, setStatusEscolhido] = useState('cancelado')

  if (carregando || !estatisticas) {
    return (
      <div className="space-y-5">
        {filtros}
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
      </div>
    )
  }

  const statusOptions = estatisticas.statusDisponiveis
  const statusAtivo = statusOptions.includes(statusEscolhido) ? statusEscolhido : (statusOptions[0] ?? statusEscolhido)
  const subgrupoDoStatus = estatisticas.porStatusESubgrupo[statusAtivo] ?? []
  const mesDoStatus = estatisticas.porStatusEMes[statusAtivo] ?? []
  const maxSubgrupo = Math.max(1, ...subgrupoDoStatus.map((s) => s.total))
  const maxMes = Math.max(1, ...mesDoStatus.map((m) => m.total))
  const maxDiaSemana = Math.max(1, ...estatisticas.relatosPorDiaSemana.map((d) => d.total))
  const totalDoStatus = subgrupoDoStatus.reduce((acc, s) => acc + s.total, 0)

  return (
    <div className="space-y-5">
      {filtros}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-xl bg-white p-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> Fechados
          </p>
          <p className="text-xl font-bold leading-tight">{estatisticas.totalFechados}</p>
        </div>
        <div className="border rounded-xl bg-green-50 p-3">
          <p className="text-[11px] font-semibold text-green-700 uppercase tracking-wide">No prazo</p>
          <p className="text-xl font-bold leading-tight text-green-700">{estatisticas.pctNoPrazo}%</p>
          <p className="text-[11px] text-green-700/80">{estatisticas.fechadosNoPrazo} caso(s)</p>
        </div>
        <div className="border rounded-xl bg-red-50 p-3">
          <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">Fora do prazo</p>
          <p className="text-xl font-bold leading-tight text-red-700">{estatisticas.fechadosForaPrazo}</p>
        </div>
        <div className="border rounded-xl bg-white p-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cancelados (origem)</p>
          <p className="text-xl font-bold leading-tight">{estatisticas.porStatusESubgrupo.cancelado?.reduce((acc, s) => acc + s.total, 0) ?? 0}</p>
        </div>
      </div>
      {estatisticas.fechadosSemPrazo > 0 && (
        <p className="text-xs text-muted-foreground">
          {estatisticas.fechadosSemPrazo} caso(s) fechado(s) sem prazo/data de fechamento reconhecidos na origem — fora do cálculo de % no prazo.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> % fechado no prazo por ano</h3>
          {estatisticas.fechadosPorAno.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum caso fechado no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3">Ano</th>
                    <th className="py-1.5 pr-3 text-right">Fechados</th>
                    <th className="py-1.5 pr-3 text-right">No prazo</th>
                    <th className="py-1.5 pr-3 text-right">Fora do prazo</th>
                    <th className="py-1.5 pr-3 text-right">% no prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estatisticas.fechadosPorAno.map((a) => (
                    <tr key={a.ano}>
                      <td className="py-1.5 pr-3 font-medium">{a.ano}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{a.total}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-green-700">{a.noPrazo}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{a.foraPrazo}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{(a.noPrazo + a.foraPrazo) > 0 ? `${a.pctNoPrazo}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> % fechado no prazo por mês</h3>
          {estatisticas.fechadosPorMes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum caso fechado no período.</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3">Mês</th>
                    <th className="py-1.5 pr-3 text-right">Fechados</th>
                    <th className="py-1.5 pr-3 text-right">No prazo</th>
                    <th className="py-1.5 pr-3 text-right">Fora do prazo</th>
                    <th className="py-1.5 pr-3 text-right">% no prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estatisticas.fechadosPorMes.map((m) => (
                    <tr key={m.mes}>
                      <td className="py-1.5 pr-3 font-medium">{m.mes}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{m.total}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-green-700">{m.noPrazo}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{m.foraPrazo}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{(m.noPrazo + m.foraPrazo) > 0 ? `${m.pctNoPrazo}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="border rounded-xl bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Relatos por subgrupo e mês</h3>
          <div>
            <label className="text-xs text-muted-foreground mr-2">Status</label>
            <select
              value={statusAtivo}
              onChange={(e) => setStatusEscolhido(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs"
            >
              {statusOptions.length === 0
                ? <option value="">Sem dados no período</option>
                : statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{totalDoStatus} relato(s) com esse status no período filtrado.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por subgrupo</h4>
            {subgrupoDoStatus.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum relato com esse status no período.</p>
            ) : (
              <div className="space-y-1.5">
                {subgrupoDoStatus.map((s) => (
                  <BarraHorizontal key={s.subgrupo} label={s.subgrupo} total={s.total} max={maxSubgrupo} />
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por mês</h4>
            {mesDoStatus.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum relato com esse status no período.</p>
            ) : (
              <div className="space-y-1.5">
                {mesDoStatus.map((m) => (
                  <BarraHorizontal key={m.mes} label={m.mes} total={m.total} max={maxMes} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border rounded-xl bg-white p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Relatos por dia da semana</h3>
        <div className="space-y-1.5">
          {estatisticas.relatosPorDiaSemana.map((d) => (
            <BarraHorizontal key={d.diaSemana} label={d.diaSemana} total={d.total} max={maxDiaSemana} />
          ))}
        </div>
      </div>
    </div>
  )
}
