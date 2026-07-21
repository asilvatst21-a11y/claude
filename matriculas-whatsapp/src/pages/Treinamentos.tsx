import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, GraduationCap, Loader2, Upload, Plus, Trash2, CheckCircle2,
  AlertTriangle, RefreshCw, Search, MessageCircle,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { SALA_TML_LABEL, type SalaTML } from '../lib/tml'
import { formatarDataBR } from '../lib/utils'

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
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
              <h2 className="font-semibold text-sm">Treinamentos publicados</h2>
              <button onClick={fetchTreinamentos} className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent"><RefreshCw className="h-3.5 w-3.5" /> Atualizar</button>
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
                </tr></thead>
                <tbody>
                  {treinamentos.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-3 py-2 font-medium">{t.titulo}</td>
                      <td className="px-3 py-2">{(t.salas ?? []).map((s) => SALA_TML_LABEL[s]).join(', ') || '—'}</td>
                      <td className="px-3 py-2">{formatarDataBR(t.data_treinamento)}</td>
                      <td className="px-3 py-2">{t.palestrante_nome}</td>
                      <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700">Publicado</span></td>
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
