import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Building2, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import PessoaValorCard from '../components/PessoaValorCard'

const TIPOS_SOLICITACAO = ['Finalizar Rota', 'Entrega/Recolha de Materiais', 'Outros'] as const
const SOLICITANTES_AMBEV = ['Isabela Kimel', 'Takasi Augusto', 'Roberta Soares', 'Outro']

interface ColaboradorNome { nome: string }

export default function SolicitarExtra() {
  const [filiais, setFiliais] = useState<string[]>([])
  const [colaboradores, setColaboradores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  const [filial, setFilial] = useState('')
  const [nomeSolicitante, setNomeSolicitante] = useState('')
  const [dataSolicitacao, setDataSolicitacao] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoSolicitacao, setTipoSolicitacao] = useState<typeof TIPOS_SOLICITACAO[number] | ''>('')
  const [descricao, setDescricao] = useState('')
  const [mapa, setMapa] = useState('')
  const [local, setLocal] = useState('')
  const [solicitanteAmbev, setSolicitanteAmbev] = useState('')
  const [solicitanteAmbevOutro, setSolicitanteAmbevOutro] = useState('')
  const [motoristaNome, setMotoristaNome] = useState('')
  const [ajudante1Nome, setAjudante1Nome] = useState('')
  const [ajudante2Nome, setAjudante2Nome] = useState('')
  const [valorUnico, setValorUnico] = useState(false)
  const [valorAcordado, setValorAcordado] = useState('')
  const [valorMotorista, setValorMotorista] = useState('')
  const [valorAjudante1, setValorAjudante1] = useState('')
  const [valorAjudante2, setValorAjudante2] = useState('')

  useEffect(() => {
    supabase.from('filiais').select('nome').order('nome').then(({ data }) => {
      const nomes = (data ?? []).map(f => f.nome)
      setFiliais(nomes)
      if (nomes.length > 0) setFilial(nomes[0])
    })
  }, [])

  useEffect(() => {
    if (!filial) { setColaboradores([]); return }
    supabase
      .from('colaboradores')
      .select('nome')
      .eq('filial', filial)
      .order('nome')
      .then(({ data }) => setColaboradores((data as ColaboradorNome[] ?? []).map(c => c.nome)))
  }, [filial])

  function resetForm() {
    setNomeSolicitante('')
    setTipoSolicitacao('')
    setDescricao('')
    setMapa('')
    setLocal('')
    setSolicitanteAmbev('')
    setSolicitanteAmbevOutro('')
    setMotoristaNome('')
    setAjudante1Nome('')
    setAjudante2Nome('')
    setValorUnico(false)
    setValorAcordado('')
    setValorMotorista('')
    setValorAjudante1('')
    setValorAjudante2('')
    setDataSolicitacao(new Date().toISOString().slice(0, 10))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!filial || !nomeSolicitante.trim() || !tipoSolicitacao) {
      setErro('Preencha filial, nome do solicitante e tipo de solicitação.')
      return
    }
    if (tipoSolicitacao === 'Finalizar Rota' && !mapa.trim()) {
      setErro('Informe o mapa para finalizar a rota.')
      return
    }
    if (tipoSolicitacao === 'Entrega/Recolha de Materiais' && !local.trim()) {
      setErro('Informe o local da entrega/recolha.')
      return
    }
    setEnviando(true)
    const vMotorista = valorUnico ? null : (valorMotorista ? Number(valorMotorista) : null)
    const vAjudante1 = valorUnico ? null : (valorAjudante1 ? Number(valorAjudante1) : null)
    const vAjudante2 = valorUnico ? null : (valorAjudante2 ? Number(valorAjudante2) : null)
    const vTotal = valorUnico
      ? (valorAcordado ? Number(valorAcordado) : null)
      : ([vMotorista, vAjudante1, vAjudante2].some(v => v != null)
        ? [vMotorista, vAjudante1, vAjudante2].reduce((soma: number, v) => soma + (v ?? 0), 0)
        : null)
    const { error } = await supabase.from('solicitacoes_extra').insert({
      filial,
      nome_solicitante: nomeSolicitante.trim(),
      data_solicitacao: dataSolicitacao,
      tipo_solicitacao: tipoSolicitacao,
      descricao: descricao.trim() || null,
      mapa: tipoSolicitacao === 'Finalizar Rota' ? mapa.trim() : null,
      local: tipoSolicitacao === 'Entrega/Recolha de Materiais' ? local.trim() : null,
      solicitante_ambev: solicitanteAmbev === 'Outro' ? (solicitanteAmbevOutro.trim() || null) : (solicitanteAmbev || null),
      motorista_nome: motoristaNome || null,
      ajudante1_nome: ajudante1Nome || null,
      ajudante2_nome: ajudante2Nome || null,
      valor_acordado: vTotal,
      valor_motorista: vMotorista,
      valor_ajudante1: vAjudante1,
      valor_ajudante2: vAjudante2,
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    resetForm()
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-8 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <h1 className="text-brand-700 text-xl font-bold">Solicitação enviada!</h1>
          <p className="text-sm text-gray-500">Sua solicitação foi registrada e será analisada pela equipe de Distribuição.</p>
          <button
            onClick={() => setEnviado(false)}
            className="w-full bg-accent-500 hover:bg-accent-600 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            Registrar outra solicitação
          </button>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 justify-center">
            <ArrowLeft size={14} /> Voltar para o login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-white border-b border-gray-100 px-8 py-6 flex flex-col items-center">
          <img src="/logo.png" alt="LOG20" className="h-16 mb-2 object-contain" />
          <h1 className="text-brand-700 text-xl font-bold tracking-tight">Solicitação Extra</h1>
          <p className="text-brand-400 text-sm mt-1">Finalização de rota, entrega/recolha de materiais e outras solicitações</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Filial</label>
              <div className="relative">
                <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={filial}
                  onChange={e => setFilial(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
                >
                  {filiais.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data da solicitação</label>
              <input
                type="date"
                value={dataSolicitacao}
                onChange={e => setDataSolicitacao(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do solicitante</label>
            <input
              value={nomeSolicitante}
              onChange={e => setNomeSolicitante(e.target.value)}
              placeholder="Seu nome"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Solicitação</label>
            <select
              value={tipoSolicitacao}
              onChange={e => setTipoSolicitacao(e.target.value as typeof tipoSolicitacao)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Selecione...</option>
              {TIPOS_SOLICITACAO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descreva a solicitação</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {tipoSolicitacao === 'Finalizar Rota' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mapa</label>
              <input
                value={mapa}
                onChange={e => setMapa(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {tipoSolicitacao === 'Entrega/Recolha de Materiais' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Local</label>
              <input
                value={local}
                onChange={e => setLocal(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Solicitante Ambev</label>
            <select
              value={solicitanteAmbev}
              onChange={e => setSolicitanteAmbev(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Selecione...</option>
              {SOLICITANTES_AMBEV.map(s => <option key={s}>{s}</option>)}
            </select>
            {solicitanteAmbev === 'Outro' && (
              <input
                value={solicitanteAmbevOutro}
                onChange={e => setSolicitanteAmbevOutro(e.target.value)}
                placeholder="Nome do solicitante Ambev"
                className="w-full mt-2 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={valorUnico}
                onChange={e => setValorUnico(e.target.checked)}
                className="rounded text-brand-700"
              />
              Valor único para todos
            </label>

            <PessoaValorCard
              label="Motorista"
              nome={motoristaNome}
              onNomeChange={setMotoristaNome}
              colaboradores={colaboradores}
              valor={valorMotorista}
              onValorChange={setValorMotorista}
              mostrarValor={!valorUnico}
            />
            <PessoaValorCard
              label="Ajudante 1"
              nome={ajudante1Nome}
              onNomeChange={setAjudante1Nome}
              colaboradores={colaboradores}
              valor={valorAjudante1}
              onValorChange={setValorAjudante1}
              mostrarValor={!valorUnico}
            />
            <PessoaValorCard
              label="Ajudante 2"
              nome={ajudante2Nome}
              onNomeChange={setAjudante2Nome}
              colaboradores={colaboradores}
              valor={valorAjudante2}
              onValorChange={setValorAjudante2}
              mostrarValor={!valorUnico}
            />

            {valorUnico && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor acordado (total)</label>
                <input
                  type="number"
                  step="0.01"
                  value={valorAcordado}
                  onChange={e => setValorAcordado(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {enviando
              ? <><Loader2 size={18} className="animate-spin" /> Enviando...</>
              : 'Enviar solicitação'
            }
          </button>

          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 justify-center w-full">
            <ArrowLeft size={14} /> Voltar para o login
          </Link>
        </form>
      </div>
    </div>
  )
}
