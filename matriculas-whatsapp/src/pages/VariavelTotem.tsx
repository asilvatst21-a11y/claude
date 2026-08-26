import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ArrowLeft, Building2, Loader2, Delete, Search, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, TrendingUp, CalendarRange, HelpCircle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  buscarTotemCompetencia, buscarCompetenciaPorCpf, competenciaAtual, competenciaAnterior, competenciaSeguinte,
  rangeCompetencia, buscarClusters, clusterDoTotal, formatarBRL, agregarDiasCompetencia, existeCadastroArmazem,
  buscarColaboradoresArmazemPorPrefixoCpf,
  type ResultadoTotemCompetencia, type DiaCompetencia, type Cluster,
} from '../lib/variavelArmazem'
import { buscarAcumuladoPorCpf, buscarColaboradoresTurnoPorPrefixoCpf, temVinculoAtividadeAtivo, type AcumuladoColaboradorMes } from '../lib/variavelTurno'
import { formatarDataBR } from '../lib/utils'

function competenciaLabel(mesRotulo: string): string {
  const [, mes] = mesRotulo.split('-')
  return `${mes}/${mesRotulo.split('-')[0]}`
}

// Gera a lista de dias da competência (21→20) do início até o ÚLTIMO
// LANÇAMENTO (não até o fim da janela) — dias futuros ainda não importados
// pelo supervisor não aparecem como "sem lançamento", só somem quando ele
// realmente sobe o lançamento daquele dia. Preenche os buracos entre o
// início e o último lançamento (esses sim são ausências reais).
function diasCompletos(mesRotulo: string, dias: DiaCompetencia[]): (DiaCompetencia | { data: string; semLancamento: true })[] {
  if (dias.length === 0) return []
  const { ini } = rangeCompetencia(mesRotulo)
  const ultimoLancamento = dias[dias.length - 1].data
  const porData = new Map(dias.map((d) => [d.data, d]))
  const out: (DiaCompetencia | { data: string; semLancamento: true })[] = []
  const cursor = new Date(`${ini}T00:00:00`)
  const fimDate = new Date(`${ultimoLancamento}T00:00:00`)
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

  // Um colaborador pode ter as duas modalidades de RV (pontuação e
  // atividade de turno), só uma, ou nenhuma ainda apurada na competência.
  // Quando tem as duas, ele escolhe qual ver; quando só tem uma, mostra
  // direto — sem aba nem escolha.
  const [temPontuacao, setTemPontuacao] = useState(false)
  const [temAtividade, setTemAtividade] = useState(false)
  const [modoExibicao, setModoExibicao] = useState<'pontuacao' | 'atividade'>('pontuacao')

  // Tabela de faixas (clusters) — pra tirar dúvida de quanto se recebe por
  // 1.000 pontos em cada faixa, acessível a qualquer momento.
  const [clusters, setClusters] = useState<Cluster[] | null>(null)
  const [mostrarFaixas, setMostrarFaixas] = useState(false)

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map((f) => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
    buscarClusters().then(setClusters).catch(() => setClusters([]))
  }, [])

  function tecla(n: string) {
    if (digitos.length >= 6) return
    setErro('')
    setDigitos((d) => (d + n).slice(0, 6))
  }
  function apagar() { setErro(''); setDigitos((d) => d.slice(0, -1)) }

  function reiniciar() {
    setDigitos(''); setErro(''); setResultadosLista(null); setPessoa(null); setDadosCompetencia(null)
    setMesRotulo(competenciaAtual())
    setTemPontuacao(false); setTemAtividade(false); setModoExibicao('pontuacao')
  }

  async function buscar() {
    if (digitos.length !== 6 || !filial) { setErro('Digite os 6 primeiros números do seu CPF.'); return }
    setErro(''); setBuscando(true); setResultadosLista(null)
    try {
      let res = await buscarTotemCompetencia(filial, digitos, mesRotulo)
      if (res.length === 0) {
        // Ninguém com pontuação lançada NESSA competência — mas a pessoa
        // pode estar cadastrada e só não ter lançamento ainda no mês atual
        // (ex.: import do turno dela atrasado). Busca pelo cadastro
        // (histórico completo, não travado no mês) pra ela poder entrar e
        // navegar pra uma competência anterior que já tenha dado.
        const cadastrados = await buscarColaboradoresArmazemPorPrefixoCpf(filial, digitos)
        if (cadastrados.length > 0) {
          res = await Promise.all(cadastrados.map((c) => buscarCompetenciaPorCpf(filial, c.cpfReal, mesRotulo)))
        }
      }
      if (res.length === 0) {
        // Ainda nada — a pessoa pode estar flegada só na RV por atividade de
        // turno (sem nunca ter tido pontuação). Última tentativa antes de
        // dizer "não encontramos".
        const turno = await buscarColaboradoresTurnoPorPrefixoCpf(filial, digitos)
        res = turno.map((t) => agregarDiasCompetencia(t.cpfReal, t.nome, []))
      }
      if (res.length === 0) {
        setErro('Não encontramos sua variável nesta competência. Confira os 6 dígitos ou fale com o supervisor.')
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

  // Descobre quais modalidades essa pessoa realmente tem (independe da
  // competência selecionada) pra decidir se mostra aba de escolha, ou
  // direto a única que existir.
  useEffect(() => {
    if (!pessoa || !filial) return
    let cancelado = false
    Promise.all([
      existeCadastroArmazem(filial, pessoa.cpfReal),
      temVinculoAtividadeAtivo(filial, pessoa.cpfReal),
    ]).then(([pont, ativ]) => {
      if (cancelado) return
      setTemPontuacao(pont)
      setTemAtividade(ativ)
      setModoExibicao(pont ? 'pontuacao' : 'atividade')
    })
    return () => { cancelado = true }
  }, [pessoa, filial])

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
        <div className={`flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 flex flex-col gap-4 ${modoExibicao === 'pontuacao' ? 'pb-24' : 'pb-8'}`}>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-accent-600">Colaborador</div>
            <div className="text-lg font-bold mt-0.5">{pessoa.nome}</div>
          </div>

          <button onClick={() => setMostrarFaixas(true)} className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 hover:text-accent-800">
            <HelpCircle className="h-3.5 w-3.5" /> Quanto eu recebo por faixa de pontuação?
          </button>

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

          {temPontuacao && temAtividade && (
            <div className="flex rounded-xl border border-gray-200 p-1 bg-gray-50">
              <button
                onClick={() => setModoExibicao('pontuacao')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${modoExibicao === 'pontuacao' ? 'bg-brand-900 text-white' : 'text-gray-500'}`}
              >
                RV por pontuação
              </button>
              <button
                onClick={() => setModoExibicao('atividade')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${modoExibicao === 'atividade' ? 'bg-brand-900 text-white' : 'text-gray-500'}`}
              >
                RV por atividade
              </button>
            </div>
          )}

          {modoExibicao !== 'pontuacao' ? null : c.diasComLancamento === 0 ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-center text-sm text-amber-800">
              Nenhum lançamento nesta competência.
            </div>
          ) : (
            <div className="rounded-2xl bg-green-50 border border-green-200 p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-green-700 text-center">Resumo da Variável — {competenciaLabel(mesRotulo)}</div>
              <div className="text-center mt-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-green-700">Valor atualizado</div>
                <div className="text-4xl font-extrabold text-green-700 tabular-nums">{formatarBRL(c.valorTotal)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-3">
                <div className="rounded-xl bg-white/70 border border-green-100 p-2.5 text-center">
                  <div className="text-[9.5px] font-bold uppercase tracking-wide text-green-700">Pontuação média</div>
                  <div className="text-base font-extrabold text-gray-900 tabular-nums mt-0.5">{Math.round(c.pontuacaoTotal / c.diasComLancamento).toLocaleString('pt-BR')} pts</div>
                </div>
                <div className="rounded-xl bg-white/70 border border-green-100 p-2.5 text-center">
                  <div className="text-[9.5px] font-bold uppercase tracking-wide text-green-700">Faixa média</div>
                  <div className="text-base font-extrabold text-gray-900 tabular-nums mt-0.5">
                    {(() => {
                      const media = c.pontuacaoTotal / c.diasComLancamento
                      const faixa = clusterDoTotal(media, clusters ?? [])
                      return faixa ? `${formatarBRL(faixa.valorPor1000)}/1k` : '—'
                    })()}
                  </div>
                </div>
              </div>
              {c.ultimoDia && (
                <div className="mt-3 pt-3 border-t border-green-200 flex items-center justify-between text-xs text-green-800">
                  <span className="flex items-center gap-1.5">
                    Último lançamento — {formatarDataBR(c.ultimoDia.data)}
                    {c.ultimoDia.rvDobrada && <span className="text-[9px] font-bold uppercase text-white bg-orange-500 px-1.5 py-0.5 rounded-full">🔥 RV 2x</span>}
                  </span>
                  <span className="font-bold tabular-nums">{formatarBRL(c.ultimoDia.valor)}</span>
                </div>
              )}
            </div>
          )}

          {modoExibicao === 'pontuacao' && (
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
                <div key={d.data} className={`rounded-xl border px-3 py-2 ${d.rvDobrada ? 'border-orange-200 bg-orange-50/60' : d.data === c.ultimoDia?.data ? 'border-green-200 bg-green-50/60' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      {formatarDataBR(d.data)}
                      {d.data === c.ultimoDia?.data && <span className="text-[9px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">último</span>}
                      {d.rvDobrada && <span className="text-[9px] font-bold uppercase tracking-wide text-white bg-orange-500 px-1.5 py-0.5 rounded-full">🔥 2x</span>}
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
          )}

          {modoExibicao === 'pontuacao' && c.diasComLancamento > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Resumo da competência</div>
              <div className="rounded-2xl border border-gray-200 divide-y">
                <Linha k="Média diária" v={formatarBRL(c.mediaDiaria)} />
                <Linha icon={TrendingUp} k="Maior dia" v={c.maiorDia ? `${formatarBRL(c.maiorDia.valor)} · ${formatarDataBR(c.maiorDia.data)}` : '—'} />
              </div>
            </div>
          )}

          {modoExibicao === 'atividade' && <AcumuladoAtividadesSecao filial={filial} cpfReal={pessoa.cpfReal} mesRotulo={mesRotulo} />}
        </div>

        {/* Rodapé fixo com os totais da competência — só faz sentido na RV por pontuação */}
        {modoExibicao === 'pontuacao' && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-3 flex justify-around">
            <RodapeItem k="Dias" v={String(c.diasComLancamento)} />
            <RodapeItem k="Pontos" v={c.pontuacaoTotal.toLocaleString('pt-BR')} />
            <RodapeItem k="Total período" v={formatarBRL(c.valorTotal)} destaque />
          </div>
        )}

        {mostrarFaixas && <FaixasModal clusters={clusters ?? []} onClose={() => setMostrarFaixas(false)} />}
      </div>
    )
  }

  // ── Lista de escolha (6 dígitos batem com mais de uma pessoa) ──────────
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
        <p className="text-brand-200 text-sm mt-1">Digite os 6 primeiros números do seu CPF.</p>
        <button onClick={() => setMostrarFaixas(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300 hover:text-accent-200">
          <HelpCircle className="h-3.5 w-3.5" /> Quanto eu recebo por faixa de pontuação?
        </button>
      </div>
      <div className="flex-1 bg-white text-gray-900 rounded-t-3xl px-5 pt-6 pb-8 flex flex-col gap-5">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-1.5"><Building2 className="h-3.5 w-3.5" /> Filial</label>
          <select value={filial} onChange={(e) => setFilial(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base bg-white">
            {filiais.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`w-11 h-16 rounded-2xl border-2 grid place-items-center text-3xl font-extrabold tabular-nums ${digitos[i] ? 'border-accent-500 text-gray-900' : 'border-gray-200 text-gray-300'}`}>
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
          <button onClick={buscar} disabled={buscando || digitos.length !== 6} className="py-4 rounded-xl bg-accent-500 disabled:opacity-40 text-white grid place-items-center active:bg-accent-600 transition">
            {buscando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Search className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mostrarFaixas && <FaixasModal clusters={clusters ?? []} onClose={() => setMostrarFaixas(false)} />}
    </div>
  )
}

// Seção extra da RV por atividade de turno — só aparece se a pessoa
// estiver flegada como responsável de alguma atividade (variavel_turno_
// atividade_colaboradores). Segue o mesmo padrão da RV por pontuação
// acima: mesma janela de competência (21→20), refaz a busca sempre que o
// colaborador troca de competência lá em cima. Mostra o acumulado por
// atividade; clicar numa atividade abre os dias com o resultado que o
// conferente lançou naquele fechamento + o valor gerado (ou "Ausente").
function AcumuladoAtividadesSecao({ filial, cpfReal, mesRotulo }: { filial: string; cpfReal: string; mesRotulo: string }) {
  const [dados, setDados] = useState<AcumuladoColaboradorMes | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    setCarregando(true)
    setDados(null)
    const { ini, fim } = rangeCompetencia(mesRotulo)
    buscarAcumuladoPorCpf(filial, cpfReal, ini, fim)
      .then(setDados)
      .finally(() => setCarregando(false))
  }, [filial, cpfReal, mesRotulo])

  if (carregando) return null
  if (!dados) return null

  const turnos = [...new Set(dados.porAtividade.map((a) => a.turno))]

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">RV por atividade — {turnos.join(', ')}</div>
      <div className="rounded-2xl bg-green-50 border border-green-200 p-5">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide text-green-700">Acumulado do mês</div>
          <div className="text-3xl font-extrabold text-green-700 tabular-nums mt-1">{formatarBRL(dados.totalGerado)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <div className="rounded-xl bg-white/70 border border-green-100 p-2.5 text-center">
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-green-700">Dias batidos</div>
            <div className="text-base font-extrabold text-gray-900 mt-0.5">{dados.diasBatidos} de {dados.diasRegistrados}</div>
          </div>
          <div className="rounded-xl bg-white/70 border border-green-100 p-2.5 text-center">
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-green-700">Cota diária total</div>
            <div className="text-base font-extrabold text-gray-900 tabular-nums mt-0.5">{formatarBRL(dados.cotaDiariaTotal)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-3">
        {dados.porAtividade.map((a) => {
          const abertaAgora = aberta === a.atividadeId
          return (
            <div key={a.atividadeId} className="rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setAberta(abertaAgora ? null : a.atividadeId)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-white active:bg-gray-50"
              >
                <span className="text-sm">
                  <span className="font-semibold">{a.atividadeNome}</span>
                  <span className="text-gray-500"> · {a.turno} · {a.dias.length} dia(s)</span>
                  {a.metaAcumulada && (
                    <span className={`ml-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${a.totalGerado > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {a.totalGerado > 0 ? 'meta batida' : 'meta não batida'}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tabular-nums text-green-700">{formatarBRL(a.totalGerado)}</span>
                  {abertaAgora ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </span>
              </button>
              {abertaAgora && (
                <div className="divide-y border-t border-gray-100">
                  {a.metaAcumulada && (
                    <div className="px-3 py-2 text-[11px] text-gray-500 bg-gray-50/60">
                      Meta pelo acumulado do período — o valor não varia por dia. Cada linha é só o indicador do dia, em
                      vermelho quando aquele dia não bateu a meta.
                    </div>
                  )}
                  {a.dias.map((d, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-xs bg-gray-50/60">
                      <span>
                        <span className="font-semibold">{formatarDataBR(d.data)}</span>
                        {!a.metaAcumulada && <span className="text-gray-500"> · {d.resultadoTexto}</span>}
                      </span>
                      {a.metaAcumulada ? (
                        <span className={`font-extrabold tabular-nums ${d.bateuDia ? 'text-green-700' : 'text-red-500'}`}>{d.resultadoTexto}</span>
                      ) : (
                        <span className={`font-extrabold tabular-nums ${d.ausente ? 'text-red-500' : d.valorGerado > 0 ? 'text-green-700' : 'text-gray-400'}`}>{formatarBRL(d.valorGerado)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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

// Tabela de faixas (clusters) — o colaborador recebe TODOS os pontos pagos
// na faixa em que o TOTAL do dia se encaixa (não é progressivo por faixa).
function FaixasModal({ clusters, onClose }: { clusters: Cluster[]; onClose: () => void }) {
  const ordenados = [...clusters].sort((a, b) => a.pontMin - b.pontMin)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="text-base font-bold text-gray-900">Quanto você recebe por faixa</h3>
            <p className="text-xs text-gray-500 mt-0.5">Vale para a pontuação de cada dia.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="p-5">
          {ordenados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Não foi possível carregar as faixas agora.</p>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 text-xs">Faixa de pontos</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 text-xs">A cada 1.000 pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ordenados.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2.5 tabular-nums text-gray-800">{c.pontMin.toLocaleString('pt-BR')} – {c.pontMax.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right font-bold text-green-700">{formatarBRL(c.valorPor1000)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3 text-center">Você recebe todos os pontos do dia pagos na faixa em que o total se encaixar.</p>
        </div>
      </div>
    </div>
  )
}
