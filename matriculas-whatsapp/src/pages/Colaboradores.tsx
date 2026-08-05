import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Loader2, Plus, RefreshCw, Search, Upload, Users, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { parseColaboradores, importarColaboradores } from '../lib/colaboradores'
import { FiltroMulti } from '../components/FiltroMulti'
import { formatarDataBR } from '../lib/utils'
import { mesesDeEmpresa } from '../lib/gsdpqVencimento'
import type { Colaborador } from '../types'

function tempoDeCasaLabel(dataAdmissao: string | null): string {
  if (!dataAdmissao) return '—'
  const meses = mesesDeEmpresa(dataAdmissao, new Date())
  if (meses < 0) return '—'
  if (meses < 12) return `${meses}m`
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  return resto === 0 ? `${anos}a` : `${anos}a ${resto}m`
}

// Campos que hoje são mantidos em duplicidade em outras telas (GSD, TML,
// Armazém) — aqui viram a fonte única. Ver supabase-migration-colaboradores-central.sql.
export default function Colaboradores() {
  const { usuario } = useAuth()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [cargo, setCargo] = useState('')
  const [funcao, setFuncao] = useState('')
  const [equipe, setEquipe] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [status, setStatus] = useState('')
  const [matriculaPromax, setMatriculaPromax] = useState('')
  const [importando, setImportando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [filtroEquipe, setFiltroEquipe] = useState('todas')
  const [filtroFuncao, setFiltroFuncao] = useState<string[]>([])
  // Desligados ficam ocultos por padrão — só aparecem escolhendo
  // "Desligados" ou "Todos".
  const [filtroStatus, setFiltroStatus] = useState<'ativos' | 'desligados' | 'todos'>('ativos')
  const [filtroTelefone, setFiltroTelefone] = useState<'todos' | 'com' | 'sem'>('todos')
  type CampoOrdenacao = 'nome' | 'matricula' | 'matricula_promax' | 'equipe' | 'status'
  const [ordenarPor, setOrdenarPor] = useState<CampoOrdenacao>('nome')
  const [ordemDesc, setOrdemDesc] = useState(false)

  const fetchColaboradores = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase.from('colaboradores').select('*').eq('filial', usuario.filial).order('nome')
    setColaboradores((data ?? []) as Colaborador[])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchColaboradores() }, [fetchColaboradores])

  function abrirCriar() {
    setEditando(null)
    setNome(''); setMatricula(''); setMatriculaPromax(''); setCargo(''); setFuncao(''); setEquipe(''); setTelefone(''); setCpf(''); setStatus('TRABALHANDO')
    setErro('')
    setModal(true)
  }

  function abrirEditar(c: Colaborador) {
    setEditando(c)
    setNome(c.nome); setMatricula(c.matricula ?? ''); setMatriculaPromax(c.matricula_promax ?? '')
    setCargo(c.cargo ?? ''); setFuncao(c.funcao ?? '')
    setEquipe(c.equipe ?? ''); setTelefone(c.telefone ?? ''); setCpf(c.cpf ?? ''); setStatus(c.status ?? '')
    setErro('')
    setModal(true)
  }

  // Motoristas TML, Ajudantes (Financeiro), Supervisores TML e Supervisores
  // GSD ainda guardam seu próprio telefone (usado direto pelos fluxos de
  // WhatsApp) — em vez de já trocar essas tabelas por completo, sincroniza
  // o valor pra lá também sempre que o telefone é corrigido aqui. Motorista
  // e Ajudante são casados pela matrícula Promax (mais confiável — nome tem
  // variações de grafia entre as bases); Supervisor não tem matrícula, casa
  // por nome mesmo.
  async function sincronizarTelefone(
    filial: string, nomeColaborador: string, matriculaPromax: string | null, telefoneNovo: string | null
  ) {
    const tarefas = [
      supabase.from('supervisores_tml').update({ telefone: telefoneNovo }).eq('filial', filial).ilike('nome', nomeColaborador),
      supabase.from('gsdpq_supervisores').update({ telefone: telefoneNovo }).eq('filial', filial).ilike('nome', nomeColaborador),
    ]
    if (matriculaPromax && matriculaPromax.trim()) {
      tarefas.push(
        supabase.from('motoristas_sala_tml').update({ telefone: telefoneNovo }).eq('filial', filial).eq('matricula', Number(matriculaPromax)),
        supabase.from('ajudantes').update({ telefone: telefoneNovo }).eq('codigo', Number(matriculaPromax)),
      )
      // A tela de Motoristas TML na verdade mostra o telefone vindo daqui
      // (tabela legada `matriculas`, casando pelo número = matrícula Promax)
      // sempre que motoristas_sala_tml.telefone está vazio — por isso
      // precisa ficar em dia também. `whatsapp` não aceita nulo, então só
      // atualiza quando há um número novo (não apaga registro existente).
      if (telefoneNovo) {
        tarefas.push(supabase.from('matriculas').update({ whatsapp: telefoneNovo }).eq('numero', matriculaPromax.trim()))
      }
    } else {
      tarefas.push(supabase.from('motoristas_sala_tml').update({ telefone: telefoneNovo }).eq('filial', filial).ilike('nome', nomeColaborador))
    }
    await Promise.all(tarefas)
  }

  async function handleSalvar() {
    if (!usuario || !nome.trim()) return
    setSalvando(true)
    setErro('')
    const campos = {
      filial: usuario.filial,
      nome: nome.trim(),
      matricula: matricula.trim() || null,
      matricula_promax: matriculaPromax.trim() || null,
      cargo: cargo.trim() || null,
      funcao: funcao.trim() || null,
      equipe: equipe.trim() || null,
      telefone: telefone.trim() || null,
      cpf: cpf.trim() || null,
      status: status.trim() || null,
    }
    const { error } = editando
      ? await supabase.from('colaboradores').update(campos).eq('id', editando.id)
      : await supabase.from('colaboradores').insert(campos)
    setSalvando(false)
    if (error) {
      setErro(error.message.includes('duplicate') || error.message.includes('unique') ? 'Já existe um colaborador com esse nome.' : error.message)
      return
    }
    await sincronizarTelefone(usuario.filial, nome.trim(), campos.matricula_promax, campos.telefone)
    setModal(false)
    await fetchColaboradores()
  }

  // Importação NÃO altera quem já está cadastrado e continua na planilha —
  // só insere quem é novo e marca como desligado quem sumiu (ver
  // importarColaboradores em lib/colaboradores.ts, compartilhada com o
  // import de Jornada). Cadastro de quem continua ativo fica intocado,
  // mesmo que a planilha traga status/função/equipe/telefone diferentes
  // pra essa pessoa — evita sobrescrever edição manual feita aqui na tela.
  async function handleImportar(file: File) {
    if (!usuario) return
    setImportando(true)
    try {
      const buffer = await file.arrayBuffer()
      const rows = parseColaboradores(buffer, usuario.filial)
      if (rows.length === 0) throw new Error('Nenhum colaborador encontrado na planilha (esperado colunas COLABORADOR, FUNCAO, EQUIPE).')

      const resultado = await importarColaboradores(usuario.filial, rows)

      // Propaga telefone só de quem foi inserido agora — quem já existia
      // não é alterado.
      const comTelefoneNovo = resultado.novosInseridos.filter(r => r.telefone)
      await Promise.all(comTelefoneNovo.map(r => sincronizarTelefone(usuario.filial, r.nome, r.matricula_promax ?? null, r.telefone ?? null)))
      await fetchColaboradores()
      alert(
        `${resultado.novos} novo(s) colaborador(es) inserido(s). ` +
        `${resultado.desligados} marcado(s) como desligado(s) (sumiram da planilha). ` +
        `${resultado.mantidos} já cadastrado(s) e mantido(s) sem alteração.`
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao importar planilha.')
    } finally {
      setImportando(false)
    }
  }

  // Edição rápida de telefone/cpf direto na tabela, sem abrir o modal.
  async function atualizarCampo(id: string, campos: Partial<Pick<Colaborador, 'telefone' | 'cpf'>>) {
    setSalvandoId(id)
    setColaboradores(prev => prev.map(c => (c.id === id ? { ...c, ...campos } : c)))
    await supabase.from('colaboradores').update(campos).eq('id', id)
    if ('telefone' in campos && usuario) {
      const colaborador = colaboradores.find(c => c.id === id)
      if (colaborador) await sincronizarTelefone(usuario.filial, colaborador.nome, colaborador.matricula_promax ?? null, campos.telefone ?? null)
    }
    setSalvandoId(null)
  }

  const equipesDisponiveis = useMemo(
    () => Array.from(new Set(colaboradores.map(c => c.equipe ?? c.sala).filter((v): v is string => !!v))).sort(),
    [colaboradores]
  )
  const funcoesDisponiveis = useMemo(
    () => Array.from(new Set(colaboradores.map(c => c.funcao).filter((v): v is string => !!v))).sort(),
    [colaboradores]
  )

  const buscaNorm = busca.trim().toLowerCase()
  const filtrados = useMemo(() => {
    let lista = colaboradores
    if (buscaNorm) {
      lista = lista.filter(c =>
        c.nome.toLowerCase().includes(buscaNorm) ||
        (c.matricula ?? '').toLowerCase().includes(buscaNorm) ||
        (c.matricula_promax ?? '').toLowerCase().includes(buscaNorm) ||
        (c.equipe ?? '').toLowerCase().includes(buscaNorm) ||
        (c.funcao ?? '').toLowerCase().includes(buscaNorm)
      )
    }
    if (filtroEquipe !== 'todas') lista = lista.filter(c => (c.equipe ?? c.sala) === filtroEquipe)
    if (filtroFuncao.length > 0) lista = lista.filter(c => c.funcao && filtroFuncao.includes(c.funcao))
    if (filtroStatus === 'ativos') lista = lista.filter(c => c.status !== 'DESLIGADO')
    else if (filtroStatus === 'desligados') lista = lista.filter(c => c.status === 'DESLIGADO')
    if (filtroTelefone === 'com') lista = lista.filter(c => !!c.telefone)
    if (filtroTelefone === 'sem') lista = lista.filter(c => !c.telefone)

    const valor = (c: Colaborador): string => {
      switch (ordenarPor) {
        case 'matricula': return c.matricula ?? ''
        case 'matricula_promax': return c.matricula_promax ?? ''
        case 'equipe': return c.equipe ?? c.sala ?? ''
        case 'status': return c.status ?? ''
        default: return c.nome
      }
    }
    const ordenada = [...lista].sort((a, b) => {
      const cmp = valor(a).localeCompare(valor(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
      return ordemDesc ? -cmp : cmp
    })
    return ordenada
  }, [colaboradores, buscaNorm, filtroEquipe, filtroFuncao, filtroStatus, filtroTelefone, ordenarPor, ordemDesc])

  function alternarOrdenacao(campo: CampoOrdenacao) {
    if (ordenarPor === campo) setOrdemDesc(v => !v)
    else { setOrdenarPor(campo); setOrdemDesc(false) }
  }

  function IconeOrdenacao({ campo }: { campo: CampoOrdenacao }) {
    if (ordenarPor !== campo) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return ordemDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
  }

  const comTelefone = colaboradores.filter(c => c.telefone).length

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-accent-600" /> Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro central de nome, matrícula, cargo/função/equipe, telefone e CPF. Outras telas (GSD, TML,
            Armazém, Fixação de Motorista) já usam ou vão passar a usar esse cadastro em vez de manter listas
            próprias — cadastre ou corrija um colaborador aqui e ele aparece atualizado nos outros módulos.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <button onClick={fetchColaboradores} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={() => inputRef.current?.click()} disabled={importando} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50">
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar planilha
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImportar(file)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          <button onClick={abrirCriar} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm transition-colors">
            <Plus className="h-4 w-4" /> Novo colaborador
          </button>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">Lista de Colaboradores</h2>
            <p className="text-xs text-muted-foreground">{filtrados.length} de {colaboradores.length} cadastrado(s) · {comTelefone} com telefone</p>
          </div>
          <div className="relative shrink-0">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar nome, matrícula, equipe..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md w-56 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-wrap bg-muted/20">
          <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="todas">Todas as equipes</option>
            {equipesDisponiveis.map(eq => <option key={eq} value={eq}>{eq}</option>)}
          </select>
          <FiltroMulti label="Função" selected={filtroFuncao} onChange={setFiltroFuncao} options={funcoesDisponiveis} />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as 'ativos' | 'desligados' | 'todos')} className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="ativos">Trabalhando (oculta desligados)</option>
            <option value="desligados">Só desligados</option>
            <option value="todos">Todos os status</option>
          </select>
          <select value={filtroTelefone} onChange={e => setFiltroTelefone(e.target.value as 'todos' | 'com' | 'sem')} className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="todos">Com ou sem telefone</option>
            <option value="com">Só com telefone</option>
            <option value="sem">Só sem telefone</option>
          </select>
          {(filtroEquipe !== 'todas' || filtroFuncao.length > 0 || filtroStatus !== 'ativos' || filtroTelefone !== 'todos') && (
            <button
              onClick={() => { setFiltroEquipe('todas'); setFiltroFuncao([]); setFiltroStatus('ativos'); setFiltroTelefone('todos') }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum colaborador encontrado.</p>
            <p className="text-sm mt-1">Cadastre manualmente ou importe a planilha de colaboradores em Jornada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => alternarOrdenacao('nome')} className="flex items-center gap-1 hover:text-foreground">Nome <IconeOrdenacao campo="nome" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => alternarOrdenacao('matricula')} className="flex items-center gap-1 hover:text-foreground">Matrícula (LOG20) <IconeOrdenacao campo="matricula" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => alternarOrdenacao('matricula_promax')} className="flex items-center gap-1 hover:text-foreground">Matrícula (Promax) <IconeOrdenacao campo="matricula_promax" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cargo / Função</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => alternarOrdenacao('equipe')} className="flex items-center gap-1 hover:text-foreground">Equipe <IconeOrdenacao campo="equipe" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tempo de casa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <button onClick={() => alternarOrdenacao('status')} className="flex items-center gap-1 hover:text-foreground">Status <IconeOrdenacao campo="status" /></button>
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.matricula ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.matricula_promax ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{[c.cargo, c.funcao].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.equipe ?? c.sala ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={c.telefone ?? ''}
                        placeholder="—"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (c.telefone ?? '')) atualizarCampo(c.id, { telefone: v || null })
                        }}
                        disabled={salvandoId === c.id}
                        className="w-32 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={c.cpf ?? ''}
                        placeholder="—"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (c.cpf ?? '')) atualizarCampo(c.id, { cpf: v || null })
                        }}
                        disabled={salvandoId === c.id}
                        className="w-28 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground" title={c.data_admissao ? formatarDataBR(c.data_admissao) : undefined}>
                      {tempoDeCasaLabel(c.data_admissao ?? null)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.status ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => abrirEditar(c)} className="text-xs px-3 py-1.5 rounded-md border hover:bg-accent transition-colors">
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">{editando ? 'Editar colaborador' : 'Novo colaborador'}</h2>
              <button onClick={() => setModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Matrícula (LOG20)</label>
                  <input value={matricula} onChange={e => setMatricula(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Matrícula (Promax)</label>
                  <input value={matriculaPromax} onChange={e => setMatriculaPromax(e.target.value)} placeholder="Só motoristas/ajudantes" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">CPF</label>
                <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="Só números" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Cargo</label>
                  <input value={cargo} onChange={e => setCargo(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Função</label>
                  <input value={funcao} onChange={e => setFuncao(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Equipe</label>
                  <input value={equipe} onChange={e => setEquipe(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">— sem status —</option>
                    <option value="TRABALHANDO">Trabalhando</option>
                    <option value="DESLIGADO">Desligado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone (WhatsApp)</label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  placeholder="Ex: 21999999999 ou 5521999999999"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(false)} disabled={salvando} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button
                onClick={handleSalvar}
                disabled={salvando || !nome.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
