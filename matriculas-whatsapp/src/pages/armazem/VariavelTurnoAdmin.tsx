import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Power, Layers, UserCog, KeyRound } from 'lucide-react'
import { listarUsuarios, criarUsuario, resetarSenhaUsuario } from '../../lib/usuariosApi'
import type { Usuario } from '../../types'
import {
  listarAtividadesTurno, salvarAtividadeTurno, alternarAtivoAtividadeTurno, cotaDiaria, formatarBRL,
  listarColaboradoresElegiveis, type TurnoAtividade, type TurnoTipoRegistro, type TurnoUnidade, type TurnoDirecao,
  type ColaboradorElegivel,
} from '../../lib/variavelTurno'

const UNIDADE_LABEL: Record<TurnoUnidade, string> = {
  percentual: '% percentual', reais: 'R$', numero: 'número', ok_nok: 'OK / NOK',
}
const DIRECAO_LABEL: Record<TurnoDirecao, string> = { maior_melhor: '↑ maior melhor', menor_melhor: '↓ menor melhor' }

// Cargo usado só pra identificar o login do conferente — o acesso direto à
// tabela `usuarios` é fechado por RLS (supabase-fechar-usuarios.sql), então
// login/senha são criados via api/usuarios (mesmo caminho já usado pela
// tela de Operadores do Armazém). Com cargo preenchido, um usuário não-admin
// (o supervisor do Armazém, não o admin geral) já tem permissão de criar.
const CARGO_CONFERENTE = 'Conferente RV'
const SENHA_PADRAO_CONFERENTE = 'CONFERENTE123'

function formVazio(filial: string) {
  return {
    turno: '1º Turno', nome: '', tipoRegistro: 'manual' as TurnoTipoRegistro, unidade: 'percentual' as TurnoUnidade,
    direcao: 'maior_melhor' as TurnoDirecao, metaValor: '', valorFinalMensal: '',
    colaboradorId: '', conferenteUsuarioId: '', filial,
  }
}

function formConferenteVazio() {
  return { login: '', nome: '', senha: '' }
}

export default function VariavelTurnoAdmin({ filial }: { filial: string }) {
  const [atividades, setAtividades] = useState<TurnoAtividade[]>([])
  const [colaboradores, setColaboradores] = useState<ColaboradorElegivel[]>([])
  const [conferentes, setConferentes] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(() => formVazio(filial))
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const [formConferente, setFormConferente] = useState(formConferenteVazio())
  const [salvandoConferente, setSalvandoConferente] = useState(false)
  const [erroConferente, setErroConferente] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [ativs, colabs, usuariosDaFilial] = await Promise.all([
      listarAtividadesTurno(filial),
      listarColaboradoresElegiveis(filial),
      listarUsuarios({ filial, apenasComCargo: true }).catch(() => [] as Usuario[]),
    ])
    setAtividades(ativs)
    setColaboradores(colabs)
    setConferentes(usuariosDaFilial.filter((u) => u.cargo === CARGO_CONFERENTE))
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
    setForm({
      turno: a.turno, nome: a.nome, tipoRegistro: a.tipoRegistro, unidade: a.unidade,
      direcao: a.direcao ?? 'maior_melhor', metaValor: a.metaValor != null ? String(a.metaValor) : '',
      valorFinalMensal: String(a.valorFinalMensal), colaboradorId: a.colaboradorId ?? '',
      conferenteUsuarioId: a.conferenteUsuarioId ?? '', filial,
    })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setForm(formVazio(filial))
  }

  async function salvar() {
    setErro('')
    const valorFinalMensal = parseFloat(form.valorFinalMensal.replace(',', '.'))
    if (!form.nome.trim() || !Number.isFinite(valorFinalMensal)) {
      setErro('Preencha o nome da atividade e o valor final mensal.')
      return
    }
    if (!form.colaboradorId) { setErro('Selecione o colaborador responsável.'); return }
    if (!form.conferenteUsuarioId) { setErro('Selecione o conferente que fecha o turno.'); return }
    const colaborador = colaboradores.find((c) => c.id === form.colaboradorId)
    const conferente = conferentes.find((u) => u.id === form.conferenteUsuarioId)
    const metaValor = form.unidade === 'ok_nok' ? null : parseFloat(form.metaValor.replace(',', '.'))
    if (form.unidade !== 'ok_nok' && !Number.isFinite(metaValor)) {
      setErro('Preencha o valor da meta (ou escolha a unidade OK/NOK).')
      return
    }
    setSalvando(true)
    const { error } = await salvarAtividadeTurno({
      id: editandoId ?? undefined, filial, turno: form.turno, nome: form.nome.trim(),
      tipoRegistro: form.tipoRegistro, unidade: form.unidade, direcao: form.direcao,
      metaValor: metaValor ?? null, valorFinalMensal,
      colaboradorId: form.colaboradorId, colaboradorNome: colaborador?.nome ?? null,
      conferenteUsuarioId: form.conferenteUsuarioId, conferenteNome: conferente?.nome ?? conferente?.login ?? null,
    })
    setSalvando(false)
    if (error) { setErro(`Erro ao salvar: ${error}`); return }
    cancelarEdicao()
    await carregar()
  }

  async function alternarAtivo(a: TurnoAtividade) {
    await alternarAtivoAtividadeTurno(a.id, !a.ativo)
    await carregar()
  }

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        O conferente só lança as atividades <b className="text-green-700">Manuais</b> no fim do turno — as de <b>Upload</b> seguem
        o fluxo de relatório normal, fora desse fechamento. Valor final mensal é dividido pelos dias úteis (segunda a sábado) do mês.
      </p>

      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-1.5"><UserCog className="h-4 w-4 text-accent-600" /> Conferentes</h4>
        <p className="text-xs text-gray-500">
          Login usado só pra entrar em <code>/armazem/turno</code> e fechar o turno — não dá acesso a mais nada do sistema.
        </p>

        {conferentes.length > 0 && (
          <div className="divide-y border rounded-md">
            {conferentes.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span><b>{c.nome ?? c.login}</b> <span className="text-gray-400 font-mono">({c.login})</span></span>
                <button onClick={() => resetarSenhaConferente(c)} className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent">
                  <KeyRound className="h-3 w-3" /> Resetar senha
                </button>
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
                <th className="px-3 py-2 text-right">Valor / mês</th>
                <th className="px-3 py-2 text-right">Cota diária</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Conferente</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {atividades.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Nenhuma atividade cadastrada.</td></tr>
              )}
              {atividades.map((a) => (
                <tr key={a.id} className={`border-b last:border-0 ${!a.ativo ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{a.turno}</td>
                  <td className="px-3 py-2 font-medium">{a.nome}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.tipoRegistro === 'manual' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.tipoRegistro === 'manual' ? 'Manual' : 'Upload'}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {a.unidade === 'ok_nok' ? 'OK/NOK' : (
                      <>{a.direcao === 'menor_melhor' ? '≤' : '≥'} {a.metaValor}{a.unidade === 'percentual' ? '%' : a.unidade === 'reais' ? ' R$' : ''}</>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatarBRL(a.valorFinalMensal)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatarBRL(cotaDiaria(a.valorFinalMensal, hoje))}</td>
                  <td className="px-3 py-2">{a.colaboradorNome ?? '—'}</td>
                  <td className="px-3 py-2">{a.conferenteNome ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => editar(a)} className="text-[11px] px-2 py-1 rounded border hover:bg-accent mr-1">Editar</button>
                    <button onClick={() => alternarAtivo(a)} className="text-[11px] px-2 py-1 rounded border hover:bg-accent inline-flex items-center gap-1">
                      <Power className="h-3 w-3" /> {a.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
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
                <input value={form.metaValor} onChange={(e) => setForm((f) => ({ ...f, metaValor: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs font-mono" />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 flex items-end text-[11px] text-gray-400 pb-2">Direção e valor da meta não se aplicam a OK/NOK — só considera "bateu" quando o registro é OK.</div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Valor final (mês)</label>
            <input value={form.valorFinalMensal} onChange={(e) => setForm((f) => ({ ...f, valorFinalMensal: e.target.value }))} placeholder="Ex.: 183,33" className="w-full border rounded px-2 py-1.5 text-xs font-mono" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Colaborador responsável</label>
            <select value={form.colaboradorId} onChange={(e) => setForm((f) => ({ ...f, colaboradorId: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs">
              <option value="">Selecione…</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>)}
            </select>
            {colaboradores.length === 0 && (
              <p className="text-[10px] text-amber-600 mt-1">
                Nenhum colaborador com função "Ajudante de Armazém" ou "Operador de Empilhadeira" encontrado em Gente › Colaboradores.
              </p>
            )}
          </div>
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
          {editandoId && <button onClick={cancelarEdicao} className="text-xs px-3 py-2 rounded-md border">Cancelar</button>}
        </div>
      </div>
    </div>
  )
}
