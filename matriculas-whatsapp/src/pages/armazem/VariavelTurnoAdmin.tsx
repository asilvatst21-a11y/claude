import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Power, Layers, UserCog, KeyRound, Users, X, CalendarClock, Check } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { listarUsuarios, criarUsuario, resetarSenhaUsuario, atualizarUsuario } from '../../lib/usuariosApi'
import type { Usuario } from '../../types'
import {
  listarAtividadesTurno, salvarAtividadeTurno, alternarAtivoAtividadeTurno,
  listarColaboradoresDaAtividade, salvarColaboradorAtividade, alternarAtivoColaboradorAtividade, preencherCreditosRetroativos,
  cotaDiaria, formatarBRL, listarColaboradoresElegiveis, minutosParaHHMM, hhmmParaMinutos,
  listarEquipeConferente, adicionarNaEquipeConferente, alternarAtivoEquipeConferente,
  listarRegistrosDoMes, registrarAtividadeTurno, bateuMetaAtividade,
  listarRegistrosOperadorDoMes, registrarAtividadeTurnoPorOperador,
  listarHorariosFechamento, salvarHorarioFechamento, TURNOS_CONFERENTE, TURNO_CONFERENTE_LABEL,
  recalcularCreditosHistorico,
  type TurnoAtividade, type TurnoTipoRegistro, type TurnoUnidade, type TurnoDirecao,
  type ColaboradorElegivel, type AtividadeColaborador, type ConferenteEquipeMembro, type TurnoRegistro,
  type RegistroOperador, type HorarioFechamentoTurno,
} from '../../lib/variavelTurno'

const UNIDADE_LABEL: Record<TurnoUnidade, string> = {
  percentual: '% percentual', reais: 'R$', numero: 'número', ok_nok: 'OK / NOK', tempo: 'Tempo (hh:mm)',
}

function formatarMetaTexto(a: TurnoAtividade): string {
  if (a.unidade === 'ok_nok') return 'OK/NOK'
  if (a.metaValor == null) return '—'
  const sinal = a.direcao === 'menor_melhor' ? '≤' : '≥'
  if (a.unidade === 'tempo') return `${sinal} ${minutosParaHHMM(a.metaValor)}`
  if (a.unidade === 'percentual') return `${sinal} ${a.metaValor}%`
  if (a.unidade === 'reais') return `${sinal} ${a.metaValor} R$`
  return `${sinal} ${a.metaValor}`
}
const DIRECAO_LABEL: Record<TurnoDirecao, string> = { maior_melhor: '↑ maior melhor', menor_melhor: '↓ menor melhor' }

// Cargo usado só pra identificar o login do conferente — o acesso direto à
// tabela `usuarios` é fechado por RLS (supabase-fechar-usuarios.sql), então
// login/senha são criados via api/usuarios (mesmo caminho já usado pela
// tela de Operadores do Armazém). Com cargo preenchido, um usuário não-admin
// (o supervisor do Armazém, não o admin geral) já tem permissão de criar.
const CARGO_CONFERENTE = 'Conferente RV'
const SENHA_PADRAO_CONFERENTE = 'CONFERENTE123'

function formVazio() {
  return {
    turno: '1º Turno', nome: '', tipoRegistro: 'manual' as TurnoTipoRegistro, unidade: 'percentual' as TurnoUnidade,
    direcao: 'maior_melhor' as TurnoDirecao, metaValor: '', conferenteUsuarioId: '', porOperador: false, metaAcumulada: false,
  }
}

function formConferenteVazio() {
  return { login: '', nome: '', senha: '', turno: '', telefone: '' }
}

// Uma atividade pode ter VÁRIOS colaboradores (ex.: EFC feita por vários
// ajudantes) — cada um com o próprio valor final mensal, não dividido entre
// o grupo. Esse painel só aparece depois que a atividade já tem id (ou seja,
// já foi salva pelo menos uma vez).
function ColaboradoresDaAtividade({ atividadeId, elegiveis }: { atividadeId: string; elegiveis: ColaboradorElegivel[] }) {
  const [lista, setLista] = useState<AtividadeColaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [colaboradorId, setColaboradorId] = useState('')
  const [valorFinalMensal, setValorFinalMensal] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setLista(await listarColaboradoresDaAtividade(atividadeId))
    setLoading(false)
  }, [atividadeId])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    setErro('')
    const valor = parseFloat(valorFinalMensal.replace(',', '.'))
    const colaborador = elegiveis.find((c) => c.id === colaboradorId)
    if (!colaborador) { setErro('Selecione um colaborador.'); return }
    if (!Number.isFinite(valor)) { setErro('Preencha o valor final mensal desse colaborador.'); return }
    setSalvando(true)
    const { error, diasPreenchidos } = await salvarColaboradorAtividade({
      atividadeId, colaboradorId: colaborador.id, colaboradorNome: colaborador.nome, valorFinalMensal: valor,
    })
    setSalvando(false)
    if (error) { setErro(`Erro ao adicionar: ${error}`); return }
    setColaboradorId('')
    setValorFinalMensal('')
    await carregar()
    if (diasPreenchidos) alert(`${colaborador.nome} vinculado(a) — ${diasPreenchidos} dia(s) já lançados nessa atividade foram creditados retroativamente.`)
  }

  async function alternar(c: AtividadeColaborador) {
    await alternarAtivoColaboradorAtividade(c.id, !c.ativo)
    await carregar()
  }

  const [preenchendoRetroativo, setPreenchendoRetroativo] = useState<string | null>(null)
  async function preencherRetroativo(c: AtividadeColaborador) {
    if (!c.colaboradorId) return
    setPreenchendoRetroativo(c.id)
    const n = await preencherCreditosRetroativos(atividadeId, c.colaboradorId, c.colaboradorNome, c.valorFinalMensal)
    setPreenchendoRetroativo(null)
    alert(n > 0 ? `${n} dia(s) já lançados foram creditados retroativamente pra ${c.colaboradorNome}.` : `${c.colaboradorNome} já está com todos os dias lançados creditados — nada pra preencher.`)
    await carregar()
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const disponiveis = elegiveis.filter((e) => !lista.some((l) => l.colaboradorId === e.id && l.ativo))

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-gray-50/50">
      <h5 className="text-xs font-semibold flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-accent-600" /> Colaboradores desta atividade</h5>
      {loading ? (
        <div className="flex justify-center py-4 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : lista.length === 0 ? (
        <p className="text-[11px] text-gray-400">Nenhum colaborador adicionado ainda.</p>
      ) : (
        <div className="divide-y border rounded-md bg-white">
          {lista.map((c) => (
            <div key={c.id} className={`flex items-center justify-between px-3 py-2 text-xs ${!c.ativo ? 'opacity-40' : ''}`}>
              <span>{c.colaboradorNome}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-gray-500">{formatarBRL(c.valorFinalMensal)}/mês · {formatarBRL(cotaDiaria(c.valorFinalMensal, hoje))}/dia</span>
                {c.ativo && c.colaboradorId && (
                  <button
                    onClick={() => preencherRetroativo(c)}
                    disabled={preenchendoRetroativo === c.id}
                    className="px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50 text-[10px] text-gray-500 disabled:opacity-50 whitespace-nowrap"
                    title="Credita dias já lançados nessa atividade antes desse vínculo existir"
                  >
                    {preenchendoRetroativo === c.id ? '…' : 'Preencher retroativo'}
                  </button>
                )}
                <button onClick={() => alternar(c)} className="p-1 rounded hover:bg-gray-100" title={c.ativo ? 'Remover' : 'Reativar'}>
                  {c.ativo ? <X className="h-3.5 w-3.5 text-red-500" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
      <div className="grid sm:grid-cols-3 gap-2 items-end">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Colaborador</label>
          <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs">
            <option value="">Selecione…</option>
            {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Valor final (mês)</label>
          <input value={valorFinalMensal} onChange={(e) => setValorFinalMensal(e.target.value)} placeholder="Ex.: 183,33" className="w-full border rounded px-2 py-1.5 text-xs font-mono" />
        </div>
      </div>
      <button onClick={adicionar} disabled={salvando} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-accent disabled:opacity-50">
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar colaborador
      </button>
    </div>
  )
}

// Lista fixa de pessoas que o conferente confere presença no fim do turno
// — quem ele marcar "ausente" perde o dia inteiro de RV. Selecionada aqui,
// por quem cadastra o login do conferente (não precisa coincidir com quem
// está em cada atividade específica).
function EquipeDoConferente({ conferenteUsuarioId, elegiveis }: { conferenteUsuarioId: string; elegiveis: ColaboradorElegivel[] }) {
  const [lista, setLista] = useState<ConferenteEquipeMembro[]>([])
  const [loading, setLoading] = useState(true)
  const [colaboradorId, setColaboradorId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setLista(await listarEquipeConferente(conferenteUsuarioId))
    setLoading(false)
  }, [conferenteUsuarioId])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    setErro('')
    const colaborador = elegiveis.find((c) => c.id === colaboradorId)
    if (!colaborador) { setErro('Selecione um colaborador.'); return }
    setSalvando(true)
    const { error } = await adicionarNaEquipeConferente(conferenteUsuarioId, colaborador.id, colaborador.nome)
    setSalvando(false)
    if (error) { setErro(`Erro ao adicionar: ${error}`); return }
    setColaboradorId('')
    await carregar()
  }

  async function alternar(m: ConferenteEquipeMembro) {
    await alternarAtivoEquipeConferente(m.id, !m.ativo)
    await carregar()
  }

  const disponiveis = elegiveis.filter((e) => !lista.some((l) => l.colaboradorId === e.id && l.ativo))

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-gray-50/50 mt-2">
      <h5 className="text-xs font-semibold flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-accent-600" /> Equipe (lista de presença do turno)</h5>
      {loading ? (
        <div className="flex justify-center py-3 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : lista.length === 0 ? (
        <p className="text-[11px] text-gray-400">Ninguém adicionado ainda — sem equipe, a tela de presença fica vazia pro conferente.</p>
      ) : (
        <div className="divide-y border rounded-md bg-white">
          {lista.map((m) => (
            <div key={m.id} className={`flex items-center justify-between px-3 py-2 text-xs ${!m.ativo ? 'opacity-40' : ''}`}>
              <span>{m.colaboradorNome}</span>
              <button onClick={() => alternar(m)} className="p-1 rounded hover:bg-gray-100" title={m.ativo ? 'Remover' : 'Reativar'}>
                {m.ativo ? <X className="h-3.5 w-3.5 text-red-500" /> : <Power className="h-3.5 w-3.5 text-green-600" />}
              </button>
            </div>
          ))}
        </div>
      )}
      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Colaborador</label>
          <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs">
            <option value="">Selecione…</option>
            {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>)}
          </select>
        </div>
        <button onClick={adicionar} disabled={salvando} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-accent disabled:opacity-50 whitespace-nowrap">
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
        </button>
      </div>
    </div>
  )
}

// Dias úteis (segunda a sábado, mesma régua da cota diária) de um mês
// "yyyy-mm", mais recente primeiro.
function diasDoMes(mesISO: string): string[] {
  const [ano, mes] = mesISO.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const dias: string[] = []
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() !== 0) dias.push(`${mesISO}-${String(d).padStart(2, '0')}`)
  }
  return dias.reverse()
}

function mesAtualISO(): string {
  return new Date().toISOString().slice(0, 7)
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Lançamento manual do dia — mesma função do fechamento do conferente
// (registra o resultado de hoje e recalcula o crédito de cada colaborador
// da atividade), só que feito aqui no painel em vez do kiosk do conferente.
// Pensado pras atividades "Manual diário" (TMA, Eficiência de Carregamento
// etc.), que não têm conferente responsável.
function LancamentoManualDiario({ atividades }: { atividades: TurnoAtividade[] }) {
  const { usuario } = useAuth()
  const hoje = hojeISO()
  const [registrosHoje, setRegistrosHoje] = useState<Map<string, TurnoRegistro>>(new Map())
  const [registrosOperadorHoje, setRegistrosOperadorHoje] = useState<Record<string, Map<string, RegistroOperador>>>({})
  const [colaboradoresPorAtividade, setColaboradoresPorAtividade] = useState<Record<string, AtividadeColaborador[]>>({})
  const [valores, setValores] = useState<Record<string, string>>({})
  const [valoresOperador, setValoresOperador] = useState<Record<string, Record<string, string>>>({})
  const [excluidos, setExcluidos] = useState<Record<string, Set<string>>>({})
  const [expandido, setExpandido] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const mapaRegistros = new Map<string, TurnoRegistro>()
    const mapaRegistrosOperador: Record<string, Map<string, RegistroOperador>> = {}
    const mapaColaboradores: Record<string, AtividadeColaborador[]> = {}
    await Promise.all(atividades.map(async (a) => {
      const colabs = await listarColaboradoresDaAtividade(a.id)
      mapaColaboradores[a.id] = colabs.filter((c) => c.ativo)
      if (a.porOperador) {
        const doMes = await listarRegistrosOperadorDoMes(a.id, hoje.slice(0, 7))
        mapaRegistrosOperador[a.id] = doMes.get(hoje) ?? new Map()
      } else {
        const doMes = await listarRegistrosDoMes(a.id, hoje.slice(0, 7))
        const r = doMes.get(hoje)
        if (r) mapaRegistros.set(a.id, r)
      }
    }))
    setRegistrosHoje(mapaRegistros)
    setRegistrosOperadorHoje(mapaRegistrosOperador)
    setColaboradoresPorAtividade(mapaColaboradores)
    setLoading(false)
  }, [atividades, hoje])

  useEffect(() => { carregar() }, [carregar])

  function alternarExcluido(atividadeId: string, colaboradorId: string) {
    setExcluidos((prev) => {
      const atual = new Set(prev[atividadeId] ?? [])
      if (atual.has(colaboradorId)) atual.delete(colaboradorId)
      else atual.add(colaboradorId)
      return { ...prev, [atividadeId]: atual }
    })
  }

  function parseValor(atividade: TurnoAtividade, bruto: string): { valorNumero: number | null; okNok: boolean | null; erro?: string } {
    if (atividade.unidade === 'ok_nok') return { valorNumero: null, okNok: bruto.toUpperCase() === 'OK' }
    if (atividade.unidade === 'tempo') {
      const v = hhmmParaMinutos(bruto)
      return v == null ? { valorNumero: null, okNok: null, erro: 'Valor de tempo inválido — use hh:mm.' } : { valorNumero: v, okNok: null }
    }
    const v = parseFloat(bruto.replace(',', '.'))
    return Number.isFinite(v) ? { valorNumero: v, okNok: null } : { valorNumero: null, okNok: null, erro: 'Valor inválido.' }
  }

  async function salvar(atividade: TurnoAtividade) {
    if (!usuario) return
    setErro('')
    const bruto = (valores[atividade.id] ?? '').trim()
    if (!bruto) { setErro('Preencha o resultado antes de salvar.'); return }
    const { valorNumero, okNok, erro: erroParse } = parseValor(atividade, bruto)
    if (erroParse) { setErro(erroParse); return }
    setSalvandoId(atividade.id)
    const colaboradores = colaboradoresPorAtividade[atividade.id] ?? await listarColaboradoresDaAtividade(atividade.id)
    const { error } = await registrarAtividadeTurno(
      atividade, colaboradores, hoje, { valorNumero, okNok },
      { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
      excluidos[atividade.id] ?? new Set(),
    )
    setSalvandoId(null)
    if (error) { setErro(`Erro ao salvar: ${error}`); return }
    await carregar()
  }

  async function salvarPorOperador(atividade: TurnoAtividade) {
    if (!usuario) return
    setErro('')
    const colaboradores = colaboradoresPorAtividade[atividade.id] ?? []
    const valoresDaAtividade = valoresOperador[atividade.id] ?? {}
    const mapaValores = new Map<string, { valorNumero: number | null; okNok: boolean | null }>()
    for (const c of colaboradores) {
      if (!c.colaboradorId) continue
      const bruto = (valoresDaAtividade[c.colaboradorId] ?? '').trim()
      if (!bruto) continue
      const { valorNumero, okNok, erro: erroParse } = parseValor(atividade, bruto)
      if (erroParse) { setErro(`${c.colaboradorNome}: ${erroParse}`); return }
      mapaValores.set(c.colaboradorId, { valorNumero, okNok })
    }
    setSalvandoId(atividade.id)
    const { error } = await registrarAtividadeTurnoPorOperador(
      atividade, colaboradores, hoje, mapaValores,
      { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
      excluidos[atividade.id] ?? new Set(),
    )
    setSalvandoId(null)
    if (error) { setErro(`Erro ao salvar: ${error}`); return }
    await carregar()
  }

  if (atividades.length === 0) return null

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1.5"><Check className="h-4 w-4 text-accent-600" /> Lançamento manual do dia</h4>
      <p className="text-xs text-gray-500">Mesmo efeito do fechamento do conferente — registra o resultado de hoje e já credita cada colaborador da atividade.</p>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {loading ? (
        <div className="flex justify-center py-6 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {atividades.map((a) => {
            const colabs = colaboradoresPorAtividade[a.id] ?? []
            const excluidosDessaAtividade = excluidos[a.id] ?? new Set<string>()

            if (a.porOperador) {
              const registrosOperador = registrosOperadorHoje[a.id] ?? new Map<string, RegistroOperador>()
              const qtdLancados = colabs.filter((c) => c.colaboradorId && registrosOperador.has(c.colaboradorId)).length
              return (
                <div key={a.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium flex-1">{a.turno} — {a.nome} <span className="text-[10px] text-accent-600 font-bold uppercase ml-1">por operador</span></span>
                    <button onClick={() => salvarPorOperador(a)} disabled={salvandoId === a.id} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
                      {salvandoId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />} Salvar
                    </button>
                    {qtdLancados > 0 && <span className="text-[10px] font-bold uppercase text-green-600 whitespace-nowrap">✓ {qtdLancados}/{colabs.length} lançado(s) hoje</span>}
                  </div>
                  {colabs.length === 0 ? (
                    <p className="text-[11px] text-gray-400">Nenhum colaborador vinculado — adicione em "Colaboradores desta atividade" na edição da atividade.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {colabs.map((c) => {
                        const excluido = c.colaboradorId != null && excluidosDessaAtividade.has(c.colaboradorId)
                        return (
                          <div key={c.id} className={`border rounded-md px-2 py-1.5 ${excluido ? 'opacity-40' : ''}`}>
                            <p className="text-[10px] text-gray-500 mb-0.5">{c.colaboradorNome}</p>
                            <div className="flex items-center gap-1">
                              <input
                                disabled={excluido}
                                value={c.colaboradorId ? (valoresOperador[a.id]?.[c.colaboradorId] ?? '') : ''}
                                onChange={(e) => c.colaboradorId && setValoresOperador((v) => ({ ...v, [a.id]: { ...(v[a.id] ?? {}), [c.colaboradorId!]: e.target.value } }))}
                                placeholder={a.unidade === 'tempo' ? 'hh:mm' : '0'}
                                className="border rounded px-1.5 py-1 text-xs font-mono w-16"
                              />
                              <label className="flex items-center" title="Não trabalhou hoje">
                                <input type="checkbox" checked={excluido} onChange={() => c.colaboradorId && alternarExcluido(a.id, c.colaboradorId)} className="h-3 w-3" />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            const jaTem = registrosHoje.get(a.id)
            return (
              <div key={a.id} className="border rounded-md">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="text-xs font-medium flex-1">{a.turno} — {a.nome}</span>
                  {a.unidade === 'ok_nok' ? (
                    <select value={valores[a.id] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [a.id]: e.target.value }))} className="border rounded px-2 py-1 text-xs w-28">
                      <option value="">—</option>
                      <option value="OK">OK</option>
                      <option value="NOK">NOK</option>
                    </select>
                  ) : (
                    <input
                      value={valores[a.id] ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [a.id]: e.target.value }))}
                      placeholder={a.unidade === 'tempo' ? 'hh:mm' : 'resultado'}
                      className="border rounded px-2 py-1 text-xs font-mono w-28"
                    />
                  )}
                  {colabs.length > 0 && (
                    <button onClick={() => setExpandido((v) => (v === a.id ? null : a.id))} className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded border hover:bg-accent whitespace-nowrap">
                      <Users className="h-3 w-3" /> Excluir colaborador{excluidosDessaAtividade.size > 0 ? ` (${excluidosDessaAtividade.size})` : ''}
                    </button>
                  )}
                  <button onClick={() => salvar(a)} disabled={salvandoId === a.id} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
                    {salvandoId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />} Salvar
                  </button>
                  {jaTem && <span className="text-[10px] font-bold uppercase text-green-600 whitespace-nowrap">✓ já registrado hoje</span>}
                </div>
                {expandido === a.id && (
                  <div className="border-t bg-gray-50/50 px-3 py-2 space-y-1">
                    <p className="text-[10px] text-gray-500 mb-1">Marque quem NÃO trabalhou hoje — não recebe crédito mesmo se a meta for batida.</p>
                    {colabs.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={c.colaboradorId != null && excluidosDessaAtividade.has(c.colaboradorId)}
                          onChange={() => c.colaboradorId && alternarExcluido(a.id, c.colaboradorId)}
                        />
                        {c.colaboradorNome}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Lançamento retroativo — pensado pras atividades "Manual diário" (TMA,
// Eficiência de Carregamento etc.), que não passam pelo fechamento do
// conferente. O admin escolhe a atividade + o mês e preenche/corrige
// qualquer dia (inclusive dias já passados), sem precisar de upload.
function LancamentoRetroativo({ atividades }: { atividades: TurnoAtividade[] }) {
  const { usuario } = useAuth()
  const [atividadeId, setAtividadeId] = useState('')
  const [mes, setMes] = useState(mesAtualISO())
  const [registros, setRegistros] = useState<Map<string, TurnoRegistro>>(new Map())
  const [colaboradores, setColaboradores] = useState<AtividadeColaborador[]>([])
  const [valores, setValores] = useState<Record<string, string>>({})
  const [valoresOperador, setValoresOperador] = useState<Record<string, Record<string, string>>>({})
  const [excluidosPorDia, setExcluidosPorDia] = useState<Record<string, Set<string>>>({})
  const [expandidoDia, setExpandidoDia] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [salvandoDia, setSalvandoDia] = useState<string | null>(null)
  const [salvandoTodos, setSalvandoTodos] = useState(false)
  const [erro, setErro] = useState('')

  const atividade = atividades.find((a) => a.id === atividadeId) ?? null

  const carregar = useCallback(async () => {
    if (!atividadeId) { setRegistros(new Map()); setColaboradores([]); return }
    setLoading(true)
    const colabs = await listarColaboradoresDaAtividade(atividadeId)
    setColaboradores(colabs.filter((c) => c.ativo))

    if (atividade?.porOperador) {
      const porDia = await listarRegistrosOperadorDoMes(atividadeId, mes)
      setRegistros(new Map())
      const iniciais: Record<string, Record<string, string>> = {}
      for (const [data, porColaborador] of porDia) {
        iniciais[data] = {}
        for (const [colaboradorId, r] of porColaborador) {
          if (atividade.unidade === 'ok_nok') iniciais[data][colaboradorId] = r.okNok == null ? '' : r.okNok ? 'OK' : 'NOK'
          else if (atividade.unidade === 'tempo' && r.valorNumero != null) iniciais[data][colaboradorId] = minutosParaHHMM(r.valorNumero)
          else iniciais[data][colaboradorId] = r.valorNumero != null ? String(r.valorNumero) : ''
        }
      }
      setValoresOperador(iniciais)
    } else {
      const regs = await listarRegistrosDoMes(atividadeId, mes)
      setRegistros(regs)
      const iniciais: Record<string, string> = {}
      for (const [data, r] of regs) {
        if (atividade?.unidade === 'ok_nok') iniciais[data] = r.okNok == null ? '' : r.okNok ? 'OK' : 'NOK'
        else if (atividade?.unidade === 'tempo' && r.valorNumero != null) iniciais[data] = minutosParaHHMM(r.valorNumero)
        else iniciais[data] = r.valorNumero != null ? String(r.valorNumero) : ''
      }
      setValores(iniciais)
    }
    setLoading(false)
  }, [atividadeId, mes, atividade?.unidade, atividade?.porOperador])

  useEffect(() => { carregar() }, [carregar])

  function alternarExcluido(data: string, colaboradorId: string) {
    setExcluidosPorDia((prev) => {
      const atual = new Set(prev[data] ?? [])
      if (atual.has(colaboradorId)) atual.delete(colaboradorId)
      else atual.add(colaboradorId)
      return { ...prev, [data]: atual }
    })
  }

  function parseValor(bruto: string): { valorNumero: number | null; okNok: boolean | null; erro?: string } {
    if (!atividade) return { valorNumero: null, okNok: null, erro: 'Selecione uma atividade.' }
    if (atividade.unidade === 'ok_nok') return { valorNumero: null, okNok: bruto.toUpperCase() === 'OK' }
    if (atividade.unidade === 'tempo') {
      const v = hhmmParaMinutos(bruto)
      return v == null ? { valorNumero: null, okNok: null, erro: 'use hh:mm' } : { valorNumero: v, okNok: null }
    }
    const v = parseFloat(bruto.replace(',', '.'))
    return Number.isFinite(v) ? { valorNumero: v, okNok: null } : { valorNumero: null, okNok: null, erro: 'valor inválido' }
  }

  async function salvarDia(data: string) {
    if (!atividade || !usuario) return
    setErro('')
    const bruto = (valores[data] ?? '').trim()
    if (!bruto) return
    const { valorNumero, okNok, erro: erroParse } = parseValor(bruto)
    if (erroParse) { setErro(`Valor inválido em ${data} — ${erroParse}.`); return }
    setSalvandoDia(data)
    const { error } = await registrarAtividadeTurno(
      atividade, colaboradores, data, { valorNumero, okNok },
      { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
      excluidosPorDia[data] ?? new Set(),
    )
    setSalvandoDia(null)
    if (error) { setErro(`Erro ao salvar ${data}: ${error}`); return }
    await carregar()
  }

  // Salva todos os dias preenchidos do mês de uma vez — pensado pro
  // lançamento retroativo: a pessoa preenche vários dias e clica em salvar
  // só uma vez, em vez de precisar confirmar linha por linha (é isso que
  // fazia dia preenchido nunca virar registro de verdade, sobrando como
  // "sem lançamento"/"ausente" no totem do colaborador).
  async function salvarTodos() {
    if (!atividade || !usuario) return
    setErro('')
    const diasPreenchidos = atividade.porOperador
      ? diasDoMes(mes).filter((data) => colaboradores.some((c) => c.colaboradorId && (valoresOperador[data]?.[c.colaboradorId] ?? '').trim()))
      : diasDoMes(mes).filter((data) => (valores[data] ?? '').trim())
    if (diasPreenchidos.length === 0) { setErro('Nenhum dia preenchido pra salvar.'); return }

    setSalvandoTodos(true)
    const erros: string[] = []
    for (const data of diasPreenchidos) {
      setSalvandoDia(data)
      if (atividade.porOperador) {
        const valoresDoDia = valoresOperador[data] ?? {}
        const mapaValores = new Map<string, { valorNumero: number | null; okNok: boolean | null }>()
        let erroParseLocal: string | null = null
        for (const c of colaboradores) {
          if (!c.colaboradorId) continue
          const bruto = (valoresDoDia[c.colaboradorId] ?? '').trim()
          if (!bruto) continue
          const { valorNumero, okNok, erro: erroParse } = parseValor(bruto)
          if (erroParse) { erroParseLocal = `${data} — ${c.colaboradorNome}: ${erroParse}.`; break }
          mapaValores.set(c.colaboradorId, { valorNumero, okNok })
        }
        if (erroParseLocal) { erros.push(erroParseLocal); continue }
        const { error } = await registrarAtividadeTurnoPorOperador(
          atividade, colaboradores, data, mapaValores,
          { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
          excluidosPorDia[data] ?? new Set(),
        )
        if (error) erros.push(`${data}: ${error}`)
      } else {
        const bruto = (valores[data] ?? '').trim()
        const { valorNumero, okNok, erro: erroParse } = parseValor(bruto)
        if (erroParse) { erros.push(`${data} — ${erroParse}.`); continue }
        const { error } = await registrarAtividadeTurno(
          atividade, colaboradores, data, { valorNumero, okNok },
          { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
          excluidosPorDia[data] ?? new Set(),
        )
        if (error) erros.push(`${data}: ${error}`)
      }
    }
    setSalvandoDia(null)
    setSalvandoTodos(false)
    await carregar()
    if (erros.length > 0) setErro(`${diasPreenchidos.length - erros.length} de ${diasPreenchidos.length} dia(s) salvos. Falhas:\n${erros.join('\n')}`)
    else alert(`${diasPreenchidos.length} dia(s) salvos.`)
  }

  async function salvarDiaPorOperador(data: string) {
    if (!atividade || !usuario) return
    setErro('')
    const valoresDoDia = valoresOperador[data] ?? {}
    const mapaValores = new Map<string, { valorNumero: number | null; okNok: boolean | null }>()
    for (const c of colaboradores) {
      if (!c.colaboradorId) continue
      const bruto = (valoresDoDia[c.colaboradorId] ?? '').trim()
      if (!bruto) continue
      const { valorNumero, okNok, erro: erroParse } = parseValor(bruto)
      if (erroParse) { setErro(`${data} — ${c.colaboradorNome}: ${erroParse}.`); return }
      mapaValores.set(c.colaboradorId, { valorNumero, okNok })
    }
    setSalvandoDia(data)
    const { error } = await registrarAtividadeTurnoPorOperador(
      atividade, colaboradores, data, mapaValores,
      { usuarioId: usuario.id, nome: usuario.nome ?? usuario.login },
      excluidosPorDia[data] ?? new Set(),
    )
    setSalvandoDia(null)
    if (error) { setErro(`Erro ao salvar ${data}: ${error}`); return }
    await carregar()
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-accent-600" /> Lançamento retroativo</h4>
      <p className="text-xs text-gray-500">Escolha a atividade e o mês pra preencher ou corrigir qualquer dia, mesmo já passado — sem precisar de upload.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Atividade</label>
          <select value={atividadeId} onChange={(e) => setAtividadeId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs">
            <option value="">Selecione…</option>
            {atividades.map((a) => <option key={a.id} value={a.id}>{a.turno} — {a.nome}{a.porOperador ? ' (por operador)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Mês</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" />
        </div>
      </div>

      {atividade && !loading && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-accent-50 border border-accent-200 rounded-md px-3 py-2">
          <p className="text-[11px] text-accent-800">Preencha quantos dias quiser e clique aqui uma vez só — não precisa confirmar dia por dia.</p>
          <button
            onClick={salvarTodos}
            disabled={salvandoTodos || salvandoDia != null}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent-500 hover:bg-accent-600 text-white font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {salvandoTodos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {salvandoTodos && salvandoDia ? `Salvando ${salvandoDia.slice(8, 10)}/${salvandoDia.slice(5, 7)}…` : 'Salvar todos os dias preenchidos'}
          </button>
        </div>
      )}

      {erro && <p className="text-xs text-red-600 whitespace-pre-line">{erro}</p>}

      {!atividade ? (
        <p className="text-[11px] text-gray-400">Selecione uma atividade pra ver os dias do mês.</p>
      ) : loading ? (
        <div className="flex justify-center py-6 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : atividade.porOperador ? (
        colaboradores.length === 0 ? (
          <p className="text-[11px] text-gray-400">Nenhum colaborador vinculado — adicione em "Colaboradores desta atividade" na edição da atividade.</p>
        ) : (
          <div className="border rounded-md overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Dia</th>
                  {colaboradores.map((c) => <th key={c.id} className="px-2 py-2 font-medium text-gray-500 whitespace-nowrap">{c.colaboradorNome}</th>)}
                  <th className="px-3 py-2 font-medium text-gray-500">Total</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {diasDoMes(mes).map((data) => {
                  const excluidosDoDia = excluidosPorDia[data] ?? new Set<string>()
                  const valoresDoDia = valoresOperador[data] ?? {}
                  const total = colaboradores.reduce((acc, c) => {
                    if (!c.colaboradorId || excluidosDoDia.has(c.colaboradorId)) return acc
                    const v = parseFloat((valoresDoDia[c.colaboradorId] ?? '').replace(',', '.'))
                    return Number.isFinite(v) ? acc + v : acc
                  }, 0)
                  return (
                    <tr key={data} className="border-t">
                      <td className="px-3 py-1.5 font-mono text-gray-500 whitespace-nowrap">{data.slice(8, 10)}/{data.slice(5, 7)}</td>
                      {colaboradores.map((c) => {
                        const excluido = c.colaboradorId != null && excluidosDoDia.has(c.colaboradorId)
                        return (
                          <td key={c.id} className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                disabled={excluido}
                                value={c.colaboradorId ? (valoresDoDia[c.colaboradorId] ?? '') : ''}
                                onChange={(e) => c.colaboradorId && setValoresOperador((v) => ({ ...v, [data]: { ...(v[data] ?? {}), [c.colaboradorId!]: e.target.value } }))}
                                placeholder={atividade.unidade === 'tempo' ? 'hh:mm' : '0'}
                                className={`border rounded px-1.5 py-1 text-xs font-mono w-14 ${excluido ? 'opacity-40' : ''}`}
                              />
                              <input
                                type="checkbox" checked={excluido} title="Não trabalhou nesse dia"
                                onChange={() => c.colaboradorId && alternarExcluido(data, c.colaboradorId)}
                                className="h-3 w-3"
                              />
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{total > 0 ? total : '—'}</td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => salvarDiaPorOperador(data)} disabled={salvandoDia === data} className="p-1.5 rounded border hover:bg-accent disabled:opacity-50" title="Salvar">
                          {salvandoDia === data ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="border rounded-md divide-y max-h-[420px] overflow-y-auto">
          {diasDoMes(mes).map((data) => {
            const jaTem = registros.has(data)
            const bateu = jaTem ? bateuMetaAtividade(atividade, registros.get(data)!.valorNumero, registros.get(data)!.okNok) : null
            const excluidosDoDia = excluidosPorDia[data] ?? new Set<string>()
            return (
              <div key={data}>
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="w-20 font-mono text-gray-500">{data.slice(8, 10)}/{data.slice(5, 7)}</span>
                  {atividade.unidade === 'ok_nok' ? (
                    <select value={valores[data] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [data]: e.target.value }))} className="flex-1 border rounded px-2 py-1 text-xs">
                      <option value="">—</option>
                      <option value="OK">OK</option>
                      <option value="NOK">NOK</option>
                    </select>
                  ) : (
                    <input
                      value={valores[data] ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [data]: e.target.value }))}
                      placeholder={atividade.unidade === 'tempo' ? 'hh:mm' : '—'}
                      className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                    />
                  )}
                  {colaboradores.length > 0 && (
                    <button onClick={() => setExpandidoDia((v) => (v === data ? null : data))} className="p-1.5 rounded border hover:bg-accent" title="Excluir colaborador nesse dia">
                      <Users className={`h-3 w-3 ${excluidosDoDia.size > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                    </button>
                  )}
                  <button onClick={() => salvarDia(data)} disabled={salvandoDia === data} className="p-1.5 rounded border hover:bg-accent disabled:opacity-50" title="Salvar">
                    {salvandoDia === data ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                  </button>
                  {jaTem && <span className={`text-[10px] font-bold uppercase whitespace-nowrap ${bateu ? 'text-green-600' : 'text-red-500'}`}>{bateu ? 'bateu' : 'não bateu'}</span>}
                </div>
                {expandidoDia === data && (
                  <div className="bg-gray-50/50 px-3 py-2 space-y-1 border-t">
                    <p className="text-[10px] text-gray-500 mb-1">Marque quem NÃO trabalhou neste dia — não recebe crédito mesmo se a meta for batida.</p>
                    {colaboradores.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={c.colaboradorId != null && excluidosDoDia.has(c.colaboradorId)}
                          onChange={() => c.colaboradorId && alternarExcluido(data, c.colaboradorId)}
                        />
                        {c.colaboradorNome}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Horário de fechamento de cada turno — base do futuro aviso automático via
// WhatsApp lembrando o conferente de lançar as atividades diárias. Editável
// aqui; os 3 turnos já vêm semeados pela migração (13h30/21h30/5h30).
function HorariosFechamentoTurno({ filial }: { filial: string }) {
  const [horarios, setHorarios] = useState<HorarioFechamentoTurno[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoTurno, setSalvandoTurno] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setHorarios(await listarHorariosFechamento(filial))
    setLoading(false)
  }, [filial])

  useEffect(() => { carregar() }, [carregar])

  function horarioDoTurno(turno: string): string {
    return horarios.find((h) => h.turno === turno)?.horarioFechamento ?? ''
  }

  async function salvar(turno: string, valor: string) {
    setSalvandoTurno(turno)
    const { error } = await salvarHorarioFechamento(filial, turno, valor)
    setSalvandoTurno(null)
    if (error) { alert(`Erro ao salvar horário: ${error}`); return }
    await carregar()
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-accent-600" /> Horário de fechamento por turno</h4>
      <p className="text-xs text-gray-500">
        Horário em que cada turno encerra — base do aviso automático de WhatsApp que vai lembrar o conferente de lançar
        as atividades do dia. Editável a qualquer momento.
      </p>
      {loading ? (
        <div className="flex justify-center py-4 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-3">
          {TURNOS_CONFERENTE.map((t) => (
            <div key={t}>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{TURNO_CONFERENTE_LABEL[t]}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  defaultValue={horarioDoTurno(t)}
                  onBlur={(e) => { const v = e.target.value; if (v && v !== horarioDoTurno(t)) salvar(t, v) }}
                  className="w-full border rounded px-2 py-1.5 text-xs"
                />
                {salvandoTurno === t && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VariavelTurnoAdmin({ filial }: { filial: string }) {
  const [atividades, setAtividades] = useState<TurnoAtividade[]>([])
  const [colaboradoresPorAtividade, setColaboradoresPorAtividade] = useState<Record<string, AtividadeColaborador[]>>({})
  const [elegiveis, setElegiveis] = useState<ColaboradorElegivel[]>([])
  const [conferentes, setConferentes] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(() => formVazio())
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const [formConferente, setFormConferente] = useState(formConferenteVazio())
  const [salvandoConferente, setSalvandoConferente] = useState(false)
  const [erroConferente, setErroConferente] = useState('')
  const [equipeExpandida, setEquipeExpandida] = useState<string | null>(null)
  const [recalculando, setRecalculando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [ativs, elegs, usuariosDaFilial] = await Promise.all([
      listarAtividadesTurno(filial),
      listarColaboradoresElegiveis(filial),
      listarUsuarios({ filial, apenasComCargo: true }).catch(() => [] as Usuario[]),
    ])
    setAtividades(ativs)
    setElegiveis(elegs)
    setConferentes(usuariosDaFilial.filter((u) => u.cargo === CARGO_CONFERENTE))
    const porAtividade: Record<string, AtividadeColaborador[]> = {}
    await Promise.all(ativs.map(async (a) => { porAtividade[a.id] = await listarColaboradoresDaAtividade(a.id) }))
    setColaboradoresPorAtividade(porAtividade)
    setLoading(false)
  }, [filial])

  useEffect(() => { carregar() }, [carregar])

  async function cadastrarConferente() {
    setErroConferente('')
    if (!formConferente.login.trim() || !formConferente.nome.trim()) {
      setErroConferente('Preencha login e nome do conferente.')
      return
    }
    setSalvandoConferente(true)
    try {
      await criarUsuario({
        filial, login: formConferente.login.trim(), nome: formConferente.nome.trim(),
        senha: formConferente.senha || SENHA_PADRAO_CONFERENTE,
        cargo: CARGO_CONFERENTE, admin: false, permissoes: [],
        turno: formConferente.turno || null, telefone: formConferente.telefone.trim() || null,
      })
      setFormConferente(formConferenteVazio())
      await carregar()
    } catch (e) {
      setErroConferente(e instanceof Error ? e.message : 'Erro ao cadastrar conferente.')
    } finally {
      setSalvandoConferente(false)
    }
  }

  async function atualizarTurnoConferente(c: Usuario, turno: string) {
    try {
      await atualizarUsuario(c.id, { turno: turno || null })
      await carregar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar turno.')
    }
  }

  async function atualizarTelefoneConferente(c: Usuario, telefone: string) {
    try {
      await atualizarUsuario(c.id, { telefone: telefone.trim() || null })
      await carregar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar telefone.')
    }
  }

  async function resetarSenhaConferente(c: Usuario) {
    if (!confirm(`Resetar a senha de ${c.login} para "${SENHA_PADRAO_CONFERENTE}"?`)) return
    try {
      await resetarSenhaUsuario(c.id, SENHA_PADRAO_CONFERENTE)
      alert(`Senha resetada para: ${SENHA_PADRAO_CONFERENTE}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao resetar senha.')
    }
  }

  function editar(a: TurnoAtividade) {
    setEditandoId(a.id)
    const metaValorTexto = a.metaValor == null ? '' : a.unidade === 'tempo' ? minutosParaHHMM(a.metaValor) : String(a.metaValor)
    setForm({
      turno: a.turno, nome: a.nome, tipoRegistro: a.tipoRegistro, unidade: a.unidade,
      direcao: a.direcao ?? 'maior_melhor', metaValor: metaValorTexto,
      conferenteUsuarioId: a.conferenteUsuarioId ?? '', porOperador: a.porOperador, metaAcumulada: a.metaAcumulada,
    })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setForm(formVazio())
  }

  async function salvar() {
    setErro('')
    if (!form.nome.trim()) { setErro('Preencha o nome da atividade.'); return }
    if (!form.conferenteUsuarioId) { setErro('Selecione o conferente que fecha o turno.'); return }
    const conferente = conferentes.find((u) => u.id === form.conferenteUsuarioId)
    const metaValor = form.unidade === 'ok_nok' ? null
      : form.unidade === 'tempo' ? hhmmParaMinutos(form.metaValor)
        : parseFloat(form.metaValor.replace(',', '.'))
    if (form.unidade !== 'ok_nok' && (metaValor == null || !Number.isFinite(metaValor))) {
      setErro(form.unidade === 'tempo' ? 'Preencha a meta de tempo no formato hh:mm (ex.: 00:45).' : 'Preencha o valor da meta (ou escolha a unidade OK/NOK).')
      return
    }
    setSalvando(true)
    const { error, id } = await salvarAtividadeTurno({
      id: editandoId ?? undefined, filial, turno: form.turno, nome: form.nome.trim(),
      tipoRegistro: form.tipoRegistro, unidade: form.unidade, direcao: form.direcao,
      metaValor: metaValor ?? null,
      conferenteUsuarioId: form.conferenteUsuarioId, conferenteNome: conferente?.nome ?? conferente?.login ?? null,
      porOperador: form.porOperador, metaAcumulada: form.metaAcumulada,
    })
    setSalvando(false)
    if (error) { setErro(`Erro ao salvar: ${error}`); return }
    await carregar()
    // Depois de criar, entra direto em edição pra poder adicionar os
    // colaboradores (só dá pra vincular colaborador depois que a atividade
    // já existe).
    if (!editandoId && id) setEditandoId(id)
  }

  async function alternarAtivo(a: TurnoAtividade) {
    await alternarAtivoAtividadeTurno(a.id, !a.ativo)
    await carregar()
  }

  async function recalcularHistorico() {
    if (!confirm('Recalcular TODO o histórico de créditos de RV por atividade dessa filial com a conta corrigida (dias úteis da competência 21→20)? Isso pode levar alguns instantes.')) return
    setRecalculando(true)
    try {
      const { atividadesProcessadas, creditosAtualizados } = await recalcularCreditosHistorico(filial)
      alert(`Histórico recalculado: ${atividadesProcessadas} atividade(s) verificada(s), ${creditosAtualizados} crédito(s) corrigido(s).`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao recalcular histórico.')
    } finally {
      setRecalculando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        O conferente só lança as atividades <b className="text-green-700">Manuais</b> no fim do turno — as de <b>Upload</b> seguem
        o fluxo de relatório normal, fora desse fechamento. Uma atividade pode ter vários colaboradores (ex.: EFC feita por
        vários ajudantes) — o valor final mensal é individual, não dividido entre o grupo, e é dividido pelos dias úteis
        da competência (21→20) pra virar a cota diária de cada um — a não ser que a atividade seja de <b>meta acumulada</b>,
        que paga o valor cheio ou zero conforme a média do período inteiro.
      </p>

      <div className="flex items-center justify-between gap-2 border rounded-lg p-3 bg-gray-50/50">
        <p className="text-[11px] text-gray-500">
          Créditos gravados antes do ajuste da cota diária pra competência (21→20) ficaram com a conta antiga (mês
          calendário). Use aqui pra corrigir o histórico já lançado dessa filial.
        </p>
        <button
          onClick={recalcularHistorico}
          disabled={recalculando}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-accent disabled:opacity-50 whitespace-nowrap"
        >
          {recalculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />} Recalcular histórico
        </button>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5"><UserCog className="h-4 w-4 text-accent-600" /> Conferentes</h4>
        <p className="text-xs text-gray-500">
          Login usado só pra entrar em <code>/armazem/turno</code> e fechar o turno — não dá acesso a mais nada do sistema.
        </p>

        {conferentes.length > 0 && (
          <div className="divide-y border rounded-md">
            {conferentes.map((c) => (
              <div key={c.id} className="px-3 py-2">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span><b>{c.nome ?? c.login}</b> <span className="text-gray-400 font-mono">({c.login})</span></span>
                  <span className="flex items-center gap-1.5">
                    <select
                      value={c.turno ?? ''}
                      onChange={(e) => atualizarTurnoConferente(c, e.target.value)}
                      className="border rounded px-1.5 py-1 text-xs bg-white"
                      title="Turno"
                    >
                      <option value="">Sem turno</option>
                      {TURNOS_CONFERENTE.map((t) => <option key={t} value={t}>{TURNO_CONFERENTE_LABEL[t]}</option>)}
                    </select>
                    <input
                      defaultValue={c.telefone ?? ''}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.telefone ?? '')) atualizarTelefoneConferente(c, v) }}
                      placeholder="telefone p/ aviso"
                      className="border rounded px-1.5 py-1 text-xs w-32"
                      title="Telefone (WhatsApp)"
                    />
                    <button onClick={() => setEquipeExpandida((v) => (v === c.id ? null : c.id))} className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent whitespace-nowrap">
                      <Users className="h-3 w-3" /> Equipe (presença)
                    </button>
                    <button onClick={() => resetarSenhaConferente(c)} className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent whitespace-nowrap">
                      <KeyRound className="h-3 w-3" /> Resetar senha
                    </button>
                  </span>
                </div>
                {equipeExpandida === c.id && <EquipeDoConferente conferenteUsuarioId={c.id} elegiveis={elegiveis} />}
              </div>
            ))}
          </div>
        )}

        {erroConferente && <p className="text-xs text-red-600">{erroConferente}</p>}
        <div className="grid sm:grid-cols-6 gap-2 items-end">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Login</label>
            <input value={formConferente.login} onChange={(e) => setFormConferente((f) => ({ ...f, login: e.target.value }))} placeholder="ex.: lsiqueira" className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Nome</label>
            <input value={formConferente.nome} onChange={(e) => setFormConferente((f) => ({ ...f, nome: e.target.value }))} placeholder="ex.: Luana Siqueira" className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Senha (opcional)</label>
            <input value={formConferente.senha} onChange={(e) => setFormConferente((f) => ({ ...f, senha: e.target.value }))} placeholder={SENHA_PADRAO_CONFERENTE} className="w-full border rounded px-2 py-1.5 text-xs font-mono" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Turno</label>
            <select value={formConferente.turno} onChange={(e) => setFormConferente((f) => ({ ...f, turno: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs bg-white">
              <option value="">Sem turno</option>
              {TURNOS_CONFERENTE.map((t) => <option key={t} value={t}>{TURNO_CONFERENTE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Telefone (WhatsApp)</label>
            <input value={formConferente.telefone} onChange={(e) => setFormConferente((f) => ({ ...f, telefone: e.target.value }))} placeholder="ex.: 24999998888" className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <button onClick={cadastrarConferente} disabled={salvandoConferente} className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-accent disabled:opacity-50">
            {salvandoConferente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Cadastrar conferente
          </button>
        </div>
      </div>

      <HorariosFechamentoTurno filial={filial} />

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {loading ? (
        <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500 border-b bg-gray-50">
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2">Atividade</th>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2">Meta</th>
                <th className="px-3 py-2">Colaboradores</th>
                <th className="px-3 py-2">Conferente</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {atividades.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhuma atividade cadastrada.</td></tr>
              )}
              {atividades.map((a) => {
                const colabs = (colaboradoresPorAtividade[a.id] ?? []).filter((c) => c.ativo)
                return (
                  <tr key={a.id} className={`border-b last:border-0 align-top ${!a.ativo ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{a.turno}</td>
                    <td className="px-3 py-2 font-medium">{a.nome}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        a.tipoRegistro === 'manual' ? 'bg-green-50 text-green-700'
                          : a.tipoRegistro === 'manual_admin' ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                      }`}
                      >
                        {a.tipoRegistro === 'manual' ? 'Manual (turno)' : a.tipoRegistro === 'manual_admin' ? 'Manual (painel)' : 'Upload'}
                      </span>
                      {a.porOperador && (
                        <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-100 text-accent-700">por operador</span>
                      )}
                      {a.metaAcumulada && (
                        <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">meta acumulada</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatarMetaTexto(a)}</td>
                    <td className="px-3 py-2">
                      {colabs.length === 0 ? '—' : colabs.map((c) => c.colaboradorNome).join(', ')}
                    </td>
                    <td className="px-3 py-2">{a.conferenteNome ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => editar(a)} className="text-[11px] px-2 py-1 rounded border hover:bg-accent mr-1">Editar</button>
                      <button onClick={() => alternarAtivo(a)} className="text-[11px] px-2 py-1 rounded border hover:bg-accent inline-flex items-center gap-1">
                        <Power className="h-3 w-3" /> {a.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5"><Layers className="h-4 w-4 text-accent-600" /> {editandoId ? 'Editar atividade' : 'Nova atividade'}</h4>
        <div className="grid sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Turno</label>
            <input value={form.turno} onChange={(e) => setForm((f) => ({ ...f, turno: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Atividade</label>
            <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex.: EFC descarga" className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo de registro</label>
            <select value={form.tipoRegistro} onChange={(e) => setForm((f) => ({ ...f, tipoRegistro: e.target.value as TurnoTipoRegistro }))} className="w-full border rounded px-2 py-1.5 text-xs">
              <option value="manual">Manual (conferente lança no turno)</option>
              <option value="manual_admin">Manual diário (lançado aqui no painel)</option>
              <option value="upload">Upload (fora do fechamento)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Unidade da meta</label>
            <select value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value as TurnoUnidade }))} className="w-full border rounded px-2 py-1.5 text-xs">
              {(Object.keys(UNIDADE_LABEL) as TurnoUnidade[]).map((u) => <option key={u} value={u}>{UNIDADE_LABEL[u]}</option>)}
            </select>
          </div>
          {form.unidade !== 'ok_nok' ? (
            <>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Direção</label>
                <select value={form.direcao} onChange={(e) => setForm((f) => ({ ...f, direcao: e.target.value as TurnoDirecao }))} className="w-full border rounded px-2 py-1.5 text-xs">
                  {(Object.keys(DIRECAO_LABEL) as TurnoDirecao[]).map((d) => <option key={d} value={d}>{DIRECAO_LABEL[d]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Valor da meta</label>
                <input
                  value={form.metaValor}
                  onChange={(e) => setForm((f) => ({ ...f, metaValor: e.target.value }))}
                  placeholder={form.unidade === 'tempo' ? 'hh:mm (ex.: 00:45)' : undefined}
                  className="w-full border rounded px-2 py-1.5 text-xs font-mono"
                />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 flex items-end text-[11px] text-gray-400 pb-2">Direção e valor da meta não se aplicam a OK/NOK — só considera "bateu" quando o registro é OK.</div>
          )}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Conferente que fecha o turno</label>
            <select value={form.conferenteUsuarioId} onChange={(e) => setForm((f) => ({ ...f, conferenteUsuarioId: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs">
              <option value="">Selecione…</option>
              {conferentes.map((u) => <option key={u.id} value={u.id}>{u.nome ?? u.login} ({u.login})</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end pb-2">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={form.porOperador} onChange={(e) => setForm((f) => ({ ...f, porOperador: e.target.checked }))} />
              Lançamento por operador — cada colaborador lança o próprio valor do dia (ex.: Quebra), em vez de todos herdarem um valor único do turno.
            </label>
          </div>
          <div className="sm:col-span-2 flex items-end pb-2">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={form.metaAcumulada} onChange={(e) => setForm((f) => ({ ...f, metaAcumulada: e.target.checked }))} />
              Meta acumulada — paga o valor final CHEIO se a média da competência inteira (21→20) bater a meta, ou ZERO se não bater, em vez de cota por dia batido (ex.: TMA).
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {editandoId ? 'Salvar alterações' : 'Cadastrar atividade'}
          </button>
          {editandoId && <button onClick={cancelarEdicao} className="text-xs px-3 py-2 rounded-md border">Fechar edição</button>}
        </div>

        {editandoId && <ColaboradoresDaAtividade atividadeId={editandoId} elegiveis={elegiveis} />}
      </div>

      <LancamentoManualDiario atividades={atividades.filter((a) => a.tipoRegistro === 'manual_admin' && a.ativo)} />
      <LancamentoRetroativo atividades={atividades.filter((a) => a.ativo)} />
    </div>
  )
}
