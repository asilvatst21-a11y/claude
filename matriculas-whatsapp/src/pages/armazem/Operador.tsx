import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, Square, ArrowLeft, ArrowRight, AlertTriangle, LogOut, Loader2, CheckCircle2, Boxes } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { enviarMensagemGrupo } from '../../lib/zapi'
import type { ArmazemAtividadeTipo, ArmazemExecucao, ArmazemExecucaoPausa, ArmazemPergunta, ArmazemResposta } from '../../types'

type Tela = 'carregando' | 'selecionar' | 'andamento' | 'wizard'

function formatarDuracao(segundos: number) {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

export default function ArmazemOperador() {
  const { usuario, sair } = useAuth()
  const navigate = useNavigate()

  const [tela, setTela] = useState<Tela>('carregando')
  const [atividades, setAtividades] = useState<ArmazemAtividadeTipo[]>([])
  const [execucao, setExecucao] = useState<ArmazemExecucao | null>(null)
  const [pausaAtual, setPausaAtual] = useState<ArmazemExecucaoPausa | null>(null)
  const [tipoAtividade, setTipoAtividade] = useState<ArmazemAtividadeTipo | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Wizard de finalização
  const [passo, setPasso] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [houveAnomalia, setHouveAnomalia] = useState<boolean | null>(null)
  const [anomaliaDescricao, setAnomaliaDescricao] = useState('')

  const carregarEstado = useCallback(async () => {
    if (!usuario) return
    setErro('')
    const { data: execAtiva } = await supabase
      .from('armazem_execucoes')
      .select('*')
      .eq('colaborador_id', usuario.id)
      .in('status', ['em_andamento', 'pausada'])
      .maybeSingle()

    if (execAtiva) {
      setExecucao(execAtiva)
      if (execAtiva.atividade_tipo_id) {
        const { data: tipo } = await supabase.from('armazem_atividades_tipo').select('*').eq('id', execAtiva.atividade_tipo_id).maybeSingle()
        setTipoAtividade(tipo ?? null)
      }
      if (execAtiva.status === 'pausada') {
        const { data: pausa } = await supabase
          .from('armazem_execucoes_pausas')
          .select('*')
          .eq('execucao_id', execAtiva.id)
          .is('pausa_fim', null)
          .maybeSingle()
        setPausaAtual(pausa ?? null)
      }
      setTela('andamento')
      return
    }

    const { data: tipos } = await supabase
      .from('armazem_atividades_tipo')
      .select('*')
      .eq('filial', usuario.filial)
      .eq('ativo', true)
      .contains('cargos', usuario.cargo ? [usuario.cargo] : [])
      .order('nome')
    setAtividades(Array.isArray(tipos) ? tipos : [])
    setTela('selecionar')
  }, [usuario])

  useEffect(() => { carregarEstado() }, [carregarEstado])

  useEffect(() => {
    if (tela !== 'andamento') return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [tela])

  async function iniciarAtividade(tipo: ArmazemAtividadeTipo) {
    if (!usuario) return
    setSalvando(true)
    setErro('')
    const { data, error } = await supabase
      .from('armazem_execucoes')
      .insert({
        filial: usuario.filial,
        colaborador_id: usuario.id,
        colaborador_nome: usuario.nome ?? usuario.login,
        cargo: usuario.cargo,
        atividade_tipo_id: tipo.id,
        atividade_nome: tipo.nome,
        hora_inicio: new Date().toISOString(),
        status: 'em_andamento',
      })
      .select('*')
      .single()
    setSalvando(false)
    if (error || !data) return setErro(error?.message ?? 'Não foi possível iniciar a atividade.')
    setExecucao(data)
    setTipoAtividade(tipo)
    setTela('andamento')
  }

  async function pausarAtividade() {
    if (!execucao) return
    setSalvando(true)
    const { data } = await supabase
      .from('armazem_execucoes_pausas')
      .insert({ execucao_id: execucao.id, pausa_inicio: new Date().toISOString() })
      .select('*')
      .single()
    await supabase.from('armazem_execucoes').update({ status: 'pausada' }).eq('id', execucao.id)
    setPausaAtual(data ?? null)
    setExecucao({ ...execucao, status: 'pausada' })
    setSalvando(false)
  }

  async function retomarAtividade() {
    if (!execucao || !pausaAtual) return
    setSalvando(true)
    await supabase.from('armazem_execucoes_pausas').update({ pausa_fim: new Date().toISOString() }).eq('id', pausaAtual.id)
    await supabase.from('armazem_execucoes').update({ status: 'em_andamento' }).eq('id', execucao.id)
    setPausaAtual(null)
    setExecucao({ ...execucao, status: 'em_andamento' })
    setSalvando(false)
  }

  async function cancelarAtividade() {
    if (!execucao) return
    if (!window.confirm('Cancelar esta atividade? Use apenas se ela foi iniciada por engano.')) return
    setSalvando(true)
    await supabase.from('armazem_execucoes').update({ status: 'cancelada', hora_fim: new Date().toISOString() }).eq('id', execucao.id)
    setSalvando(false)
    resetarParaSelecao()
  }

  function resetarParaSelecao() {
    setExecucao(null)
    setTipoAtividade(null)
    setPausaAtual(null)
    setPasso(0)
    setRespostas({})
    setHouveAnomalia(null)
    setAnomaliaDescricao('')
    carregarEstado()
  }

  function abrirWizard() {
    setPasso(0)
    setRespostas({})
    setHouveAnomalia(null)
    setAnomaliaDescricao('')
    setTela('wizard')
  }

  const perguntas: ArmazemPergunta[] = tipoAtividade?.perguntas ?? []
  const totalPassos = perguntas.length + 1 // + pergunta de anomalia
  const perguntaAtual = passo < perguntas.length ? perguntas[passo] : null

  function respostaValida(): boolean {
    if (perguntaAtual) {
      const valor = respostas[perguntaAtual.id]
      if (!perguntaAtual.obrigatoria) return true
      return !!valor && valor.trim() !== ''
    }
    if (houveAnomalia === null) return false
    if (houveAnomalia && !anomaliaDescricao.trim()) return false
    return true
  }

  async function avancarWizard() {
    if (!respostaValida()) return
    if (passo < totalPassos - 1) {
      setPasso(passo + 1)
    } else {
      await finalizarAtividade()
    }
  }

  async function finalizarAtividade() {
    if (!execucao) return
    setSalvando(true)
    setErro('')

    const respostasFinais: ArmazemResposta[] = perguntas.map(p => ({
      pergunta_id: p.id,
      pergunta: p.pergunta,
      resposta: respostas[p.id] ?? '',
    }))

    const horaFim = new Date()
    const duracaoMinutos = Math.round((horaFim.getTime() - new Date(execucao.hora_inicio).getTime()) / 60000)

    const { error } = await supabase
      .from('armazem_execucoes')
      .update({
        status: 'concluida',
        hora_fim: horaFim.toISOString(),
        duracao_minutos: duracaoMinutos,
        respostas: respostasFinais,
        houve_anomalia: !!houveAnomalia,
        anomalia_descricao: houveAnomalia ? anomaliaDescricao.trim() : null,
      })
      .eq('id', execucao.id)

    if (error) {
      setSalvando(false)
      return setErro(error.message)
    }

    if (houveAnomalia && usuario) {
      const { data: filial } = await supabase.from('filiais').select('grupo_armazem_whatsapp').eq('nome', usuario.filial).maybeSingle()
      if (filial?.grupo_armazem_whatsapp) {
        enviarMensagemGrupo(
          filial.grupo_armazem_whatsapp,
          `⚠️ Anomalia registrada no Armazém\n\nColaborador: ${execucao.colaborador_nome}\nAtividade: ${execucao.atividade_nome}\nDescrição: ${anomaliaDescricao.trim()}`,
        ).catch(() => { /* alerta é best-effort, não bloqueia a finalização */ })
      }
    }

    setSalvando(false)
    resetarParaSelecao()
  }

  if (tela === 'carregando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1f2b]">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    )
  }

  // ─── Tela: selecionar atividade ─────────────────────────────────────────
  if (tela === 'selecionar') {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex flex-col">
        <header className="bg-[#0b1f2b] text-white px-5 pt-8 pb-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm">Olá,</p>
              <h1 className="text-2xl font-bold">{usuario?.nome ?? usuario?.login}</h1>
              <p className="text-white/50 text-sm mt-0.5">{usuario?.cargo ?? '—'}</p>
            </div>
            <button onClick={() => { sair(); navigate('/login') }} className="p-2 rounded-full bg-white/10 hover:bg-white/20" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-5 py-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Boxes size={20} className="text-accent-500" /> Escolha uma atividade
          </h2>
          {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
          {atividades.length === 0 ? (
            <p className="text-gray-400 text-center py-12">Nenhuma atividade disponível para o seu cargo no momento.</p>
          ) : (
            <div className="space-y-3">
              {atividades.map(a => (
                <button
                  key={a.id}
                  disabled={salvando}
                  onClick={() => iniciarAtividade(a)}
                  className="w-full bg-white rounded-2xl shadow-sm border p-5 text-left flex items-center justify-between active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <div>
                    <p className="text-lg font-bold text-gray-800">{a.nome}</p>
                    {a.unidade_producao && <p className="text-sm text-gray-400 mt-0.5">Produção em {a.unidade_producao}</p>}
                    {a.meta_tempo_minutos && <p className="text-sm text-gray-400">Meta: {a.meta_tempo_minutos} min</p>}
                  </div>
                  <div className="bg-green-500 text-white rounded-full p-3">
                    <Play size={20} fill="white" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    )
  }

  // ─── Tela: atividade em andamento ───────────────────────────────────────
  if (tela === 'andamento' && execucao) {
    const pausada = execucao.status === 'pausada'
    const segundos = Math.max(0, Math.floor((agora - new Date(execucao.hora_inicio).getTime()) / 1000))

    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col">
        <header className="px-5 pt-8 pb-2">
          <p className="text-white/50 text-sm uppercase tracking-wide">Atividade em execução</p>
          <h1 className="text-3xl font-bold mt-1">{execucao.atividade_nome}</h1>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="text-6xl font-mono font-bold tabular-nums tracking-tight">
            {formatarDuracao(segundos)}
          </div>
          {pausada && (
            <p className="mt-3 text-amber-400 font-semibold flex items-center gap-1.5">
              <Pause size={16} /> Pausada
            </p>
          )}
        </main>

        <div className="px-5 pb-10 space-y-3">
          {pausada ? (
            <button
              onClick={retomarAtividade}
              disabled={salvando}
              className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play size={22} fill="white" /> Retomar
            </button>
          ) : (
            <button
              onClick={pausarAtividade}
              disabled={salvando}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Pause size={22} fill="white" /> Pausar
            </button>
          )}

          <button
            onClick={abrirWizard}
            disabled={salvando || pausada}
            className="w-full bg-accent-500 hover:bg-accent-600 text-white rounded-2xl py-5 text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Square size={20} fill="white" /> Finalizar atividade
          </button>

          <button
            onClick={cancelarAtividade}
            disabled={salvando}
            className="w-full text-red-400 hover:text-red-300 text-sm font-medium py-2 disabled:opacity-50"
          >
            Cancelar atividade (iniciada por engano)
          </button>
        </div>
      </div>
    )
  }

  // ─── Tela: wizard de finalização (uma pergunta por vez) ─────────────────
  if (tela === 'wizard') {
    const progresso = ((passo + 1) / totalPassos) * 100
    const ultimo = passo === totalPassos - 1

    return (
      <div className="min-h-screen bg-[#0b1f2b] text-white flex flex-col">
        <header className="px-5 pt-8 pb-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setTela('andamento')} className="text-white/60 hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <p className="text-white/50 text-sm">{passo + 1} de {totalPassos}</p>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-accent-500 transition-all duration-300" style={{ width: `${progresso}%` }} />
          </div>
        </header>

        <main className="flex-1 flex flex-col justify-center px-6">
          {perguntaAtual ? (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold leading-tight">{perguntaAtual.pergunta}</h2>

              {perguntaAtual.tipo === 'numero' && (
                <input
                  type="number"
                  autoFocus
                  className="w-full bg-white/10 rounded-2xl px-5 py-5 text-2xl font-semibold outline-none focus:ring-2 focus:ring-accent-500 placeholder:text-white/30"
                  placeholder="Digite um número"
                  value={respostas[perguntaAtual.id] ?? ''}
                  onChange={e => setRespostas({ ...respostas, [perguntaAtual.id]: e.target.value })}
                />
              )}

              {perguntaAtual.tipo === 'texto' && (
                <textarea
                  autoFocus
                  rows={4}
                  className="w-full bg-white/10 rounded-2xl px-5 py-5 text-xl font-medium outline-none focus:ring-2 focus:ring-accent-500 placeholder:text-white/30"
                  placeholder="Digite sua resposta"
                  value={respostas[perguntaAtual.id] ?? ''}
                  onChange={e => setRespostas({ ...respostas, [perguntaAtual.id]: e.target.value })}
                />
              )}

              {perguntaAtual.tipo === 'sim_nao' && (
                <div className="grid grid-cols-2 gap-3">
                  {['Sim', 'Não'].map(opcao => (
                    <button
                      key={opcao}
                      onClick={() => setRespostas({ ...respostas, [perguntaAtual.id]: opcao })}
                      className={`rounded-2xl py-6 text-2xl font-bold transition-colors
                        ${respostas[perguntaAtual.id] === opcao ? 'bg-accent-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {opcao}
                    </button>
                  ))}
                </div>
              )}

              {perguntaAtual.tipo === 'multipla_escolha' && (
                <div className="space-y-3">
                  {(perguntaAtual.opcoes ?? []).filter(o => o.trim()).map(opcao => (
                    <button
                      key={opcao}
                      onClick={() => setRespostas({ ...respostas, [perguntaAtual.id]: opcao })}
                      className={`w-full rounded-2xl py-5 px-5 text-xl font-semibold text-left transition-colors
                        ${respostas[perguntaAtual.id] === opcao ? 'bg-accent-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {opcao}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold leading-tight flex items-center gap-3">
                <AlertTriangle className="text-amber-400" size={32} /> Houve alguma anomalia durante a atividade?
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map(valor => (
                  <button
                    key={String(valor)}
                    onClick={() => setHouveAnomalia(valor)}
                    className={`rounded-2xl py-6 text-2xl font-bold transition-colors
                      ${houveAnomalia === valor ? 'bg-accent-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    {valor ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
              {houveAnomalia && (
                <textarea
                  autoFocus
                  rows={4}
                  className="w-full bg-white/10 rounded-2xl px-5 py-5 text-xl font-medium outline-none focus:ring-2 focus:ring-accent-500 placeholder:text-white/30"
                  placeholder="Descreva a anomalia"
                  value={anomaliaDescricao}
                  onChange={e => setAnomaliaDescricao(e.target.value)}
                />
              )}
            </div>
          )}

          {erro && <p className="text-red-400 mt-4">{erro}</p>}
        </main>

        <div className="px-5 pb-10">
          <button
            onClick={avancarWizard}
            disabled={!respostaValida() || salvando}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white rounded-2xl py-5 text-xl font-bold flex items-center justify-center gap-2"
          >
            {salvando ? <Loader2 className="animate-spin" /> : ultimo ? <><CheckCircle2 size={22} /> Finalizar Atividade</> : <>Próxima <ArrowRight size={20} /></>}
          </button>
        </div>
      </div>
    )
  }

  return null
}
