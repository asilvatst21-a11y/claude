import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Check, ChevronRight, ChevronLeft, Loader2, Search, Building2,
  AlertTriangle, CheckCircle2, ArrowLeft, Truck, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { enviarMensagemGrupo } from '../lib/zapi'
import {
  buscarBaiasDoMapa, iniciarBaia, marcarItem, registrarDivergencia, finalizarBaia, pularBaia,
  montarMensagemDivergencia, buscarPessoasConferencia, PORTA_LABEL, MOTIVOS_PULAR_BAIA,
  type BaiaConf, type ItemConf, type PortaConf, type PessoaConferencia,
} from '../lib/conferencia'
import { ENVIOS_CONFERENCIA_DIVERGENCIA_PAUSADOS } from '../lib/whatsappStatus'

function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// Data local (não UTC) — usar toISOString() aqui rolaria a data pra frente
// perto da meia-noite no horário do Brasil (UTC-3), fazendo a conferência
// buscar/gravar num dia diferente do que o Relatório de Separação foi
// importado.
function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Tela = 'inicio' | 'baias' | 'baia'

export default function ConferenciaDigital() {
  const [tela, setTela] = useState<Tela>('inicio')
  const [filiais, setFiliais] = useState<string[]>([])
  const [filial, setFilial] = useState('')
  const [nome, setNome] = useState('')
  const [mapa, setMapa] = useState('')
  const [baias, setBaias] = useState<BaiaConf[]>([])
  const [baiaAtiva, setBaiaAtiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [divItem, setDivItem] = useState<ItemConf | null>(null)
  const [pessoas, setPessoas] = useState<PessoaConferencia[]>([])
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [buscaProdutoAberta, setBuscaProdutoAberta] = useState(false)
  const [produtoSelecionado, setProdutoSelecionado] = useState<(ItemConf & { baiaRotulo: string }) | null>(null)
  const [pularAberto, setPularAberto] = useState(false)

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  // Lista de motoristas + ajudantes pra sugerir enquanto digita — recarrega
  // quando a filial muda (motoristas são cadastrados por filial).
  useEffect(() => {
    if (!filial) return
    buscarPessoasConferencia(filial).then(setPessoas).catch(() => setPessoas([]))
  }, [filial])

  const sugestoes = useMemo(() => {
    const termo = normalizarBusca(nome)
    if (!termo) return []
    return pessoas.filter((p) => normalizarBusca(p.nome).includes(termo)).slice(0, 8)
  }, [pessoas, nome])

  const recarregar = useCallback(async () => {
    const num = Number(mapa.trim())
    if (!filial || !num) return
    try {
      const lista = await buscarBaiasDoMapa(filial, num, hojeISO())
      setBaias(lista)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao atualizar a lista de baias.')
    }
  }, [filial, mapa])

  async function buscar() {
    const num = Number(mapa.trim())
    if (!filial || !num) { setErro('Selecione a filial e digite o número do mapa.'); return }
    if (!nome.trim()) { setErro('Digite seu nome antes de conferir.'); return }
    setErro(''); setLoading(true)
    try {
      const lista = await buscarBaiasDoMapa(filial, num, hojeISO())
      setLoading(false)
      if (lista.length === 0) {
        setErro(`Nenhuma baia encontrada para o mapa ${num} hoje. Confira se o Relatório de Separação já foi importado.`)
        return
      }
      setBaias(lista)
      setTela('baias')
    } catch (err) {
      setLoading(false)
      setErro(err instanceof Error ? err.message : 'Erro ao buscar as baias do mapa.')
    }
  }

  async function abrirBaia(b: BaiaConf) {
    setErro('')
    setBaiaAtiva(b.id)
    setTela('baia')
    try {
      await iniciarBaia(b.id)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao abrir a baia.')
    }
  }

  async function toggleItem(it: ItemConf) {
    if (it.divergencia) return
    try {
      await marcarItem(it.id, !it.conferido)
      setBaias((prev) => prev.map((b) => b.id !== baiaAtiva ? b : {
        ...b, itens: b.itens.map((x) => x.id === it.id ? { ...x, conferido: !x.conferido } : x),
      }))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao marcar o item. Tente de novo.')
    }
  }

  async function confirmarDivergencia(tipo: 'falta' | 'sobra' | 'avaria', qtdReal: string, obs: string) {
    if (!divItem) return
    const qtd = qtdReal.trim() === '' ? null : Number(qtdReal)
    try {
      await registrarDivergencia(divItem.id, tipo, isNaN(qtd as number) ? null : qtd, obs.trim() || null)
      const baia = baias.find((b) => b.id === baiaAtiva)
      setBaias((prev) => prev.map((b) => b.id !== baiaAtiva ? b : {
        ...b, itens: b.itens.map((x) => x.id === divItem.id
          ? { ...x, divergencia: true, conferido: true, tipoDivergencia: tipo, qtdReal: qtd, obs: obs.trim() || null }
          : x),
      }))
      // Aviso automático ao grupo configurado (mesmo padrão dos outros módulos).
      // Falha no envio da mensagem não deve travar a marcação da divergência,
      // que já foi salva no banco — por isso é um try/catch à parte.
      try {
        if (ENVIOS_CONFERENCIA_DIVERGENCIA_PAUSADOS) throw new Error('envio pausado')
        const { data: filialRow } = await supabase.from('filiais').select('grupo_conferencia_whatsapp').eq('nome', filial).maybeSingle()
        if (filialRow?.grupo_conferencia_whatsapp && baia) {
          await enviarMensagemGrupo(filialRow.grupo_conferencia_whatsapp, montarMensagemDivergencia({
            mapa: Number(mapa), baiaRotulo: baia.rotulo, data: hojeISO(), conferente: nome,
            item: { ...divItem, divergencia: true, tipoDivergencia: tipo, qtdReal: qtd, obs: obs.trim() || null },
          }))
        }
      } catch {
        /* aviso ao grupo é best-effort — a divergência já foi registrada */
      }
      setDivItem(null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar a divergência. Tente de novo.')
    }
  }

  async function confirmarBaia() {
    if (!baiaAtiva) return
    setErro('')
    try {
      await finalizarBaia(baiaAtiva, nome.trim() || null)
      setBaias((prev) => prev.map((b) => b.id === baiaAtiva ? { ...b, status: 'conferida' } : b))
      setBaiaAtiva(null)
      setTela('baias')
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar a baia. Tente de novo.')
    }
  }

  async function confirmarPular(motivo: string) {
    if (!baiaAtiva) return
    try {
      await pularBaia(baiaAtiva, motivo, nome.trim() || null)
      setBaias((prev) => prev.map((b) => b.id === baiaAtiva ? { ...b, status: 'pulada', motivoPulada: motivo } : b))
      setPularAberto(false)
      setBaiaAtiva(null)
      setTela('baias')
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao pular a baia. Tente de novo.')
    }
  }

  const baia = useMemo(() => baias.find((b) => b.id === baiaAtiva) ?? null, [baias, baiaAtiva])
  // "Resolvidas" = conferidas OU puladas — as duas liberam o mapa; o badge
  // visual continua diferenciando as duas (ver tela de lista de baias).
  const conferidas = baias.filter((b) => b.status === 'conferida').length
  const resolvidas = baias.filter((b) => b.status === 'conferida' || b.status === 'pulada').length

  // Proteção: se a tela de detalhe ficar sem uma baia correspondente (ex.:
  // a lista foi recarregada e o id não bateu mais), volta pra lista em vez
  // de renderizar uma tela de detalhe vazia/quebrada.
  useEffect(() => {
    if (tela === 'baia' && baiaAtiva && baias.length > 0 && !baia) {
      setTela('baias')
    }
  }, [tela, baiaAtiva, baias, baia])
  const grupos = useMemo(() => {
    const g = new Map<PortaConf, BaiaConf[]>()
    for (const b of baias) { const arr = g.get(b.porta) ?? []; arr.push(b); g.set(b.porta, arr) }
    return (['M', 'A', 'Z'] as PortaConf[]).map((p) => [p, g.get(p) ?? []] as const).filter(([, arr]) => arr.length > 0)
  }, [baias])

  // Busca de produto: acha em qual baia um item está e a quantidade prevista
  // sem precisar abrir baia por baia — os itens já estão todos carregados
  // (vieram junto com buscarBaiasDoMapa), então filtra local, sem nova consulta.
  const todosItens = useMemo(
    () => baias.flatMap((b) => b.itens.map((it) => ({ ...it, baiaRotulo: b.rotulo }))),
    [baias],
  )
  const resultadosBuscaProduto = useMemo(() => {
    const termo = normalizarBusca(buscaProduto)
    if (!termo) return []
    return todosItens.filter((it) => normalizarBusca(it.descricao ?? it.codigo ?? '').includes(termo)).slice(0, 15)
  }, [todosItens, buscaProduto])

  // ── Tela 1: início ──────────────────────────────────────────────────────
  if (tela === 'inicio') {
    return (
      <div key="tela-inicio" className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="px-5 pt-8 pb-6">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-brand-200 text-sm mb-6"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          <div className="flex items-center gap-2 text-accent-300 text-xs font-bold tracking-widest uppercase mb-1"><Package className="h-4 w-4" /> Conferência de carga</div>
          <h1 className="text-2xl font-bold">Conferir caminhão</h1>
          <p className="text-brand-200 text-sm mt-1">Confira os produtos carregados, baia por baia.</p>
        </div>
        <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-1.5"><Building2 className="h-3.5 w-3.5" /> Filial</label>
            <select value={filial} onChange={(e) => setFilial(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base bg-white">
              {filiais.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5 block">Seu nome (motorista ou ajudante)</label>
            <input
              value={nome}
              onChange={(e) => { setNome(e.target.value); setSugestoesAbertas(true) }}
              onFocus={() => setSugestoesAbertas(true)}
              onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
              placeholder="Digite pra buscar…"
              autoComplete="off"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base"
            />
            {sugestoesAbertas && sugestoes.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                {sugestoes.map((p) => (
                  <button
                    key={`${p.tipo}-${p.nome}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setNome(p.nome); setSugestoesAbertas(false) }}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-gray-50 text-sm border-b last:border-b-0 border-gray-100"
                  >
                    <span className="text-gray-900">{p.nome}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${p.tipo === 'motorista' ? 'bg-brand-100 text-brand-700' : 'bg-accent-100 text-accent-800'}`}>
                      {p.tipo === 'motorista' ? 'Motorista' : 'Ajudante'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5 block">Número do mapa</label>
            <input value={mapa} onChange={(e) => setMapa(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Ex: 278620" className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-3xl font-extrabold tracking-wide tabular-nums" />
          </div>
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}
          <button onClick={buscar} disabled={loading} className="mt-auto w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-bold rounded-xl py-4 text-base flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />} Buscar baias do mapa
          </button>
        </div>
      </div>
    )
  }

  // ── Tela 2: lista de baias ───────────────────────────────────────────────
  if (tela === 'baias') {
    return (
      <div key="tela-baias" className="min-h-screen bg-gray-50">
        <div className="bg-brand-800 text-white px-4 pt-6 pb-4 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button onClick={() => { setTela('inicio'); setBaias([]) }} className="opacity-85"><ChevronLeft className="h-6 w-6" /></button>
            <div className="text-[11px] uppercase tracking-wider opacity-75 font-bold">Baias a conferir</div>
            <div className="ml-auto flex items-center gap-1.5 text-sm font-bold"><Truck className="h-4 w-4" /> Mapa {mapa}</div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

          <div className="bg-white border rounded-xl px-4 py-3 relative">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5 flex items-center gap-1.5"><Search className="h-3.5 w-3.5" /> Buscar produto</label>
            <input
              value={buscaProduto}
              onChange={(e) => { setBuscaProduto(e.target.value); setProdutoSelecionado(null); setBuscaProdutoAberta(true) }}
              onFocus={() => setBuscaProdutoAberta(true)}
              onBlur={() => setTimeout(() => setBuscaProdutoAberta(false), 150)}
              placeholder="Digite as iniciais do produto…"
              autoComplete="off"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm"
            />
            {buscaProdutoAberta && resultadosBuscaProduto.length > 0 && (
              <div className="absolute z-20 left-4 right-4 top-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {resultadosBuscaProduto.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setProdutoSelecionado(it); setBuscaProdutoAberta(false) }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50 text-sm border-b last:border-b-0 border-gray-100"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{it.descricao ?? it.codigo ?? 'Item'}</span>
                      <span className="block text-[11px] text-gray-400">{it.baiaRotulo}</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums shrink-0">{it.quantidade ?? '—'} {it.unidade ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
            {buscaProdutoAberta && buscaProduto.trim() && resultadosBuscaProduto.length === 0 && (
              <div className="absolute z-20 left-4 right-4 top-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-sm text-gray-500">
                Nenhum produto encontrado com esse nome.
              </div>
            )}
            {produtoSelecionado && (
              <div className="mt-3 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2.5 flex items-center gap-3">
                <Package className="h-5 w-5 text-accent-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{produtoSelecionado.descricao ?? produtoSelecionado.codigo}</div>
                  <div className="text-xs text-accent-800">Baia: <b>{produtoSelecionado.baiaRotulo}</b></div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-extrabold tabular-nums">{produtoSelecionado.quantidade ?? '—'}</div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold">{produtoSelecionado.unidade ?? ''}</div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl px-4 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <b className="text-sm">{resolvidas} de {baias.length} baias resolvidas</b>
              <span className="text-xs text-gray-500 tabular-nums">{baias.length - resolvidas} faltam</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${baias.length ? (resolvidas / baias.length) * 100 : 0}%` }} />
            </div>
            {resolvidas > conferidas && (
              <p className="text-[11px] text-amber-600 font-semibold mt-1.5">{resolvidas - conferidas} pulada(s) sem conferir item a item</p>
            )}
          </div>

          {grupos.map(([porta, arr]) => (
            <div key={porta} className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1 pt-1">
                {PORTA_LABEL[porta]}<span className="flex-1 h-px bg-gray-200" />
              </div>
              {arr.map((b) => {
                const feitos = b.itens.filter((i) => i.conferido).length
                const done = b.status === 'conferida'
                const pulada = b.status === 'pulada'
                return (
                  <button key={b.id} onClick={() => abrirBaia(b)} className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left active:scale-[.99] transition ${done ? 'bg-green-50 border-green-200' : pulada ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                    <span className={`w-[52px] h-[52px] shrink-0 rounded-xl grid place-content-center text-center ${b.porta === 'M' ? 'bg-brand-800 text-white' : b.porta === 'A' ? 'bg-accent-100 text-accent-800 border border-accent-200' : 'bg-gray-200 text-gray-600'}`}>
                      <span className="text-xl font-extrabold leading-none">{b.porta}</span>
                      {b.ordem != null && <span className="text-[11px] font-bold opacity-85 tabular-nums mt-0.5">{String(b.ordem).padStart(2, '0')}</span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold">{b.rotulo}</span>
                      <span className="block text-xs text-gray-500 tabular-nums mt-0.5">
                        {done ? `${b.totalItens} itens conferidos` : pulada ? (b.motivoPulada ?? 'Pulada') : `${feitos}/${b.totalItens} itens · ${b.totalCaixas} cx`}
                      </span>
                    </span>
                    {done
                      ? <span className="text-green-700 text-xs font-bold flex items-center gap-1"><Check className="h-4 w-4" /> Conferida</span>
                      : pulada
                        ? <span className="text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">Pulada</span>
                        : <span className="text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">Pendente</span>}
                    <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
                  </button>
                )
              })}
            </div>
          ))}

          {resolvidas === baias.length && baias.length > 0 && (
            <div className="bg-green-600 text-white rounded-2xl p-4 flex items-center gap-3 mt-2">
              <CheckCircle2 className="h-8 w-8 shrink-0" />
              <div><b className="block">Mapa {mapa} conferido!</b><span className="text-sm text-green-50">Todas as baias foram verificadas ou puladas.</span></div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Tela 3: detalhe da baia ──────────────────────────────────────────────
  const feitos = baia?.itens.filter((i) => i.conferido).length ?? 0
  const totalBaia = baia?.itens.length ?? 0
  const tudoFeito = totalBaia > 0 && feitos === totalBaia
  return (
    <div key="tela-baia" className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-brand-800 text-white px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => { setBaiaAtiva(null); setTela('baias') }} className="opacity-85"><ChevronLeft className="h-6 w-6" /></button>
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-75 font-bold">Conferindo baia</div>
            <div className="text-base font-bold">{baia?.rotulo}</div>
          </div>
          <div className="ml-auto text-sm font-bold tabular-nums">Mapa {mapa}</div>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-2 pb-28">
        {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}
        {baia?.itens.map((it) => (
          <div key={it.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition ${it.divergencia ? 'bg-red-50 border-red-200' : it.conferido ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
            <button onClick={() => toggleItem(it)} className={`w-8 h-8 shrink-0 rounded-lg border-2 grid place-items-center transition ${it.divergencia ? 'border-red-400 bg-red-400' : it.conferido ? 'border-green-600 bg-green-600' : 'border-gray-300'}`}>
              {it.divergencia ? <AlertTriangle className="h-4 w-4 text-white" /> : it.conferido ? <Check className="h-5 w-5 text-white" /> : null}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold leading-tight ${it.conferido && !it.divergencia ? 'text-gray-500 line-through' : ''}`}>{it.descricao ?? it.codigo ?? 'Item'}</div>
              <div className="flex items-center gap-2 mt-1.5">
                {it.codigo && <span className="text-[11px] text-gray-400 font-semibold tabular-nums">Cód. {it.codigo}</span>}
                {it.tipo && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${it.tipo.toLowerCase().startsWith('retorn') ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{it.tipo}</span>}
                <button onClick={() => setDivItem(it)} className="text-[11px] font-bold text-red-600 ml-auto">Divergência</button>
              </div>
              {it.divergencia && <div className="text-[11px] text-red-700 font-semibold mt-1">⚠️ {it.tipoDivergencia?.toUpperCase()}{it.qtdReal != null ? ` · veio ${it.qtdReal}` : ''}</div>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-extrabold leading-none tabular-nums">{it.quantidade ?? '—'}</div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">{it.unidade ?? ''}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
        <p className="text-center text-xs text-gray-500 tabular-nums">{feitos} de {totalBaia} itens conferidos</p>
        <button onClick={confirmarBaia} disabled={!tudoFeito} className={`w-full rounded-xl py-3.5 font-bold text-base flex items-center justify-center gap-2 ${tudoFeito ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
          {tudoFeito ? <><Check className="h-5 w-5" /> Confirmar baia</> : `Confirmar baia (${feitos}/${totalBaia})`}
        </button>
        {baia?.status !== 'conferida' && (
          <button onClick={() => setPularAberto(true)} className="w-full rounded-xl py-2.5 font-bold text-sm text-amber-700 border-2 border-amber-200 bg-amber-50 flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Pular conferência desta baia
          </button>
        )}
      </div>

      {divItem && <DivergenciaModal item={divItem} onClose={() => setDivItem(null)} onConfirm={confirmarDivergencia} />}
      {pularAberto && <PularBaiaModal onClose={() => setPularAberto(false)} onConfirm={confirmarPular} />}
    </div>
  )
}

function PularBaiaModal({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (motivo: string) => void | Promise<void>
}) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_PULAR_BAIA[0])
  const [outro, setOutro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const precisaOutro = motivo === 'Outro'
  const motivoFinal = precisaOutro ? outro.trim() : motivo
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-600">Pular conferência</div>
            <div className="text-sm text-gray-600 mt-0.5">Por que não dá pra conferir item a item essa baia?</div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="space-y-2">
          {MOTIVOS_PULAR_BAIA.map((m) => (
            <button
              key={m}
              onClick={() => setMotivo(m)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-bold ${motivo === m ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'}`}
            >
              {m}
            </button>
          ))}
        </div>
        {precisaOutro && (
          <input
            value={outro}
            onChange={(e) => setOutro(e.target.value)}
            placeholder="Descreva o motivo"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm"
          />
        )}
        <button
          onClick={async () => { setEnviando(true); await onConfirm(motivoFinal); setEnviando(false) }}
          disabled={enviando || !motivoFinal}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2"
        >
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />} Pular esta baia
        </button>
      </div>
    </div>
  )
}

function DivergenciaModal({ item, onClose, onConfirm }: {
  item: ItemConf
  onClose: () => void
  onConfirm: (tipo: 'falta' | 'sobra' | 'avaria', qtdReal: string, obs: string) => void
}) {
  const [tipo, setTipo] = useState<'falta' | 'sobra' | 'avaria'>('falta')
  const [qtdReal, setQtdReal] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const opcoes: { v: 'falta' | 'sobra' | 'avaria'; label: string }[] = [
    { v: 'falta', label: 'Faltou' }, { v: 'sobra', label: 'Veio a mais' }, { v: 'avaria', label: 'Avaria' },
  ]
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-red-600">Registrar divergência</div>
            <div className="text-sm font-semibold mt-0.5">{item.descricao ?? item.codigo}</div>
            <div className="text-xs text-gray-500 tabular-nums">Separado: {item.quantidade ?? '—'} {item.unidade ?? ''}</div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {opcoes.map((o) => (
            <button key={o.v} onClick={() => setTipo(o.v)} className={`py-2.5 rounded-xl text-sm font-bold border-2 ${tipo === o.v ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}>{o.label}</button>
          ))}
        </div>
        {tipo !== 'avaria' && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5 block">Quantidade que veio no caminhão</label>
            <input value={qtdReal} onChange={(e) => setQtdReal(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Ex: 3" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold tabular-nums" />
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5 block">Observação (opcional)</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Detalhe o que aconteceu" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm" />
        </div>
        <button
          onClick={async () => { setEnviando(true); await onConfirm(tipo, qtdReal, obs); setEnviando(false) }}
          disabled={enviando}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2"
        >
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />} Registrar e avisar o grupo
        </button>
      </div>
    </div>
  )
}
