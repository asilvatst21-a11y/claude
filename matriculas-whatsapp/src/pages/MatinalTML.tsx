import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Square, CheckCircle2, AlertTriangle, ArrowLeft, Loader2, Building2, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SALA_TML_LABEL, type SalaTML, metaMatinalMinutos } from '../lib/tml'

const SALAS: SalaTML[] = ['COLORADO', 'SUB-FURIA']

type Tela = 'carregando' | 'selecionar' | 'pronto' | 'andamento' | 'confirmar' | 'concluida'

interface MatinalRow {
  id: number
  horario_inicio: string
  horario_final: string | null
  meta_minutos: number | null
  duracao_minutos: number | null
  estouro_duracao: boolean | null
  motivo_estouro: string | null
  iniciado_por: string | null
  finalizado_por: string | null
}

const CAMPOS_MATINAL = 'id, horario_inicio, horario_final, meta_minutos, duracao_minutos, estouro_duracao, motivo_estouro, iniciado_por, finalizado_por'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatarCronometro(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MatinalTML() {
  const [tela, setTela] = useState<Tela>('selecionar')
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [sala, setSala] = useState<SalaTML | null>(null)
  const [nome, setNome] = useState('')
  const [registro, setRegistro] = useState<MatinalRow | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [fimTentativo, setFimTentativo] = useState<Date | null>(null)
  const [motivoEstouro, setMotivoEstouro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  useEffect(() => {
    if (tela !== 'andamento') return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [tela])

  async function continuar() {
    if (!filial || !sala || !nome.trim()) {
      setErro('Preencha filial, sala e seu nome.')
      return
    }
    setErro('')
    setSalvando(true)
    const { data: row } = await supabase
      .from('matinal_tml')
      .select(CAMPOS_MATINAL)
      .eq('filial', filial)
      .eq('sala', sala)
      .eq('data', hojeISO())
      .maybeSingle()
    setSalvando(false)
    setRegistro(row ?? null)
    if (!row) setTela('pronto')
    else if (!row.horario_final) setTela('andamento')
    else setTela('concluida')
  }

  function trocarSalaOuFilial() {
    setRegistro(null)
    setErro('')
    setAviso('')
    setTela('selecionar')
  }

  // Trava: a matinal só pode ser iniciada uma única vez por dia/sala. Usa
  // insert (não upsert) pra que, se alguém já tiver apertado antes (ex.: duas
  // pessoas no mesmo link ao mesmo tempo), o banco rejeite em vez de
  // sobrescrever o horário de início já registrado.
  async function iniciarMatinal() {
    if (!filial || !sala) return
    setSalvando(true)
    setErro('')
    const { data: row, error } = await supabase
      .from('matinal_tml')
      .insert({ filial, sala, data: hojeISO(), horario_inicio: new Date().toISOString(), iniciado_por: nome.trim() })
      .select(CAMPOS_MATINAL)
      .single()
    setSalvando(false)
    if (error) {
      if (error.code === '23505') {
        setAviso('Essa matinal já foi iniciada por outra pessoa. Mostrando o registro atual.')
        await continuar()
        return
      }
      setErro(error.message)
      return
    }
    setRegistro(row)
    setTela('andamento')
  }

  function pedirConfirmacaoFim() {
    setFimTentativo(new Date())
    setMotivoEstouro('')
    setTela('confirmar')
  }

  async function confirmarFim() {
    if (!registro || !fimTentativo) return
    const inicio = new Date(registro.horario_inicio)
    const duracao = Math.max(0, Math.round((fimTentativo.getTime() - inicio.getTime()) / 60000))
    const meta = metaMatinalMinutos(hojeISO())
    const estourou = duracao > meta
    if (estourou && !motivoEstouro.trim()) {
      setErro('A matinal passou da meta — explique o motivo do estouro antes de confirmar.')
      return
    }
    setSalvando(true)
    setErro('')
    const { data: row, error } = await supabase
      .from('matinal_tml')
      .update({
        horario_final: fimTentativo.toISOString(),
        meta_minutos: meta,
        duracao_minutos: duracao,
        estouro_duracao: estourou,
        motivo_estouro: estourou ? motivoEstouro.trim() : null,
        finalizado_por: nome.trim() || null,
      })
      .eq('id', registro.id)
      .is('horario_final', null)
      .select(CAMPOS_MATINAL)
      .maybeSingle()
    setSalvando(false)
    if (error) { setErro(error.message); return }
    if (!row) {
      // Já tinha sido finalizada por outra pessoa enquanto essa tela estava aberta.
      setAviso('Essa matinal já havia sido finalizada por outra pessoa.')
      await continuar()
      return
    }
    setRegistro(row)
    setTela('concluida')
  }

  // ─── Tela: selecionar filial/sala/nome ─────────────────────────────────
  if (tela === 'selecionar') {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex flex-col">
        <header className="bg-[#0b1f2b] text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg flex flex-col items-center">
          <img src="/logo.png" alt="LOG20" className="h-12 mb-2 object-contain" />
          <h1 className="text-xl font-bold">Timer da Matinal</h1>
          <p className="text-white/50 text-sm mt-0.5 text-center">Marque o início e o fim da matinal de hoje</p>
        </header>

        <main className="flex-1 px-5 py-6 space-y-4">
          {aviso && (
            <p className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-3 py-2">{aviso}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Filial</label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={filial}
                onChange={(e) => setFilial(e.target.value)}
                className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
              >
                {filiais.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sala</label>
            <div className="grid grid-cols-2 gap-3">
              {SALAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSala(s)}
                  className={`rounded-xl py-4 text-sm font-bold transition-colors border-2
                    ${sala === s ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'}`}
                >
                  {SALA_TML_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Seu nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Quem está registrando"
              className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-400 mt-1">Confira bem o nome antes de continuar — ele fica vinculado a essa matinal.</p>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">{erro}</div>
          )}

          <button
            onClick={continuar}
            disabled={salvando || !filial || !sala || !nome.trim()}
            className="w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {salvando ? <Loader2 size={18} className="animate-spin" /> : 'Continuar'}
          </button>

          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 justify-center w-full">
            <ArrowLeft size={14} /> Voltar para o login
          </Link>
        </main>
      </div>
    )
  }

  // ─── Tela: pronta para iniciar ──────────────────────────────────────────
  if (tela === 'pronto') {
    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col">
        <header className="px-5 pt-8 pb-2 flex items-center justify-between">
          <button onClick={trocarSalaOuFilial} className="flex items-center gap-1 text-white/60 hover:text-white text-sm">
            <ArrowLeft size={18} /> Trocar
          </button>
          <p className="text-white/50 text-sm">{filial} · {sala && SALA_TML_LABEL[sala]}</p>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
          <Clock className="h-14 w-14 text-white/30" />
          <h1 className="text-2xl font-bold">Matinal ainda não iniciada hoje</h1>
          <p className="text-white/50 text-sm">Aperte abaixo no momento em que a matinal começar.</p>
        </main>

        <div className="px-5 pb-10 space-y-3">
          {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}
          <button
            onClick={iniciarMatinal}
            disabled={salvando}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-2"
          >
            {salvando ? <Loader2 size={22} className="animate-spin" /> : <Play size={22} fill="white" />} Iniciar Matinal
          </button>
        </div>
      </div>
    )
  }

  // ─── Tela: matinal em andamento ─────────────────────────────────────────
  if (tela === 'andamento' && registro) {
    const segundos = Math.max(0, Math.floor((agora - new Date(registro.horario_inicio).getTime()) / 1000))
    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col">
        <header className="px-5 pt-8 pb-2">
          <p className="text-white/50 text-sm uppercase tracking-wide">Matinal em andamento</p>
          <h1 className="text-2xl font-bold mt-1">{filial} · {sala && SALA_TML_LABEL[sala]}</h1>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-5 space-y-3">
          <div className="text-6xl font-mono font-bold tabular-nums tracking-tight">{formatarCronometro(segundos)}</div>
          <p className="text-white/50 text-sm">Início: <span className="text-white font-semibold">{formatarHorario(registro.horario_inicio)}</span></p>
          {registro.iniciado_por && <p className="text-white/40 text-xs">Iniciado por {registro.iniciado_por}</p>}
        </main>

        <div className="px-5 pb-10 space-y-3">
          {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}
          <button
            onClick={pedirConfirmacaoFim}
            disabled={salvando}
            className="w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-2"
          >
            <Square size={20} fill="white" /> Finalizar Matinal
          </button>
        </div>
      </div>
    )
  }

  // ─── Tela: confirmar horário de início/fim antes de gravar ─────────────
  if (tela === 'confirmar' && registro && fimTentativo) {
    const duracaoTentativa = Math.round((fimTentativo.getTime() - new Date(registro.horario_inicio).getTime()) / 60000)
    const estourouTentativo = duracaoTentativa > metaMatinalMinutos(hojeISO())
    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col">
        <header className="px-5 pt-8 pb-2">
          <p className="text-white/50 text-sm uppercase tracking-wide">Confirme a matinal</p>
          <h1 className="text-2xl font-bold mt-1">{filial} · {sala && SALA_TML_LABEL[sala]}</h1>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 space-y-5">
          <div className="w-full bg-white/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Início da matinal</span>
              <span className="text-xl font-bold">{formatarHorario(registro.horario_inicio)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Fim da matinal</span>
              <span className="text-xl font-bold">{formatarHorario(fimTentativo.toISOString())}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Duração</span>
              <span className="text-xl font-bold">{duracaoTentativa} min</span>
            </div>
          </div>

          {estourouTentativo && (
            <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2 text-left">
              <p className="text-amber-300 text-sm flex items-center gap-1.5">
                <AlertTriangle size={16} /> A matinal passou da meta do dia. Explique o motivo do estouro:
              </p>
              <textarea
                value={motivoEstouro}
                onChange={(e) => setMotivoEstouro(e.target.value)}
                placeholder="Ex.: chegada de mais caminhões que o esperado, falta de colaborador, etc."
                rows={3}
                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>
          )}

          <p className="text-white/40 text-sm text-center">Confira os horários acima antes de confirmar. Depois de confirmado não dá pra reabrir essa matinal.</p>
        </main>

        <div className="px-5 pb-10 space-y-3">
          {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}
          <button
            onClick={confirmarFim}
            disabled={salvando || (estourouTentativo && !motivoEstouro.trim())}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-2"
          >
            {salvando ? <Loader2 size={22} className="animate-spin" /> : <CheckCircle2 size={22} />} Confirmar
          </button>
          <button
            onClick={() => setTela('andamento')}
            disabled={salvando}
            className="w-full text-white/60 hover:text-white text-sm font-medium py-2 disabled:opacity-50"
          >
            Voltar (ainda não finalizar)
          </button>
        </div>
      </div>
    )
  }

  // ─── Tela: matinal concluída (bloqueada) ────────────────────────────────
  if (tela === 'concluida' && registro) {
    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col">
        <header className="px-5 pt-8 pb-2 flex items-center justify-between">
          <button onClick={trocarSalaOuFilial} className="flex items-center gap-1 text-white/60 hover:text-white text-sm">
            <ArrowLeft size={18} /> Trocar
          </button>
          <p className="text-white/50 text-sm">{filial} · {sala && SALA_TML_LABEL[sala]}</p>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
          {registro.estouro_duracao ? (
            <AlertTriangle className="h-14 w-14 text-amber-400" />
          ) : (
            <CheckCircle2 className="h-14 w-14 text-green-500" />
          )}
          <h1 className="text-2xl font-bold">Matinal já registrada hoje</h1>

          <div className="w-full bg-white/10 rounded-2xl p-5 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Início</span>
              <span className="text-lg font-bold">{formatarHorario(registro.horario_inicio)}</span>
            </div>
            {registro.horario_final && (
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Fim</span>
                <span className="text-lg font-bold">{formatarHorario(registro.horario_final)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Duração</span>
              <span className="text-lg font-bold">{registro.duracao_minutos} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Meta do dia</span>
              <span className="text-lg font-bold">{registro.meta_minutos} min</span>
            </div>
          </div>

          {registro.estouro_duracao && (
            <div className="w-full text-left text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 space-y-1">
              <p className="font-semibold">A matinal durou mais que a meta do dia.</p>
              {registro.motivo_estouro && <p className="text-amber-200/90">Motivo: {registro.motivo_estouro}</p>}
            </div>
          )}
          <p className="text-white/40 text-xs">Essa matinal já foi concluída e não pode ser reaberta.</p>
        </main>

        <div className="px-5 pb-10">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white justify-center w-full">
            <ArrowLeft size={14} /> Voltar para o login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1f2b]">
      <Loader2 className="animate-spin text-white" size={32} />
    </div>
  )
}
