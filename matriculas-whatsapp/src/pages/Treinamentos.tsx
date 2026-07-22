import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, GraduationCap, Loader2, Upload, Plus, Trash2, CheckCircle2,
  AlertTriangle, RefreshCw, Search, MessageCircle, Send,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { enviarAvisosTreinamento } from '../lib/treinamentos'
import { SALA_TML_LABEL, type SalaTML } from '../lib/tml'
import { formatarDataBR } from '../lib/utils'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'

const SALAS: SalaTML[] = ['COLORADO', 'SUB-FURIA']

interface FaqItem { pergunta: string; resposta: string }

interface Treinamento {
  id: string
  titulo: string
  salas: SalaTML[]
  palestrante_nome: string
  palestrante_telefone: string
  data_treinamento: string
  status: 'rascunho' | 'publicado'
  created_at: string
}

function amanhaISO(): string {
  return new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10)
}

interface Duvida {
  id: string
  treinamento_id: string
  colaborador_nome: string | null
  pergunta: string
  pergunta_por_audio: boolean
  resposta: string | null
  status: 'aguardando_palestrante' | 'respondida_auto' | 'respondida_palestrante'
  created_at: string
}

const STATUS_DUVIDA_LABEL: Record<Duvida['status'], string> = {
  aguardando_palestrante: 'Aguardando palestrante',
  respondida_auto: 'Respondida na hora',
  respondida_palestrante: 'Respondida pelo palestrante',
}
const STATUS_DUVIDA_COR: Record<Duvida['status'], string> = {
  aguardando_palestrante: 'bg-amber-50 text-amber-700',
  respondida_auto: 'bg-green-50 text-green-700',
  respondida_palestrante: 'bg-blue-50 text-blue-700',
}

function lerArquivoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const resultado = String(reader.result ?? '')
      resolve(resultado.slice(resultado.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function Treinamentos() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'criar' | 'duvidas'>('criar')

  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([])
  const [loadingLista, setLoadingLista] = useState(true)

  // Formulário de novo treinamento
  const [titulo, setTitulo] = useState('')
  const [salasSelecionadas, setSalasSelecionadas] = useState<SalaTML[]>(['COLORADO'])
  const [dataTreinamento, setDataTreinamento] = useState(amanhaISO())
  const [palestranteNome, setPalestranteNome] = useState('')
  const [palestranteTelefone, setPalestranteTelefone] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroGeracao, setErroGeracao] = useState('')
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [conteudoExtraido, setConteudoExtraido] = useState('')
  const [publicando, setPublicando] = useState(false)
  const [publicado, setPublicado] = useState(false)

  const [forcando, setForcando] = useState<string | null>(null)
  const [msgForcado, setMsgForcado] = useState<string | null>(null)

  const fetchTreinamentos = useCallback(async () => {
    if (!usuario) return
    setLoadingLista(true)
    const { data } = await supabase
      .from('treinamentos_matinal')
      .select('id, titulo, salas, palestrante_nome, palestrante_telefone, data_treinamento, status, created_at')
      .eq('filial', usuario.filial)
      .order('created_at', { ascending: false })
    setTreinamentos((data ?? []) as Treinamento[])
    setLoadingLista(false)
  }, [usuario])

  useEffect(() => { fetchTreinamentos() }, [fetchTreinamentos])

  async function gerarFaq() {
    if (!arquivo) return
    setGerando(true)
    setErroGeracao('')
    setFaq([])
    try {
      const base64 = await lerArquivoBase64(arquivo)
      const resp = await fetch('/api/treinamento-gerar-faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeArquivo: arquivo.name, mimeType: arquivo.type, base64 }),
      })
      const data = await resp.json()
      if (!resp.ok) { setErroGeracao(data?.erro ?? 'Erro ao gerar a FAQ.'); return }
      setFaq(data.faq ?? [])
      setConteudoExtraido(data.conteudoExtraido ?? '')
    } catch {
      setErroGeracao('Erro de conexão ao processar o arquivo.')
    } finally {
      setGerando(false)
    }
  }

  function atualizarFaq(i: number, campo: 'pergunta' | 'resposta', valor: string) {
    setFaq((f) => f.map((item, idx) => (idx === i ? { ...item, [campo]: valor } : item)))
  }
  function removerFaq(i: number) {
    setFaq((f) => f.filter((_, idx) => idx !== i))
  }
  function adicionarFaqManual() {
    setFaq((f) => [...f, { pergunta: '', resposta: '' }])
  }

  // Botão de emergência: manda os avisos do treinamento mesmo se ninguém
  // finalizou a matinal pelo botão (Timer da Matinal) — por exemplo quando a
  // matinal foi auto-finalizada pelo reimport do checklist e o disparo
  // automático nunca rodou.
  async function forcarDisparo(t: Treinamento) {
    if (!usuario) return
    setForcando(t.id)
    setMsgForcado(null)
    let total = 0
    for (const sala of t.salas) {
      const { enviados } = await enviarAvisosTreinamento(usuario.filial, sala, { id: t.id, titulo: t.titulo })
      total += enviados
    }
    setForcando(null)
    setMsgForcado(`${total} aviso(s) enviado(s) pra "${t.titulo}".`)
    setTimeout(() => setMsgForcado(null), 5000)
  }

  function alternarSala(s: SalaTML) {
    setSalasSelecionadas((atual) => {
      if (atual.includes(s)) {
        const restante = atual.filter((x) => x !== s)
        return restante.length > 0 ? restante : atual  // sempre pelo menos 1 sala marcada
      }
      return [...atual, s]
    })
  }

  const podePublicar =
    !!usuario && titulo.trim() && palestranteNome.trim() && palestranteTelefone.trim() &&
    dataTreinamento && salasSelecionadas.length > 0 &&
    faq.length > 0 && faq.every((f) => f.pergunta.trim() && f.resposta.trim())

  async function publicar() {
    if (!usuario || !podePublicar) return
    setPublicando(true)
    setErroGeracao('')
    const { data: trein, error } = await supabase
      .from('treinamentos_matinal')
      .insert({
        filial: usuario.filial,
        salas: salasSelecionadas,
        data_treinamento: dataTreinamento,
        titulo: titulo.trim(),
        palestrante_nome: palestranteNome.trim(),
        palestrante_telefone: palestranteTelefone.trim(),
        arquivo_nome: arquivo?.name ?? null,
        conteudo_extraido: conteudoExtraido || null,
        status: 'publicado',
      })
      .select('id')
      .single()
    if (error || !trein) {
      setPublicando(false)
      setErroGeracao(`Não foi possível publicar: ${error?.message ?? 'erro desconhecido'}`)
      return
    }
    const { error: errFaq } = await supabase.from('treinamento_faq_matinal').insert(
      faq.map((f) => ({ treinamento_id: trein.id, pergunta: f.pergunta.trim(), resposta: f.resposta.trim(), origem: 'ia' as const })),
    )
    setPublicando(false)
    if (errFaq) { setErroGeracao(`Treinamento criado, mas houve erro ao salvar a FAQ: ${errFaq.message}`); return }

    setPublicado(true)
    setTitulo(''); setPalestranteNome(''); setPalestranteTelefone(''); setArquivo(null); setFaq([]); setConteudoExtraido('')
    setSalasSelecionadas(['COLORADO']); setDataTreinamento(amanhaISO())
    await fetchTreinamentos()
    setTimeout(() => setPublicado(false), 3000)
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link to="/distribuicao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Treinamentos</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Suba o material do treinamento, revise a FAQ gerada automaticamente e publique para a matinal. Dúvidas dos
          colaboradores respondidas pelo WhatsApp aparecem na Central de Dúvidas.
        </p>
      </div>

      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button onClick={() => setAba('criar')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${aba === 'criar' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}>Treinamentos</button>
        <button onClick={() => setAba('duvidas')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${aba === 'duvidas' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}>Central de Dúvidas</button>
      </div>

      {aba === 'criar' && (
        <>
          {usuario && <GruposMatinalConfig filial={usuario.filial} />}

          <div className="rounded-lg border p-4 sm:p-5 space-y-5">
            <h2 className="font-semibold">Novo treinamento</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Título do treinamento</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Amarração de Carga — NR-11"
                  className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Sala(s) — toque para marcar mais de uma</label>
                <div className="grid grid-cols-2 gap-2">
                  {SALAS.map((s) => {
                    const marcada = salasSelecionadas.includes(s)
                    return (
                      <button key={s} type="button" onClick={() => alternarSala(s)}
                        className={`py-2 text-sm font-semibold rounded-md border-2 transition-colors ${marcada ? 'bg-primary text-primary-foreground border-primary' : 'border-gray-200 hover:border-primary/40'}`}>
                        {SALA_TML_LABEL[s]}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">Se marcar as duas, a FAQ vale pras duas salas.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Data do treinamento</label>
                <input type="date" value={dataTreinamento} onChange={(e) => setDataTreinamento(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
                <p className="text-[11px] text-muted-foreground">Só aparece no Timer da Matinal desse dia.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Palestrante</label>
                <input value={palestranteNome} onChange={(e) => setPalestranteNome(e.target.value)} placeholder="Nome de quem apresentou"
                  className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Telefone do palestrante</label>
                <input value={palestranteTelefone} onChange={(e) => setPalestranteTelefone(e.target.value)} placeholder="Ex: 24999998888"
                  className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
                <p className="text-[11px] text-muted-foreground">É pra esse número que o bot manda as dúvidas que não estiverem na FAQ.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Material (PDF ou apresentação PPTX)</label>
              <label className="flex flex-col items-center gap-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{arquivo ? arquivo.name : 'Toque para escolher o arquivo'}</span>
                <input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="hidden" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setFaq([]); setErroGeracao('') }} />
              </label>
              <button onClick={gerarFaq} disabled={!arquivo || gerando}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
                Gerar perguntas automaticamente
              </button>
              {erroGeracao && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {erroGeracao}</p>}
            </div>

            {faq.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">FAQ gerada — revise antes de publicar</label>
                <div className="space-y-2">
                  {faq.map((f, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <input value={f.pergunta} onChange={(e) => atualizarFaq(i, 'pergunta', e.target.value)} placeholder="Pergunta"
                          className="flex-1 text-sm font-semibold px-2 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button onClick={() => removerFaq(i)} className="p-1.5 rounded-md hover:bg-red-50 text-red-500 shrink-0" title="Remover">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea value={f.resposta} onChange={(e) => atualizarFaq(i, 'resposta', e.target.value)} placeholder="Resposta" rows={2}
                        className="w-full text-sm px-2 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={adicionarFaqManual} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border hover:bg-accent">
                <Plus className="h-4 w-4" /> Adicionar pergunta manual
              </button>
              <button onClick={publicar} disabled={!podePublicar || publicando}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Publicar treinamento
              </button>
              {publicado && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Publicado!</span>}
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-sm">Treinamentos publicados</h2>
              <div className="flex items-center gap-2">
                {msgForcado && <span className="text-xs text-green-600">{msgForcado}</span>}
                <button onClick={fetchTreinamentos} className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent"><RefreshCw className="h-3.5 w-3.5" /> Atualizar</button>
              </div>
            </div>
            {loadingLista ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : treinamentos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum treinamento cadastrado ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Título</th><th className="px-3 py-2 font-medium">Sala(s)</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Palestrante</th><th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Aviso</th>
                </tr></thead>
                <tbody>
                  {treinamentos.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-3 py-2 font-medium">{t.titulo}</td>
                      <td className="px-3 py-2">{(t.salas ?? []).map((s) => SALA_TML_LABEL[s]).join(', ') || '—'}</td>
                      <td className="px-3 py-2">{formatarDataBR(t.data_treinamento)}</td>
                      <td className="px-3 py-2">{t.palestrante_nome}</td>
                      <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700">Publicado</span></td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => forcarDisparo(t)}
                          disabled={forcando === t.id}
                          title='Manda os avisos agora mesmo se ninguém finalizou a matinal pelo botão (ex.: quando a matinal foi auto-finalizada sem passar pelo "Timer da Matinal")'
                          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border hover:bg-accent disabled:opacity-50 whitespace-nowrap"
                        >
                          {forcando === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Forçar disparo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {aba === 'duvidas' && <CentralDuvidas treinamentos={treinamentos} />}
    </div>
  )
}

function CentralDuvidas({ treinamentos }: { treinamentos: Treinamento[] }) {
  const { usuario } = useAuth()
  const [duvidas, setDuvidas] = useState<Duvida[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [encerrando, setEncerrando] = useState(false)

  const fetchDuvidas = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('duvidas_matinal')
      .select('id, treinamento_id, colaborador_nome, pergunta, pergunta_por_audio, resposta, status, created_at')
      .eq('filial', usuario.filial)
      .order('created_at', { ascending: false })
      .limit(200)
    setDuvidas((data ?? []) as Duvida[])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchDuvidas() }, [fetchDuvidas])

  // Fecha as dúvidas ainda sem resposta do palestrante e limpa os avisos de
  // treinamento do dia — enquanto um telefone tem um aviso "de hoje" em
  // aberto, o bot trata a próxima mensagem dele como resposta ao
  // treinamento, o que trava o acesso ao menu da Aurora. Botão de emergência
  // pra liberar todo mundo de uma vez (ex.: depois de adicionar um assunto
  // novo na Aurora e perceber gente presa no fluxo antigo).
  async function encerrarPendentesELiberar() {
    if (!usuario) return
    if (!window.confirm('Isso encerra todas as dúvidas de treinamento sem resposta do palestrante e libera os colaboradores travados nesse fluxo (podendo usar o menu da Aurora normalmente de novo). Continuar?')) return
    setEncerrando(true)
    await supabase.from('duvidas_matinal').update({
      status: 'respondida_palestrante',
      resposta: 'Encerrada automaticamente — sem resposta do palestrante.',
      respondida_em: new Date().toISOString(),
    }).eq('filial', usuario.filial).eq('status', 'aguardando_palestrante')
    await supabase.from('matinal_treinamento_avisos').delete().eq('filial', usuario.filial)
    await fetchDuvidas()
    setEncerrando(false)
    alert('Pendências encerradas e conversas liberadas.')
  }

  const tituloPorId = useMemo(() => new Map(treinamentos.map((t) => [t.id, t.titulo])), [treinamentos])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return duvidas
    return duvidas.filter((d) =>
      (d.colaborador_nome ?? '').toLowerCase().includes(q) ||
      d.pergunta.toLowerCase().includes(q) ||
      (tituloPorId.get(d.treinamento_id) ?? '').toLowerCase().includes(q))
  }, [duvidas, busca, tituloPorId])

  const hoje = new Date().toISOString().slice(0, 10)
  const hojeArr = duvidas.filter((d) => d.created_at.slice(0, 10) === hoje)
  const stats = {
    hoje: hojeArr.length,
    auto: hojeArr.filter((d) => d.status === 'respondida_auto').length,
    aguardando: hojeArr.filter((d) => d.status === 'aguardando_palestrante').length,
    palestrante: hojeArr.filter((d) => d.status === 'respondida_palestrante').length,
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Perguntas hoje</p><p className="text-2xl font-bold">{stats.hoje}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Respondidas na hora</p><p className="text-2xl font-bold text-green-600">{stats.auto}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Aguardando palestrante</p><p className="text-2xl font-bold text-amber-600">{stats.aguardando}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Respondidas pelo palestrante</p><p className="text-2xl font-bold text-blue-600">{stats.palestrante}</p></div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por colaborador, pergunta ou treinamento…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <button onClick={fetchDuvidas} className="flex items-center gap-1.5 text-sm px-2.5 py-2 rounded border hover:bg-accent"><RefreshCw className="h-4 w-4" /> Atualizar</button>
        <button
          onClick={encerrarPendentesELiberar}
          disabled={encerrando}
          title="Encerra as dúvidas sem resposta do palestrante e libera quem ficou travado nesse fluxo, sem conseguir usar o menu da Aurora"
          className="flex items-center gap-1.5 text-sm px-2.5 py-2 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          {encerrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Encerrar pendentes e liberar conversas
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtradas.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MessageCircle className="h-6 w-6 text-muted-foreground/50" /> Nenhuma dúvida registrada ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Colaborador</th><th className="px-3 py-2 font-medium">Pergunta</th>
              <th className="px-3 py-2 font-medium">Treinamento</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Quando</th>
            </tr></thead>
            <tbody>
              {filtradas.map((d) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/10 align-top">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{d.colaborador_nome ?? '—'}</td>
                  <td className="px-3 py-2 max-w-[280px]">
                    {d.pergunta}{d.pergunta_por_audio && <span className="text-[10px] text-muted-foreground ml-1">(áudio)</span>}
                    {d.resposta && <p className="text-xs text-muted-foreground mt-1">↳ {d.resposta}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{tituloPorId.get(d.treinamento_id) ?? '—'}</td>
                  <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${STATUS_DUVIDA_COR[d.status]}`}>{STATUS_DUVIDA_LABEL[d.status]}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatarDataBR(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Grupos de WhatsApp usados no aviso de treinamento da matinal (1 por sala) —
// mesmas colunas já lidas em MatinalTML.tsx; sem essa tela não havia como
// configurá-los.
function GruposMatinalConfig({ filial }: { filial: string }) {
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)

  const [colorado, setColorado] = useState('')
  const [subFuria, setSubFuria] = useState('')
  const [original, setOriginal] = useState({ colorado: '', subFuria: '' })

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(async () => {
    if (!filial) { setCarregando(false); return }
    setCarregando(true)
    const { data } = await supabase
      .from('filiais')
      .select('grupo_matinal_colorado_whatsapp, grupo_matinal_subfuria_whatsapp')
      .eq('nome', filial)
      .maybeSingle()
    const v = {
      colorado: data?.grupo_matinal_colorado_whatsapp ?? '',
      subFuria: data?.grupo_matinal_subfuria_whatsapp ?? '',
    }
    setColorado(v.colorado); setSubFuria(v.subFuria)
    setOriginal(v)
    setCarregando(false)
  }, [filial])

  useEffect(() => { carregar() }, [carregar])

  async function buscarGrupos() {
    setBuscando(true)
    setErroBusca(null)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscando(false)
    if (erro) { setErroBusca(erro); return }
    if (gs.length === 0) { setErroBusca('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvar() {
    if (!filial) return
    setSalvando(true)
    setSalvo(false)
    await supabase
      .from('filiais')
      .update({
        grupo_matinal_colorado_whatsapp: colorado.trim() || null,
        grupo_matinal_subfuria_whatsapp: subFuria.trim() || null,
      })
      .eq('nome', filial)
    setOriginal({ colorado: colorado.trim(), subFuria: subFuria.trim() })
    setSalvando(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const alterado = colorado.trim() !== original.colorado || subFuria.trim() !== original.subFuria

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <button onClick={() => setAberto((a) => !a)} className="flex items-center justify-between w-full text-left">
        <span className="font-semibold text-sm">Grupos de WhatsApp da Matinal</span>
        <span className="text-xs text-muted-foreground">{aberto ? 'Recolher' : 'Configurar'}</span>
      </button>
      <p className="text-xs text-muted-foreground">
        Recebem o aviso de "hoje tivemos o treinamento X" logo depois da matinal, direcionando os colaboradores a chamar o bot no privado.
      </p>

      {aberto && (
        <>
          <div className="flex items-center justify-end">
            <button onClick={buscarGrupos} disabled={buscando} className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors disabled:opacity-50">
              {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {buscando ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
            </button>
          </div>

          {erroBusca && <p className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 rounded-md p-2"><AlertTriangle className="h-3.5 w-3.5" /> {erroBusca}</p>}

          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="space-y-4">
              <GroupPicker
                label="Sala Colorado"
                value={colorado} onChange={setColorado} grupos={grupos} onCopy={copiar} copiado={copiado}
              />
              <GroupPicker
                label="Sala Sub-Fúria"
                value={subFuria} onChange={setSubFuria} grupos={grupos} onCopy={copiar} copiado={copiado}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t pt-3">
            {salvo && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Salvo!</span>}
            <button onClick={salvar} disabled={salvando || !alterado || !filial} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {salvando ? 'Salvando…' : 'Salvar configuração'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
