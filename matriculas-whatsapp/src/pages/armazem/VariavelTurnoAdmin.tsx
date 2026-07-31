import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Power, Layers, UserCog, KeyRound, Users, X } from 'lucide-react'
import { listarUsuarios, criarUsuario, resetarSenhaUsuario } from '../../lib/usuariosApi'
import type { Usuario } from '../../types'
import {
  listarAtividadesTurno, salvarAtividadeTurno, alternarAtivoAtividadeTurno,
  listarColaboradoresDaAtividade, salvarColaboradorAtividade, alternarAtivoColaboradorAtividade,
  cotaDiaria, formatarBRL, listarColaboradoresElegiveis, minutosParaHHMM, hhmmParaMinutos,
  listarEquipeConferente, adicionarNaEquipeConferente, alternarAtivoEquipeConferente,
  type TurnoAtividade, type TurnoTipoRegistro, type TurnoUnidade, type TurnoDirecao,
  type ColaboradorElegivel, type AtividadeColaborador, type ConferenteEquipeMembro,
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
    direcao: 'maior_melhor' as TurnoDirecao, metaValor: '', conferenteUsuarioId: '',
  }
}

function formConferenteVazio() {
  return { login: '', nome: '', senha: '' }
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
    const { error } = await salvarColaboradorAtividade({
      atividadeId, colaboradorId: colaborador.id, colaboradorNome: colaborador.nome, valorFinalMensal: valor,
    })
    setSalvando(false)
    if (error) { setErro(`Erro ao adicionar: ${error}`); return }
    setColaboradorId('')
    setValorFinalMensal('')
    await carregar()
  }

  async function alternar(c: AtividadeColaborador) {
    await alternarAtivoColaboradorAtividade(c.id, !c.ativo)
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
      })
      setFormConferente(formConferenteVazio())
      await carregar()
    } catch (e) {
      setErroConferente(e instanceof Error ? e.message : 'Erro ao cadastrar conferente.')
    } finally {
      setSalvandoConferente(false)
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
      conferenteUsuarioId: a.conferenteUsuarioId ?? '',
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        O conferente só lança as atividades <b className="text-green-700">Manuais</b> no fim do turno — as de <b>Upload</b> seguem
        o fluxo de relatório normal, fora desse fechamento. Uma atividade pode ter vários colaboradores (ex.: EFC feita por
        vários ajudantes) — o valor final mensal é individual, não dividido entre o grupo, e é dividido pelos dias úteis
        (segunda a sábado) do mês pra virar a cota diária de cada um.
      </p>

      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5"><UserCog className="h-4 w-4 text-accent-600" /> Conferentes</h4>
        <p className="text-xs text-gray-500">
          Login usado só pra entrar em <code>/armazem/turno</code> e fechar o turno — não dá acesso a mais nada do sistema.
        </p>

        {conferentes.length > 0 && (
          <div className="divide-y border rounded-md">
            {conferentes.map((c) => (
              <div key={c.id} className="px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span><b>{c.nome ?? c.login}</b> <span className="text-gray-400 font-mono">({c.login})</span></span>
                  <span className="flex items-center gap-1">
                    <button onClick={() => setEquipeExpandida((v) => (v === c.id ? null : c.id))} className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent">
                      <Users className="h-3 w-3" /> Equipe (presença)
                    </button>
                    <button onClick={() => resetarSenhaConferente(c)} className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent">
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
        <div className="grid sm:grid-cols-4 gap-2 items-end">
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
          <button onClick={cadastrarConferente} disabled={salvandoConferente} className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md border hover:bg-accent disabled:opacity-50">
            {salvandoConferente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Cadastrar conferente
          </button>
        </div>
      </div>

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
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.tipoRegistro === 'manual' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.tipoRegistro === 'manual' ? 'Manual' : 'Upload'}
                      </span>
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
              <option value="manual">Manual (conferente lança)</option>
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
        </div>

        <div className="flex items-center gap-2">
          <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {editandoId ? 'Salvar alterações' : 'Cadastrar atividade'}
          </button>
          {editandoId && <button onClick={cancelarEdicao} className="text-xs px-3 py-2 rounded-md border">Fechar edição</button>}
        </div>

        {editandoId && <ColaboradoresDaAtividade atividadeId={editandoId} elegiveis={elegiveis} />}
      </div>
    </div>
  )
}
