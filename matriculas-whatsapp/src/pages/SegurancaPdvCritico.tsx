import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Upload, Loader2, ShieldAlert, Settings2, ChevronDown, BarChart2, CalendarClock, Users, Trophy, Search, ChevronLeft, ChevronRight, Bell, HelpCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  listarNiveisSubgrupo, salvarNivelSubgrupo, semearNiveisPadrao,
  importarRelatosPdv, listarRelatos, marcarNaoCritico, encerrarComDataRetroativa, corrigirDataFechamento,
  carregarRelatosAnalise, calcularEstatisticasPdvCritico, buscarNomesColaboradoresPorMatricula,
  listarSupervisoresPdv, agendarVisita, aprovarCaso, reabrirCaso, RISCOS_VISITA_PDV, listarAvisosMotoristaPdv,
  NIVEL_LABEL, NIVEL_MEDIDO_LABEL, STATUS_LABEL, PRAZO_DIAS,
  type NivelSubgrupo, type NivelCriticidade, type RelatoLinha, type ResultadoImportRelatos,
  type LinhaAnaliseRelato, type EstatisticasPdvCritico, type SupervisorPdv, type AvisoMotoristaLinha,
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

function AgendarModal({
  relato, filial, enviando, onFechar, onConfirmar,
}: {
  relato: RelatoLinha
  filial: string
  enviando: boolean
  onFechar: () => void
  onConfirmar: (supervisor: SupervisorPdv) => void
}) {
  const [supervisores, setSupervisores] = useState<SupervisorPdv[]>([])
  const [carregando, setCarregando] = useState(true)
  const [supervisorId, setSupervisorId] = useState('')

  useEffect(() => {
    listarSupervisoresPdv(filial).then((lista) => {
      setSupervisores(lista)
      setCarregando(false)
    })
  }, [filial])

  const supervisorSelecionado = supervisores.find((s) => s.id === supervisorId) ?? null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-1">Agendar visita</h3>
        <p className="text-xs text-muted-foreground mb-3">
          PDV <b>{relato.codigoPdv}</b> · {relato.subgrupo}
          {relato.nivel && <> · <span className={`inline-flex px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${NIVEL_CSS[relato.nivel]}`}>{NIVEL_LABEL[relato.nivel]}</span></>}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Escolha o supervisor que vai receber o aviso por WhatsApp com o link do checklist da visita.
        </p>
        <label className="block text-xs text-muted-foreground mb-1">Supervisor</label>
        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando supervisores…</div>
        ) : supervisores.length === 0 ? (
          <p className="text-xs text-red-600 mb-3">Nenhum supervisor cadastrado pra essa filial (cadastro em TML → Supervisores).</p>
        ) : (
          <select
            value={supervisorId}
            onChange={(e) => setSupervisorId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          >
            <option value="">Selecione…</option>
            {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onFechar} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-accent">Cancelar</button>
          <button
            disabled={!supervisorSelecionado || enviando}
            onClick={() => supervisorSelecionado && onConfirmar(supervisorSelecionado)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
          >
            {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {enviando ? 'Enviando…' : 'Agendar e enviar WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}

const NIVEL_MEDIDO_CSS: Record<string, string> = {
  alto: 'bg-red-50 text-red-700 border-red-200',
  medio: 'bg-amber-50 text-amber-700 border-amber-200',
  leve: 'bg-slate-100 text-slate-700 border-slate-200',
  conforme: 'bg-green-50 text-green-700 border-green-200',
}

function FinalizacaoModal({
  relato, processando, onFechar, onAprovar, onReabrir, onNaoCritico,
}: {
  relato: RelatoLinha
  processando: boolean
  onFechar: () => void
  onAprovar: () => void
  onReabrir: () => void
  onNaoCritico: () => void
}) {
  const riscos = (relato.riscosMarcados ?? []).map((id) => RISCOS_VISITA_PDV.find((r) => r.id === id)?.label ?? id)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-1">Finalizar caso — PDV {relato.codigoPdv}</h3>
        <p className="text-xs text-muted-foreground mb-3">{relato.subgrupo}</p>

        <div className="border rounded-lg p-3 mb-3 bg-muted/20 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Nível medido na visita:</span>
            {relato.nivelMedido ? (
              <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${NIVEL_MEDIDO_CSS[relato.nivelMedido]}`}>
                {NIVEL_MEDIDO_LABEL[relato.nivelMedido]}
              </span>
            ) : <span className="text-xs">—</span>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Riscos encontrados na visita:</p>
            {riscos.length === 0 ? (
              <p className="text-xs">Nenhum — visita não encontrou risco.</p>
            ) : (
              <ul className="text-xs list-disc list-inside space-y-0.5">
                {riscos.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
          {relato.acaoRecomendada && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Ação recomendada pelo supervisor:</p>
              <p className="text-xs">{relato.acaoRecomendada}</p>
            </div>
          )}
          {relato.visitadoEm && (
            <p className="text-[11px] text-muted-foreground">Visitado em {formatarDataBR(relato.visitadoEm)}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          <b>Aprovar</b> encerra o caso e passa a avisar o motorista quando ele for pra esse PDV.{' '}
          <b>Reabrir</b> volta pra triagem com prazo novo (calculado pela criticidade medida na visita).{' '}
          <b>Não crítico</b> encerra sem avisar o motorista (exige justificativa).
        </p>

        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={onFechar} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-accent">Cancelar</button>
          <button
            disabled={processando}
            onClick={onNaoCritico}
            className="text-sm px-3 py-1.5 rounded-lg border hover:bg-accent disabled:opacity-50"
          >
            Não crítico
          </button>
          <button
            disabled={processando}
            onClick={onReabrir}
            className="text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            Reabrir
          </button>
          <button
            disabled={processando}
            onClick={onAprovar}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
          >
            {processando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Aprovar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SegurancaPdvCritico() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'painel' | 'analise' | 'lista' | 'avisos'>('painel')
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
  const [modalAgendar, setModalAgendar] = useState<RelatoLinha | null>(null)
  const [agendando, setAgendando] = useState(false)
  const [modalFinalizar, setModalFinalizar] = useState<RelatoLinha | null>(null)
  const [finalizando, setFinalizando] = useState(false)

  const [analiseLinhas, setAnaliseLinhas] = useState<LinhaAnaliseRelato[] | null>(null)
  const [nomePorMatricula, setNomePorMatricula] = useState<Map<string, string>>(new Map())
  const [carregandoAnalise, setCarregandoAnalise] = useState(false)
  const [filtroAno, setFiltroAno] = useState<number | null>(null)
  const [filtroMes, setFiltroMes] = useState<number | null>(null)

  const [avisos, setAvisos] = useState<AvisoMotoristaLinha[] | null>(null)
  const [carregandoAvisos, setCarregandoAvisos] = useState(false)

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
    const [linhas, nomes] = await Promise.all([
      carregarRelatosAnalise(usuario.filial),
      buscarNomesColaboradoresPorMatricula(),
    ])
    setAnaliseLinhas(linhas)
    setNomePorMatricula(nomes)
    setCarregandoAnalise(false)
  }, [usuario])

  const carregarAvisos = useCallback(async () => {
    if (!usuario) return
    setCarregandoAvisos(true)
    setAvisos(await listarAvisosMotoristaPdv(usuario.filial))
    setCarregandoAvisos(false)
  }, [usuario])

  useEffect(() => { carregarNiveis() }, [carregarNiveis])
  useEffect(() => { carregarRelatos() }, [carregarRelatos])
  useEffect(() => { if ((aba === 'analise' || aba === 'lista') && !analiseLinhas) carregarAnalise() }, [aba, analiseLinhas, carregarAnalise])
  useEffect(() => { if (aba === 'avisos' && !avisos) carregarAvisos() }, [aba, avisos, carregarAvisos])

  const estatisticas = useMemo(
    () => analiseLinhas ? calcularEstatisticasPdvCritico(analiseLinhas, { ano: filtroAno, mes: filtroMes }, nomePorMatricula) : null,
    [analiseLinhas, filtroAno, filtroMes, nomePorMatricula]
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

  async function handleCorrigirFechamento(id: string, novaData: string): Promise<string | null> {
    const { error } = await corrigirDataFechamento(id, novaData)
    if (error) return error
    setAnaliseLinhas(null)
    return null
  }

  async function handleAgendar(supervisor: SupervisorPdv) {
    if (!usuario || !modalAgendar) return
    setAgendando(true)
    setErro('')
    const r = await agendarVisita(
      {
        id: modalAgendar.id, codigoPdv: modalAgendar.codigoPdv, subgrupo: modalAgendar.subgrupo,
        nivel: modalAgendar.nivel, prazoVisita: modalAgendar.prazoVisita, instrucaoRegistrada: modalAgendar.instrucaoRegistrada,
      },
      supervisor,
      usuario.nome ?? usuario.login
    )
    setAgendando(false)
    if (r.error) { setErro(r.error); return }
    setModalAgendar(null)
    if (r.whatsappEnviado === false) {
      setErro(`Visita agendada, mas o WhatsApp pro supervisor não saiu: ${r.whatsappErro ?? 'erro desconhecido'}. Avise por outro meio.`)
    }
    await carregarRelatos()
  }

  async function handleAprovar() {
    if (!usuario || !modalFinalizar) return
    setFinalizando(true)
    setErro('')
    const { error } = await aprovarCaso(modalFinalizar.id, usuario.nome ?? usuario.login)
    setFinalizando(false)
    if (error) { setErro(error); return }
    setModalFinalizar(null)
    await carregarRelatos()
  }

  async function handleReabrir() {
    if (!usuario || !modalFinalizar) return
    setFinalizando(true)
    setErro('')
    const { error } = await reabrirCaso(modalFinalizar.id, usuario.nome ?? usuario.login)
    setFinalizando(false)
    if (error) { setErro(error); return }
    setModalFinalizar(null)
    await carregarRelatos()
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
          { valor: 'lista' as const, label: 'Lista completa' },
          { valor: 'avisos' as const, label: 'Avisos ao motorista' },
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
          onCorrigirFechamento={handleCorrigirFechamento}
        />
      ) : aba === 'lista' ? (
        <ListaCompletaTab
          linhas={analiseLinhas}
          carregando={carregandoAnalise}
          nomePorMatricula={nomePorMatricula}
        />
      ) : aba === 'avisos' ? (
        <AvisosMotoristaTab avisos={avisos} carregando={carregandoAvisos} />
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
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Instrução registrada</th>
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
                    <td className="px-3 py-2 max-w-[220px]">{r.instrucaoRegistrada || <span className="text-muted-foreground">—</span>}</td>
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
                          <button onClick={() => setModalAgendar(r)} className="text-[11px] font-semibold px-2 py-1 rounded-md border hover:bg-accent whitespace-nowrap">
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
                      {r.status === 'preenchido' && (
                        <button onClick={() => setModalFinalizar(r)} className="text-[11px] font-semibold px-2 py-1 rounded-md border hover:bg-accent whitespace-nowrap">
                          Finalizar
                        </button>
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
      {modalAgendar && usuario && (
        <AgendarModal
          relato={modalAgendar}
          filial={usuario.filial}
          enviando={agendando}
          onFechar={() => setModalAgendar(null)}
          onConfirmar={handleAgendar}
        />
      )}
      {modalFinalizar && (
        <FinalizacaoModal
          relato={modalFinalizar}
          processando={finalizando}
          onFechar={() => setModalFinalizar(null)}
          onAprovar={handleAprovar}
          onReabrir={handleReabrir}
          onNaoCritico={() => { const id = modalFinalizar.id; setModalFinalizar(null); setModalNaoCritico(id) }}
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
  estatisticas, carregando, filtroAno, filtroMes, onFiltroAno, onFiltroMes, onCorrigirFechamento,
}: {
  estatisticas: EstatisticasPdvCritico | null
  carregando: boolean
  filtroAno: number | null
  filtroMes: number | null
  onFiltroAno: (ano: number | null) => void
  onFiltroMes: (mes: number | null) => void
  onCorrigirFechamento: (id: string, novaData: string) => Promise<string | null>
}) {
  const [edicaoId, setEdicaoId] = useState<string | null>(null)
  const [edicaoData, setEdicaoData] = useState('')
  const [edicaoSalvando, setEdicaoSalvando] = useState(false)
  const [edicaoErro, setEdicaoErro] = useState('')

  async function salvarCorrecao(id: string) {
    if (!edicaoData) return
    setEdicaoSalvando(true)
    setEdicaoErro('')
    const erro = await onCorrigirFechamento(id, edicaoData)
    setEdicaoSalvando(false)
    if (erro) { setEdicaoErro(erro); return }
    setEdicaoId(null)
  }
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

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Relatos por dia da semana</h3>
          <div className="space-y-1.5">
            {estatisticas.relatosPorDiaSemana.map((d) => (
              <BarraHorizontal key={d.diaSemana} label={d.diaSemana} total={d.total} max={maxDiaSemana} />
            ))}
          </div>
        </div>

        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Funil operacional (status atual)</h3>
          {estatisticas.funil.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum relato no período.</p>
          ) : (
            <div className="space-y-1.5">
              {estatisticas.funil.map((f) => (
                <BarraHorizontal
                  key={f.status}
                  label={STATUS_LABEL[f.status as keyof typeof STATUS_LABEL] ?? f.status}
                  total={f.total}
                  max={Math.max(1, ...estatisticas.funil.map((x) => x.total))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border rounded-xl bg-white p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Trophy className="h-4 w-4 text-primary" /> PDVs recorrentes</h3>
        {estatisticas.pdvsRecorrentes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum relato no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5 pr-3">PDV</th>
                  <th className="py-1.5 pr-3 text-right">Relatos</th>
                  <th className="py-1.5 pr-3 text-right">Reincidências</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {estatisticas.pdvsRecorrentes.map((p) => (
                  <tr key={p.codigoPdv}>
                    <td className="py-1.5 pr-3 font-medium tabular-nums">{p.codigoPdv}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{p.total}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{p.reincidencias > 0 ? <span className="text-red-600 font-semibold">{p.reincidencias}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Criticidade × % no prazo</h3>
          {estatisticas.porCriticidade.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum caso fechado no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3">Nível</th>
                    <th className="py-1.5 pr-3 text-right">Fechados</th>
                    <th className="py-1.5 pr-3 text-right">% no prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estatisticas.porCriticidade.map((c) => (
                    <tr key={c.nivel}>
                      <td className="py-1.5 pr-3 font-medium">{NIVEL_LABEL[c.nivel as NivelCriticidade] ?? 'Sem nível'}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{c.total}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{(c.noPrazo + c.foraPrazo) > 0 ? `${c.pctNoPrazo}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {estatisticas.tempoMedioFechamentoDias != null
              ? `Tempo médio de fechamento: ${estatisticas.tempoMedioFechamentoDias} dia(s) (relato → fechamento).`
              : 'Sem dados suficientes pra calcular tempo médio de fechamento.'}
          </p>
        </div>

        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Reincidência por mês</h3>
          {estatisticas.reincidenciaPorMes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum relato no período.</p>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3">Mês</th>
                    <th className="py-1.5 pr-3 text-right">Relatos</th>
                    <th className="py-1.5 pr-3 text-right">Reincidentes</th>
                    <th className="py-1.5 pr-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estatisticas.reincidenciaPorMes.map((r) => (
                    <tr key={r.mes}>
                      <td className="py-1.5 pr-3 font-medium">{r.mes}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.total}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.reincidentes}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{r.pctReincidencia}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> Top motoristas que relatam</h3>
          {estatisticas.topMotoristas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum relato com matrícula no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3">Motorista</th>
                    <th className="py-1.5 pr-3 text-right">Relatos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estatisticas.topMotoristas.map((m) => (
                    <tr key={m.matricula}>
                      <td className="py-1.5 pr-3">{m.nome}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border rounded-xl bg-white p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-primary" /> Motivos de "Não crítico" ({estatisticas.totalNaoCritico})</h3>
          {estatisticas.motivosNaoCritico.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum caso marcado não crítico no período.</p>
          ) : (
            <div className="space-y-1.5">
              {estatisticas.motivosNaoCritico.map((mo) => (
                <BarraHorizontal
                  key={mo.justificativa}
                  label={mo.justificativa}
                  total={mo.total}
                  max={Math.max(1, ...estatisticas.motivosNaoCritico.map((x) => x.total))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border rounded-xl bg-white p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-red-600" /> Fora do prazo no período ({estatisticas.fechadosForaPrazo})
        </h3>
        {estatisticas.casosForaPrazo.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum caso fora do prazo no período filtrado.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5 pr-3">PDV</th>
                  <th className="py-1.5 pr-3">Subgrupo</th>
                  <th className="py-1.5 pr-3">Nível</th>
                  <th className="py-1.5 pr-3">Relato</th>
                  <th className="py-1.5 pr-3">Prazo</th>
                  <th className="py-1.5 pr-3">Fechou</th>
                  <th className="py-1.5 pr-3 text-right">Dias de atraso</th>
                  <th className="py-1.5 pr-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {estatisticas.casosForaPrazo.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5 pr-3 font-medium tabular-nums">{c.codigoPdv}</td>
                    <td className="py-1.5 pr-3 max-w-[200px] truncate" title={c.subgrupo}>{c.subgrupo}</td>
                    <td className="py-1.5 pr-3">{c.nivel ? (NIVEL_LABEL[c.nivel as NivelCriticidade] ?? c.nivel) : '—'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatarDataBR(c.dataRelato)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatarDataBR(c.prazoOrigem)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {edicaoId === c.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={edicaoData}
                            max={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => setEdicaoData(e.target.value)}
                            className="border rounded px-1.5 py-0.5 text-xs"
                          />
                          <button
                            disabled={!edicaoData || edicaoSalvando}
                            onClick={() => salvarCorrecao(c.id)}
                            className="text-[11px] font-semibold text-green-700 hover:underline disabled:opacity-50"
                          >
                            {edicaoSalvando ? '…' : 'Salvar'}
                          </button>
                          <button onClick={() => setEdicaoId(null)} className="text-[11px] text-muted-foreground hover:underline">Cancelar</button>
                        </div>
                      ) : formatarDataBR(c.finalizadoEm)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-red-600">{c.diasAtraso != null ? `+${c.diasAtraso}d` : '—'}</td>
                    <td className="py-1.5 pr-3">
                      {edicaoId !== c.id && (
                        <button
                          onClick={() => { setEdicaoId(c.id); setEdicaoData(c.finalizadoEm ?? ''); setEdicaoErro('') }}
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline whitespace-nowrap"
                        >
                          Corrigir data
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {edicaoErro && <p className="text-xs text-red-600 px-3 py-2">{edicaoErro}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function normalizarMatriculaLista(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}

const PAGINA_LISTA = 50

function ListaCompletaTab({
  linhas, carregando, nomePorMatricula,
}: {
  linhas: LinhaAnaliseRelato[] | null
  carregando: boolean
  nomePorMatricula: Map<string, string>
}) {
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [pagina, setPagina] = useState(1)

  const filtradas = useMemo(() => {
    if (!linhas) return []
    const buscaNorm = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (statusFiltro && l.status !== statusFiltro) return false
      if (!buscaNorm) return true
      return l.codigoPdv.toLowerCase().includes(buscaNorm) || l.subgrupo.toLowerCase().includes(buscaNorm)
    })
  }, [linhas, busca, statusFiltro])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGINA_LISTA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const pagina0 = (paginaAtual - 1) * PAGINA_LISTA
  const visiveis = filtradas.slice(pagina0, pagina0 + PAGINA_LISTA)

  const statusOptions = useMemo(() => [...new Set((linhas ?? []).map((l) => l.status))].sort(), [linhas])

  if (carregando || !linhas) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-muted-foreground mb-1">Buscar por PDV ou subgrupo</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
              placeholder="Ex.: 279861 ou rampa"
              className="w-full border rounded-md pl-8 pr-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select
            value={statusFiltro}
            onChange={(e) => { setStatusFiltro(e.target.value); setPagina(1) }}
            className="border rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s}</option>)}
          </select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtradas.length} relato(s) no filtro</span>
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 px-3">PDV</th>
              <th className="py-2 px-3">Subgrupo</th>
              <th className="py-2 px-3">Nível</th>
              <th className="py-2 px-3">Relato do motorista</th>
              <th className="py-2 px-3">Instrução registrada</th>
              <th className="py-2 px-3">Status BEES</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Motorista</th>
              <th className="py-2 px-3">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visiveis.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum relato no filtro.</td></tr>
            ) : visiveis.map((l, i) => {
              const matricula = l.codigoMotorista ? normalizarMatriculaLista(l.codigoMotorista) : null
              const nomeMotorista = matricula ? nomePorMatricula.get(matricula) : null
              return (
                <tr key={`${l.codigoPdv}-${l.subgrupo}-${l.dataRelato}-${i}`} className="hover:bg-slate-50 align-top">
                  <td className="py-2 px-3 font-semibold tabular-nums whitespace-nowrap">{l.codigoPdv}</td>
                  <td className="py-2 px-3 max-w-[160px]">{l.subgrupo}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{l.nivel ? (NIVEL_LABEL[l.nivel] ?? l.nivel) : '—'}</td>
                  <td className="py-2 px-3 max-w-[220px]">{l.relatoMotorista || '—'}</td>
                  <td className="py-2 px-3 max-w-[220px]">{l.instrucaoRegistrada || '—'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{l.origemStatus || '—'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{STATUS_LABEL[l.status as keyof typeof STATUS_LABEL] ?? l.status}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {matricula ? (nomeMotorista || `Matrícula ${matricula} (sem nome cadastrado)`) : '—'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{formatarDataBR(l.dataRelato)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtradas.length > PAGINA_LISTA && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={paginaAtual <= 1}
            className="flex items-center gap-1 px-2 py-1 rounded-md border disabled:opacity-40 hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-xs text-muted-foreground">Página {paginaAtual} de {totalPaginas}</span>
          <button
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaAtual >= totalPaginas}
            className="flex items-center gap-1 px-2 py-1 rounded-md border disabled:opacity-40 hover:bg-accent"
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function AvisosMotoristaTab({ avisos, carregando }: { avisos: AvisoMotoristaLinha[] | null; carregando: boolean }) {
  if (carregando || !avisos) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
  }
  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-white p-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Bell className="h-4 w-4 text-primary" /> Avisos enviados aos motoristas
          <span
            className="cursor-help"
            title={
              'Histórico de todo aviso de "PDV crítico na rota" já mandado por WhatsApp — dispara automaticamente a cada ' +
              'import do BEES em Jornada e Tempo em Rota, para quem tem no mapa do dia um PDV com caso aprovado. Um ' +
              'motorista só recebe uma vez por PDV por dia, mesmo reimportando o BEES várias vezes.'
            }
          >
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </h2>
      </div>
      <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 px-3">Data</th>
              <th className="py-2 px-3">Motorista</th>
              <th className="py-2 px-3">PDV</th>
              <th className="py-2 px-3">Motivo</th>
              <th className="py-2 px-3">Enviado em</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {avisos.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum aviso enviado ainda.</td></tr>
            ) : avisos.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="py-2 px-3 whitespace-nowrap">{formatarDataBR(a.data)}</td>
                <td className="py-2 px-3 whitespace-nowrap">{a.nomeMotorista}</td>
                <td className="py-2 px-3 font-semibold tabular-nums">{a.codigoPdv}</td>
                <td className="py-2 px-3 max-w-[260px]">{a.subgrupo ?? '—'}</td>
                <td className="py-2 px-3 whitespace-nowrap">{formatarDataBR(a.enviadoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
