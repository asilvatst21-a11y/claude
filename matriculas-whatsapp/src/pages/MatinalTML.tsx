import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Play, Square, Clock3, CheckCircle2, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SALA_TML_LABEL, type SalaTML, metaMatinalMinutos } from '../lib/tml'

const SALAS: SalaTML[] = ['COLORADO', 'SUB-FURIA']

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface MatinalRow {
  id: number
  horario_inicio: string | null
  horario_final: string | null
  meta_minutos: number | null
  duracao_minutos: number | null
  estouro_duracao: boolean | null
  iniciado_por: string | null
  finalizado_por: string | null
}

function formataDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MatinalTML() {
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [sala, setSala] = useState<SalaTML>('COLORADO')
  const [nome, setNome] = useState('')
  const [registro, setRegistro] = useState<MatinalRow | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(() => Date.now())

  const data = hojeISO()

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  useEffect(() => {
    if (!registro?.horario_inicio || registro.horario_final) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [registro])

  async function carregar() {
    if (!filial) return
    setCarregando(true)
    setErro('')
    const { data: row } = await supabase
      .from('matinal_tml')
      .select('id, horario_inicio, horario_final, meta_minutos, duracao_minutos, estouro_duracao, iniciado_por, finalizado_por')
      .eq('filial', filial)
      .eq('sala', sala)
      .eq('data', data)
      .maybeSingle()
    setRegistro(row ?? null)
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [filial, sala])

  const elapsedSegundos = useMemo(() => {
    if (!registro?.horario_inicio || registro.horario_final) return 0
    return Math.max(0, Math.floor((agora - new Date(registro.horario_inicio).getTime()) / 1000))
  }, [registro, agora])

  async function iniciarMatinal() {
    if (!filial) return
    setSalvando(true)
    setErro('')
    const { data: row, error } = await supabase
      .from('matinal_tml')
      .upsert(
        { filial, sala, data, horario_inicio: new Date().toISOString(), iniciado_por: nome.trim() || null },
        { onConflict: 'filial,sala,data' }
      )
      .select('id, horario_inicio, horario_final, meta_minutos, duracao_minutos, estouro_duracao, iniciado_por, finalizado_por')
      .single()
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setRegistro(row)
  }

  async function finalizarMatinal() {
    if (!registro?.horario_inicio) return
    setSalvando(true)
    setErro('')
    const inicio = new Date(registro.horario_inicio)
    const fim = new Date()
    const duracao = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000))
    const meta = metaMatinalMinutos(data)
    const { data: row, error } = await supabase
      .from('matinal_tml')
      .update({
        horario_final: fim.toISOString(),
        meta_minutos: meta,
        duracao_minutos: duracao,
        estouro_duracao: duracao > meta,
        finalizado_por: nome.trim() || null,
      })
      .eq('id', registro.id)
      .select('id, horario_inicio, horario_final, meta_minutos, duracao_minutos, estouro_duracao, iniciado_por, finalizado_por')
      .single()
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setRegistro(row)
  }

  const finalizada = !!registro?.horario_final
  const emAndamento = !!registro?.horario_inicio && !finalizada

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-white border-b border-gray-100 px-8 py-6 flex flex-col items-center">
          <img src="/logo.png" alt="LOG20" className="h-16 mb-2 object-contain" />
          <h1 className="text-brand-700 text-xl font-bold tracking-tight">Timer da Matinal</h1>
          <p className="text-brand-400 text-sm mt-1 text-center">Aperte para marcar o início e o fim da matinal de hoje</p>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Filial</label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={filial}
                onChange={(e) => setFilial(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
              >
                {filiais.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sala</label>
            <select
              value={sala}
              onChange={(e) => setSala(e.target.value as SalaTML)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              {SALAS.map((s) => <option key={s} value={s}>{SALA_TML_LABEL[s]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Seu nome (opcional)</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Quem está registrando"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center space-y-3">
              {!registro?.horario_inicio && (
                <>
                  <Clock3 className="h-10 w-10 text-brand-400 mx-auto" />
                  <p className="text-sm text-gray-500">Matinal ainda não iniciada hoje</p>
                  <button
                    onClick={iniciarMatinal}
                    disabled={salvando || !filial}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {salvando ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} Iniciar Matinal
                  </button>
                </>
              )}

              {emAndamento && (
                <>
                  <p className="text-xs text-gray-500">Matinal em andamento</p>
                  <p className="text-4xl font-mono font-bold text-brand-700">{formataDuracao(elapsedSegundos)}</p>
                  <button
                    onClick={finalizarMatinal}
                    disabled={salvando}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {salvando ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />} Finalizar Matinal
                  </button>
                </>
              )}

              {finalizada && registro && (
                <>
                  {registro.estouro_duracao ? (
                    <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
                  ) : (
                    <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                  )}
                  <p className="text-sm text-gray-600">Matinal finalizada hoje</p>
                  <p className="text-2xl font-bold text-brand-700">{registro.duracao_minutos} min</p>
                  <p className="text-xs text-gray-400">Meta do dia: {registro.meta_minutos} min</p>
                  {registro.estouro_duracao && (
                    <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      A matinal durou mais que a meta do dia.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {erro}
            </div>
          )}

          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 justify-center w-full">
            <ArrowLeft size={14} /> Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  )
}
