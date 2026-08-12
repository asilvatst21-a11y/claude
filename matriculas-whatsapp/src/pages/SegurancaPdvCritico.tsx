import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Upload, Loader2, ShieldAlert, Settings2, ChevronDown } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  listarNiveisSubgrupo, salvarNivelSubgrupo, semearNiveisPadrao,
  importarRelatosPdv, listarRelatos, marcarNaoCritico,
  NIVEL_LABEL, STATUS_LABEL, PRAZO_DIAS,
  type NivelSubgrupo, type NivelCriticidade, type RelatoLinha, type ResultadoImportRelatos,
} from '../lib/pdvSeguranca'

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

export default function SegurancaPdvCritico() {
  const { usuario } = useAuth()
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

  useEffect(() => { carregarNiveis() }, [carregarNiveis])
  useEffect(() => { carregarRelatos() }, [carregarRelatos])

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
        `✅ ${r.seguranca} relato(s) de Segurança importado(s)` +
        (r.reincidencias ? ` (${r.reincidencias} reincidência(s) — criticidade escalada automaticamente)` : '') +
        `. ${r.outrasAreas} de outras áreas ignorado(s) (não entram nesse fluxo). ` +
        `${r.jaExistiam} já existiam (Status BEES atualizado quando mudou; resto do caso preservado). ` +
        (r.canceladosNaOrigem ? `${r.canceladosNaOrigem} novo(s) já cancelado(s) na origem, ignorado(s). ` : '') +
        (r.semData ? `${r.semData} sem data reconhecida, ignorado(s).` : '')
      )
      await carregarRelatos()
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
              accept=".xlsx,.xls"
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
    </div>
  )
}
