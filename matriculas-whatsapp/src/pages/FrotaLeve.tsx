import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Search, Truck, AlertTriangle, Clock, Plus, Power, User } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import { formatarDataBR } from '../lib/utils'

// Uma viagem de frota leve (saída → retorno), preenchida pelo bot de WhatsApp.
// Espelha a tabela frota_leve_saidas criada na migration supabase-migration-frota-leve.sql.
interface FrotaLeveSaida {
  id: string
  status: string
  placa: string | null
  motorista_nome: string | null
  condutor_nome: string | null
  km_saida: number | null
  hora_saida: string | null
  destino: string | null
  previsao_min: number | null
  previsao_retorno: string | null
  km_retorno: number | null
  hora_retorno: string | null
  observacoes: string | null
  saida_registrada_em: string | null
  finalizado_em: string | null
  created_at: string
}

interface Veiculo { id: string; placa: string; modelo: string | null; ativo: boolean }
interface Condutor { id: string; nome: string; telefone: string | null; ativo: boolean }

// Estados que contam como "viagem em aberto" (veículo fora / coleta em andamento).
const STATUS_ABERTO = ['coletando_saida', 'aguardando_foto_saida', 'em_rota', 'coletando_retorno', 'aguardando_foto_retorno']

const STATUS_LABEL: Record<string, string> = {
  coletando_saida: 'Registrando saída',
  aguardando_foto_saida: 'Aguardando foto',
  em_rota: 'Em rota',
  coletando_retorno: 'Registrando retorno',
  aguardando_foto_retorno: 'Aguardando foto',
  finalizado: 'Finalizada',
  cancelado: 'Cancelada',
}

const STATUS_COR: Record<string, string> = {
  em_rota: 'bg-blue-100 text-blue-700',
  finalizado: 'bg-green-100 text-green-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

function horaBR(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

function km(v: number | null): string {
  return v == null ? '—' : v.toLocaleString('pt-BR')
}

// Duração entre dois instantes (ou até agora, se ainda em rota) → "2h 05min".
function duracao(inicio: string | null, fim: string | null): string {
  if (!inicio) return '—'
  const ms = (fim ? new Date(fim).getTime() : Date.now()) - new Date(inicio).getTime()
  if (ms < 0) return '—'
  const min = Math.round(ms / 60_000)
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`
}

export default function FrotaLeve() {
  const { usuario } = useAuth()
  const [viagens, setViagens] = useState<FrotaLeveSaida[]>([])
  const [loading, setLoading] = useState(true)
  const [somenteAbertas, setSomenteAbertas] = useState(false)
  const [busca, setBusca] = useState('')

  // Configuração do grupo de WhatsApp da frota leve
  const [grupo, setGrupo] = useState('')
  const [grupoOriginal, setGrupoOriginal] = useState('')
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroBuscaGrupos, setErroBuscaGrupos] = useState<string | null>(null)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [grupoSalvo, setGrupoSalvo] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  // Cadastros (veículos e condutores)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [condutores, setCondutores] = useState<Condutor[]>([])
  const [novaPlaca, setNovaPlaca] = useState('')
  const [novoModelo, setNovoModelo] = useState('')
  const [novoCondutor, setNovoCondutor] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [salvandoCad, setSalvandoCad] = useState(false)
  const [erroCad, setErroCad] = useState<string | null>(null)

  const fetchCadastros = useCallback(async () => {
    if (!usuario) return
    const [{ data: veic }, { data: cond }] = await Promise.all([
      supabase.from('frota_leve_veiculos').select('*').eq('filial', usuario.filial).order('placa'),
      supabase.from('frota_leve_condutores').select('*').eq('filial', usuario.filial).order('nome'),
    ])
    setVeiculos((veic ?? []) as Veiculo[])
    setCondutores((cond ?? []) as Condutor[])
  }, [usuario])

  const fetchViagens = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data }, { data: filialRow }] = await Promise.all([
      supabase.from('frota_leve_saidas').select('*').eq('filial', usuario.filial).order('created_at', { ascending: false }).limit(500),
      supabase.from('filiais').select('grupo_frota_leve_whatsapp').eq('nome', usuario.filial).maybeSingle(),
    ])
    setViagens((data ?? []) as FrotaLeveSaida[])
    const g = filialRow?.grupo_frota_leve_whatsapp ?? ''
    setGrupo(g)
    setGrupoOriginal(g)
    await fetchCadastros()
    setLoading(false)
  }, [usuario, fetchCadastros])

  useEffect(() => { fetchViagens() }, [fetchViagens])

  async function buscarGrupos() {
    setBuscandoGrupos(true)
    setErroBuscaGrupos(null)
    const { grupos: gs, erro: e } = await listarGrupos()
    setBuscandoGrupos(false)
    if (e) { setErroBuscaGrupos(e); return }
    if (gs.length === 0) { setErroBuscaGrupos('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvarGrupo() {
    if (!usuario) return
    setSalvandoGrupo(true)
    setGrupoSalvo(false)
    await supabase.from('filiais').update({ grupo_frota_leve_whatsapp: grupo.trim() || null }).eq('nome', usuario.filial)
    setGrupoOriginal(grupo.trim())
    setSalvandoGrupo(false)
    setGrupoSalvo(true)
    setTimeout(() => setGrupoSalvo(false), 2500)
  }

  function copiar(id: string) {
    navigator.clipboard?.writeText(id).then(() => {
      setCopiado(id)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  async function addVeiculo() {
    if (!usuario) return
    const placa = novaPlaca.trim().toUpperCase()
    if (!placa) return
    setSalvandoCad(true)
    setErroCad(null)
    const { error } = await supabase.from('frota_leve_veiculos').insert({ filial: usuario.filial, placa, modelo: novoModelo.trim() || null })
    setSalvandoCad(false)
    if (error) { setErroCad(`Não foi possível salvar o veículo: ${error.message}`); return }
    setNovaPlaca('')
    setNovoModelo('')
    await fetchCadastros()
  }

  async function toggleVeiculo(v: Veiculo) {
    setErroCad(null)
    const { error } = await supabase.from('frota_leve_veiculos').update({ ativo: !v.ativo }).eq('id', v.id)
    if (error) { setErroCad(error.message); return }
    await fetchCadastros()
  }

  async function addCondutor() {
    if (!usuario) return
    const nomeC = novoCondutor.trim()
    if (!nomeC) return
    setSalvandoCad(true)
    setErroCad(null)
    const { error } = await supabase.from('frota_leve_condutores').insert({ filial: usuario.filial, nome: nomeC, telefone: novoTelefone.trim() || null })
    setSalvandoCad(false)
    if (error) { setErroCad(`Não foi possível salvar o condutor: ${error.message}`); return }
    setNovoCondutor('')
    setNovoTelefone('')
    await fetchCadastros()
  }

  async function toggleCondutor(c: Condutor) {
    setErroCad(null)
    const { error } = await supabase.from('frota_leve_condutores').update({ ativo: !c.ativo }).eq('id', c.id)
    if (error) { setErroCad(error.message); return }
    await fetchCadastros()
  }

  const abertas = useMemo(() => viagens.filter(v => STATUS_ABERTO.includes(v.status)), [viagens])
  const emRota = useMemo(() => viagens.filter(v => v.status === 'em_rota'), [viagens])
  const atrasadas = useMemo(
    () => emRota.filter(v => v.previsao_retorno && new Date(v.previsao_retorno).getTime() < Date.now()),
    [emRota],
  )

  const filtradas = useMemo(() => {
    let lista = somenteAbertas ? abertas : viagens
    const q = busca.trim().toLowerCase()
    if (q) lista = lista.filter(v =>
      (v.placa ?? '').toLowerCase().includes(q) ||
      (v.condutor_nome ?? '').toLowerCase().includes(q) ||
      (v.motorista_nome ?? '').toLowerCase().includes(q) ||
      (v.destino ?? '').toLowerCase().includes(q))
    return lista
  }, [viagens, abertas, somenteAbertas, busca])

  const grupoMudou = grupo.trim() !== grupoOriginal.trim()

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link to="/frota" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <Truck className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Frota Leve</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Controle de saída e retorno de veículos leves, registrado pelos colaboradores no grupo de WhatsApp.
        </p>
      </div>

      {/* Cartões-resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Em rota</p>
          <p className="text-2xl font-bold text-blue-600">{emRota.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Retorno atrasado</p>
          <p className={`text-2xl font-bold ${atrasadas.length ? 'text-red-600' : 'text-foreground'}`}>{atrasadas.length}</p>
        </div>
        <div className="rounded-lg border p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Viagens (total)</p>
          <p className="text-2xl font-bold">{viagens.length}</p>
        </div>
      </div>

      {/* Configuração do grupo de WhatsApp */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Grupo de WhatsApp</h2>
          <button
            onClick={buscarGrupos}
            disabled={buscandoGrupos}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {buscandoGrupos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar grupos
          </button>
        </div>
        {erroBuscaGrupos && (
          <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {erroBuscaGrupos}</p>
        )}
        <GroupPicker
          label="Grupo do controle da frota leve"
          hint="Grupo onde os colaboradores mandam “registro” para registrar saída/retorno do veículo."
          value={grupo}
          onChange={setGrupo}
          grupos={grupos}
          onCopy={copiar}
          copiado={copiado}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={salvarGrupo}
            disabled={!grupoMudou || salvandoGrupo}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {salvandoGrupo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Salvar grupo
          </button>
          {grupoSalvo && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Salvo!</span>}
        </div>
      </div>

      {/* Cadastros: Veículos e Condutores */}
      {erroCad && (
        <p className="flex items-start gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 rounded-md p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {erroCad}
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Veículos */}
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> Veículos</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              value={novaPlaca}
              onChange={e => setNovaPlaca(e.target.value)}
              placeholder="Placa (ABC-1234)"
              className="flex-1 min-w-[120px] px-3 py-2 text-sm border rounded-md font-mono uppercase focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={novoModelo}
              onChange={e => setNovoModelo(e.target.value)}
              placeholder="Modelo (opcional)"
              className="flex-1 min-w-[120px] px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addVeiculo}
              disabled={!novaPlaca.trim() || salvandoCad}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
            {veiculos.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum veículo cadastrado.</p>
            ) : veiculos.map(v => (
              <div key={v.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${v.ativo ? '' : 'opacity-50'}`}>
                <span className="font-mono font-medium">{v.placa}</span>
                {v.modelo && <span className="text-muted-foreground text-xs">{v.modelo}</span>}
                <button onClick={() => toggleVeiculo(v)} title={v.ativo ? 'Desativar' : 'Ativar'} className="ml-auto text-xs flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent">
                  <Power className={`h-3.5 w-3.5 ${v.ativo ? 'text-green-600' : 'text-gray-400'}`} /> {v.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Condutores */}
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Condutores</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              value={novoCondutor}
              onChange={e => setNovoCondutor(e.target.value)}
              placeholder="Nome do condutor"
              className="flex-1 min-w-[120px] px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={novoTelefone}
              onChange={e => setNovoTelefone(e.target.value)}
              placeholder="Telefone (opcional)"
              className="flex-1 min-w-[120px] px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addCondutor}
              disabled={!novoCondutor.trim() || salvandoCad}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
            {condutores.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum condutor cadastrado.</p>
            ) : condutores.map(c => (
              <div key={c.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${c.ativo ? '' : 'opacity-50'}`}>
                <span className="font-medium">{c.nome}</span>
                {c.telefone && <span className="text-muted-foreground text-xs">{c.telefone}</span>}
                <button onClick={() => toggleCondutor(c)} title={c.ativo ? 'Desativar' : 'Ativar'} className="ml-auto text-xs flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent">
                  <Power className={`h-3.5 w-3.5 ${c.ativo ? 'text-green-600' : 'text-gray-400'}`} /> {c.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por placa, condutor ou destino…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={somenteAbertas} onChange={e => setSomenteAbertas(e.target.checked)} />
          Somente em aberto
        </label>
        <button
          onClick={fetchViagens}
          className="flex items-center gap-1.5 text-sm px-2.5 py-2 rounded border hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma viagem registrada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Placa</th>
                <th className="px-3 py-2 font-medium">Condutor</th>
                <th className="px-3 py-2 font-medium">Saída</th>
                <th className="px-3 py-2 font-medium">Destino</th>
                <th className="px-3 py-2 font-medium">Previsão</th>
                <th className="px-3 py-2 font-medium">Retorno</th>
                <th className="px-3 py-2 font-medium text-right">KM rodados</th>
                <th className="px-3 py-2 font-medium">Tempo</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(v => {
                const atrasada = v.status === 'em_rota' && v.previsao_retorno && new Date(v.previsao_retorno).getTime() < Date.now()
                const rodados = v.km_retorno != null && v.km_saida != null ? v.km_retorno - v.km_saida : null
                const fim = v.status === 'em_rota' ? null : v.finalizado_em
                return (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{v.placa ?? '—'}</td>
                    <td className="px-3 py-2">{v.condutor_nome ?? v.motorista_nome ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {km(v.km_saida)}{v.hora_saida ? ` · ${v.hora_saida}` : ''}
                    </td>
                    <td className="px-3 py-2 max-w-[160px] truncate" title={v.destino ?? ''}>{v.destino ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {v.status === 'em_rota' ? (
                        <span className={`inline-flex items-center gap-1 ${atrasada ? 'text-red-600 font-medium' : ''}`}>
                          {atrasada && <Clock className="h-3.5 w-3.5" />}{horaBR(v.previsao_retorno)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {v.km_retorno != null ? `${km(v.km_retorno)}${v.hora_retorno ? ` · ${v.hora_retorno}` : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{rodados != null ? `${km(rodados)} km` : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{duracao(v.saida_registrada_em, fim)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${STATUS_COR[v.status] ?? 'bg-amber-100 text-amber-700'}`}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatarDataBR(v.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
