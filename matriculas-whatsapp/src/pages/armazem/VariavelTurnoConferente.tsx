import { useCallback, useEffect, useState } from 'react'
import { Building2, User, Lock, Loader2, LogOut, ClipboardCheck, ChevronLeft } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import {
  listarAtividadesConferente, registrarAtividadeTurno, cotaDiaria, bateuMetaAtividade, formatarBRL,
  type AtividadeConferente,
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

function unidadeSufixo(unidade: string): string {
  if (unidade === 'percentual') return '%'
  if (unidade === 'reais') return ' R$'
  return ''
}

function EntradaValor({ atividade, onSalvar, salvando }: { atividade: AtividadeConferente; onSalvar: (valorNumero: number | null, okNok: boolean | null) => void; salvando: boolean }) {
  const [valor, setValor] = useState(atividade.registroHoje?.valorNumero != null ? String(atividade.registroHoje.valorNumero) : '')
  const [okNok, setOkNok] = useState<boolean | null>(atividade.registroHoje?.okNok ?? null)

  if (atividade.unidade === 'ok_nok') {
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

  const numero = parseFloat(valor.replace(',', '.'))
  return (
    <div className="mt-5 space-y-3">
      <div className="bg-white/10 rounded-2xl px-5 py-6 text-center flex items-center justify-center gap-6">
        <button onClick={() => setValor((v) => v.slice(0, -1))} className="text-white/50 text-sm font-semibold px-2">⌫</button>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/[^0-9,.]/g, ''))}
          inputMode="decimal"
          placeholder="0"
          className="bg-transparent text-center text-4xl font-bold tabular-nums text-white outline-none w-40"
        />
        <span className="text-white/40 text-lg font-bold">{unidadeSufixo(atividade.unidade)}</span>
      </div>
      <button
        disabled={!Number.isFinite(numero) || salvando}
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
  const [resultado, setResultado] = useState<{ bateu: boolean; valor: number } | null>(null)
  const hoje = hojeISO()
  const cota = cotaDiaria(atividade.valorFinalMensal, hoje)

  async function salvar(valorNumero: number | null, okNok: boolean | null) {
    if (!usuario) return
    setSalvando(true)
    setErro('')
    const { error } = await registrarAtividadeTurno(atividade, hoje, { valorNumero, okNok }, { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login })
    setSalvando(false)
    if (error) { setErro(error); return }
    setResultado({ bateu: bateuMetaAtividade(atividade, valorNumero, okNok), valor: cota })
  }

  const metaTexto = atividade.unidade === 'ok_nok'
    ? 'Meta: precisa ser OK'
    : `Meta ${atividade.direcao === 'menor_melhor' ? '≤' : '≥'} ${atividade.metaValor}${unidadeSufixo(atividade.unidade)}`

  return (
    <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col px-5 pt-8 pb-10">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => onVoltar(!!resultado)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><ChevronLeft size={18} /></button>
        <div className="text-xs text-white/50 text-right">{atividade.turno}<br />{new Date(`${hoje}T00:00:00`).toLocaleDateString('pt-BR')}</div>
      </div>
      <h2 className="text-xl font-bold">{atividade.nome}</h2>
      <p className="text-sm text-white/50 mt-1">{metaTexto} · responsável {atividade.colaboradorNome} · cota do dia {formatarBRL(cota)}</p>

      {erro && <div className="bg-red-500/20 text-red-200 text-xs rounded-lg px-3 py-2 mt-4">{erro}</div>}

      {!resultado ? (
        <EntradaValor atividade={atividade} onSalvar={salvar} salvando={salvando} />
      ) : (
        <div className={`mt-6 rounded-2xl px-5 py-4 flex items-center justify-between font-bold text-sm ${resultado.bateu ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
          <span>{resultado.bateu ? '✓ bateu a meta' : '✕ não bateu a meta'}</span>
          <span>{resultado.bateu ? `+ ${formatarBRL(resultado.valor)}` : formatarBRL(0)}</span>
        </div>
      )}
    </div>
  )
}

export default function VariavelTurnoConferente() {
  const { usuario, sair } = useAuth()
  const [atividades, setAtividades] = useState<AtividadeConferente[]>([])
  const [loading, setLoading] = useState(true)
  const [aberta, setAberta] = useState<AtividadeConferente | null>(null)
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

  const turnos = [...new Set(atividades.map((a) => a.turno))]

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col">
      <header className="bg-[#0b1f2b] text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">Olá,</p>
            <h1 className="text-2xl font-bold">{usuario.nome ?? usuario.login}</h1>
            <p className="text-white/50 text-sm mt-0.5">Conferente{turnos.length > 0 ? ` · ${turnos.join(', ')}` : ''} · {new Date(`${hojeISO()}T00:00:00`).toLocaleDateString('pt-BR')}</p>
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
                  <div>
                    <p className="text-base font-bold text-gray-800">{a.nome}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {feita
                        ? `✓ já registrada · ${a.registroHoje?.okNok != null ? (a.registroHoje.okNok ? 'OK' : 'NOK') : `${a.registroHoje?.valorNumero}${unidadeSufixo(a.unidade)}`}`
                        : a.unidade === 'ok_nok' ? 'Meta: OK' : `Meta ${a.direcao === 'menor_melhor' ? '≤' : '≥'} ${a.metaValor}${unidadeSufixo(a.unidade)}`}
                    </p>
                  </div>
                  <div className={`rounded-full p-3 text-white ${feita ? 'bg-green-500' : 'bg-[#b6661a]'}`}>
                    {feita ? '✓' : '›'}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
