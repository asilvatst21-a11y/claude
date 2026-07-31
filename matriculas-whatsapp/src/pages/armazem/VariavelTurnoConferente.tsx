import { useCallback, useEffect, useState } from 'react'
import { Building2, User, Lock, Loader2, LogOut, ClipboardCheck, ChevronLeft, CheckCircle2, Users } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import {
  listarAtividadesConferente, registrarAtividadeTurno, hhmmParaMinutos, minutosParaHHMM,
  listarEquipeConferente, buscarPresencaDoDia, registrarPresencasDoDia,
  type AtividadeConferente, type ConferenteEquipeMembro, type PresencaDia,
} from '../../lib/variavelTurno'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Login próprio da tela de fechamento de turno — não reaproveita o
// componente <Login/> porque ele redireciona pra "/" (ou "/armazem" se o
// usuário tiver cargo) depois de autenticar; aqui a intenção é ficar
// exatamente nesta tela, então o formulário chama entrar() direto e deixa o
// wrapper (ver App.tsx) re-renderizar assim que o usuário estiver logado.
export function LoginConferente() {
  const { entrar } = useAuth()
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { sucesso, erro: erroMsg } = await entrar(filial, login, senha)
    setLoading(false)
    if (!sucesso) setErro(erroMsg ?? 'Erro ao entrar')
  }

  return (
    <div className="min-h-screen bg-[#0b1f2b] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-8 py-7 flex flex-col items-center border-b border-gray-100">
          <div className="w-12 h-12 rounded-xl bg-[#0b1f2b] text-white flex items-center justify-center font-bold text-lg mb-3">RV</div>
          <h1 className="text-lg font-bold text-gray-800">Fechamento de turno</h1>
          <p className="text-xs text-gray-400 mt-1 text-center">Entre com o login cadastrado pra registrar as atividades do seu turno.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Filial</label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={filial} onChange={(e) => setFilial(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white appearance-none">
                {filiais.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Login</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={login} onChange={(e) => setLogin(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="username" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Senha</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm" autoComplete="current-password" />
            </div>
          </div>
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{erro}</div>}
          <button type="submit" disabled={loading || !login || !senha} className="w-full bg-[#b6661a] hover:opacity-90 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Entrada do resultado — só o valor daquela atividade, sem mostrar meta,
// colaboradores nem o que cada um vai receber (decisão explícita: o
// conferente só registra o que aconteceu, o cálculo de RV fica invisível
// pra ele).
function EntradaValor({ unidade, valorInicial, onSalvar, salvando }: {
  unidade: AtividadeConferente['unidade']
  valorInicial: { valorNumero: number | null; okNok: boolean | null }
  onSalvar: (valorNumero: number | null, okNok: boolean | null) => void
  salvando: boolean
}) {
  const [valor, setValor] = useState(
    unidade === 'tempo' && valorInicial.valorNumero != null ? minutosParaHHMM(valorInicial.valorNumero)
      : valorInicial.valorNumero != null ? String(valorInicial.valorNumero) : '',
  )
  const [okNok, setOkNok] = useState<boolean | null>(valorInicial.okNok)

  if (unidade === 'ok_nok') {
    return (
      <div className="flex gap-3 mt-5">
        <button onClick={() => setOkNok(true)} className={`flex-1 py-4 rounded-2xl font-bold text-sm ${okNok === true ? 'bg-green-500 text-white' : 'bg-white/10 text-white'}`}>OK</button>
        <button onClick={() => setOkNok(false)} className={`flex-1 py-4 rounded-2xl font-bold text-sm ${okNok === false ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}>NOK</button>
        <button
          disabled={okNok == null || salvando}
          onClick={() => onSalvar(null, okNok)}
          className="px-5 rounded-2xl font-bold text-sm bg-white text-[#0b1f2b] disabled:opacity-40"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : 'OK'}
        </button>
      </div>
    )
  }

  const numero = unidade === 'tempo' ? hhmmParaMinutos(valor) : parseFloat(valor.replace(',', '.'))
  const valido = numero != null && Number.isFinite(numero)
  const sufixo = unidade === 'percentual' ? '%' : unidade === 'reais' ? ' R$' : ''

  return (
    <div className="mt-5 space-y-3">
      <div className="bg-white/10 rounded-2xl px-5 py-6 text-center flex items-center justify-center gap-6">
        <button onClick={() => setValor((v) => v.slice(0, -1))} className="text-white/50 text-sm font-semibold px-2">⌫</button>
        <input
          value={valor}
          onChange={(e) => setValor(unidade === 'tempo' ? e.target.value.replace(/[^0-9:]/g, '') : e.target.value.replace(/[^0-9,.]/g, ''))}
          inputMode={unidade === 'tempo' ? 'numeric' : 'decimal'}
          placeholder={unidade === 'tempo' ? 'hh:mm' : '0'}
          className="bg-transparent text-center text-4xl font-bold tabular-nums text-white outline-none w-40"
        />
        <span className="text-white/40 text-lg font-bold">{sufixo}</span>
      </div>
      <button
        disabled={!valido || salvando}
        onClick={() => onSalvar(numero, null)}
        className="w-full bg-[#b6661a] disabled:opacity-40 text-white font-bold text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2"
      >
        {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar registro'}
      </button>
    </div>
  )
}

function TelaRegistro({ atividade, onVoltar }: { atividade: AtividadeConferente; onVoltar: (recarregar: boolean) => void }) {
  const { usuario } = useAuth()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const hoje = hojeISO()

  async function salvar(valorNumero: number | null, okNok: boolean | null) {
    if (!usuario) return
    setSalvando(true)
    setErro('')
    const { error } = await registrarAtividadeTurno(
      atividade, atividade.colaboradores, hoje, { valorNumero, okNok },
      { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
    )
    setSalvando(false)
    if (error) { setErro(error); return }
    onVoltar(true)
  }

  return (
    <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col px-5 pt-8 pb-10">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => onVoltar(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><ChevronLeft size={18} /></button>
        <div className="text-xs text-white/50 text-right">{new Date(`${hoje}T00:00:00`).toLocaleDateString('pt-BR')}</div>
      </div>
      <h2 className="text-xl font-bold">{atividade.nome}</h2>
      <p className="text-sm text-white/50 mt-1">Registre o resultado do turno.</p>

      {erro && <div className="bg-red-500/20 text-red-200 text-xs rounded-lg px-3 py-2 mt-4">{erro}</div>}

      <EntradaValor
        unidade={atividade.unidade}
        valorInicial={{ valorNumero: atividade.registroHoje?.valorNumero ?? null, okNok: atividade.registroHoje?.okNok ?? null }}
        onSalvar={salvar}
        salvando={salvando}
      />
    </div>
  )
}

// Depois que TODAS as atividades manuais do dia estão registradas, o
// conferente confere presença da equipe fixa dele — quem ele marcar
// ausente perde o dia inteiro de RV, mesmo que a atividade tenha batido a
// meta (zera os créditos do dia daquela pessoa).
function TelaPresenca({ onConcluir }: { onConcluir: () => void }) {
  const { usuario } = useAuth()
  const [equipe, setEquipe] = useState<ConferenteEquipeMembro[]>([])
  const [presencas, setPresencas] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [concluido, setConcluido] = useState(false)
  const hoje = hojeISO()

  useEffect(() => {
    if (!usuario) return
    setLoading(true)
    Promise.all([listarEquipeConferente(usuario.id), buscarPresencaDoDia(usuario.id, hoje)]).then(([eq, jaMarcado]) => {
      setEquipe(eq.filter((m) => m.ativo))
      const inicial: Record<string, boolean> = {}
      for (const m of eq) inicial[m.id] = true
      for (const p of jaMarcado) {
        const membro = eq.find((m) => m.colaboradorId === p.colaboradorId)
        if (membro) inicial[membro.id] = p.presente
      }
      setPresencas(inicial)
      if (jaMarcado.length > 0) setConcluido(true)
      setLoading(false)
    })
  }, [usuario, hoje])

  async function confirmar() {
    if (!usuario) return
    setSalvando(true)
    setErro('')
    const lista: PresencaDia[] = equipe.map((m) => ({ colaboradorId: m.colaboradorId, colaboradorNome: m.colaboradorNome, presente: presencas[m.id] ?? true }))
    const { error } = await registrarPresencasDoDia(usuario.id, hoje, lista)
    setSalvando(false)
    if (error) { setErro(error); return }
    setConcluido(true)
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
  }

  if (concluido) {
    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col items-center justify-center px-5 text-center">
        <CheckCircle2 className="h-14 w-14 text-green-400 mb-4" />
        <h2 className="text-xl font-bold">Turno fechado!</h2>
        <p className="text-white/50 text-sm mt-1">Todas as atividades e a presença de hoje já foram registradas.</p>
        <button onClick={onConcluir} className="mt-6 text-sm px-5 py-2.5 rounded-xl bg-white/10">Voltar</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col">
      <header className="bg-[#0b1f2b] text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-2">
          <Users size={20} />
          <div>
            <h1 className="text-lg font-bold">Lista de presença</h1>
            <p className="text-white/50 text-xs mt-0.5">Quem não está presente hoje perde o dia de RV.</p>
          </div>
        </div>
      </header>
      <main className="flex-1 px-5 py-6">
        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
        {equipe.length === 0 ? (
          <p className="text-gray-400 text-center py-12 text-sm">Nenhuma equipe cadastrada pra você. Fale com quem gerencia o Armazém.</p>
        ) : (
          <div className="space-y-2">
            {equipe.map((m) => {
              const presente = presencas[m.id] ?? true
              return (
                <div key={m.id} className="bg-white rounded-2xl shadow-sm border p-4 flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-sm">{m.colaboradorNome}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPresencas((p) => ({ ...p, [m.id]: true }))} className={`text-xs font-bold px-3 py-1.5 rounded-full ${presente ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>Presente</button>
                    <button onClick={() => setPresencas((p) => ({ ...p, [m.id]: false }))} className={`text-xs font-bold px-3 py-1.5 rounded-full ${!presente ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}>Ausente</button>
                  </div>
                </div>
              )
            })}
            <button onClick={confirmar} disabled={salvando} className="w-full mt-4 bg-[#b6661a] disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar presença do dia'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default function VariavelTurnoConferente() {
  const { usuario, sair } = useAuth()
  const [atividades, setAtividades] = useState<AtividadeConferente[]>([])
  const [loading, setLoading] = useState(true)
  const [aberta, setAberta] = useState<AtividadeConferente | null>(null)
  const [mostrarPresenca, setMostrarPresenca] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    setErro('')
    try {
      setAtividades(await listarAtividadesConferente(usuario.filial, usuario.id, hojeISO()))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar as atividades.')
    } finally {
      setLoading(false)
    }
  }, [usuario])

  useEffect(() => { carregar() }, [carregar])

  if (!usuario) return null

  if (aberta) {
    return (
      <TelaRegistro
        atividade={aberta}
        onVoltar={(recarregar) => { setAberta(null); if (recarregar) carregar() }}
      />
    )
  }

  if (mostrarPresenca) {
    return <TelaPresenca onConcluir={() => setMostrarPresenca(false)} />
  }

  const todasFeitas = atividades.length > 0 && atividades.every((a) => !!a.registroHoje)

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col">
      <header className="bg-[#0b1f2b] text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">Olá,</p>
            <h1 className="text-2xl font-bold">{usuario.nome ?? usuario.login}</h1>
            <p className="text-white/50 text-sm mt-0.5">Conferente · {new Date(`${hojeISO()}T00:00:00`).toLocaleDateString('pt-BR')}</p>
          </div>
          <button onClick={sair} className="p-2 rounded-full bg-white/10 hover:bg-white/20" title="Sair"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="flex-1 px-5 py-6">
        <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-[#b6661a]" /> Atividades pra fechar agora
        </h2>
        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : atividades.length === 0 ? (
          <p className="text-gray-400 text-center py-12 text-sm">Nenhuma atividade manual cadastrada pra você.</p>
        ) : (
          <div className="space-y-3">
            {atividades.map((a) => {
              const feita = !!a.registroHoje
              return (
                <button
                  key={a.id}
                  onClick={() => setAberta(a)}
                  className={`w-full bg-white rounded-2xl shadow-sm border p-5 text-left flex items-center justify-between active:scale-[0.98] transition-transform ${feita ? 'opacity-55' : ''}`}
                >
                  <p className="text-base font-bold text-gray-800">{a.nome}</p>
                  <div className={`rounded-full p-3 text-white ${feita ? 'bg-green-500' : 'bg-[#b6661a]'}`}>
                    {feita ? '✓' : '›'}
                  </div>
                </button>
              )
            })}
            {todasFeitas && (
              <button
                onClick={() => setMostrarPresenca(true)}
                className="w-full mt-2 bg-[#0b1f2b] text-white font-bold text-sm py-4 rounded-2xl flex items-center justify-center gap-2"
              >
                <Users className="h-4 w-4" /> Conferir presença da equipe
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
