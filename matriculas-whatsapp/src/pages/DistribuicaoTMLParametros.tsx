import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, RefreshCw, Save, SlidersHorizontal, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatarDataBR } from '../lib/utils'
import {
  DESLOCAMENTO_IDEAL_MIN, DESLOCAMENTO_ESTOURO_MIN, CHECKLIST_IDEAL_MIN, CONFERENCIA_IDEAL_MIN, META_TML_TOTAL_MIN,
  gatilhoEstouroMinutos, etapaIdealMinutos, SALA_TML_LABEL, type SalaTML,
  type MetaMatinalParam, type GatilhoEstouroParam, type EtapaIdealParam, type SalaHistoricoParam,
} from '../lib/tml'

interface MotoristaSalaCadastro { matricula: number; nome: string; sala: string | null }

const DIAS_SEMANA = [
  { dow: 0, label: 'Domingo' },
  { dow: 1, label: 'Segunda' },
  { dow: 2, label: 'Terça' },
  { dow: 3, label: 'Quarta' },
  { dow: 4, label: 'Quinta' },
  { dow: 5, label: 'Sexta' },
  { dow: 6, label: 'Sábado' },
]

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Meta padrão de fallback (mesma regra fixa de lib/tml.ts), usada só pra
// pré-preencher o formulário quando ainda não existe nenhum parâmetro salvo.
function metaPadraoFallback(dow: number): number {
  return dow === 1 || dow === 2 ? 11 : 7
}

export default function DistribuicaoTMLParametros() {
  const { usuario } = useAuth()
  const [metaParams, setMetaParams] = useState<MetaMatinalParam[]>([])
  const [gatilhoParams, setGatilhoParams] = useState<GatilhoEstouroParam[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoMeta, setSalvandoMeta] = useState(false)
  const [salvandoGatilho, setSalvandoGatilho] = useState(false)
  const [historicoMetaAberto, setHistoricoMetaAberto] = useState(true)
  const [historicoGatilhoAberto, setHistoricoGatilhoAberto] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [vigenciaMeta, setVigenciaMeta] = useState(hojeISO())
  const [metasPorDia, setMetasPorDia] = useState<Record<number, number>>({})

  const [vigenciaGatilho, setVigenciaGatilho] = useState(hojeISO())
  const [idealMin, setIdealMin] = useState(DESLOCAMENTO_IDEAL_MIN)
  const [estouroMin, setEstouroMin] = useState(DESLOCAMENTO_ESTOURO_MIN)

  const [etapaParams, setEtapaParams] = useState<EtapaIdealParam[]>([])
  const [salvandoEtapa, setSalvandoEtapa] = useState(false)
  const [historicoEtapaAberto, setHistoricoEtapaAberto] = useState(true)
  const [vigenciaEtapa, setVigenciaEtapa] = useState(hojeISO())
  const [checklistIdealMin, setChecklistIdealMin] = useState(CHECKLIST_IDEAL_MIN)
  const [conferenciaIdealMin, setConferenciaIdealMin] = useState(CONFERENCIA_IDEAL_MIN)

  const [motoristas, setMotoristas] = useState<MotoristaSalaCadastro[]>([])
  const [salaHistorico, setSalaHistorico] = useState<SalaHistoricoParam[]>([])
  const [salvandoSala, setSalvandoSala] = useState(false)
  const [historicoSalaAberto, setHistoricoSalaAberto] = useState(true)
  const [matriculaSala, setMatriculaSala] = useState('')
  const [salaNova, setSalaNova] = useState<SalaTML>('COLORADO')
  const [vigenciaSala, setVigenciaSala] = useState(hojeISO())

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data: meta }, { data: gat }, { data: etp }, { data: motoristasRaw }, { data: salaHistoricoRaw }] = await Promise.all([
      supabase
        .from('tml_meta_matinal')
        .select('dia_semana, meta_minutos, vigente_a_partir')
        .eq('filial', usuario.filial)
        .order('vigente_a_partir', { ascending: false }),
      supabase
        .from('tml_gatilho_estouro')
        .select('deslocamento_ideal_minutos, deslocamento_estouro_minutos, vigente_a_partir')
        .eq('filial', usuario.filial)
        .order('vigente_a_partir', { ascending: false }),
      supabase
        .from('tml_etapa_ideal')
        .select('etapa, ideal_minutos, vigente_a_partir')
        .eq('filial', usuario.filial)
        .order('vigente_a_partir', { ascending: false }),
      supabase
        .from('motoristas_sala_tml')
        .select('matricula, nome, sala')
        .eq('filial', usuario.filial)
        .order('nome'),
      supabase
        .from('motoristas_sala_historico')
        .select('matricula, sala, vigente_a_partir')
        .eq('filial', usuario.filial)
        .order('vigente_a_partir', { ascending: false }),
    ])
    const metaRows = meta ?? []
    const gatRows = gat ?? []
    const etpRows = etp ?? []
    setMetaParams(metaRows)
    setGatilhoParams(gatRows)
    setEtapaParams(etpRows)
    setMotoristas((motoristasRaw ?? []) as MotoristaSalaCadastro[])
    setSalaHistorico((salaHistoricoRaw ?? []) as SalaHistoricoParam[])

    const hoje = hojeISO()
    const metasIniciais: Record<number, number> = {}
    for (const d of DIAS_SEMANA) {
      const candidatos = metaRows.filter((m) => m.dia_semana === d.dow && m.vigente_a_partir <= hoje)
      candidatos.sort((a, b) => b.vigente_a_partir.localeCompare(a.vigente_a_partir))
      metasIniciais[d.dow] = candidatos[0]?.meta_minutos ?? metaPadraoFallback(d.dow)
    }
    setMetasPorDia(metasIniciais)

    const gatilhoAtual = gatilhoEstouroMinutos(hoje, gatRows)
    setIdealMin(gatilhoAtual.ideal)
    setEstouroMin(gatilhoAtual.estouro)

    setChecklistIdealMin(etapaIdealMinutos('checklist', hoje, etpRows))
    setConferenciaIdealMin(etapaIdealMinutos('conferencia', hoje, etpRows))

    setLoading(false)
  }, [usuario])

  useEffect(() => { carregar() }, [carregar])

  async function salvarMetas() {
    if (!usuario) return
    setSalvandoMeta(true)
    setErro('')
    setAviso('')
    try {
      const linhas = DIAS_SEMANA.map((d) => ({
        filial: usuario.filial,
        dia_semana: d.dow,
        meta_minutos: metasPorDia[d.dow] ?? metaPadraoFallback(d.dow),
        vigente_a_partir: vigenciaMeta,
      }))
      const { error } = await supabase
        .from('tml_meta_matinal')
        .upsert(linhas, { onConflict: 'filial,dia_semana,vigente_a_partir' })
      if (error) throw new Error(error.message)
      setAviso(`Meta da matinal atualizada — vale a partir de ${formatarDataBR(vigenciaMeta)}. Dados já registrados antes dessa data não são afetados.`)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar meta da matinal')
    } finally {
      setSalvandoMeta(false)
    }
  }

  async function salvarGatilho() {
    if (!usuario) return
    setSalvandoGatilho(true)
    setErro('')
    setAviso('')
    try {
      const { error } = await supabase
        .from('tml_gatilho_estouro')
        .upsert(
          {
            filial: usuario.filial,
            deslocamento_ideal_minutos: idealMin,
            deslocamento_estouro_minutos: estouroMin,
            vigente_a_partir: vigenciaGatilho,
          },
          { onConflict: 'filial,vigente_a_partir' }
        )
      if (error) throw new Error(error.message)
      setAviso(`Gatilho de estouro atualizado — vale a partir de ${formatarDataBR(vigenciaGatilho)}. Dados já registrados antes dessa data não são afetados.`)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar gatilho de estouro')
    } finally {
      setSalvandoGatilho(false)
    }
  }

  async function salvarEtapa() {
    if (!usuario) return
    setSalvandoEtapa(true)
    setErro('')
    setAviso('')
    try {
      const linhas = [
        { filial: usuario.filial, etapa: 'checklist', ideal_minutos: checklistIdealMin, vigente_a_partir: vigenciaEtapa },
        { filial: usuario.filial, etapa: 'conferencia', ideal_minutos: conferenciaIdealMin, vigente_a_partir: vigenciaEtapa },
      ]
      const { error } = await supabase
        .from('tml_etapa_ideal')
        .upsert(linhas, { onConflict: 'filial,etapa,vigente_a_partir' })
      if (error) throw new Error(error.message)
      setAviso(`Tempo ideal de checklist/conferência atualizado — vale a partir de ${formatarDataBR(vigenciaEtapa)}. Dados já registrados antes dessa data não são afetados.`)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar tempo ideal de checklist/conferência')
    } finally {
      setSalvandoEtapa(false)
    }
  }

  async function salvarSala() {
    if (!usuario || !matriculaSala) return
    setSalvandoSala(true)
    setErro('')
    setAviso('')
    try {
      const { error } = await supabase
        .from('motoristas_sala_historico')
        .upsert(
          { filial: usuario.filial, matricula: Number(matriculaSala), sala: salaNova, vigente_a_partir: vigenciaSala },
          { onConflict: 'filial,matricula,vigente_a_partir' }
        )
      if (error) throw new Error(error.message)
      const nomeMotorista = motoristas.find((m) => m.matricula === Number(matriculaSala))?.nome ?? matriculaSala
      setAviso(`${nomeMotorista} passa a valer ${SALA_TML_LABEL[salaNova]} a partir de ${formatarDataBR(vigenciaSala)}. Checklist já registrado antes dessa data não é afetado.`)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar troca de sala')
    } finally {
      setSalvandoSala(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/distribuicao/tml" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-1 flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" /> Parâmetros — TML
          </h1>
          <p className="text-sm text-muted-foreground">
            Ajuste a meta de duração da matinal por dia da semana e o gatilho de estouro do deslocamento.
            Toda alteração vale a partir da data escolhida — dados já registrados antes dela continuam
            sendo avaliados com a regra que estava em vigor na época.
          </p>
        </div>
        <button onClick={carregar} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}
      {aviso && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2">{aviso}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
        </div>
      ) : (
        <>
          <div className="border rounded-lg bg-white">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Meta de duração da matinal por dia da semana</h2>
              <p className="text-xs text-muted-foreground">Quanto tempo a matinal deve durar (em minutos) em cada dia.</p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DIAS_SEMANA.map((d) => (
                  <div key={d.dow}>
                    <label className="block text-xs text-muted-foreground mb-1">{d.label}</label>
                    <input
                      type="number"
                      min={0}
                      value={metasPorDia[d.dow] ?? ''}
                      onChange={(e) => setMetasPorDia((prev) => ({ ...prev, [d.dow]: Number(e.target.value) }))}
                      className="w-full border rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Vigente a partir de</label>
                  <input type="date" value={vigenciaMeta} onChange={(e) => setVigenciaMeta(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <button
                  onClick={salvarMetas}
                  disabled={salvandoMeta}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
                >
                  {salvandoMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar meta da matinal
                </button>
              </div>
            </div>
            {metaParams.length > 0 && (
              <div className="border-t">
                <button onClick={() => setHistoricoMetaAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  {historicoMetaAberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  Histórico de metas ({metaParams.length})
                </button>
                {historicoMetaAberto && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vigente a partir de</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Dia da semana</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Meta (min)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {metaParams.map((m, i) => (
                          <tr key={`${m.dia_semana}-${m.vigente_a_partir}-${i}`}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatarDataBR(m.vigente_a_partir)}</td>
                            <td className="px-4 py-2">{DIAS_SEMANA.find((d) => d.dow === m.dia_semana)?.label ?? m.dia_semana}</td>
                            <td className="px-4 py-2 text-right">{m.meta_minutos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg bg-white">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Sala por motorista — histórico de trocas</h2>
              <p className="text-xs text-muted-foreground">
                Cadastro de motoristas só guarda a sala atual de cada um. Quando alguém troca de sala, registre aqui —
                o checklist já importado antes da troca continua calculado com a sala que valia na época dele; quem
                nunca trocou não precisa de nada aqui, usa a sala do cadastro normalmente.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Motorista</label>
                  <select value={matriculaSala} onChange={(e) => setMatriculaSala(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm">
                    <option value="">Selecione...</option>
                    {motoristas.map((m) => (
                      <option key={m.matricula} value={m.matricula}>{m.nome} ({m.matricula})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Nova sala</label>
                  <select value={salaNova} onChange={(e) => setSalaNova(e.target.value as SalaTML)} className="w-full border rounded-md px-2 py-1.5 text-sm">
                    <option value="COLORADO">{SALA_TML_LABEL.COLORADO}</option>
                    <option value="SUB-FURIA">{SALA_TML_LABEL['SUB-FURIA']}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Vigente a partir de</label>
                  <input type="date" value={vigenciaSala} onChange={(e) => setVigenciaSala(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
              <button
                onClick={salvarSala}
                disabled={salvandoSala || !matriculaSala}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
              >
                {salvandoSala ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Registrar troca de sala
              </button>
            </div>
            {salaHistorico.length > 0 && (
              <div className="border-t">
                <button onClick={() => setHistoricoSalaAberto((v) => !v)} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  {historicoSalaAberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  Trocas registradas ({salaHistorico.length})
                </button>
                {historicoSalaAberto && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vigente a partir de</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Motorista</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sala</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {salaHistorico.map((h, i) => (
                          <tr key={`${h.matricula}-${h.vigente_a_partir}-${i}`}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatarDataBR(h.vigente_a_partir)}</td>
                            <td className="px-4 py-2">{motoristas.find((m) => m.matricula === h.matricula)?.nome ?? h.matricula}</td>
                            <td className="px-4 py-2">{SALA_TML_LABEL[h.sala]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg bg-white">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Gatilho de estouro do deslocamento</h2>
              <p className="text-xs text-muted-foreground">
                Tempo de deslocamento (início do checklist menos fim da matinal) considerado ideal e a partir de quantos
                minutos é um estouro de gatilho.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Ideal (min)</label>
                  <input type="number" min={0} value={idealMin} onChange={(e) => setIdealMin(Number(e.target.value))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Estouro de gatilho (min)</label>
                  <input type="number" min={0} value={estouroMin} onChange={(e) => setEstouroMin(Number(e.target.value))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Vigente a partir de</label>
                  <input type="date" value={vigenciaGatilho} onChange={(e) => setVigenciaGatilho(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
              <button
                onClick={salvarGatilho}
                disabled={salvandoGatilho}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
              >
                {salvandoGatilho ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar gatilho de estouro
              </button>
            </div>
            {gatilhoParams.length > 0 && (
              <div className="border-t">
                <button onClick={() => setHistoricoGatilhoAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  {historicoGatilhoAberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  Histórico de gatilhos ({gatilhoParams.length})
                </button>
                {historicoGatilhoAberto && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vigente a partir de</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ideal (min)</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Estouro (min)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {gatilhoParams.map((g, i) => (
                          <tr key={`${g.vigente_a_partir}-${i}`}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatarDataBR(g.vigente_a_partir)}</td>
                            <td className="px-4 py-2 text-right">{g.deslocamento_ideal_minutos}</td>
                            <td className="px-4 py-2 text-right">{g.deslocamento_estouro_minutos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg bg-white">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Tempo ideal de checklist e de conferência</h2>
              <p className="text-xs text-muted-foreground">
                Usado na Análise do TML (passo a passo por mapa) pra marcar se o checklist e a
                conferência de cada placa estouraram o tempo ou não.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Checklist ideal (min)</label>
                  <input type="number" min={0} value={checklistIdealMin} onChange={(e) => setChecklistIdealMin(Number(e.target.value))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Conferência ideal (min)</label>
                  <input type="number" min={0} value={conferenciaIdealMin} onChange={(e) => setConferenciaIdealMin(Number(e.target.value))} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Vigente a partir de</label>
                  <input type="date" value={vigenciaEtapa} onChange={(e) => setVigenciaEtapa(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
              <button
                onClick={salvarEtapa}
                disabled={salvandoEtapa}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
              >
                {salvandoEtapa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar tempo ideal
              </button>
            </div>
            {etapaParams.length > 0 && (
              <div className="border-t">
                <button onClick={() => setHistoricoEtapaAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  {historicoEtapaAberto ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  Histórico ({etapaParams.length})
                </button>
                {historicoEtapaAberto && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vigente a partir de</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Etapa</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ideal (min)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {etapaParams.map((e, i) => (
                          <tr key={`${e.etapa}-${e.vigente_a_partir}-${i}`}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatarDataBR(e.vigente_a_partir)}</td>
                            <td className="px-4 py-2 capitalize">{e.etapa}</td>
                            <td className="px-4 py-2 text-right">{e.ideal_minutos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg bg-white">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-sm">Tempo de Movimentação — calculado automaticamente</h2>
              <p className="text-xs text-muted-foreground">
                {META_TML_TOTAL_MIN}min − Matinal do dia − Deslocamento − Checklist − Conferência. Não é editável aqui:
                muda sozinho quando você altera a Matinal por dia ou os fixos acima (ainda não salvos contam no cálculo).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Dia</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Matinal</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Fixos</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Movimentação</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Soma = meta TML</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DIAS_SEMANA.map((d) => {
                    const matinal = metasPorDia[d.dow] ?? metaPadraoFallback(d.dow)
                    const semMatinal = matinal === 0
                    const fixos = idealMin + checklistIdealMin + conferenciaIdealMin
                    const movimentacao = META_TML_TOTAL_MIN - matinal - fixos
                    return (
                      <tr key={d.dow} className={semMatinal ? 'text-muted-foreground' : ''}>
                        <td className="px-4 py-2">{d.label}</td>
                        {semMatinal ? (
                          <td colSpan={4} className="px-4 py-2 text-right">sem matinal</td>
                        ) : (
                          <>
                            <td className="px-4 py-2 text-right">{matinal}min</td>
                            <td className="px-4 py-2 text-right">{fixos}min</td>
                            <td className={`px-4 py-2 text-right font-semibold ${movimentacao < 0 ? 'text-red-600' : 'text-green-700'}`}>
                              {movimentacao}min
                            </td>
                            <td className="px-4 py-2 text-right">{matinal + fixos + movimentacao}min</td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {DIAS_SEMANA.some((d) => {
              const matinal = metasPorDia[d.dow] ?? metaPadraoFallback(d.dow)
              return matinal > 0 && META_TML_TOTAL_MIN - matinal - (idealMin + checklistIdealMin + conferenciaIdealMin) < 0
            }) && (
              <div className="mx-4 mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Em algum dia a Matinal + os fixos já passam de {META_TML_TOTAL_MIN}min — a meta de Movimentação
                  daria negativa. Ajuste a Matinal daquele dia ou os tempos fixos acima.
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
