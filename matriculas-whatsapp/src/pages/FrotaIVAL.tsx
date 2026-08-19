import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownUp, ArrowLeft, Building2, Loader2, Upload, Wrench, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  buscarTrocasPlacaArmazem, salvarMotivoTroca, rankingPlacas, trocasPorMes, MOTIVOS_TROCA_PLACA,
  type TrocaPlaca, type MotivoTrocaPlaca,
} from '../lib/trocaPlacaManutenco'
import { parseOsAtendimentoBuffer } from '../lib/tmlParser'
import {
  importarOsAtendimento, buscarOsAtendimento, abertaDuranteCarregamento, osAtendimentoPorMes,
  type OsAtendimento,
} from '../lib/frotaOsAtendimento'

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
function rotuloMes(mesISO: string): string {
  const [ano, mes] = mesISO.split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`
}

function labelMotivo(motivo: MotivoTrocaPlaca): string {
  return MOTIVOS_TROCA_PLACA.find((m) => m.value === motivo)?.label ?? motivo
}

function PillMotivo({ motivo }: { motivo: MotivoTrocaPlaca | null }) {
  if (!motivo) return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-current" />Sem motivo</span>
  if (motivo === 'MANUTENCAO') return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-current" />Manutenção</span>
  return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700"><span className="h-1.5 w-1.5 rounded-full bg-current" />{labelMotivo(motivo)}</span>
}

function ModalMotivo({
  troca, onFechar, onSalvo, salvando, salvar,
}: {
  troca: TrocaPlaca
  onFechar: () => void
  onSalvo: (t: TrocaPlaca) => void
  salvando: boolean
  salvar: (mapa: number, motivo: MotivoTrocaPlaca, osNumero: string | null, osDescricao: string | null) => Promise<void>
}) {
  const [motivo, setMotivo] = useState<MotivoTrocaPlaca>(troca.motivo ?? 'MANUTENCAO')
  const [osNumero, setOsNumero] = useState(troca.osNumero ?? '')
  const [osDescricao, setOsDescricao] = useState(troca.osDescricao ?? '')

  async function handleSalvar() {
    await salvar(troca.mapa, motivo, osNumero.trim() || null, osDescricao.trim() || null)
    onSalvo({ ...troca, motivo, osNumero: osNumero.trim() || null, osDescricao: osDescricao.trim() || null })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-50" onClick={onFechar}>
      <div className="bg-white border rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3.5 border-b flex items-start justify-between">
          <div>
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Mapa {troca.mapa} · {formatarDataBR(troca.data)}</div>
            <h2 className="text-base font-bold">Classificar motivo da troca</h2>
            <div className="flex items-center gap-2 mt-2.5 text-xs text-muted-foreground">
              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-bold">{troca.placaGerado}</code>
              <span>→</span>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-bold">{troca.placaCarregado}</code>
            </div>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Motivo da troca</label>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_TROCA_PLACA.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMotivo(opt.value)}
                  className={`flex items-center gap-2 border-[1.5px] rounded-lg px-3 py-2.5 text-xs font-semibold text-left transition-colors ${motivo === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  <span className={`h-3.5 w-3.5 rounded-full border-[1.5px] flex-shrink-0 relative ${motivo === opt.value ? 'border-brand-500' : 'border-gray-300'}`}>
                    {motivo === opt.value && <span className="absolute inset-[3px] rounded-full bg-brand-500" />}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {motivo === 'MANUTENCAO' && (
            <div className="border-[1.5px] border-dashed border-gray-300 bg-gray-50 rounded-lg p-3.5 space-y-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">OS (opcional — nem toda manutenção abre OS)</p>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Nº da OS</label>
                <input
                  type="text"
                  value={osNumero}
                  onChange={(e) => setOsNumero(e.target.value)}
                  placeholder="Ex.: 88213"
                  className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Descrição da OS</label>
                <textarea
                  value={osDescricao}
                  onChange={(e) => setOsDescricao(e.target.value)}
                  placeholder="Ex.: Pneu dianteiro furado — troca de veículo antes da saída"
                  className="w-full text-sm border rounded-lg px-3 py-2 min-h-[64px] resize-none focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-4 pt-1 flex justify-end gap-2">
          <button onClick={onFechar} className="text-xs font-semibold px-3.5 py-2 rounded-lg border hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-60 flex items-center gap-1.5"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

type Aba = 'trocas' | 'ranking' | 'mensal' | 'os'

function OsCarregamentoTab({
  osList, osMensal, carregando, importando, erro, inputRef, onImportar,
}: {
  osList: OsAtendimento[]
  osMensal: { mes: string; total: number }[]
  carregando: boolean
  importando: boolean
  erro: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onImportar: (file: File) => void
}) {
  const diasUnicos = new Set(osList.filter((o) => o.dataAbertura).map((o) => o.dataAbertura)).size

  return (
    <div className="space-y-4">
      <div className="border rounded-xl bg-white p-4">
        <h3 className="text-sm font-semibold">Importar relatório de OS (OS_ATENDIMENTO)</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">Reimportar atualiza as OS que já existem (pelo número da OS).</p>
        <div
          className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/40 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {importando ? <Loader2 className="h-7 w-7 mx-auto mb-1.5 animate-spin text-brand-500" /> : <Upload className="h-7 w-7 mx-auto mb-1.5 text-muted-foreground" />}
          <p className="text-sm font-medium">{importando ? 'Processando...' : 'Clique para importar (.csv / .xlsx)'}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportar(f); if (inputRef.current) inputRef.current.value = '' }}
        />
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

      {carregando ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={22} className="animate-spin mr-2" /> Carregando OS...
        </div>
      ) : osList.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wrench size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma OS aberta no período de carregamento (22h-06h) encontrada. Importe o relatório acima.</p>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">OS abertas no carregamento</p>
              <p className="text-2xl font-bold text-brand-700">{osList.length}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Período</p>
              <p className="text-sm font-semibold">{formatarDataBR(osList[0]?.dataAbertura)} a {formatarDataBR(osList[osList.length - 1]?.dataAbertura)}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Dias únicos</p>
              <p className="text-2xl font-bold text-brand-700">{diasUnicos}</p>
            </div>
          </div>

          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-gray-50 text-sm font-semibold">Acumulado mês a mês</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Mês</th>
                    <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">OS no carregamento</th>
                  </tr>
                </thead>
                <tbody>
                  {osMensal.map((m, i) => (
                    <tr key={m.mes} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">{rotuloMes(m.mes)}</td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums">{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Abertura</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">OS</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Placa</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Motivo</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Quem abriu</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Tipo OS</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Status</th>
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Fornecedor</th>
                  </tr>
                </thead>
                <tbody>
                  {osList.map((o, i) => (
                    <tr key={o.os} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatarDataBR(o.dataAbertura)} {o.horaAbertura ?? ''}</td>
                      <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">{o.os}</td>
                      <td className="px-4 py-2 whitespace-nowrap"><code className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{o.placa ?? '—'}</code></td>
                      <td className="px-4 py-2 whitespace-nowrap">{o.problema ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{o.usuarioCriacao ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{o.tipoOs ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{o.statusOs ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{o.fornecedor ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function FrotaIVAL() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<Aba>('trocas')
  const [trocas, setTrocas] = useState<TrocaPlaca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [trocaSelecionada, setTrocaSelecionada] = useState<TrocaPlaca | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Filtros aplicados às três abas de trocas.
  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [filtroMotivo, setFiltroMotivo] = useState<MotivoTrocaPlaca | 'SEM_MOTIVO' | ''>('')
  const [filtroMes, setFiltroMes] = useState('')

  // OS abertas durante o carregamento.
  const [osList, setOsList] = useState<OsAtendimento[]>([])
  const [carregandoOs, setCarregandoOs] = useState(false)
  const [importandoOs, setImportandoOs] = useState(false)
  const [erroOs, setErroOs] = useState('')
  const osInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!usuario) return
    setCarregando(true)
    setErro('')
    buscarTrocasPlacaArmazem(usuario.filial)
      .then(setTrocas)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar trocas de placa.'))
      .finally(() => setCarregando(false))
  }, [usuario])

  const carregarOs = useMemo(() => async () => {
    if (!usuario) return
    setCarregandoOs(true)
    setErroOs('')
    try {
      setOsList(await buscarOsAtendimento(usuario.filial))
    } catch (err) {
      setErroOs(err instanceof Error ? err.message : 'Erro ao carregar OS.')
    } finally {
      setCarregandoOs(false)
    }
  }, [usuario])

  useEffect(() => {
    if (aba === 'os' && osList.length === 0) carregarOs()
  }, [aba, carregarOs, osList.length])

  async function handleImportarOs(file: File) {
    if (!usuario) return
    setImportandoOs(true)
    setErroOs('')
    try {
      const buffer = await file.arrayBuffer()
      const registros = parseOsAtendimentoBuffer(buffer)
      if (registros.length === 0) {
        alert('Nenhuma OS encontrada na planilha.')
        return
      }
      const total = await importarOsAtendimento(usuario.filial, registros)
      await carregarOs()
      alert(`${total} OS importada(s)/atualizada(s).`)
    } catch (err) {
      setErroOs(err instanceof Error ? err.message : 'Erro ao importar OS.')
    } finally {
      setImportandoOs(false)
    }
  }

  const osCarregamento = useMemo(() => osList.filter((o) => abertaDuranteCarregamento(o.horaAbertura)), [osList])
  const osMensal = useMemo(() => osAtendimentoPorMes(osCarregamento), [osCarregamento])

  const placasConhecidas = useMemo(() => {
    const set = new Set<string>()
    for (const t of trocas) { set.add(t.placaGerado); set.add(t.placaCarregado) }
    return [...set].sort()
  }, [trocas])

  const mesesConhecidos = useMemo(() => {
    const set = new Set<string>()
    for (const t of trocas) set.add(t.data.slice(0, 7))
    return [...set].sort()
  }, [trocas])

  const trocasFiltradas = useMemo(() => {
    return trocas.filter((t) => {
      if (filtroPlaca && t.placaGerado !== filtroPlaca && t.placaCarregado !== filtroPlaca) return false
      if (filtroMotivo === 'SEM_MOTIVO' && t.motivo) return false
      if (filtroMotivo && filtroMotivo !== 'SEM_MOTIVO' && t.motivo !== filtroMotivo) return false
      if (filtroMes && t.data.slice(0, 7) !== filtroMes) return false
      return true
    })
  }, [trocas, filtroPlaca, filtroMotivo, filtroMes])

  const semMotivo = useMemo(() => trocasFiltradas.filter((t) => !t.motivo).length, [trocasFiltradas])
  const comManutencao = useMemo(() => trocasFiltradas.filter((t) => t.motivo === 'MANUTENCAO').length, [trocasFiltradas])
  const outros = useMemo(() => trocasFiltradas.filter((t) => t.motivo && t.motivo !== 'MANUTENCAO').length, [trocasFiltradas])

  const ranking = useMemo(() => rankingPlacas(trocasFiltradas), [trocasFiltradas])
  const mensal = useMemo(() => trocasPorMes(trocasFiltradas), [trocasFiltradas])

  async function salvar(mapa: number, motivo: MotivoTrocaPlaca, osNumero: string | null, osDescricao: string | null) {
    if (!usuario) return
    setSalvando(true)
    try {
      await salvarMotivoTroca(usuario.filial, mapa, motivo, osNumero, osDescricao, usuario.nome ?? usuario.login)
    } finally {
      setSalvando(false)
    }
  }

  function handleSalvo(atualizada: TrocaPlaca) {
    setTrocas((ts) => ts.map((t) => (t.mapa === atualizada.mapa ? atualizada : t)))
    setTrocaSelecionada(null)
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/frota" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            IV - AL
            <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Apoio Logístico</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            {usuario && <><Building2 size={12} /> {usuario.filial} ·</>} Trocas de placa por manutenção no carregamento (fase Gerado → Carregado do 03.11.20)
          </p>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2 mb-4"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1 border-b">
            <button onClick={() => setAba('trocas')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'trocas' ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Trocas</button>
            <button onClick={() => setAba('ranking')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'ranking' ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Ranking de Placas</button>
            <button onClick={() => setAba('mensal')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'mensal' ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Mês a Mês</button>
            <button onClick={() => setAba('os')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${aba === 'os' ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Wrench className="h-3.5 w-3.5" />OS no Carregamento</button>
          </div>

          {aba === 'os' ? (
            <OsCarregamentoTab
              osList={osCarregamento}
              osMensal={osMensal}
              carregando={carregandoOs}
              importando={importandoOs}
              erro={erroOs}
              inputRef={osInputRef}
              onImportar={handleImportarOs}
            />
          ) : trocas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ArrowDownUp size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma troca de placa encontrada.</p>
            </div>
          ) : (
          <>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Placa</label>
              <select value={filtroPlaca} onChange={(e) => setFiltroPlaca(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 min-w-[140px]">
                <option value="">Todas</option>
                {placasConhecidas.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Motivo</label>
              <select value={filtroMotivo} onChange={(e) => setFiltroMotivo(e.target.value as MotivoTrocaPlaca | 'SEM_MOTIVO' | '')} className="text-sm border rounded-lg px-3 py-1.5 min-w-[160px]">
                <option value="">Todos</option>
                <option value="SEM_MOTIVO">Sem motivo</option>
                {MOTIVOS_TROCA_PLACA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Mês</label>
              <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 min-w-[120px]">
                <option value="">Todos</option>
                {mesesConhecidos.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
              </select>
            </div>
            {(filtroPlaca || filtroMotivo || filtroMes) && (
              <button onClick={() => { setFiltroPlaca(''); setFiltroMotivo(''); setFiltroMes('') }} className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1.5">Limpar filtros</button>
            )}
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Total no período</p>
              <p className="text-2xl font-bold text-brand-700">{trocasFiltradas.length}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Sem motivo classificado</p>
              <p className="text-2xl font-bold text-amber-700">{semMotivo}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Manutenção</p>
              <p className="text-2xl font-bold text-red-700">{comManutencao}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Outro motivo</p>
              <p className="text-2xl font-bold text-gray-900">{outros}</p>
            </div>
          </div>

          {aba === 'trocas' ? (
            <div className="border rounded-xl bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Data</th>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Mapa</th>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Placa Gerado → Carregado</th>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Motivo</th>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">OS</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trocasFiltradas.map((troca, i) => (
                      <tr key={troca.mapa} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatarDataBR(troca.data)}</td>
                        <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">{troca.mapa}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{troca.placaGerado}</code>
                          <span className="text-muted-foreground mx-1.5">→</span>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{troca.placaCarregado}</code>
                        </td>
                        <td className="px-4 py-2"><PillMotivo motivo={troca.motivo} /></td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{troca.osNumero ? `OS ${troca.osNumero}` : '—'}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setTrocaSelecionada(troca)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                          >
                            {troca.motivo ? 'Editar' : 'Classificar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {trocasFiltradas.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma troca com esse filtro.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : aba === 'ranking' ? (
            <div className="border rounded-xl bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Placa</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Total</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Manutenção</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Ajuste de Fixação</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Mudança de Perfil</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Outro</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Sem motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.placa} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2 whitespace-nowrap"><code className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{r.placa}</code></td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums">{r.total}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-700">{r.porMotivo.MANUTENCAO || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.porMotivo.AJUSTE_FIXACAO || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.porMotivo.MUDANCA_PERFIL || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.porMotivo.OUTRO || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-700">{r.semMotivo || '—'}</td>
                      </tr>
                    ))}
                    {ranking.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhuma troca com esse filtro.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border rounded-xl bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Mês</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Total</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Manutenção</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Ajuste de Fixação</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Mudança de Perfil</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Outro</th>
                      <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Sem motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mensal.map((m, i) => (
                      <tr key={m.mes} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">{rotuloMes(m.mes)}</td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums">{m.total}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-700">{m.porMotivo.MANUTENCAO || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.porMotivo.AJUSTE_FIXACAO || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.porMotivo.MUDANCA_PERFIL || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m.porMotivo.OUTRO || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-700">{m.semMotivo || '—'}</td>
                      </tr>
                    ))}
                    {mensal.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhuma troca com esse filtro.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {trocaSelecionada && (
        <ModalMotivo
          troca={trocaSelecionada}
          onFechar={() => setTrocaSelecionada(null)}
          onSalvo={handleSalvo}
          salvando={salvando}
          salvar={salvar}
        />
      )}
    </div>
  )
}
