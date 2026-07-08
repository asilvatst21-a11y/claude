import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ArrowLeft, Building2, Loader2, Delete, Search, ChevronRight, Coins, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { buscarTotem, formatarBRL, type ResultadoTotem } from '../lib/variavelArmazem'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function VariavelTotem() {
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [digitos, setDigitos] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoTotem[] | null>(null)
  const [escolhido, setEscolhido] = useState<ResultadoTotem | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  function tecla(n: string) {
    if (digitos.length >= 3) return
    setResultados(null); setEscolhido(null); setErro('')
    setDigitos((d) => (d + n).slice(0, 3))
  }
  function apagar() { setResultados(null); setEscolhido(null); setErro(''); setDigitos((d) => d.slice(0, -1)) }

  async function buscar() {
    if (digitos.length !== 3 || !filial) { setErro('Digite os 3 primeiros números do seu CPF.'); return }
    setErro(''); setBuscando(true); setResultados(null); setEscolhido(null)
    try {
      const res = await buscarTotem(filial, hojeISO(), digitos)
      if (res.length === 0) {
        setErro('Não encontramos sua variável hoje. Confira os 3 dígitos ou fale com o supervisor.')
        return
      }
      if (res.length === 1) setEscolhido(res[0])
      else setResultados(res)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao buscar. Tente de novo.')
    } finally {
      setBuscando(false)
    }
  }

  // ── Resultado ─────────────────────────────────────────────────────────
  if (escolhido) {
    const c = escolhido
    return (
      <div key="totem-resultado" className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="px-5 pt-7 pb-4">
          <button onClick={() => { setEscolhido(null); if (!resultados) setDigitos('') }} className="inline-flex items-center gap-1.5 text-brand-200 text-sm"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        </div>
        <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-accent-600">Sua variável de hoje</div>
            <div className="text-lg font-bold mt-0.5">{c.nome}</div>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
            <div className="text-xs font-bold uppercase tracking-wide text-green-700">Você fez hoje</div>
            <div className="text-5xl font-extrabold text-green-700 tabular-nums mt-1">{formatarBRL(c.valor)}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 divide-y">
            <Linha icon={TrendingUp} k="Pontos do dia" v={c.total.toLocaleString('pt-BR')} />
            <Linha k="Seu cluster" v={c.clusterMin != null ? `${c.clusterMin.toLocaleString('pt-BR')} – ${c.clusterMax?.toLocaleString('pt-BR')}` : '—'} />
            <Linha k="Valor a cada 1.000 pts" v={c.valorPor1000 != null ? formatarBRL(c.valorPor1000) : '—'} />
            <Linha icon={Coins} k="Acumulado no mês" v={formatarBRL(c.acumuladoMes)} destaque />
          </div>
          <p className="text-xs text-gray-400 text-center mt-auto">Valores referentes à pontuação lançada hoje.</p>
        </div>
      </div>
    )
  }

  // ── Lista de escolha (3 dígitos batem com mais de uma pessoa) ──────────
  if (resultados) {
    return (
      <div key="totem-lista" className="min-h-screen bg-gray-50">
        <div className="bg-brand-800 text-white px-4 pt-6 pb-4">
          <button onClick={() => { setResultados(null); setDigitos('') }} className="inline-flex items-center gap-1.5 text-brand-200 text-sm"><ArrowLeft className="h-4 w-4" /> Voltar</button>
          <div className="text-[11px] uppercase tracking-wider opacity-75 font-bold mt-2">Qual é você?</div>
        </div>
        <div className="p-4 space-y-2">
          {resultados.map((c, i) => (
            <button key={i} onClick={() => setEscolhido(c)} className="w-full flex items-center gap-3 p-4 rounded-2xl border bg-white text-left active:scale-[.99] transition">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{c.nome}</span>
                <span className="block text-xs text-gray-500 tabular-nums mt-0.5">{c.total.toLocaleString('pt-BR')} pts</span>
              </span>
              <span className="text-green-700 font-bold tabular-nums">{formatarBRL(c.valor)}</span>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Entrada (CPF) ─────────────────────────────────────────────────────
  return (
    <div key="totem-entrada" className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="px-5 pt-8 pb-6">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Wallet className="h-4 w-4" /> Variável do armazém</div>
        <h1 className="text-2xl font-bold">Consultar minha variável</h1>
        <p className="text-brand-200 text-sm mt-1">Digite os 3 primeiros números do seu CPF.</p>
      </div>
      <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-5">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-1.5"><Building2 className="h-3.5 w-3.5" /> Filial</label>
          <select value={filial} onChange={(e) => setFilial(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base bg-white">
            {filiais.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

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

function Linha({ icon: Icon, k, v, destaque }: { icon?: React.ElementType; k: string; v: string; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-gray-500 flex items-center gap-1.5">{Icon && <Icon className="h-4 w-4" />} {k}</span>
      <span className={`font-bold tabular-nums ${destaque ? 'text-green-700' : ''}`}>{v}</span>
    </div>
  )
}
