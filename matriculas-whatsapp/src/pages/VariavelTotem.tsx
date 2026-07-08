import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ArrowLeft, Building2, Loader2, Delete, Search, ChevronRight, ChevronLeft, TrendingUp, CalendarRange } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  buscarTotemCompetencia, buscarCompetenciaPorCpf, competenciaAtual, competenciaAnterior, competenciaSeguinte,
  rangeCompetencia, formatarBRL, type ResultadoTotemCompetencia, type DiaCompetencia,
} from '../lib/variavelArmazem'
import { formatarDataBR } from '../lib/utils'

function competenciaLabel(mesRotulo: string): string {
  const [, mes] = mesRotulo.split('-')
  return `${mes}/${mesRotulo.split('-')[0]}`
}

// Gera a lista completa de dias da competência (21→20), preenchendo com
// "sem lançamento" quem não tem linha naquele dia — pra mostrar o histórico
// completo, não só os dias em que bateu jornada.
function diasCompletos(mesRotulo: string, dias: DiaCompetencia[]): (DiaCompetencia | { data: string; semLancamento: true })[] {
  const { ini, fim } = rangeCompetencia(mesRotulo)
  const porData = new Map(dias.map((d) => [d.data, d]))
  const out: (DiaCompetencia | { data: string; semLancamento: true })[] = []
  const cursor = new Date(`${ini}T00:00:00`)
  const fimDate = new Date(`${fim}T00:00:00`)
  while (cursor <= fimDate) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    out.push(porData.get(iso) ?? { data: iso, semLancamento: true })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out.reverse() // mais recente primeiro
}

export default function VariavelTotem() {
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [digitos, setDigitos] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')

  const [mesRotulo, setMesRotulo] = useState(competenciaAtual)
  const [resultadosLista, setResultadosLista] = useState<ResultadoTotemCompetencia[] | null>(null)
  const [pessoa, setPessoa] = useState<{ cpfReal: string; nome: string } | null>(null)
  const [dadosCompetencia, setDadosCompetencia] = useState<ResultadoTotemCompetencia | null>(null)
  const [trocandoMes, setTrocandoMes] = useState(false)

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  function tecla(n: string) {
    if (digitos.length >= 3) return
    setErro('')
    setDigitos((d) => (d + n).slice(0, 3))
  }
  function apagar() { setErro(''); setDigitos((d) => d.slice(0, -1)) }

  function reiniciar() {
    setDigitos(''); setErro(''); setResultadosLista(null); setPessoa(null); setDadosCompetencia(null)
    setMesRotulo(competenciaAtual())
  }

  async function buscar() {
    if (digitos.length !== 3 || !filial) { setErro('Digite os 3 primeiros números do seu CPF.'); return }
    setErro(''); setBuscando(true); setResultadosLista(null)
    try {
      const res = await buscarTotemCompetencia(filial, digitos, mesRotulo)
      if (res.length === 0) {
        setErro('Não encontramos sua variável nesta competência. Confira os 3 dígitos ou fale com o supervisor.')
        return
      }
      if (res.length === 1) {
        setPessoa({ cpfReal: res[0].cpfReal, nome: res[0].nome })
        setDadosCompetencia(res[0])
      } else {
        setResultadosLista(res)
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao buscar. Tente de novo.')
    } finally {
      setBuscando(false)
    }
  }

  function escolherDaLista(r: ResultadoTotemCompetencia) {
    setPessoa({ cpfReal: r.cpfReal, nome: r.nome })
    setDadosCompetencia(r)
    setResultadosLista(null)
  }

  async function trocarCompetencia(novoMes: string) {
    if (!pessoa || !filial) return
    setMesRotulo(novoMes)
    setTrocandoMes(true)
    try {
      setDadosCompetencia(await buscarCompetenciaPorCpf(filial, pessoa.cpfReal, novoMes))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao trocar de competência.')
    } finally {
      setTrocandoMes(false)
    }
  }

  // ── Resultado ─────────────────────────────────────────────────────────
  if (pessoa && dadosCompetencia) {
    const c = dadosCompetencia
    const { ini, fim } = rangeCompetencia(mesRotulo)
    const linhas = diasCompletos(mesRotulo, c.dias)
    return (
      <div key="totem-resultado" className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="px-5 pt-7 pb-4 flex items-center justify-between">
          <button onClick={reiniciar} className="inline-flex items-center gap-1.5 text-brand-200 text-sm"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        </div>
        <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-24 flex flex-col gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-accent-600">Colaborador</div>
            <div className="text-lg font-bold mt-0.5">{pessoa.nome}</div>
          </div>

          {/* Seletor de competência */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5 text-center">Competência</div>
            <div className="flex items-center gap-2">
              <button onClick={() => trocarCompetencia(competenciaAnterior(mesRotulo))} disabled={trocandoMes} className="w-9 h-9 rounded-lg bg-brand-900 text-white grid place-items-center shrink-0 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 text-center">
                {trocandoMes ? <Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" /> : (
                  <>
                    <div className="text-lg font-extrabold tabular-nums">{competenciaLabel(mesRotulo)}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums">{formatarDataBR(ini)} a {formatarDataBR(fim)}</div>
                  </>
                )}
              </div>
              <button onClick={() => trocarCompetencia(competenciaSeguinte(mesRotulo))} disabled={trocandoMes} className="w-9 h-9 rounded-lg bg-brand-900 text-white grid place-items-center shrink-0 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {c.ultimoDia ? (
            <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-green-700 flex items-center justify-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-600" /> Seu último lançamento — {formatarDataBR(c.ultimoDia.data)}</div>
              <div className="text-4xl font-extrabold text-green-700 tabular-nums mt-1">{formatarBRL(c.ultimoDia.valor)}</div>
              <div className="flex justify-center gap-4 text-xs text-green-800 mt-2">
                <span>Pontos: <b className="tabular-nums">{c.ultimoDia.pontuacaoTotal.toLocaleString('pt-BR')}</b></span>
                <span>Faixa: <b className="tabular-nums">{c.ultimoDia.valorPor1000 != null ? `${formatarBRL(c.ultimoDia.valorPor1000)}/1k` : '—'}</b></span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-center text-sm text-amber-800">
              Nenhum lançamento nesta competência.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5" /> Histórico da competência</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {linhas.map((d) => 'semLancamento' in d ? (
                <div key={d.data} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-400 flex items-center justify-between">
                  <span>{formatarDataBR(d.data)} · sem lançamento</span>
                  <span>—</span>
                </div>
              ) : (
                <div key={d.data} className={`rounded-xl border px-3 py-2 ${d.data === c.ultimoDia?.data ? 'border-green-200 bg-green-50/60' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      {formatarDataBR(d.data)}
                      {d.data === c.ultimoDia?.data && <span className="text-[9px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">último</span>}
                    </span>
                    <span className="text-sm font-extrabold text-green-700 tabular-nums">{formatarBRL(d.valor)}</span>
                  </div>
                  <div className="flex gap-3 text-[11px] text-gray-500 mt-0.5 tabular-nums">
                    <span>{d.pontuacaoTotal.toLocaleString('pt-BR')} pts</span>
                    <span>{d.valorPor1000 != null ? `${formatarBRL(d.valorPor1000)}/1k` : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {c.diasComLancamento > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Resumo da competência</div>
              <div className="rounded-2xl border border-gray-200 divide-y">
                <Linha k="Média diária" v={formatarBRL(c.mediaDiaria)} />
                <Linha icon={TrendingUp} k="Maior dia" v={c.maiorDia ? `${formatarBRL(c.maiorDia.valor)} · ${formatarDataBR(c.maiorDia.data)}` : '—'} />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé fixo com os totais da competência */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-3 flex justify-around">
          <RodapeItem k="Dias" v={String(c.diasComLancamento)} />
          <RodapeItem k="Pontos" v={c.pontuacaoTotal.toLocaleString('pt-BR')} />
          <RodapeItem k="Total período" v={formatarBRL(c.valorTotal)} destaque />
        </div>
      </div>
    )
  }

  // ── Lista de escolha (3 dígitos batem com mais de uma pessoa) ──────────
  if (resultadosLista) {
    return (
      <div key="totem-lista" className="min-h-screen bg-gray-50">
        <div className="bg-brand-800 text-white px-4 pt-6 pb-4">
          <button onClick={() => setResultadosLista(null)} className="inline-flex items-center gap-1.5 text-brand-200 text-sm"><ArrowLeft className="h-4 w-4" /> Voltar</button>
          <div className="text-[11px] uppercase tracking-wider opacity-75 font-bold mt-2">Qual é você?</div>
        </div>
        <div className="p-4 space-y-2">
          {resultadosLista.map((c) => (
            <button key={c.cpfReal} onClick={() => escolherDaLista(c)} className="w-full flex items-center gap-3 p-4 rounded-2xl border bg-white text-left active:scale-[.99] transition">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{c.nome}</span>
                <span className="block text-xs text-gray-500 tabular-nums mt-0.5">{c.pontuacaoTotal.toLocaleString('pt-BR')} pts na competência</span>
              </span>
              <span className="text-green-700 font-bold tabular-nums">{formatarBRL(c.valorTotal)}</span>
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

function Linha({ icon: Icon, k, v }: { icon?: React.ElementType; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-gray-500 flex items-center gap-1.5">{Icon && <Icon className="h-4 w-4" />} {k}</span>
      <span className="font-bold tabular-nums">{v}</span>
    </div>
  )
}

function RodapeItem({ k, v, destaque }: { k: string; v: string; destaque?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{k}</div>
      <div className={`text-sm font-extrabold tabular-nums ${destaque ? 'text-green-700' : 'text-gray-900'}`}>{v}</div>
    </div>
  )
}
