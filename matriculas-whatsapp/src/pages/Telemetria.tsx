import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import {
  Upload, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Car, User, MapPin, Clock, Plus, X, AlertTriangle, Zap, TrendingUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { TelemetriaAlerta, TelemetriaAcao } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  CURVA_BRUSCA: 'Curva Brusca',
  FREADA_BRUSCA: 'Freada Brusca',
  EXCESSO_VELOCIDADE: 'Exc. Velocidade',
  EXCESSO_VELOCIDADE_POR_VIA: 'Exc. Veloc. por Via',
}

const TIPO_COR: Record<string, string> = {
  CURVA_BRUSCA: 'bg-orange-100 text-orange-800 border-orange-300',
  FREADA_BRUSCA: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  EXCESSO_VELOCIDADE: 'bg-rose-100 text-rose-700 border-rose-300',
  EXCESSO_VELOCIDADE_POR_VIA: 'bg-red-100 text-red-700 border-red-300',
}

const TIPO_HEX: Record<string, string> = {
  CURVA_BRUSCA: '#f97316',
  FREADA_BRUSCA: '#eab308',
  EXCESSO_VELOCIDADE: '#f43f5e',
  EXCESSO_VELOCIDADE_POR_VIA: '#ef4444',
}

const NIVEL_COR: Record<string, string> = {
  BAIXO: 'bg-green-100 text-green-700',
  MEDIO: 'bg-yellow-100 text-yellow-800',
  ALTO: 'bg-red-100 text-red-700',
  'N/A': 'bg-gray-100 text-gray-500',
}

const COR_ACAO: Record<string, string> = {
  'Advertência':          'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Suspensão':            'bg-red-100 text-red-700 border-red-300',
  'Comunicado/Orientação': 'bg-blue-100 text-blue-700 border-blue-300',
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TIPOS_LISTA = ['CURVA_BRUSCA', 'FREADA_BRUSCA', 'EXCESSO_VELOCIDADE', 'EXCESSO_VELOCIDADE_POR_VIA'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseKmh(val: string | null | undefined): number | null {
  if (!val) return null
  const m = val.match(/(\d+(?:\.\d+)?)\s*Km\/h/i)
  return m ? parseFloat(m[1]) : null
}

function parseDuracao(val: string | null | undefined): number {
  if (!val || val.trim() === '-') return 0
  const parts = val.trim().split(':')
  if (parts.length !== 3) return 0
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
}

function qualificaAcao(
  tipo: string,
  excesso_km: number | null,
  limiar_km: number | null,
  duracao_seg: number,
): boolean {
  if (tipo === 'CURVA_BRUSCA' || tipo === 'FREADA_BRUSCA' || tipo === 'EXCESSO_VELOCIDADE') return true
  if (tipo === 'EXCESSO_VELOCIDADE_POR_VIA') {
    return (
      excesso_km !== null && limiar_km !== null &&
      excesso_km > 50 &&
      excesso_km >= limiar_km * 1.05 &&
      duracao_seg >= 20
    )
  }
  return false
}

function normVal(v: string): string {
  const t = v.trim()
  return t === '-' || t === '' ? '' : t
}

function semId(motorista: string | null): boolean {
  if (!motorista) return true
  const lc = motorista.toLowerCase()
  return lc.includes('sem identifica') || lc === '-' || lc === ''
}

function motoristaEfetivo(a: TelemetriaAlerta): string {
  return a.motorista_identificado?.trim() || a.motorista || 'Sem Identificação'
}

async function parseCsv(file: File): Promise<Omit<TelemetriaAlerta, 'id' | 'filial' | 'created_at' | 'motorista_identificado'>[]> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) { resolve([]); return }

      const results: Omit<TelemetriaAlerta, 'id' | 'filial' | 'created_at' | 'motorista_identificado'>[] = []

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';')
        if (cols.length < 22) continue

        const get = (idx: number) => normVal(cols[idx] ?? '')

        const placa   = get(0)
        const prefixo = get(1)
        const motorista = get(3)
        const cpf     = get(4)
        const uo      = get(6)
        const tipo    = get(7)
        const nivel   = get(8)
        const limiarRaw  = get(10)
        const excessoRaw = get(11)
        const duracaoRaw = get(12)
        const pontoRef   = get(13)
        const categoria  = get(14)
        const logradouro = get(16)
        const cidade     = get(17)
        const estado     = get(18)
        const latStr     = get(19)
        const lonStr     = get(20)
        const dataStr    = get(21)  // DD/MM/YYYY
        const horaStr    = get(22)  // HH:MM:SS
        const status     = get(23)
        const integrador = get(29)
        const alertaDesc = get(30)

        if (!placa || !tipo) continue

        const limiarKm  = parseKmh(limiarRaw)
        const excessoKm = parseKmh(excessoRaw)
        const duracaoSeg = parseDuracao(duracaoRaw)

        let dataHora: string | null = null
        if (dataStr && horaStr) {
          const [d, m, y] = dataStr.split('/')
          if (d && m && y) {
            dataHora = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${horaStr}`
          }
        }

        const lat = parseFloat(latStr)
        const lon = parseFloat(lonStr)

        results.push({
          placa,
          prefixo:  prefixo || null,
          motorista: motorista || null,
          cpf:      cpf || null,
          uo:       uo || null,
          tipo,
          nivel:    nivel || null,
          limiar_raw:  limiarRaw || null,
          excesso_raw: excessoRaw || null,
          limiar_km:   limiarKm,
          excesso_km:  excessoKm,
          duracao_seg: duracaoSeg,
          ponto_referencia: pontoRef || null,
          categoria:   categoria || null,
          logradouro:  logradouro || null,
          cidade:      cidade || null,
          estado:      estado || null,
          latitude:    isNaN(lat) ? null : lat,
          longitude:   isNaN(lon) ? null : lon,
          data_hora:   dataHora,
          status:      status || null,
          integrador:  integrador || null,
          alerta_desconsiderado: alertaDesc || null,
          qualifica_acao: qualificaAcao(tipo, excessoKm, limiarKm, duracaoSeg),
        })
      }
      resolve(results)
    }
    reader.readAsText(file, 'ISO-8859-1')
  })
}

function fmtDuracao(seg: number | null): string {
  if (!seg) return '—'
  if (seg < 60) return `${seg}s`
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtDataHora(dh: string | null): string {
  if (!dh) return '—'
  const d = new Date(dh)
  if (isNaN(d.getTime())) return dh
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Small components ─────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${TIPO_COR[tipo] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  )
}

function NivelBadge({ nivel }: { nivel: string | null }) {
  if (!nivel || nivel === 'N/A') return null
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${NIVEL_COR[nivel] ?? 'bg-gray-100 text-gray-600'}`}>
      {nivel}
    </span>
  )
}

function AcaoBadge({ acao }: { acao: TelemetriaAcao }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${COR_ACAO[acao.tipo_acao] ?? 'bg-gray-100 text-gray-600'}`}>
      {acao.tipo_acao}{acao.dias_suspensao ? ` (${acao.dias_suspensao}d)` : ''}
    </span>
  )
}

// ─── Ação Modal ───────────────────────────────────────────────────────────────

function AcaoModal({
  alerta,
  acaoExistente,
  onSalvar,
  onFechar,
}: {
  alerta: TelemetriaAlerta
  acaoExistente: TelemetriaAcao | null
  onSalvar: (tipo: string, dias: number | null, obs: string) => void
  onFechar: () => void
}) {
  const [tipo, setTipo]   = useState(acaoExistente?.tipo_acao ?? 'Advertência')
  const [dias, setDias]   = useState(acaoExistente?.dias_suspensao?.toString() ?? '')
  const [obs, setObs]     = useState(acaoExistente?.observacao ?? '')

  const mot = alerta.motorista_identificado || alerta.motorista || 'Sem Identificação'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-800">Registrar Ação Disciplinar</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium text-gray-800">{mot}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <TipoBadge tipo={alerta.tipo} />
              <span className="text-gray-500">{fmtDataHora(alerta.data_hora)}</span>
            </div>
            {alerta.logradouro && <p className="text-gray-500 text-xs">{alerta.logradouro}{alerta.cidade ? `, ${alerta.cidade}` : ''}</p>}
            {alerta.excesso_km && alerta.limiar_km && (
              <p className="text-xs text-red-600">{alerta.excesso_km} km/h (limiar {alerta.limiar_km} km/h) — {fmtDuracao(alerta.duracao_seg)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Ação</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option>Advertência</option>
              <option>Suspensão</option>
              <option>Comunicado/Orientação</option>
            </select>
          </div>

          {tipo === 'Suspensão' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dias de Suspensão</label>
              <input type="number" min={1} value={dias} onChange={e => setDias(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
            <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none" />
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t">
          <button onClick={onFechar} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => onSalvar(tipo, tipo === 'Suspensão' ? (parseInt(dias) || null) : null, obs)}
            className="flex-1 px-4 py-2 text-sm bg-brand-700 text-white rounded-lg hover:bg-brand-800">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Identificar Modal ────────────────────────────────────────────────────────

function IdentificarModal({
  alerta,
  onSalvar,
  onFechar,
}: {
  alerta: TelemetriaAlerta
  onSalvar: (nome: string) => void
  onFechar: () => void
}) {
  const [nome, setNome] = useState(alerta.motorista_identificado ?? '')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-800">Identificar Motorista</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p className="text-gray-600">Placa: <span className="font-medium text-gray-800">{alerta.placa}</span></p>
            <p className="text-gray-500 text-xs">{fmtDataHora(alerta.data_hora)}</p>
            {alerta.logradouro && <p className="text-gray-500 text-xs">{alerta.logradouro}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Motorista</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t">
          <button onClick={onFechar} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => { if (nome.trim()) onSalvar(nome.trim()) }}
            disabled={!nome.trim()}
            className="flex-1 px-4 py-2 text-sm bg-brand-700 text-white rounded-lg hover:bg-brand-800 disabled:opacity-40">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onUpload, uploading }: { onUpload: (file: File) => void; uploading: boolean }) {
  const onDrop = useCallback((files: File[]) => {
    if (files[0]) onUpload(files[0])
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.csv'] },
    multiple: false,
    disabled: uploading,
  })

  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
      ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}
      ${uploading ? 'opacity-60 cursor-default' : ''}`}>
      <input {...getInputProps()} />
      {uploading
        ? <><Loader2 size={24} className="mx-auto mb-2 text-brand-500 animate-spin" /><p className="text-sm text-gray-600">Importando…</p></>
        : <><Upload size={24} className="mx-auto mb-2 text-gray-400" /><p className="text-sm text-gray-600">Arraste o CSV de telemetria ou <span className="text-brand-600 font-medium">clique para selecionar</span></p><p className="text-xs text-gray-400 mt-1">Histórico de Alertas exportado pelo sistema de telemetria (separado por ponto e vírgula)</p></>
      }
    </div>
  )
}

// ─── Motorista Detail (events list) ──────────────────────────────────────────

function MotoristaDetail({
  alertas,
  acoes,
  onRegistrarAcao,
}: {
  alertas: TelemetriaAlerta[]
  acoes: TelemetriaAcao[]
  onRegistrarAcao: (a: TelemetriaAlerta) => void
}) {
  const sorted = [...alertas].sort((a, b) =>
    (b.data_hora ?? '').localeCompare(a.data_hora ?? ''),
  )

  return (
    <div className="bg-gray-50 border-t border-gray-100 divide-y divide-gray-100">
      {sorted.map(a => {
        const acao = acoes.find(x => x.alerta_id === a.id)
        const excSev = a.excesso_km && a.limiar_km ? (a.excesso_km - a.limiar_km) : null
        return (
          <div key={a.id} className="px-4 py-2.5 flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <TipoBadge tipo={a.tipo} />
                <NivelBadge nivel={a.nivel} />
                <span className="text-xs text-gray-500">{fmtDataHora(a.data_hora)}</span>
              </div>
              {a.logradouro && (
                <p className="text-xs text-gray-500 truncate">
                  <MapPin size={10} className="inline mr-0.5" />
                  {a.logradouro}{a.cidade ? `, ${a.cidade}` : ''}
                </p>
              )}
              {a.ponto_referencia && (
                <p className="text-xs text-gray-400 truncate">{a.ponto_referencia}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {a.excesso_km && a.limiar_km && (
                  <span className="text-red-600 font-medium">
                    {a.excesso_km} km/h <span className="text-gray-400 font-normal">(lim. {a.limiar_km})</span>
                    {excSev !== null && <span className="text-orange-600 ml-1">+{excSev} km/h</span>}
                  </span>
                )}
                {a.excesso_raw && !a.excesso_km && <span>{a.excesso_raw}</span>}
                {a.duracao_seg !== null && a.duracao_seg > 0 && (
                  <span><Clock size={10} className="inline mr-0.5" />{fmtDuracao(a.duracao_seg)}</span>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center">
              {a.qualifica_acao
                ? acao
                  ? <AcaoBadge acao={acao} />
                  : (
                    <button onClick={() => onRegistrarAcao(a)}
                      className="flex items-center gap-0.5 text-xs text-brand-700 border border-brand-200 bg-brand-50 px-1.5 py-0.5 rounded hover:bg-brand-100">
                      <Plus size={10} /> Ação
                    </button>
                  )
                : <span className="text-xs text-gray-300">—</span>
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Telemetria() {
  const { usuario } = useAuth()

  const [alertas, setAlertas]             = useState<TelemetriaAlerta[]>([])
  const [acoes, setAcoes]                 = useState<TelemetriaAcao[]>([])
  const [loading, setLoading]             = useState(true)
  const [uploading, setUploading]         = useState(false)
  const [tab, setTab]                     = useState<'dash' | 'motoristas' | 'via' | 'semid'>('dash')
  const [expandedMot, setExpandedMot]     = useState<string | null>(null)
  const [modalAcao, setModalAcao]         = useState<TelemetriaAlerta | null>(null)
  const [modalId, setModalId]             = useState<TelemetriaAlerta | null>(null)
  const [filtroTipo, setFiltroTipo]       = useState('todos')
  const [filtroDataDe, setFiltroDataDe]   = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')
  const [busca, setBusca]                 = useState('')

  // ── Load data ──────────────────────────────────────────────────────────────

  async function loadData() {
    if (!usuario) return
    setLoading(true)
    const [{ data: al }, { data: ac }] = await Promise.all([
      supabase.from('telemetria_alertas').select('*').eq('filial', usuario.filial).order('data_hora', { ascending: false }),
      supabase.from('telemetria_acoes').select('*').eq('filial', usuario.filial),
    ])
    setAlertas(al ?? [])
    setAcoes(ac ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [usuario])

  // ── Upload CSV ─────────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    if (!usuario) return
    setUploading(true)
    try {
      const rows = await parseCsv(file)
      if (rows.length === 0) { setUploading(false); return }

      const inserts = rows.map(r => ({ ...r, filial: usuario.filial }))

      const CHUNK = 200
      for (let i = 0; i < inserts.length; i += CHUNK) {
        await supabase
          .from('telemetria_alertas')
          .upsert(inserts.slice(i, i + CHUNK), { onConflict: 'filial,placa,data_hora,tipo' })
      }
      await loadData()
    } finally {
      setUploading(false)
    }
  }

  // ── Save disciplinary action ───────────────────────────────────────────────

  async function salvarAcao(tipo: string, dias: number | null, obs: string) {
    if (!modalAcao || !usuario) return
    const existente = acoes.find(a => a.alerta_id === modalAcao.id)
    const mot = modalAcao.motorista_identificado || modalAcao.motorista || 'Sem Identificação'
    if (existente) {
      await supabase.from('telemetria_acoes').update({
        tipo_acao: tipo, dias_suspensao: dias, observacao: obs || null,
        registrado_por: usuario.nome ?? usuario.login,
      }).eq('id', existente.id)
    } else {
      await supabase.from('telemetria_acoes').insert({
        filial: usuario.filial, alerta_id: modalAcao.id,
        placa: modalAcao.placa, motorista: mot,
        tipo_acao: tipo, dias_suspensao: dias, observacao: obs || null,
        registrado_por: usuario.nome ?? usuario.login,
      })
    }
    setModalAcao(null)
    const { data } = await supabase.from('telemetria_acoes').select('*').eq('filial', usuario.filial)
    setAcoes(data ?? [])
  }

  // ── Save manual identification ─────────────────────────────────────────────

  async function salvarIdentificacao(nome: string) {
    if (!modalId) return
    await supabase.from('telemetria_alertas').update({ motorista_identificado: nome }).eq('id', modalId.id)
    setAlertas(prev => prev.map(a => a.id === modalId.id ? { ...a, motorista_identificado: nome } : a))
    setModalId(null)
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return alertas.filter(a => {
      if (filtroTipo !== 'todos' && a.tipo !== filtroTipo) return false
      if (filtroDataDe && a.data_hora && a.data_hora < filtroDataDe) return false
      if (filtroDataAte && a.data_hora && a.data_hora > filtroDataAte + 'T23:59:59') return false
      if (busca) {
        const q = busca.toLowerCase()
        const mot = motoristaEfetivo(a).toLowerCase()
        if (!mot.includes(q) && !a.placa?.toLowerCase().includes(q) && !a.logradouro?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [alertas, filtroTipo, filtroDataDe, filtroDataAte, busca])

  const kpis = useMemo(() => ({
    total:         filtered.length,
    qualificados:  filtered.filter(a => a.qualifica_acao).length,
    semId:         filtered.filter(a => semId(a.motorista) && !a.motorista_identificado).length,
    veiculos:      new Set(filtered.map(a => a.placa)).size,
    comAcao:       filtered.filter(a => acoes.some(x => x.alerta_id === a.id)).length,
  }), [filtered, acoes])

  const tiposData = useMemo(() => TIPOS_LISTA.map(t => ({
    name: TIPO_LABEL[t],
    total: filtered.filter(a => a.tipo === t).length,
    hex: TIPO_HEX[t],
  })).filter(d => d.total > 0), [filtered])

  const horaData = useMemo(() => {
    const counts = Array.from({ length: 24 }, (_, h) => ({ hora: `${h}h`, total: 0 }))
    filtered.forEach(a => {
      if (a.data_hora) {
        const h = new Date(a.data_hora).getHours()
        counts[h].total++
      }
    })
    return counts
  }, [filtered])

  const diaSemanaData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    filtered.forEach(a => {
      if (a.data_hora) counts[new Date(a.data_hora).getDay()]++
    })
    return DIAS_SEMANA.map((dia, i) => ({ dia, total: counts[i] }))
  }, [filtered])

  const evolucaoData = useMemo(() => {
    const byDate: Record<string, number> = {}
    filtered.forEach(a => {
      if (!a.data_hora) return
      const d = a.data_hora.slice(0, 10)
      byDate[d] = (byDate[d] ?? 0) + 1
    })
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([data, total]) => {
      const [, m, d] = data.split('-')
      return { data: `${d}/${m}`, total }
    })
  }, [filtered])

  // Top motoristas (by effective name)
  const topMotoristas = useMemo(() => {
    const map: Record<string, { curva: number; freada: number; veloc: number; velocVia: number; total: number }> = {}
    filtered.forEach(a => {
      const mot = motoristaEfetivo(a)
      if (!map[mot]) map[mot] = { curva: 0, freada: 0, veloc: 0, velocVia: 0, total: 0 }
      map[mot].total++
      if (a.tipo === 'CURVA_BRUSCA')                    map[mot].curva++
      else if (a.tipo === 'FREADA_BRUSCA')               map[mot].freada++
      else if (a.tipo === 'EXCESSO_VELOCIDADE')          map[mot].veloc++
      else if (a.tipo === 'EXCESSO_VELOCIDADE_POR_VIA')  map[mot].velocVia++
    })
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
  }, [filtered])

  // Top vias
  const topVias = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach(a => {
      const via = a.logradouro?.trim()
      if (!via) return
      map[via] = (map[via] ?? 0) + 1
    })
    return Object.entries(map)
      .map(([via, total]) => ({ via, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [filtered])

  const topPontos = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach(a => {
      const p = a.ponto_referencia?.trim()
      if (!p) return
      map[p] = (map[p] ?? 0) + 1
    })
    return Object.entries(map)
      .map(([ponto, total]) => ({ ponto, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [filtered])

  // Per-motorista data for drill-down table
  const motoristasTable = useMemo(() => {
    const map: Record<string, {
      alertas: TelemetriaAlerta[]
      curva: number; freada: number; veloc: number; velocVia: number
      qualificados: number; comAcao: number
      sevMedia: number | null
    }> = {}
    filtered.forEach(a => {
      const mot = motoristaEfetivo(a)
      if (!map[mot]) map[mot] = { alertas: [], curva: 0, freada: 0, veloc: 0, velocVia: 0, qualificados: 0, comAcao: 0, sevMedia: null }
      map[mot].alertas.push(a)
      if (a.tipo === 'CURVA_BRUSCA')                    map[mot].curva++
      else if (a.tipo === 'FREADA_BRUSCA')               map[mot].freada++
      else if (a.tipo === 'EXCESSO_VELOCIDADE')          map[mot].veloc++
      else if (a.tipo === 'EXCESSO_VELOCIDADE_POR_VIA')  map[mot].velocVia++
      if (a.qualifica_acao) map[mot].qualificados++
      if (acoes.some(x => x.alerta_id === a.id))        map[mot].comAcao++
    })
    // Severidade média (excesso - limiar) para velocidade
    Object.values(map).forEach(v => {
      const sevsVals = v.alertas
        .filter(a => a.excesso_km !== null && a.limiar_km !== null)
        .map(a => a.excesso_km! - a.limiar_km!)
      v.sevMedia = sevsVals.length > 0 ? Math.round(sevsVals.reduce((s, x) => s + x, 0) / sevsVals.length) : null
    })
    return Object.entries(map)
      .map(([mot, v]) => ({ mot, ...v }))
      .sort((a, b) => b.alertas.length - a.alertas.length)
  }, [filtered, acoes])

  const semIdAlertas = useMemo(() =>
    alertas.filter(a => semId(a.motorista) && !a.motorista_identificado)
      .sort((a, b) => (b.data_hora ?? '').localeCompare(a.data_hora ?? '')),
    [alertas],
  )

  const maxHora = Math.max(...horaData.map(d => d.total), 1)
  const maxDia  = Math.max(...diaSemanaData.map(d => d.total), 1)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Loader2 size={24} className="animate-spin mr-2" /> Carregando telemetria…
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Telemetria</h1>
          <p className="text-sm text-gray-500">Alertas de comportamento de direção</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Upload */}
      <UploadZone onUpload={handleUpload} uploading={uploading} />

      {alertas.length === 0 && !uploading && (
        <div className="text-center py-12 text-gray-400">
          <Zap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum dado importado. Faça upload do CSV de telemetria.</p>
        </div>
      )}

      {alertas.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text" placeholder="Buscar motorista, placa ou via…"
              value={busca} onChange={e => setBusca(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56"
            />
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
              <option value="todos">Todos os tipos</option>
              {TIPOS_LISTA.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
            <input type="date" value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
            <span className="text-gray-400 text-sm">até</span>
            <input type="date" value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {([
              ['dash',       'Dashboard'],
              ['motoristas', 'Motoristas'],
              ['via',        'Por Via'],
              ['semid',      `Sem Identificação${semIdAlertas.length > 0 ? ` (${semIdAlertas.length})` : ''}`],
            ] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as typeof tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === k
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* ── Dashboard Tab ────────────────────────────────────────────── */}
          {tab === 'dash' && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: 'Total alertas',      value: kpis.total,        icon: AlertTriangle, color: 'text-gray-700' },
                  { label: 'Qualificam p/ ação', value: kpis.qualificados,  icon: Zap,           color: 'text-red-600' },
                  { label: 'Ações registradas',  value: kpis.comAcao,       icon: TrendingUp,    color: 'text-brand-700' },
                  { label: 'Sem identificação',  value: kpis.semId,         icon: User,          color: 'text-orange-600' },
                  { label: 'Veículos únicos',    value: kpis.veiculos,      icon: Car,           color: 'text-blue-600' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${color}`}>
                      <Icon size={13} /> {label}
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>

              {/* Types + Top Motoristas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Tipos */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Alertas por Tipo</h3>
                  <div className="space-y-2">
                    {tiposData.map(t => (
                      <div key={t.name} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-32 shrink-0">{t.name}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(t.total / kpis.total) * 100}%`, backgroundColor: t.hex }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-8 text-right">{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hora do dia */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Hora do Dia</h3>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={horaData} barSize={8} margin={{ left: -20, right: 0 }}>
                      <XAxis dataKey="hora" tick={{ fontSize: 9 }} interval={2} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v) => [v, 'Alertas']} />
                      <Bar dataKey="total" radius={[2, 2, 0, 0]}>
                        {horaData.map((e, i) => (
                          <Cell key={i} fill={e.total === maxHora && maxHora > 0 ? '#ef4444' : '#1a4451'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Motoristas stacked bar */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Motoristas</h3>
                <ResponsiveContainer width="100%" height={topMotoristas.length * 32 + 20}>
                  <BarChart data={topMotoristas} layout="vertical" barSize={16} margin={{ left: 200, right: 60 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={200} />
                    <Tooltip />
                    <Bar dataKey="curva"    stackId="a" fill={TIPO_HEX.CURVA_BRUSCA}               name="Curva Brusca"       />
                    <Bar dataKey="freada"   stackId="a" fill={TIPO_HEX.FREADA_BRUSCA}              name="Freada Brusca"      />
                    <Bar dataKey="veloc"    stackId="a" fill={TIPO_HEX.EXCESSO_VELOCIDADE}         name="Exc. Velocidade"    />
                    <Bar dataKey="velocVia" stackId="a" fill={TIPO_HEX.EXCESSO_VELOCIDADE_POR_VIA} name="Exc. Veloc. por Via" radius={[0, 4, 4, 0]}
                      label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: (_: unknown, entry: { curva: number; freada: number; veloc: number; velocVia: number }) => entry ? entry.curva + entry.freada + entry.veloc + entry.velocVia : '' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  {[
                    { label: 'Curva Brusca',         color: TIPO_HEX.CURVA_BRUSCA },
                    { label: 'Freada Brusca',        color: TIPO_HEX.FREADA_BRUSCA },
                    { label: 'Exc. Velocidade',      color: TIPO_HEX.EXCESSO_VELOCIDADE },
                    { label: 'Exc. Veloc. por Via',  color: TIPO_HEX.EXCESSO_VELOCIDADE_POR_VIA },
                  ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Dia da semana + Evolução */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Dia da Semana</h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={diaSemanaData} barSize={24} margin={{ left: -20, right: 0 }}>
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [v, 'Alertas']} />
                      <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                        {diaSemanaData.map((e, i) => (
                          <Cell key={i} fill={e.total === maxDia && maxDia > 0 ? '#ef4444' : '#1a4451'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolução Diária</h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={evolucaoData} margin={{ left: -20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="data" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [v, 'Alertas']} />
                      <Line type="monotone" dataKey="total" stroke="#1a4451" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── Motoristas Tab ───────────────────────────────────────────── */}
          {tab === 'motoristas' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Motorista</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Total</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-orange-600" title="Curva Brusca">Curva</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-yellow-600" title="Freada Brusca">Freada</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-rose-600" title="Excesso Velocidade">Veloc.</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-red-600" title="Excesso Velocidade por Via">V. Via</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Qualif.</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Sev. Méd.</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-brand-700">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {motoristasTable.map(({ mot, alertas: al, curva, freada, veloc, velocVia, qualificados, comAcao, sevMedia }) => (
                    <Fragment key={mot}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedMot(expandedMot === mot ? null : mot)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2">
                          {expandedMot === mot ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          <span className="truncate max-w-xs">{mot}</span>
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-gray-700">{al.length}</td>
                        <td className="px-3 py-3 text-center text-orange-700">{curva || '—'}</td>
                        <td className="px-3 py-3 text-center text-yellow-700">{freada || '—'}</td>
                        <td className="px-3 py-3 text-center text-rose-700">{veloc || '—'}</td>
                        <td className="px-3 py-3 text-center text-red-700">{velocVia || '—'}</td>
                        <td className="px-3 py-3 text-center">
                          {qualificados > 0
                            ? <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{qualificados}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-gray-500">
                          {sevMedia !== null ? `+${sevMedia} km/h` : '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {comAcao > 0
                            ? <span className="text-xs text-brand-600 font-medium">{comAcao}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                      {expandedMot === mot && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <MotoristaDetail
                              alertas={al}
                              acoes={acoes}
                              onRegistrarAcao={setModalAcao}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Por Via Tab ──────────────────────────────────────────────── */}
          {tab === 'via' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top logradouros */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <MapPin size={14} className="text-brand-600" /> Top Logradouros
                  </h3>
                  <ResponsiveContainer width="100%" height={topVias.length * 32 + 20}>
                    <BarChart data={topVias} layout="vertical" barSize={16} margin={{ left: 220, right: 40 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="via" tick={{ fontSize: 9 }} width={220} />
                      <Tooltip formatter={(v) => [v, 'Alertas']} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#6b7280' }}>
                        {topVias.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? '#1a4451' : i < 3 ? '#334e5a' : '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Top pontos de referência */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-orange-500" /> Trechos de Risco (Ponto de Referência)
                  </h3>
                  {topPontos.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-4">Nenhum ponto de referência nos dados filtrados</p>
                    : (
                      <div className="divide-y divide-gray-50">
                        {topPontos.map(({ ponto, total }, i) => (
                          <div key={i} className="flex items-center justify-between py-2">
                            <span className="text-xs text-gray-700 flex-1 truncate pr-4">{ponto}</span>
                            <span className="text-xs font-semibold text-gray-700 shrink-0">{total}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              </div>

              {/* Via detail table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Logradouro</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Cidade</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Total</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-orange-600">Curva</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-yellow-600">Freada</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-rose-600">Veloc.</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-red-600">V. Via</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {topVias.map(({ via, total }) => {
                      const vAl = filtered.filter(a => a.logradouro?.trim() === via)
                      const cidade = vAl[0]?.cidade ?? '—'
                      return (
                        <tr key={via} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{via}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{cidade}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-gray-700">{total}</td>
                          <td className="px-3 py-2.5 text-center text-orange-700">{vAl.filter(a => a.tipo === 'CURVA_BRUSCA').length || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-yellow-700">{vAl.filter(a => a.tipo === 'FREADA_BRUSCA').length || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-rose-700">{vAl.filter(a => a.tipo === 'EXCESSO_VELOCIDADE').length || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-red-700">{vAl.filter(a => a.tipo === 'EXCESSO_VELOCIDADE_POR_VIA').length || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sem Identificação Tab ────────────────────────────────────── */}
          {tab === 'semid' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {semIdAlertas.length === 0
                ? (
                  <div className="text-center py-12 text-gray-400">
                    <User size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum evento sem identificação.</p>
                  </div>
                )
                : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Placa</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Tipo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Data/Hora</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Via</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Veloc.</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Ident.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {semIdAlertas.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{a.placa}</td>
                          <td className="px-4 py-2.5"><TipoBadge tipo={a.tipo} /></td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{fmtDataHora(a.data_hora)}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{a.logradouro ?? '—'}{a.cidade ? `, ${a.cidade}` : ''}</td>
                          <td className="px-3 py-2.5 text-center text-xs">
                            {a.excesso_km
                              ? <span className="text-red-600 font-medium">{a.excesso_km} km/h</span>
                              : a.excesso_raw ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button onClick={() => setModalId(a)}
                              className="flex items-center gap-0.5 mx-auto text-xs text-brand-700 border border-brand-200 bg-brand-50 px-1.5 py-0.5 rounded hover:bg-brand-100">
                              <Plus size={10} /> Identificar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modalAcao && (
        <AcaoModal
          alerta={modalAcao}
          acaoExistente={acoes.find(a => a.alerta_id === modalAcao.id) ?? null}
          onSalvar={salvarAcao}
          onFechar={() => setModalAcao(null)}
        />
      )}
      {modalId && (
        <IdentificarModal
          alerta={modalId}
          onSalvar={salvarIdentificacao}
          onFechar={() => setModalId(null)}
        />
      )}
    </div>
  )
}
