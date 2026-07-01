import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Link } from 'react-router-dom'
import html2canvas from 'html2canvas'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Building2, Truck, CheckCircle2, XCircle, Upload, Loader2, FileSpreadsheet, MapPinned, Image, Settings, ChevronLeft, ChevronRight, LayoutGrid, UserCheck, Trophy, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import { enviarImagemGrupo } from '../lib/zapi'
import {
  parseDisponibilidadeDiariaCsv, parseHistoricoXlsx, resumoPorDia, disponiveisNoDia,
  rankingIndisponibilidadePorPlaca, cruzarTerritorio, detectarTrocasTerritorio, placasAtivasFiltro, resumoPorPerfil, statusPlacasNoDia, matrizDisponibilidade,
  cruzarMotorista, rankingMotoristasPerdaFixacao, calcularAderenciaMotoristaPorDia, calcularAderenciaMotoristaMeses, calcularAderenciaMotoristaPorDiaESala,
  processarFixacaoMotorista, parseBaseMapaTerritorio,
  type FrotaDisponibilidadeInsert, type HistoricoTmlRegiao, type ResumoDiaFrota, type ResumoPerfilFrota, type StatusPlacaFrota,
  type CruzamentoTerritorioItem, type TrocaTerritorioItem, type HistoricoTmlMotorista, type CruzamentoMotoristaItem,
} from '../lib/frota'
import { parseEscalaBuffer } from '../lib/tmlParser'
import { isSalaTML } from '../lib/tml'
import type { FrotaDisponibilidade, FrotaPlaca, AlertaFixacaoMotorista } from '../types'

const STATUS_FIXACAO_LABEL: Record<AlertaFixacaoMotorista['status'], string> = {
  pendente: 'Pendente de envio',
  enviado: 'Aguardando resposta',
  respondido: 'Respondido — aguardando classificação',
  justificado: 'Justificado',
  erro: 'Falha no envio',
}

const STATUS_FIXACAO_COR: Record<AlertaFixacaoMotorista['status'], string> = {
  pendente: 'bg-gray-100 text-gray-600 border-gray-200',
  enviado: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  respondido: 'bg-blue-50 text-blue-700 border-blue-200',
  justificado: 'bg-green-50 text-green-700 border-green-200',
  erro: 'bg-red-50 text-red-700 border-red-200',
}

const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof Truck; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="border rounded-xl bg-white p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

async function upsertEmLotes(rows: FrotaDisponibilidadeInsert[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 50) {
    const lote = rows.slice(i, i + 50)
    const { error } = await supabase.from('frota_disponibilidade')
      .upsert(lote, { onConflict: 'filial,data,placa' })
    if (error) {
      if (!error.message.includes('cannot affect row a second time')) return error.message
      for (const linha of lote) {
        const { error: errLinha } = await supabase.from('frota_disponibilidade').upsert([linha], { onConflict: 'filial,data,placa' })
        if (errLinha) return errLinha.message
      }
    }
  }
  return null
}

// Cadastra placas novas em frota_placas (ativo=true, perfil em branco) sem
// sobrescrever o que já existe — quem edita ativo/perfil é a tela de Placas.
async function semearPlacas(filial: string, rows: { placa: string }[]) {
  const placasUnicas = Array.from(new Set(rows.map(r => r.placa)))
  const inserts = placasUnicas.map(placa => ({ filial, placa }))
  for (let i = 0; i < inserts.length; i += 50) {
    await supabase.from('frota_placas').upsert(inserts.slice(i, i + 50), { onConflict: 'filial,placa', ignoreDuplicates: true })
  }
}

export default function Frota() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'disponibilidade' | 'territorio' | 'motorista' | 'matriz'>('disponibilidade')
  const [registros, setRegistros] = useState<FrotaDisponibilidade[]>([])
  const [historicoTml, setHistoricoTml] = useState<HistoricoTmlRegiao[]>([])
  const [historicoTmlMotorista, setHistoricoTmlMotorista] = useState<HistoricoTmlMotorista[]>([])
  const [alertasFixacao, setAlertasFixacao] = useState<AlertaFixacaoMotorista[]>([])
  const [placas, setPlacas] = useState<FrotaPlaca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [uploadando, setUploadando] = useState(false)
  const [importResult, setImportResult] = useState<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null)
  const [diaTerritorio, setDiaTerritorio] = useState<string>('todos')
  const [statusTerritorio, setStatusTerritorio] = useState<'todos' | 'ok' | 'nok'>('todos')
  const [mesMotorista, setMesMotorista] = useState<string>('todos')
  const [diaMotorista, setDiaMotorista] = useState<string>('todos')
  const [statusMotorista, setStatusMotorista] = useState<'todos' | 'ok' | 'nok'>('todos')
  const [exportandoImg, setExportandoImg] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const exportPlacasRef = useRef<HTMLDivElement>(null)
  const [exportandoTrocas, setExportandoTrocas] = useState(false)
  const [exportandoCruzamento, setExportandoCruzamento] = useState(false)
  const exportTrocasRef = useRef<HTMLDivElement>(null)
  const exportCruzamentoRef = useRef<HTMLDivElement>(null)
  const [exportandoMotorista, setExportandoMotorista] = useState(false)
  const [exportandoResumoMotorista, setExportandoResumoMotorista] = useState(false)
  const [forcandoEnvioJustificativa, setForcandoEnvioJustificativa] = useState(false)
  const exportMotoristaRef = useRef<HTMLDivElement>(null)
  const hoje = new Date()
  const [mesSel, setMesSel] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })

  const carregarDados = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    const [{ data }, { data: dataTml }, { data: dataTerritorioHist }, { data: dataPlacas }, { data: dataMotoristaBase }, { data: dataRosterSala }, { data: dataAlertasFixacao }] = await Promise.all([
      supabase.from('frota_disponibilidade')
        .select('*')
        .eq('filial', usuario.filial)
        .order('data', { ascending: true }),
      supabase.from('historico_tml')
        .select('placa, data_saida, regiao_entregas, cidades_entregas')
        .eq('filial', usuario.filial)
        .or('regiao_entregas.not.is.null,cidades_entregas.not.is.null'),
      supabase.from('frota_territorio_historico')
        .select('placa, data, regiao_entregas')
        .eq('filial', usuario.filial)
        .not('regiao_entregas', 'is', null),
      supabase.from('frota_placas').select('*').eq('filial', usuario.filial),
      // Fonte da Fixação de Motorista: Base do Mapa (data correta do nome do
      // arquivo). A sala vem de motoristas_sala_tml casada por matrícula.
      supabase.from('frota_motorista_base')
        .select('placa, data, matricula, nome')
        .eq('filial', usuario.filial)
        .not('matricula', 'is', null),
      supabase.from('motoristas_sala_tml')
        .select('matricula, sala')
        .eq('filial', usuario.filial),
      supabase.from('alertas_fixacao_motorista').select('*').eq('filial', usuario.filial).order('created_at', { ascending: false }),
    ])
    setRegistros((data ?? []) as FrotaDisponibilidade[])
    setHistoricoTml([
      ...((dataTml ?? []) as HistoricoTmlRegiao[]),
      ...((dataTerritorioHist ?? []) as { placa: string | null; data: string | null; regiao_entregas: string | null }[])
        .map(r => ({ placa: r.placa, data_saida: r.data, regiao_entregas: r.regiao_entregas, cidades_entregas: null })),
    ])
    const salaPorMatricula = new Map(
      ((dataRosterSala ?? []) as { matricula: number; sala: string | null }[])
        .map(r => [r.matricula, isSalaTML(r.sala) ? r.sala : null]),
    )
    setHistoricoTmlMotorista(
      ((dataMotoristaBase ?? []) as { placa: string | null; data: string | null; matricula: number | null; nome: string | null }[])
        .map(r => ({
          placa: r.placa,
          data_saida: r.data,
          matricula: r.matricula,
          nome: r.nome,
          sala: r.matricula != null ? salaPorMatricula.get(r.matricula) ?? null : null,
        })) as HistoricoTmlMotorista[],
    )
    setAlertasFixacao((dataAlertasFixacao ?? []) as AlertaFixacaoMotorista[])
    setPlacas((dataPlacas ?? []) as FrotaPlaca[])
    setCarregando(false)
  }, [usuario])

  useEffect(() => { carregarDados() }, [carregarDados])

  const onDropCsv = useCallback((files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const texto = (e.target?.result as string) ?? ''
        const rows = parseDisponibilidadeDiariaCsv(texto, usuario.filial)
        if (rows.length === 0) {
          setImportResult({ tipo: 'erro', mensagem: 'Nenhuma linha encontrada. Verifique se o arquivo é o relatório de Frota Disponibilizada (.csv).' })
          setUploadando(false)
          return
        }
        const erro = await upsertEmLotes(rows)
        if (erro) {
          setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar: ${erro}` })
        } else {
          await semearPlacas(usuario.filial, rows)
          setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rows.length} placas importadas (${formatarDataBR(rows[0].data)}).` })
          await carregarDados()
        }
      } catch (err) {
        setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(err)}` })
      } finally {
        setUploadando(false)
      }
    }
    reader.readAsText(files[0], 'ISO-8859-1')
  }, [usuario, carregarDados])

  const onDropHistorico = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    try {
      const buffer = await files[0].arrayBuffer()
      const rows = parseHistoricoXlsx(buffer, usuario.filial)
      if (rows.length === 0) {
        setImportResult({ tipo: 'erro', mensagem: 'Nenhuma linha encontrada para esta filial no Histórico.' })
        setUploadando(false)
        return
      }
      const rowsDedup = Array.from(new Map(rows.map(r => [`${r.filial}|${r.data}|${r.placa}`, r])).values())
      const erro = await upsertEmLotes(rowsDedup)
      if (erro) {
        setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar histórico: ${erro}` })
      } else {
        await semearPlacas(usuario.filial, rowsDedup)
        const duplicados = rows.length - rowsDedup.length
        setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rowsDedup.length} registros do histórico importados.${duplicados > 0 ? ` ${duplicados} linha(s) duplicada(s) foram ignoradas.` : ''}` })
        await carregarDados()
      }
    } catch (e) {
      setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(e)}` })
    } finally {
      setUploadando(false)
    }
  }, [usuario, carregarDados])

  // Carga única do histórico de roteirização (PCD/RoadShow) anterior à
  // captura automática via Escala do dia — mesmo formato de planilha,
  // por isso reaproveita o parser da Escala (parseEscalaBuffer).
  const onDropTerritorioHistorico = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    try {
      const buffer = await files[0].arrayBuffer()
      const escalas = parseEscalaBuffer(buffer)
      const rows = escalas
        .filter(e => e.placa && e.dataEntrega && e.regiaoEntregas)
        .map(e => ({ filial: usuario.filial, mapa: e.mapa, placa: e.placa, data: e.dataEntrega, regiao_entregas: e.regiaoEntregas }))
      if (rows.length === 0) {
        setImportResult({ tipo: 'erro', mensagem: 'Nenhuma linha com região de entregas encontrada nesta planilha.' })
        setUploadando(false)
        return
      }
      const rowsDedup = Array.from(new Map(rows.map(r => [`${r.filial}|${r.mapa}`, r])).values())
      let erro: string | null = null
      for (let i = 0; i < rowsDedup.length; i += 50) {
        const lote = rowsDedup.slice(i, i + 50)
        const { error } = await supabase.from('frota_territorio_historico').upsert(lote, { onConflict: 'filial,mapa' })
        if (error) { erro = error.message; break }
      }
      if (erro) {
        setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar histórico de território: ${erro}` })
      } else {
        setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rowsDedup.length} registros de território histórico importados.` })
        await carregarDados()
      }
    } catch (e) {
      setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(e)}` })
    } finally {
      setUploadando(false)
    }
  }, [usuario, carregarDados])

  // Território executado vindo da aba "Base" da planilha diária (catálogo/
  // vendas). A data vem do nome do arquivo (DDMMAAAA). Grava em
  // frota_territorio_historico, que já é lido pelo cruzamento de território —
  // por isso não precisa da escala/saída do TML para a Fixação de Território.
  const onDropBaseTerritorio = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    try {
      const file = files[0]
      const m = file.name.match(/(\d{2})(\d{2})(\d{4})/)
      if (!m) {
        setImportResult({ tipo: 'erro', mensagem: 'Não identifiquei a data no nome do arquivo (esperado DDMMAAAA, ex.: 01072026).' })
        setUploadando(false)
        return
      }
      const dataIso = `${m[3]}-${m[2]}-${m[1]}`
      const buffer = await file.arrayBuffer()
      const linhas = parseBaseMapaTerritorio(buffer)
      if (linhas.length === 0) {
        setImportResult({ tipo: 'erro', mensagem: 'Nenhuma placa/mapa encontrada na aba "Base" da planilha.' })
        setUploadando(false)
        return
      }
      const rows = Array.from(new Map(linhas.map(l => [l.mapa, l])).values())
        .map(l => ({ filial: usuario.filial, mapa: l.mapa, placa: l.placa, data: dataIso, regiao_entregas: l.regiao_entregas }))
      let erro: string | null = null
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from('frota_territorio_historico').upsert(rows.slice(i, i + 50), { onConflict: 'filial,mapa' })
        if (error) { erro = error.message; break }
      }
      if (erro) {
        setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar território: ${erro}` })
      } else {
        await semearPlacas(usuario.filial, rows)
        setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rows.length} placas de território executado importadas (${formatarDataBR(dataIso)}).` })
        await carregarDados()
      }
    } catch (e) {
      setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(e)}` })
    } finally {
      setUploadando(false)
    }
  }, [usuario, carregarDados])

  const { getRootProps: getRootCsv, getInputProps: getInputCsv, isDragActive: isDragCsv } = useDropzone({
    onDrop: onDropCsv,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  })

  const { getRootProps: getRootHistorico, getInputProps: getInputHistorico, isDragActive: isDragHistorico } = useDropzone({
    onDrop: onDropHistorico,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  const { getRootProps: getRootTerritorioHist, getInputProps: getInputTerritorioHist, isDragActive: isDragTerritorioHist } = useDropzone({
    onDrop: onDropTerritorioHistorico,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  const { getRootProps: getRootBaseTerr, getInputProps: getInputBaseTerr, isDragActive: isDragBaseTerr } = useDropzone({
    onDrop: onDropBaseTerritorio,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  async function enviarResumoGrupo() {
    if (!usuario || !exportRef.current || !ultimo) return
    setExportandoImg(true)
    try {
      const { data: filialRow } = await supabase.from('filiais').select('grupo_frota_whatsapp').eq('nome', usuario.filial).maybeSingle()
      const grupoId = filialRow?.grupo_frota_whatsapp
      if (!grupoId) {
        alert('Grupo de WhatsApp da Disponibilidade não configurado. Configure em /frota/placas.')
        return
      }
      const legenda = `🚛 Resumo de Disponibilidade da Frota — ${formatarDataBR(ultimo.data)}`
      const canvas = await html2canvas(exportRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
      const img = canvas.toDataURL('image/png')
      const { sucesso, erro } = await enviarImagemGrupo(grupoId, img, legenda)
      await supabase.from('disparos').insert({
        filial: usuario.filial, whatsapp: grupoId, mensagem: legenda,
        status: sucesso ? 'enviado' : 'erro', erro: erro ?? null,
      })

      let sucessoPlacas = true
      let erroPlacas: string | undefined
      if (exportPlacasRef.current && statusPlacas.length > 0) {
        const legendaPlacas = `📋 Placas da Frota — ${formatarDataBR(ultimo.data)}`
        const canvasPlacas = await html2canvas(exportPlacasRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
        const imgPlacas = canvasPlacas.toDataURL('image/png')
        const resultado = await enviarImagemGrupo(grupoId, imgPlacas, legendaPlacas)
        sucessoPlacas = resultado.sucesso
        erroPlacas = resultado.erro
        await supabase.from('disparos').insert({
          filial: usuario.filial, whatsapp: grupoId, mensagem: legendaPlacas,
          status: sucessoPlacas ? 'enviado' : 'erro', erro: erroPlacas ?? null,
        })
      }

      if (sucesso && sucessoPlacas) {
        alert('Resumo enviado para o grupo.')
      } else {
        alert(`Falha ao enviar o resumo.${!sucesso ? ` Resumo: ${erro}` : ''}${!sucessoPlacas ? ` Placas: ${erroPlacas}` : ''}`)
      }
    } finally {
      setExportandoImg(false)
    }
  }

  async function enviarResumoGrupoMotorista() {
    if (!usuario || !exportMotoristaRef.current) return
    setExportandoResumoMotorista(true)
    try {
      const { data: filialRow } = await supabase.from('filiais').select('grupo_fixacao_motorista_whatsapp').eq('nome', usuario.filial).maybeSingle()
      const grupoId = filialRow?.grupo_fixacao_motorista_whatsapp
      if (!grupoId) {
        alert('Grupo de WhatsApp da Fixação de Motorista não configurado. Configure em /frota/placas.')
        return
      }
      const refData = diaMotorista === 'todos' ? cruzamentoMotorista[0]?.data : diaMotorista
      const legenda = `🚗 Resumo de Fixação de Motorista — ${refData ? formatarDataBR(refData) : ''}${aderenciaMotorista !== null ? ` — Aderência: ${aderenciaMotorista}%` : ''}`
      const canvas = await html2canvas(exportMotoristaRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
      const img = canvas.toDataURL('image/png')
      const { sucesso, erro } = await enviarImagemGrupo(grupoId, img, legenda)
      await supabase.from('disparos').insert({
        filial: usuario.filial, whatsapp: grupoId, mensagem: legenda,
        status: sucesso ? 'enviado' : 'erro', erro: erro ?? null,
      })
      alert(sucesso ? 'Resumo enviado para o grupo.' : `Falha ao enviar o resumo: ${erro}`)
    } finally {
      setExportandoResumoMotorista(false)
    }
  }

  // Reenvia a solicitação de justificativa pro supervisor sem precisar
  // reimportar a saída. Reusa o histórico já carregado em memória — só cria
  // alerta pras divergências do dia que ainda não tiverem um registrado
  // (mesma dedupe de processarFixacaoMotorista), então rodar de novo não
  // duplica envios já feitos.
  async function forcarEnvioJustificativas() {
    if (!usuario) return
    const dataAlvo = diaMotorista === 'todos' ? new Date().toISOString().slice(0, 10) : diaMotorista
    const historicoDoDia = historicoTmlMotorista.filter(h => h.data_saida === dataAlvo)
    if (historicoDoDia.length === 0) {
      alert(`Nenhum registro de saída encontrado para ${formatarDataBR(dataAlvo)}.`)
      return
    }
    setForcandoEnvioJustificativa(true)
    try {
      await processarFixacaoMotorista(usuario.filial, historicoDoDia)
      await carregarDados()
      alert(`Envio forçado concluído para ${formatarDataBR(dataAlvo)}. Confira a coluna "Justificativa" na tabela.`)
    } finally {
      setForcandoEnvioJustificativa(false)
    }
  }

  async function baixarImagem(ref: React.RefObject<HTMLDivElement | null>, setLoading: (v: boolean) => void, nomeArquivo: string) {
    if (!ref.current) return
    setLoading(true)
    try {
      const canvas = await html2canvas(ref.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivo
      a.click()
    } finally {
      setLoading(false)
    }
  }

  const registrosAtivos = useMemo(() => placasAtivasFiltro(registros, placas), [registros, placas])
  const resumos = useMemo(() => resumoPorDia(registrosAtivos), [registrosAtivos])
  const ultimo = resumos[resumos.length - 1] ?? null
  const grafico = resumos.map(r => ({ data: formatarDataBR(r.data), percentual: r.percentual }))
  const disponiveis = ultimo ? disponiveisNoDia(registrosAtivos, ultimo.data) : []
  const statusPlacas = useMemo(() => (ultimo ? statusPlacasNoDia(registrosAtivos, ultimo.data, placas) : []), [registrosAtivos, ultimo, placas])
  const matriz = useMemo(() => matrizDisponibilidade(registrosAtivos, placas, mesSel.ano, mesSel.mes), [registrosAtivos, placas, mesSel])
  const ranking = useMemo(() => rankingIndisponibilidadePorPlaca(registrosAtivos).filter(r => r.diasIndisponivel > 0), [registrosAtivos])
  const perfis = ultimo ? resumoPorPerfil(registrosAtivos.filter(r => r.data === ultimo.data), placas) : []
  const cruzamento = useMemo(() => cruzarTerritorio(registrosAtivos, historicoTml), [registrosAtivos, historicoTml])
  const comDado = useMemo(() => cruzamento.filter(c => c.bate !== null), [cruzamento])
  const diasComDado = useMemo(() => Array.from(new Set(comDado.map(c => c.data))).sort((a, b) => b.localeCompare(a)), [comDado])
  const comDadoFiltrado = diaTerritorio === 'todos' ? comDado : comDado.filter(c => c.data === diaTerritorio)
  const aderencia = comDadoFiltrado.length > 0 ? Math.round((comDadoFiltrado.filter(c => c.bate).length / comDadoFiltrado.length) * 100) : null
  const linhasExibidas = statusTerritorio === 'todos' ? comDadoFiltrado : comDadoFiltrado.filter(c => statusTerritorio === 'ok' ? c.bate : !c.bate)
  const trocas = useMemo(() => detectarTrocasTerritorio(comDadoFiltrado), [comDadoFiltrado])

  const cruzamentoMotorista = useMemo(() => cruzarMotorista(historicoTmlMotorista, placas), [historicoTmlMotorista, placas])
  // Meses com dado (YYYY-MM), mais recente primeiro. O filtro de dia lista só
  // os dias do mês selecionado; escolher um dia específico refina dentro do mês.
  const mesesComDadoMotorista = useMemo(() => Array.from(new Set(cruzamentoMotorista.map(c => c.data.slice(0, 7)))).sort((a, b) => b.localeCompare(a)), [cruzamentoMotorista])
  const diasComDadoMotorista = useMemo(() => Array.from(new Set(
    cruzamentoMotorista
      .filter(c => mesMotorista === 'todos' || c.data.slice(0, 7) === mesMotorista)
      .map(c => c.data),
  )).sort((a, b) => b.localeCompare(a)), [cruzamentoMotorista, mesMotorista])
  const cruzamentoMotoristaFiltrado = useMemo(() => cruzamentoMotorista.filter(c =>
    (diaMotorista !== 'todos'
      ? c.data === diaMotorista
      : mesMotorista === 'todos' || c.data.slice(0, 7) === mesMotorista),
  ), [cruzamentoMotorista, diaMotorista, mesMotorista])
  const aderenciaMotorista = cruzamentoMotoristaFiltrado.length > 0
    ? Math.round((cruzamentoMotoristaFiltrado.filter(c => c.bate).length / cruzamentoMotoristaFiltrado.length) * 100)
    : null
  const linhasMotoristaExibidas = statusMotorista === 'todos' ? cruzamentoMotoristaFiltrado : cruzamentoMotoristaFiltrado.filter(c => statusMotorista === 'ok' ? c.bate : !c.bate)
  const rankingMotorista = useMemo(() => rankingMotoristasPerdaFixacao(cruzamentoMotorista), [cruzamentoMotorista])
  const aderenciaMotoristaPorDia = useMemo(() => calcularAderenciaMotoristaPorDia(cruzamentoMotorista), [cruzamentoMotorista])
  const aderenciaMotoristaPorDiaSala = useMemo(() => calcularAderenciaMotoristaPorDiaESala(cruzamentoMotorista), [cruzamentoMotorista])
  const evolucaoMotoristaMeses = useMemo(() => calcularAderenciaMotoristaMeses(aderenciaMotoristaPorDia, 6), [aderenciaMotoristaPorDia])
  const graficoMotoristaMeses = evolucaoMotoristaMeses.map(m => ({
    mes: `${String(m.mes).padStart(2, '0')}/${String(m.ano).slice(2)}`,
    percentual: m.acumulado.mediaPercentual,
  }))
  const graficoMotoristaDiario = useMemo(() => {
    const porData = new Map<string, { data: string; geral?: number; colorado?: number; subFuria?: number }>()
    for (const d of aderenciaMotoristaPorDia) {
      if (!porData.has(d.data)) porData.set(d.data, { data: d.data })
      porData.get(d.data)!.geral = d.percentual
    }
    for (const d of aderenciaMotoristaPorDiaSala) {
      if (!porData.has(d.data)) porData.set(d.data, { data: d.data })
      const linha = porData.get(d.data)!
      if (d.sala === 'COLORADO') linha.colorado = d.percentual
      else if (d.sala === 'SUB-FURIA') linha.subFuria = d.percentual
    }
    return Array.from(porData.values())
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(r => ({ ...r, dataLabel: new Date(`${r.data}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }))
  }, [aderenciaMotoristaPorDia, aderenciaMotoristaPorDiaSala])
  const aderenciaMotoristaPorSalaAtual = useMemo(() => {
    const salas: Array<'COLORADO' | 'SUB-FURIA'> = ['COLORADO', 'SUB-FURIA']
    return salas.map(sala => {
      const itens = cruzamentoMotoristaFiltrado.filter(c => c.sala === sala)
      const ok = itens.filter(c => c.bate).length
      return { sala, comDado: itens.length, percentual: itens.length > 0 ? Math.round((ok / itens.length) * 100) : null }
    })
  }, [cruzamentoMotoristaFiltrado])
  const alertaPorPlacaData = useMemo(() => new Map(alertasFixacao.map(a => [`${a.placa}|${a.data}`, a])), [alertasFixacao])

  return (
    <div className="p-8 max-w-6xl">
      {importResult && (
        <div className={`mb-4 flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium ${
          importResult.tipo === 'sucesso'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span>{importResult.mensagem}</span>
          <button onClick={() => setImportResult(null)} className="ml-4 text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Frota</h2>
          {usuario && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial}</p>}
        </div>
        <Link to="/frota/placas" className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
          <Settings size={14} /> Cadastro de placas
        </Link>
      </div>

      <div className="flex gap-4 mb-4 border-b border-gray-200">
        <button onClick={() => setAba('disponibilidade')} className={`text-sm font-medium px-3 py-2 border-b-2 ${aba === 'disponibilidade' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Disponibilidade
        </button>
        <button onClick={() => setAba('territorio')} className={`text-sm font-medium px-3 py-2 border-b-2 flex items-center gap-1 ${aba === 'territorio' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <MapPinned size={14} /> Fixação de Território
        </button>
        <button onClick={() => setAba('motorista')} className={`text-sm font-medium px-3 py-2 border-b-2 flex items-center gap-1 ${aba === 'motorista' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <UserCheck size={14} /> Fixação de Motorista
        </button>
        <button onClick={() => setAba('matriz')} className={`text-sm font-medium px-3 py-2 border-b-2 flex items-center gap-1 ${aba === 'matriz' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <LayoutGrid size={14} /> Matriz Mensal
        </button>
      </div>

      {aba === 'disponibilidade' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Envio diário (relatório Frota Disponibilizada, .csv)</p>
                <div {...getRootCsv()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragCsv ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
                  <input {...getInputCsv()} />
                  {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={24} className="mx-auto text-gray-400 mb-1" />}
                  <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste o relatório do dia (.csv)'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Histórico (carga única, .xlsx)</p>
                <div {...getRootHistorico()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragHistorico ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
                  <input {...getInputHistorico()} />
                  {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <FileSpreadsheet size={24} className="mx-auto text-gray-400 mb-1" />}
                  <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha de Histórico (.xlsx)'}</p>
                </div>
              </div>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
            </div>
          ) : !ultimo ? (
            <div className="text-center py-16 text-gray-400">
              <Truck size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum dado de disponibilidade ainda. Importe o relatório diário ou o Histórico para começar.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Último dia disponível: {formatarDataBR(ultimo.data)}</p>
                <button
                  onClick={enviarResumoGrupo}
                  disabled={exportandoImg}
                  className="flex items-center gap-2 text-sm text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-40"
                >
                  {exportandoImg ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                  Enviar resumo para o grupo
                </button>
              </div>

              <div className="grid sm:grid-cols-4 gap-4">
                <Card icon={Truck} label="Frota Contratada" value={String(ultimo.contratada)} accent="text-brand-700 bg-brand-50" />
                <Card icon={CheckCircle2} label="Disponível" value={String(ultimo.disponivel)} accent="text-green-700 bg-green-50" />
                <Card icon={XCircle} label="Indisponível" value={String(ultimo.indisponivel)} accent="text-red-700 bg-red-50" />
                <Card icon={Truck} label="% Disponibilidade" value={`${ultimo.percentual}%`} accent="text-accent-600 bg-accent/40" />
              </div>

              {perfis.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Disponibilidade por perfil ({formatarDataBR(ultimo.data)})</h3>
                  <div className="grid sm:grid-cols-4 gap-3">
                    {perfis.map(p => (
                      <div key={p.perfil} className="border border-gray-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 truncate">{p.perfil}</p>
                        <p className="text-lg font-bold text-gray-900">{p.disponivel}<span className="text-xs font-normal text-gray-400">/{p.ativo}</span></p>
                        <p className={`text-xs font-medium ${p.percentual >= 80 ? 'text-green-600' : p.percentual >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{p.percentual}% disponível</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FrotaExportTemplate ref={exportRef} filial={usuario?.filial ?? ''} resumo={ultimo} perfis={perfis} />
              <FrotaPlacasExportTemplate ref={exportPlacasRef} filial={usuario?.filial ?? ''} data={ultimo.data} placas={statusPlacas} />

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Tendência de % Disponibilidade</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={grafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="percentual" name="% Disponibilidade" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Motivos de Indisponibilidade ({formatarDataBR(ultimo.data)})</h3>
                  {ultimo.motivos.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhum veículo indisponível neste dia.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500">
                          <th className="text-left py-2 font-medium">Motivo</th>
                          <th className="text-right py-2 font-medium">Quantidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ultimo.motivos.map(m => (
                          <tr key={m.motivo} className="border-b border-gray-50">
                            <td className="py-2 text-gray-700">{m.motivo}</td>
                            <td className="py-2 text-right font-medium text-gray-900">{m.quantidade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Placas Disponíveis ({formatarDataBR(ultimo.data)}) — {disponiveis.length}</h3>
                  {disponiveis.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhuma placa disponível neste dia.</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b border-gray-100 text-xs text-gray-500">
                            <th className="text-left py-2 font-medium">Placa</th>
                            <th className="text-left py-2 font-medium">Frota</th>
                            <th className="text-left py-2 font-medium">Território</th>
                          </tr>
                        </thead>
                        <tbody>
                          {disponiveis.map(d => (
                            <tr key={d.id} className="border-b border-gray-50">
                              <td className="py-2 text-gray-900 font-medium">{d.placa}</td>
                              <td className="py-2 text-gray-600">{d.frota ?? '—'}</td>
                              <td className="py-2 text-gray-600">{d.regiao ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Ranking de Indisponibilidade (período completo)</h3>
                  {ranking.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhuma indisponibilidade registrada no período.</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto -mx-1">
                      <div className="space-y-1.5 px-1">
                        {ranking.slice(0, 30).map(r => {
                          const sev = r.percentualIndisponibilidade >= 50 ? 'red' : r.percentualIndisponibilidade >= 25 ? 'amber' : 'gray'
                          const sevClasses = sev === 'red'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : sev === 'amber'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          return (
                            <div key={r.placa} className="flex items-center gap-3 px-2.5 py-2 rounded-lg border border-gray-100">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900">{r.placa}</p>
                                <p className="text-xs text-gray-500 truncate">{r.diasIndisponivel} dia(s) indisponível · {r.motivos[0]?.motivo ?? '—'}</p>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded-full border shrink-0 ${sevClasses}`}>
                                {r.percentualIndisponibilidade}%
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {aba === 'territorio' && (
        <div className="space-y-5">
          <p className="text-xs text-gray-500">
            Cruza, por placa, o território disponibilizado (coluna "Região" do relatório Frota Disponibilizada, .csv importado na
            aba Disponibilidade) com a região realmente executada no dia — vinda da aba "Base" da planilha diária (Base do Mapa).
            Essa Base já é importada em <span className="font-medium">Financeiro → Catálogo/Vendas</span>: o mesmo import atualiza o
            território aqui automaticamente, não precisa subir de novo. Basta importar o CSV da Frota do mesmo dia na aba Disponibilidade.
          </p>

          <details className="bg-white rounded-xl border border-gray-200 p-4">
            <summary className="text-xs font-medium text-gray-500 cursor-pointer">Importações manuais (fallback) — só se precisar recarregar um dia</summary>
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">Base do Mapa do dia — território executado (.xlsx com a aba "Base"). A data vem do nome do arquivo (ex.: 01072026).</p>
                <div {...getRootBaseTerr()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors max-w-md ${isDragBaseTerr ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
                  <input {...getInputBaseTerr()} />
                  {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <FileSpreadsheet size={24} className="mx-auto text-gray-400 mb-1" />}
                  <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a Base do Mapa do dia (.xlsx)'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Carga única do histórico de roteirização (PCD) via escala — dias anteriores (.xlsx).</p>
                <div {...getRootTerritorioHist()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors max-w-md ${isDragTerritorioHist ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
                  <input {...getInputTerritorioHist()} />
                  {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <FileSpreadsheet size={24} className="mx-auto text-gray-400 mb-1" />}
                  <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha histórica de roteirização (.xlsx)'}</p>
                </div>
              </div>
            </div>
          </details>

          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
            </div>
          ) : comDado.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MapPinned size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma placa roteirizada no PCD para cruzar ainda. É preciso ter placas disponíveis com território (Frota) e a escala importada na tela TML (Carta de Controle).</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Dia:</label>
                  <select
                    value={diaTerritorio}
                    onChange={e => setDiaTerritorio(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="todos">Todos os dias</option>
                    {diasComDado.map(d => <option key={d} value={d}>{formatarDataBR(d)}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Status:</label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    {([
                      ['todos', 'Todos'],
                      ['ok', 'OK'],
                      ['nok', 'NOK'],
                    ] as const).map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        onClick={() => setStatusTerritorio(valor)}
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          statusTerritorio === valor ? 'bg-brand-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Card icon={CheckCircle2} label="Placas roteirizadas no PCD" value={String(comDadoFiltrado.length)} accent="text-accent-600 bg-accent/40" />
                <Card
                  icon={aderencia !== null && aderencia >= 80 ? CheckCircle2 : XCircle}
                  label="% Aderência (território x execução)"
                  value={aderencia !== null ? `${aderencia}%` : '—'}
                  accent={aderencia !== null && aderencia >= 80 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}
                />
              </div>

              {trocas.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                      <MapPinned size={16} /> Possíveis trocas de roteirização ({trocas.length})
                    </h3>
                    <button
                      onClick={() => baixarImagem(exportTrocasRef, setExportandoTrocas, `Frota_Trocas_Territorio_${diaTerritorio === 'todos' ? 'todos' : diaTerritorio}.png`)}
                      disabled={exportandoTrocas}
                      className="flex items-center gap-1.5 text-xs text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 disabled:opacity-40 shrink-0"
                    >
                      {exportandoTrocas ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
                      Exportar imagem
                    </button>
                  </div>
                  <p className="text-xs text-amber-700 mb-3">
                    Pares de placas NOK no mesmo dia em que o território de uma bateu com o que a outra executou (e
                    vice-versa) — indício de erro do roteirizador (mapas trocados entre as placas), não de falha real
                    de fixação.
                  </p>
                  <div className="space-y-2">
                    {trocas.map((t, i) => (
                      <div key={`${t.data}-${t.placaA}-${t.placaB}-${i}`} className="bg-white rounded-lg border border-amber-100 p-3 text-xs">
                        <p className="text-gray-500 mb-1.5">{formatarDataBR(t.data)}</p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <p><span className="font-semibold text-gray-900">{t.placaA}</span> — disponibilizada p/ {t.territorioA}, rodou em {t.executadoA}</p>
                          <p><span className="font-semibold text-gray-900">{t.placaB}</span> — disponibilizada p/ {t.territorioB}, rodou em {t.executadoB}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Cruzamento por placa/dia (somente placas roteirizadas no PCD)</h3>
                  <button
                    onClick={() => baixarImagem(exportCruzamentoRef, setExportandoCruzamento, `Frota_Cruzamento_Territorio_${diaTerritorio === 'todos' ? 'todos' : diaTerritorio}.png`)}
                    disabled={exportandoCruzamento}
                    className="flex items-center gap-1.5 text-xs text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-40 shrink-0"
                  >
                    {exportandoCruzamento ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
                    Exportar imagem
                  </button>
                </div>
                <div className="max-h-[32rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-left py-2 font-medium">Data</th>
                        <th className="text-left py-2 font-medium">Placa</th>
                        <th className="text-left py-2 font-medium">Território (Frota)</th>
                        <th className="text-left py-2 font-medium">Região/Cidades executada (TML)</th>
                        <th className="text-center py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasExibidas.map((c, i) => (
                        <tr key={`${c.placa}-${c.data}-${i}`} className="border-b border-gray-50">
                          <td className="py-2 text-gray-600">{formatarDataBR(c.data)}</td>
                          <td className="py-2 text-gray-900 font-medium">{c.placa}</td>
                          <td className="py-2 text-gray-600">{c.territorio}</td>
                          <td className="py-2 text-gray-600">{c.regiaoEntregas ?? '—'}</td>
                          <td className="py-2 text-center">
                            {c.bate ? (
                              <CheckCircle2 size={16} className="inline text-green-600" />
                            ) : (
                              <XCircle size={16} className="inline text-red-600" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <TerritorioTrocasExportTemplate ref={exportTrocasRef} filial={usuario?.filial ?? ''} dia={diaTerritorio} trocas={trocas} />
              <TerritorioCruzamentoExportTemplate ref={exportCruzamentoRef} filial={usuario?.filial ?? ''} dia={diaTerritorio} linhas={linhasExibidas} aderencia={aderencia} />
            </>
          )}
        </div>
      )}

      {aba === 'motorista' && (
        <div className="space-y-5">
          <p className="text-xs text-gray-500">
            Cruza a matrícula fixada na placa (cadastro em /frota/placas) com a matrícula que realmente rodou no dia, vinda
            da escala/saída importada na tela TML — Carta de Controle. Cada divergência dispara automaticamente uma
            solicitação de justificativa pro supervisor da sala via WhatsApp — o número que recebe a mensagem é o
            cadastrado em{' '}
            <Link to="/distribuicao/tml/supervisores" className="text-brand-700 underline hover:text-brand-800">
              Supervisores — TML
            </Link>{' '}
            (um supervisor por sala, COLORADO ou SUB-FURIA).
          </p>

          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
            </div>
          ) : cruzamentoMotorista.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <UserCheck size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma placa com matrícula fixada e registro do dia ainda. Cadastre as matrículas em /frota/placas e importe a Base do Mapa em Financeiro → Catálogo/Vendas.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Mês:</label>
                  <select
                    value={mesMotorista}
                    onChange={e => { setMesMotorista(e.target.value); setDiaMotorista('todos') }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="todos">Todos os meses</option>
                    {mesesComDadoMotorista.map(m => {
                      const [ano, mes] = m.split('-')
                      return <option key={m} value={m}>{`${mes}/${ano.slice(2)}`}</option>
                    })}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Dia:</label>
                  <select
                    value={diaMotorista}
                    onChange={e => setDiaMotorista(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="todos">Todos os dias</option>
                    {diasComDadoMotorista.map(d => <option key={d} value={d}>{formatarDataBR(d)}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Status:</label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    {([
                      ['todos', 'Todos'],
                      ['ok', 'OK'],
                      ['nok', 'NOK'],
                    ] as const).map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        onClick={() => setStatusMotorista(valor)}
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          statusMotorista === valor ? 'bg-brand-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card icon={CheckCircle2} label="Placas/dia comparadas" value={String(cruzamentoMotoristaFiltrado.length)} accent="text-accent-600 bg-accent/40" />
                <Card
                  icon={aderenciaMotorista !== null && aderenciaMotorista >= 80 ? CheckCircle2 : XCircle}
                  label="% Aderência (motorista fixado x executado)"
                  value={aderenciaMotorista !== null ? `${aderenciaMotorista}%` : '—'}
                  accent={aderenciaMotorista !== null && aderenciaMotorista >= 80 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}
                />
                {aderenciaMotoristaPorSalaAtual.map(s => (
                  <Card
                    key={s.sala}
                    icon={s.percentual !== null && s.percentual >= 80 ? CheckCircle2 : XCircle}
                    label={`% Aderência — ${s.sala}`}
                    value={s.percentual !== null ? `${s.percentual}%` : '—'}
                    accent={s.percentual !== null && s.percentual >= 80 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}
                  />
                ))}
              </div>

              {graficoMotoristaDiario.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Aderência diária por sala</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={graficoMotoristaDiario}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="dataLabel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="geral" name="Geral" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="colorado" name="COLORADO" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="subFuria" name="SUB-FURIA" stroke="#d97706" strokeWidth={2} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {graficoMotoristaMeses.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolução mês x mês</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={graficoMotoristaMeses}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="percentual" name="% Aderência" stroke="#2563eb" strokeWidth={2} dot />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Trophy size={15} /> Ranking de motoristas com mais perdas de fixação</h3>
                {rankingMotorista.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">Nenhuma divergência registrada no período.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto -mx-1">
                    <div className="space-y-1.5 px-1">
                      {rankingMotorista.slice(0, 30).map(r => (
                        <div key={r.matricula} className="flex items-center gap-3 px-2.5 py-2 rounded-lg border border-gray-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">{r.nome ?? `Matrícula ${r.matricula}`}</p>
                            <p className="text-xs text-gray-500 truncate">Matrícula {r.matricula} · {r.placas.length} placa(s): {r.placas.join(', ')}</p>
                          </div>
                          <span className="text-xs font-bold px-2 py-1 rounded-full border shrink-0 bg-red-50 text-red-700 border-red-200">
                            {r.perdas}x
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Cruzamento por placa/dia</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={enviarResumoGrupoMotorista}
                      disabled={exportandoResumoMotorista}
                      className="flex items-center gap-1.5 text-xs text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-40"
                    >
                      {exportandoResumoMotorista ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
                      Enviar resumo para o grupo
                    </button>
                    <button
                      onClick={() => baixarImagem(exportMotoristaRef, setExportandoMotorista, `Frota_Fixacao_Motorista_${diaMotorista === 'todos' ? 'todos' : diaMotorista}.png`)}
                      disabled={exportandoMotorista}
                      className="flex items-center gap-1.5 text-xs text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-40"
                    >
                      {exportandoMotorista ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
                      Exportar imagem
                    </button>
                    <button
                      onClick={forcarEnvioJustificativas}
                      disabled={forcandoEnvioJustificativa}
                      className="flex items-center gap-1.5 text-xs text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-40"
                    >
                      {forcandoEnvioJustificativa ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Forçar envio de justificativas
                    </button>
                  </div>
                </div>
                <div className="max-h-[32rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-left py-2 font-medium">Data</th>
                        <th className="text-left py-2 font-medium">Placa</th>
                        <th className="text-left py-2 font-medium">Sala</th>
                        <th className="text-left py-2 font-medium">Motorista fixado</th>
                        <th className="text-left py-2 font-medium">Motorista que rodou</th>
                        <th className="text-center py-2 font-medium">Status</th>
                        <th className="text-left py-2 font-medium">Justificativa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasMotoristaExibidas.map((c, i) => {
                        const alerta = alertaPorPlacaData.get(`${c.placa}|${c.data}`)
                        return (
                          <tr key={`${c.placa}-${c.data}-${i}`} className="border-b border-gray-50">
                            <td className="py-2 text-gray-600">{formatarDataBR(c.data)}</td>
                            <td className="py-2 text-gray-900 font-medium">{c.placa}</td>
                            <td className="py-2 text-gray-600">{c.sala ?? '—'}</td>
                            <td className="py-2 text-gray-600">{[c.matriculaEsperada1, c.matriculaEsperada2].filter(Boolean).join(' / ') || '—'}</td>
                            <td className="py-2 text-gray-600">{c.nomeExecutou ?? '—'} ({c.matriculaExecutou})</td>
                            <td className="py-2 text-center">
                              {c.bate ? (
                                <CheckCircle2 size={16} className="inline text-green-600" />
                              ) : (
                                <XCircle size={16} className="inline text-red-600" />
                              )}
                            </td>
                            <td className="py-2 text-gray-600">
                              {alerta ? (
                                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_FIXACAO_COR[alerta.status]}`}>
                                  {STATUS_FIXACAO_LABEL[alerta.status]}
                                </span>
                              ) : c.bate ? '—' : <span className="text-xs text-gray-400">Sem alerta</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <FixacaoMotoristaExportTemplate ref={exportMotoristaRef} filial={usuario?.filial ?? ''} dia={diaMotorista} linhas={linhasMotoristaExibidas} aderencia={aderenciaMotorista} />
            </>
          )}
        </div>
      )}

      {aba === 'matriz' && (
        <div className="space-y-4">
          {/* Navegação de mês */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMesSel(m => {
                const d = new Date(m.ano, m.mes - 2, 1)
                return { ano: d.getFullYear(), mes: d.getMonth() + 1 }
              })}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800 capitalize min-w-[110px] text-center">
              {new Date(mesSel.ano, mesSel.mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setMesSel(m => {
                const d = new Date(m.ano, m.mes, 1)
                return { ano: d.getFullYear(), mes: d.getMonth() + 1 }
              })}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
            </div>
          ) : matriz.placas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <LayoutGrid size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma placa ativa no cadastro. Importe o relatório diário para começar.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="border-collapse min-w-full text-xs">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-[#1e3a5f] z-10 whitespace-nowrap min-w-[80px]">Placa</th>
                      {matriz.diasDoMes.map(d => (
                        <th key={d} className="px-1 py-2.5 font-semibold text-center min-w-[30px]">
                          {d.slice(8)}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap min-w-[58px] sticky right-0 bg-[#1e3a5f] z-10">% Disp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.placas.map((p, ri) => (
                      <tr key={p.placa} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className={`px-3 py-1 font-bold text-gray-900 sticky left-0 z-10 whitespace-nowrap border-r border-gray-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          {p.placa}
                        </td>
                        {p.dias.map(dia => {
                          const classes: Record<string, string> = {
                            disponivel:     'bg-green-200 border border-green-400',
                            indisponivel:   'bg-red-200 border border-red-400',
                            parado:         'bg-yellow-200 border border-yellow-400',
                            nao_contratada: 'bg-gray-300 border border-gray-400',
                            sem_dado:       'bg-white border border-dashed border-gray-200',
                          }
                          return (
                            <td key={dia.data} className="px-1 py-1 text-center">
                              <div className={`mx-auto w-5 h-5 rounded-[4px] ${classes[dia.tipo]}`} title={dia.tipo.replace('_', ' ')} />
                            </td>
                          )
                        })}
                        <td className={`px-3 py-1 text-center font-bold sticky right-0 z-10 border-l border-gray-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${p.percentual >= 80 ? 'text-green-700' : p.percentual >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                          {p.diasContratadaComDado > 0 ? `${p.percentual}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#1e3a5f] text-white">
                      <td className="px-3 py-2 font-bold sticky left-0 bg-[#1e3a5f] z-10 text-xs whitespace-nowrap">% do dia</td>
                      {matriz.percentualPorDia.map(d => (
                        <td key={d.data} className={`px-1 py-2 text-center text-xs font-bold ${d.percentual >= 80 ? 'text-green-300' : d.percentual >= 60 ? 'text-yellow-300' : d.percentual === 0 ? 'text-gray-400' : 'text-red-300'}`}>
                          {d.percentual > 0 ? `${d.percentual}%` : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 sticky right-0 bg-[#1e3a5f] z-10" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Legenda */}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {[
                  { cls: 'bg-green-200 border border-green-400',              label: 'Disponível' },
                  { cls: 'bg-red-200 border border-red-400',                  label: 'Indisponível' },
                  { cls: 'bg-yellow-200 border border-yellow-400',            label: 'Parado' },
                  { cls: 'bg-gray-300 border border-gray-400',                label: 'Não Contratada' },
                  { cls: 'bg-white border border-dashed border-gray-200',     label: 'Sem dado' },
                ].map(({ cls, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded-[3px] shrink-0 ${cls}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const FrotaExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  resumo: ResumoDiaFrota | null
  perfis: ResumoPerfilFrota[]
}>(function FrotaExportTemplate({ filial, resumo, perfis }, ref) {
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: '10px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '12px', verticalAlign: 'middle' }

  if (!resumo) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '600px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Frota</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Resumo de Disponibilidade</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{formatarDataBR(resumo.data)}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Contratada', valor: resumo.contratada, cor: '#1e3a5f' },
          { label: 'Disponível', valor: resumo.disponivel, cor: '#16a34a' },
          { label: 'Indisponível', valor: resumo.indisponivel, cor: '#dc2626' },
          { label: '% Disp.', valor: `${resumo.percentual}%`, cor: '#2563eb' },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
            <p style={{ fontSize: '20px', fontWeight: 800, color: c.cor, margin: 0 }}>{c.valor}</p>
          </div>
        ))}
      </div>

      {perfis.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <thead>
            <tr style={{ background: '#1e3a5f' }}>
              <th style={th}>Perfil</th>
              <th style={{ ...th, textAlign: 'center' }}>Ativo</th>
              <th style={{ ...th, textAlign: 'center' }}>Disponível</th>
              <th style={{ ...th, textAlign: 'center' }}>% Disp.</th>
            </tr>
          </thead>
          <tbody>
            {perfis.map((p, i) => (
              <tr key={p.perfil} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, fontWeight: 600, color: '#0f172a' }}>{p.perfil}</td>
                <td style={{ ...td, textAlign: 'center' }}>{p.ativo}</td>
                <td style={{ ...td, textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{p.disponivel}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{p.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(resumo.data)}
      </div>
    </div>
  )
})

function badgeCor(p: StatusPlacaFrota): { bg: string; fg: string; border: string } {
  if (p.disponivel) return { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' }
  if (p.status.toUpperCase().includes('PARAD')) return { bg: '#fef9c3', fg: '#a16207', border: '#fde68a' }
  return { bg: '#fee2e2', fg: '#b91c1c', border: '#fecaca' }
}

const FrotaPlacasExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  data: string
  placas: StatusPlacaFrota[]
}>(function FrotaPlacasExportTemplate({ filial, data, placas }, ref) {
  const th: React.CSSProperties = { padding: '7px 10px', fontSize: '10px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 10px', fontSize: '11px', verticalAlign: 'middle', whiteSpace: 'nowrap' }

  if (placas.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '640px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Frota</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Placas ({placas.length})</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{formatarDataBR(data)}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={th}>Placa</th>
            <th style={th}>Perfil</th>
            <th style={th}>Status</th>
            <th style={th}>Motivo</th>
            <th style={th}>Rota</th>
          </tr>
        </thead>
        <tbody>
          {placas.map((p, i) => {
            const cor = badgeCor(p)
            return (
              <tr key={p.placa} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{p.placa}</td>
                <td style={{ ...td, color: '#475569' }}>{p.perfil}</td>
                <td style={td}>
                  <span style={{ display: 'inline-block', background: cor.bg, color: cor.fg, border: `1px solid ${cor.border}`, borderRadius: '999px', padding: '2px 9px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {p.status}
                  </span>
                </td>
                <td style={{ ...td, color: '#475569' }}>{p.motivo ?? ''}</td>
                <td style={{ ...td, color: '#475569' }}>{p.rota ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ paddingTop: '10px', fontSize: '10px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(data)}
      </div>
    </div>
  )
})

const TerritorioTrocasExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  dia: string
  trocas: TrocaTerritorioItem[]
}>(function TerritorioTrocasExportTemplate({ filial, dia, trocas }, ref) {
  if (trocas.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '640px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Frota</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Possíveis Trocas de Roteirização ({trocas.length})</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{dia === 'todos' ? 'Todos os dias' : formatarDataBR(dia)}</p>
      </div>

      <p style={{ fontSize: '11px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', margin: '0 0 16px' }}>
        Pares de placas NOK no mesmo dia em que o território de uma bateu com o que a outra executou (e vice-versa) —
        indício de erro do roteirizador (mapas trocados entre as placas), não de falha real de fixação.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {trocas.map((t, i) => (
          <div key={`${t.data}-${t.placaA}-${t.placaB}-${i}`} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px' }}>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 6px' }}>{formatarDataBR(t.data)}</p>
            <p style={{ fontSize: '12px', color: '#334155', margin: '0 0 4px' }}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.placaA}</span> — disponibilizada p/ {t.territorioA}, rodou em {t.executadoA}
            </p>
            <p style={{ fontSize: '12px', color: '#334155', margin: 0 }}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.placaB}</span> — disponibilizada p/ {t.territorioB}, rodou em {t.executadoB}
            </p>
          </div>
        ))}
      </div>

      <div style={{ paddingTop: '14px', fontSize: '10px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(dia === 'todos' ? trocas[0]?.data ?? '' : dia)}
      </div>
    </div>
  )
})

const TerritorioCruzamentoExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  dia: string
  linhas: CruzamentoTerritorioItem[]
  aderencia: number | null
}>(function TerritorioCruzamentoExportTemplate({ filial, dia, linhas, aderencia }, ref) {
  const th: React.CSSProperties = { padding: '7px 10px', fontSize: '10px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 10px', fontSize: '11px', verticalAlign: 'middle' }

  if (linhas.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '720px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Frota</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Cruzamento por Placa/Dia</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{dia === 'todos' ? 'Todos os dias' : formatarDataBR(dia)}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Placas roteirizadas no PCD</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>{linhas.length}</p>
        </div>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>% Aderência (território x execução)</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: aderencia !== null && aderencia >= 80 ? '#16a34a' : '#dc2626', margin: 0 }}>{aderencia !== null ? `${aderencia}%` : '—'}</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={th}>Data</th>
            <th style={th}>Placa</th>
            <th style={th}>Território (Frota)</th>
            <th style={th}>Região/Cidades executada (TML)</th>
            <th style={{ ...th, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c, i) => (
            <tr key={`${c.placa}-${c.data}-${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
              <td style={{ ...td, color: '#475569' }}>{formatarDataBR(c.data)}</td>
              <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{c.placa}</td>
              <td style={{ ...td, color: '#475569' }}>{c.territorio}</td>
              <td style={{ ...td, color: '#475569' }}>{c.regiaoEntregas ?? '—'}</td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span style={{ display: 'inline-block', background: c.bate ? '#dcfce7' : '#fee2e2', color: c.bate ? '#15803d' : '#b91c1c', border: `1px solid ${c.bate ? '#bbf7d0' : '#fecaca'}`, borderRadius: '999px', padding: '2px 9px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                  {c.bate ? 'OK' : 'NOK'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ paddingTop: '10px', fontSize: '10px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(dia === 'todos' ? linhas[0]?.data ?? '' : dia)}
      </div>
    </div>
  )
})

const FixacaoMotoristaExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  dia: string
  linhas: CruzamentoMotoristaItem[]
  aderencia: number | null
}>(function FixacaoMotoristaExportTemplate({ filial, dia, linhas, aderencia }, ref) {
  const th: React.CSSProperties = { padding: '7px 10px', fontSize: '10px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 10px', fontSize: '11px', verticalAlign: 'middle' }

  if (linhas.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '760px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Frota</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Fixação de Motorista — Cruzamento por Placa/Dia</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{dia === 'todos' ? 'Todos os dias' : formatarDataBR(dia)}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Placas/dia comparadas</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: '#1e3a5f', margin: 0 }}>{linhas.length}</p>
        </div>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>% Aderência (motorista fixado x execução)</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: aderencia !== null && aderencia >= 80 ? '#16a34a' : '#dc2626', margin: 0 }}>{aderencia !== null ? `${aderencia}%` : '—'}</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={th}>Data</th>
            <th style={th}>Placa</th>
            <th style={th}>Sala</th>
            <th style={th}>Motorista fixado</th>
            <th style={th}>Motorista que rodou</th>
            <th style={{ ...th, textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c, i) => (
            <tr key={`${c.placa}-${c.data}-${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
              <td style={{ ...td, color: '#475569' }}>{formatarDataBR(c.data)}</td>
              <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{c.placa}</td>
              <td style={{ ...td, color: '#475569' }}>{c.sala ?? '—'}</td>
              <td style={{ ...td, color: '#475569' }}>{[c.matriculaEsperada1, c.matriculaEsperada2].filter(Boolean).join(' ou ') || '—'}</td>
              <td style={{ ...td, color: '#475569' }}>{c.nomeExecutou ?? '—'} ({c.matriculaExecutou})</td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span style={{ display: 'inline-block', background: c.bate ? '#dcfce7' : '#fee2e2', color: c.bate ? '#15803d' : '#b91c1c', border: `1px solid ${c.bate ? '#bbf7d0' : '#fecaca'}`, borderRadius: '999px', padding: '2px 9px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                  {c.bate ? 'OK' : 'NOK'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ paddingTop: '10px', fontSize: '10px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(dia === 'todos' ? linhas[0]?.data ?? '' : dia)}
      </div>
    </div>
  )
})
