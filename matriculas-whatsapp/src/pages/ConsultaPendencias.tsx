import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Delete, Search, Loader2, Mic, Square, Send, ChevronRight, Wallet } from 'lucide-react'
import { formatarDataBR } from '../lib/utils'
import {
  buscarPendenciasPorCpf, consultaPendenciasEstaAtiva, enviarJustificativaPendencia, transcreverAudioPendencia,
  type CandidatoPendencia, type PendenciaItem, type ReposicaoPendencia,
} from '../lib/consultaPendencias'

type StatusItem = 'aguardando' | 'justificado' | 'abonado' | 'faturado'
type Aba = 'financeiro' | 'reposicoes'

const TIPO_REPOSICAO_LABEL: Record<string, string> = {
  falta: 'Falta',
  inversao: 'Inversão',
  avaria: 'Avaria',
  troca: 'Troca',
  remessa: 'Simples Remessa',
  indefinido: 'Não informado',
}

function statusDoItem(item: PendenciaItem): StatusItem {
  if (item.statusVale === 'Abonado') return 'abonado'
  if (item.statusVale === 'Faturado') return 'faturado'
  if (item.justificativaPrevia) return 'justificado'
  return 'aguardando'
}

function agruparPorData<T extends { data: string | null }>(itens: T[]): { data: string; itens: T[] }[] {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const chave = item.data ?? 'sem-data'
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave)!.push(item)
  }
  return [...mapa.entries()]
    .map(([data, itens]) => ({ data, itens }))
    .sort((a, b) => b.data.localeCompare(a.data))
}

export default function ConsultaPendencias() {
  const [searchParams] = useSearchParams()
  const modoTeste = searchParams.get('preview') === '1'
  const [ativa, setAtiva] = useState<boolean | null>(null)
  const [digitos, setDigitos] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [candidatos, setCandidatos] = useState<CandidatoPendencia[] | null>(null)
  const [pessoa, setPessoa] = useState<CandidatoPendencia | null>(null)
  const [itemAberto, setItemAberto] = useState<PendenciaItem | null>(null)
  const [reposicaoAberta, setReposicaoAberta] = useState<ReposicaoPendencia | null>(null)
  const [aba, setAba] = useState<Aba>('financeiro')

  useEffect(() => { consultaPendenciasEstaAtiva().then(setAtiva) }, [])

  function tecla(n: string) {
    if (digitos.length >= 3) return
    setErro('')
    setDigitos((d) => (d + n).slice(0, 3))
  }
  function apagar() { setErro(''); setDigitos((d) => d.slice(0, -1)) }

  async function buscar() {
    if (digitos.length !== 3) { setErro('Digite os 3 primeiros números do seu CPF.'); return }
    setErro(''); setBuscando(true)
    try {
      const resultado = await buscarPendenciasPorCpf(digitos)
      if (resultado.length === 0) {
        setErro('Não encontramos pendências para esses números. Confira os dígitos ou procure o setor financeiro.')
        return
      }
      if (resultado.length === 1) {
        setPessoa(resultado[0])
      } else {
        setCandidatos(resultado)
      }
    } catch {
      setErro('Erro ao consultar. Tente de novo.')
    } finally {
      setBuscando(false)
    }
  }

  function reiniciar() {
    setDigitos(''); setErro(''); setCandidatos(null); setPessoa(null); setItemAberto(null)
    setReposicaoAberta(null); setAba('financeiro')
  }

  // Enquanto a funcionalidade não estiver liberada (Vales > Configurações),
  // a página fica numa tela neutra de espera — mesmo que alguém acesse o
  // link direto, nada de real é exposto antes da aprovação do jurídico.
  if (ativa === null) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-300" />
      </div>
    )
  }
  if (ativa === false && !modoTeste) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Wallet className="h-8 w-8 text-accent-300" />
        <p className="text-lg font-bold">Consulta de Pendências</p>
        <p className="text-brand-200 text-sm max-w-xs">Essa funcionalidade ainda não está disponível. Em caso de dúvidas, procure o setor financeiro.</p>
      </div>
    )
  }

  const mostrarBannerTeste = modoTeste && !ativa

  // ── Detalhe de um item (justificativa ou status final) ────────────────
  if (pessoa && itemAberto) {
    return (
      <DetalheItem
        item={itemAberto}
        mostrarBannerTeste={mostrarBannerTeste}
        onVoltar={() => setItemAberto(null)}
        onJustificado={(texto) => {
          setItemAberto({ ...itemAberto, justificativaPrevia: texto })
          setPessoa({
            ...pessoa,
            itens: pessoa.itens.map((i) => (i.itemId === itemAberto.itemId ? { ...i, justificativaPrevia: texto } : i)),
          })
        }}
      />
    )
  }

  // ── Detalhe de uma reposição (só leitura — sem justificativa) ──────────
  if (pessoa && reposicaoAberta) {
    return <DetalheReposicao reposicao={reposicaoAberta} mostrarBannerTeste={mostrarBannerTeste} onVoltar={() => setReposicaoAberta(null)} />
  }

  // ── Lista de pendências por data (abas Financeiro / Reposições) ────────
  if (pessoa) {
    const buckets = agruparPorData(pessoa.itens)
    const bucketsReposicoes = agruparPorData(pessoa.reposicoes)
    const temReposicoes = pessoa.reposicoes.length > 0
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        {mostrarBannerTeste && <ModoTesteBanner />}
        <div className="px-5 pt-8 pb-6">
          <button onClick={reiniciar} className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</button>
          <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Wallet className="h-4 w-4" /> Consulta</div>
          <h1 className="text-2xl font-bold">Olá, {pessoa.nome.split(' ')[0]}</h1>
          <p className="text-brand-200 text-sm mt-1">Toque numa data pra ver os detalhes.</p>
        </div>
        <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-3">
          {temReposicoes && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              <button onClick={() => setAba('financeiro')} className={`flex-1 text-center text-xs font-bold py-2 rounded-lg transition-colors ${aba === 'financeiro' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-400'}`}>Financeiro</button>
              <button onClick={() => setAba('reposicoes')} className={`flex-1 text-center text-xs font-bold py-2 rounded-lg transition-colors ${aba === 'reposicoes' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-400'}`}>Reposições</button>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {aba === 'financeiro' ? (
              buckets.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma pendência financeira no momento.</p>
              ) : buckets.map((b) => (
                <div key={b.data} className="flex flex-col gap-1.5">
                  {b.itens.map((item) => {
                    const status = statusDoItem(item)
                    return (
                      <button
                        key={item.itemId}
                        onClick={() => setItemAberto(item)}
                        className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-4 py-3 text-left hover:border-accent-300 transition-colors"
                      >
                        <div>
                          <p className="font-bold text-gray-900">{formatarDataBR(item.data)}</p>
                          <p className="text-xs text-gray-400">{item.mapa ? `Mapa ${item.mapa}` : '—'}{item.produto ? ` · ${item.produto}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusPill status={status} />
                          <ChevronRight className="h-4 w-4 text-gray-300" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            ) : (
              bucketsReposicoes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma reposição em validação no momento.</p>
              ) : bucketsReposicoes.map((b) => (
                <div key={b.data} className="flex flex-col gap-1.5">
                  {b.itens.map((rep) => (
                    <button
                      key={rep.id}
                      onClick={() => setReposicaoAberta(rep)}
                      className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-4 py-3 text-left hover:border-accent-300 transition-colors"
                    >
                      <div>
                        <p className="font-bold text-gray-900">{formatarDataBR(rep.data)}{rep.produto ? ` · ${rep.produto}` : ''}</p>
                        <p className="text-xs text-gray-400">{TIPO_REPOSICAO_LABEL[rep.tipoReposicao ?? 'indefinido'] ?? 'Não informado'}{rep.mapa ? ` · Mapa ${rep.mapa}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusReposicaoPill status={rep.status} />
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Disambiguação (dígitos batem com mais de uma pessoa) ────────────
  if (candidatos) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        {mostrarBannerTeste && <ModoTesteBanner />}
        <div className="px-5 pt-8 pb-6">
          <button onClick={reiniciar} className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</button>
          <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Wallet className="h-4 w-4" /> Pendências</div>
          <h1 className="text-xl font-bold">Encontramos mais de uma pessoa</h1>
          <p className="text-brand-200 text-sm mt-1">Toque no seu nome pra continuar.</p>
        </div>
        <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-2">
          {candidatos.map((c) => (
            <button key={c.colaboradorId} onClick={() => { setPessoa(c); setAba('financeiro') }} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-left hover:border-accent-300 transition-colors">
              <span className="font-medium text-gray-900">{c.nome}</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Entrada (CPF) ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {mostrarBannerTeste && <ModoTesteBanner />}
      <div className="px-5 pt-8 pb-6">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Wallet className="h-4 w-4" /> Pendências</div>
        <h1 className="text-2xl font-bold">Consultar minhas pendências</h1>
        <p className="text-brand-200 text-sm mt-1">Digite os 3 primeiros números do seu CPF.</p>
      </div>
      <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-5">
        <div className="flex justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`w-16 h-20 rounded-2xl border-2 grid place-items-center text-4xl font-extrabold tabular-nums ${digitos[i] ? 'border-accent-500 text-gray-900' : 'border-gray-200 text-gray-300'}`}>
              {digitos[i] ?? '•'}
            </div>
          ))}
        </div>

        {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 text-center">{erro}</div>}

        <div className="grid grid-cols-3 gap-3 mt-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button key={n} onClick={() => tecla(n)} className="py-4 rounded-xl border border-gray-200 text-2xl font-bold tabular-nums active:bg-gray-100 transition">{n}</button>
          ))}
          <button onClick={apagar} className="py-4 rounded-xl border border-gray-200 grid place-items-center active:bg-gray-100 transition"><Delete className="h-6 w-6 text-gray-500" /></button>
          <button onClick={() => tecla('0')} className="py-4 rounded-xl border border-gray-200 text-2xl font-bold tabular-nums active:bg-gray-100 transition">0</button>
          <button onClick={buscar} disabled={buscando || digitos.length !== 3} className="py-4 rounded-xl bg-accent-500 disabled:opacity-40 text-white grid place-items-center active:bg-accent-600 transition">
            {buscando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Search className="h-6 w-6" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModoTesteBanner() {
  return (
    <div className="bg-amber-500 text-amber-950 text-center text-[11px] font-bold uppercase tracking-wide py-1.5">
      Modo teste — ainda não está ligado pro público
    </div>
  )
}

function StatusPill({ status }: { status: StatusItem }) {
  if (status === 'aguardando') return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">Aguardando</span>
  if (status === 'justificado') return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">Justificado</span>
  return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 whitespace-nowrap">Resolvida</span>
}

// ─── Detalhe de um item: dados operacionais (sem valores) + justificativa
// prévia (texto ou áudio), ou o status final quando já concluído. ────────
function DetalheItem({ item, mostrarBannerTeste, onVoltar, onJustificado }: {
  item: PendenciaItem
  mostrarBannerTeste: boolean
  onVoltar: () => void
  onJustificado: (texto: string) => void
}) {
  const status = statusDoItem(item)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function alternarGravacao() {
    if (gravando) {
      mediaRecorderRef.current?.stop()
      setGravando(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setTranscrevendo(true)
        const transcrito = await transcreverAudioPendencia(blob)
        setTranscrevendo(false)
        if (transcrito) setTexto((t) => (t ? `${t} ${transcrito}` : transcrito))
        else setErro('Não conseguimos transcrever o áudio. Tente digitar.')
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setGravando(true)
    } catch {
      setErro('Não conseguimos acessar o microfone.')
    }
  }

  async function enviarJustificativa() {
    if (!texto.trim()) return
    setEnviando(true)
    setErro('')
    try {
      const ok = await enviarJustificativaPendencia(item.itemId, item.ajudanteId, texto.trim())
      if (ok) {
        onJustificado(texto.trim())
        setEnviado(true)
      } else {
        setErro('Erro ao salvar. Tente de novo.')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {mostrarBannerTeste && <ModoTesteBanner />}
      <div className="px-5 pt-8 pb-6">
        <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Wallet className="h-4 w-4" /> Pendências</div>
        <h1 className="text-xl font-bold">Pendência de {formatarDataBR(item.data)}</h1>
      </div>
      <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-4">
        {(status === 'abonado' || status === 'faturado') ? (
          <div className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4">
            <StatusPill status={status} />
            <DetalheGrid item={item} />
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">Em caso de dúvidas, procure o setor financeiro.</p>
          </div>
        ) : enviado ? (
          <div className="flex flex-col items-center text-center gap-3 py-6 px-4 rounded-2xl bg-green-50 border border-green-600">
            <div className="w-12 h-12 rounded-full bg-green-600 text-white grid place-items-center text-2xl font-extrabold">✓</div>
            <p className="text-base font-extrabold text-green-700">JUSTIFICADO!</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Esta é apenas uma justificativa prévia do seu relato. Sua presença no financeiro
              ainda é obrigatória para resolver a pendência.
            </p>
          </div>
        ) : status === 'justificado' ? (
          <div className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4">
            <DetalheGrid item={item} />
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase text-blue-700 mb-1">Sua justificativa</p>
              <p className="text-sm text-blue-900">{item.justificativaPrevia}</p>
            </div>
            <p className="text-xs text-gray-400">Sua presença no financeiro ainda é obrigatória para resolver a pendência.</p>
          </div>
        ) : (
          <>
            <div className="border border-gray-200 rounded-xl p-4">
              <DetalheGrid item={item} />
            </div>
            <div className="border border-dashed border-gray-300 rounded-xl p-4 flex flex-col gap-2.5">
              <label className="text-xs font-semibold text-gray-600">O que aconteceu?</label>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Conte o que aconteceu…"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              />
              {erro && <p className="text-xs text-red-600">{erro}</p>}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={alternarGravacao}
                  disabled={transcrevendo}
                  className={`flex-1 flex items-center justify-center gap-2 text-base font-semibold py-4 rounded-xl ${gravando ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'}`}
                >
                  {transcrevendo ? <Loader2 className="h-5 w-5 animate-spin" /> : gravando ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  {transcrevendo ? 'Transcrevendo…' : gravando ? 'Parar gravação' : 'Gravar áudio'}
                </button>
                <button
                  onClick={enviarJustificativa}
                  disabled={!texto.trim() || enviando}
                  className="flex-1 flex items-center justify-center gap-2 text-base font-semibold py-4 rounded-xl bg-accent-500 text-white disabled:opacity-40"
                >
                  {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  Enviar justificativa
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DetalheGrid({ item }: { item: PendenciaItem }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Campo label="Mapa" valor={item.mapa != null ? String(item.mapa) : '—'} />
      <Campo label="Produto" valor={item.produto ?? '—'} />
      <Campo label="Qtd. saída" valor={item.qtdeSaida != null ? `${item.qtdeSaida} ${item.unidade ?? ''}`.trim() : '—'} />
      <Campo label="Qtd. retorno" valor={item.qtdeRetorno != null ? `${item.qtdeRetorno} ${item.unidade ?? ''}`.trim() : '—'} />
      <Campo label="Qtd. diferença" valor={item.qtdeDiferenca != null ? `${item.qtdeDiferenca} ${item.unidade ?? ''}`.trim() : '—'} />
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{valor}</span>
    </div>
  )
}

function StatusReposicaoPill({ status }: { status: ReposicaoPendencia['status'] }) {
  if (status === 'pendente') return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">Aguardando</span>
  if (status === 'validado') return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 whitespace-nowrap">Aprovada</span>
  return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-700 whitespace-nowrap">Reprovada</span>
}

// ─── Detalhe de uma reposição: só leitura, sem campo de justificativa — o
// colaborador apenas acompanha se a validação foi aprovada ou reprovada. ───
function DetalheReposicao({ reposicao, mostrarBannerTeste, onVoltar }: {
  reposicao: ReposicaoPendencia
  mostrarBannerTeste: boolean
  onVoltar: () => void
}) {
  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {mostrarBannerTeste && <ModoTesteBanner />}
      <div className="px-5 pt-8 pb-6">
        <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Wallet className="h-4 w-4" /> Consulta</div>
        <h1 className="text-xl font-bold">Reposição de {formatarDataBR(reposicao.data)}</h1>
      </div>
      <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-4">
        <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Mapa" valor={reposicao.mapa ?? '—'} />
            <Campo label="Tipo" valor={TIPO_REPOSICAO_LABEL[reposicao.tipoReposicao ?? 'indefinido'] ?? 'Não informado'} />
            <Campo label="Produto" valor={reposicao.produto ?? '—'} />
            <Campo label="Quantidade" valor={reposicao.quantidade ?? '—'} />
          </div>
          <div>
            <StatusReposicaoPill status={reposicao.status} />
          </div>
          {reposicao.status === 'negado' && reposicao.motivoReprovacao && (
            <div className="bg-red-50 border border-red-600 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase text-red-700 mb-1">Motivo da reprovação</p>
              <p className="text-sm text-red-800">{reposicao.motivoReprovacao}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            {reposicao.status === 'pendente'
              ? 'Essa solicitação foi registrada pelo robô de reposição e está com o controle pra validar. Você só acompanha o status aqui — não precisa fazer nada.'
              : 'Em caso de dúvidas, procure o setor financeiro.'}
          </p>
        </div>
      </div>
    </div>
  )
}
