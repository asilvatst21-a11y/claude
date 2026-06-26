import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Loader2, RefreshCw, Users, UserCog, AlertTriangle, CheckCircle, Clock, X, Send, BarChart2,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enviarListaOpcoesWhatsApp, enviarMensagemGrupo, enviarImagemGrupo } from '../lib/zapi'
import { serieCartaControleCDD, renderCartaControlePNG } from '../lib/tmlCartaControle'
import { parseEscalaBuffer, parseSaidaBuffer, parseChecklistBuffer } from '../lib/tmlParser'
import {
  isSalaTML, horarioLimite, atrasoMinutos, saidaInvalida, SALA_TML_LABEL, type SalaTML,
  horarioFinalMatinalPadrao, tempoDeslocamentoComMatinalReal, metaMatinalMinutos, MATINAL_AUTO_FINALIZA_MIN,
} from '../lib/tml'
import { gerarResumoDiario, gerarResumoGerencial, statusSaidaPorSala, type StatusSalaTML } from '../lib/tmlResumos'
import type { AlertaTML, HistoricoTML, MotivoJustificativaTML } from '../types'
import { formatarDataBR } from '../lib/utils'

const MOTIVOS_PADRAO = ['ATRASO NA MATINAL', 'ATRASO COLABORADOR', 'MANUTENÇÃO', 'CONFERENCIA DE CARGA', 'OUTRO']

function ResultadoBadge({ resultado }: { resultado: HistoricoTML['resultado'] }) {
  if (resultado === 'no_prazo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
        <CheckCircle className="h-3 w-3" /> Dentro da meta
      </span>
    )
  }
  if (resultado === 'atrasado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100">
        <AlertTriangle className="h-3 w-3" /> Atrasado
      </span>
    )
  }
  if (resultado === 'invalido') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-purple-700 bg-purple-100">
        <X className="h-3 w-3" /> Inválido (saiu antes da matinal)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-700 bg-gray-100">
      <Clock className="h-3 w-3" /> Indefinido
    </span>
  )
}

function StatusBadge({ status }: { status: AlertaTML['status'] }) {
  if (status === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-blue-700 bg-blue-100">
        <Send className="h-3 w-3" /> Pendente de envio
      </span>
    )
  }
  if (status === 'justificado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
        <CheckCircle className="h-3 w-3" /> Justificado
      </span>
    )
  }
  if (status === 'erro') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100">
        <AlertTriangle className="h-3 w-3" /> Erro
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-yellow-700 bg-yellow-100">
      <Clock className="h-3 w-3" /> Aguardando justificativa
    </span>
  )
}

function montarMensagemTml(alerta: {
  mapa: number
  placa: string | null
  nome: string | null
  matricula: number | null
  sala: string
  horario_limite: string
  horario_saida: string
  atraso_minutos: number
}): string {
  return (
    `⚠️ *TML PERDIDO*\n\n` +
    `🗺️ Mapa: ${alerta.mapa}\n` +
    `🚛 Placa: ${alerta.placa ?? '-'}\n` +
    `👤 Motorista: ${alerta.nome ?? '—'} (matrícula ${alerta.matricula ?? '—'})\n` +
    `🏢 Sala: ${alerta.sala}\n` +
    `🕐 Limite de saída: ${alerta.horario_limite}\n` +
    `🕑 Saída real: ${alerta.horario_saida}\n` +
    `⏱️ Atraso: ${alerta.atraso_minutos} min\n\n` +
    `O motorista perdeu o TML. Toque em "Selecionar motivo" abaixo e escolha a justificativa.`
  )
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function dataMaisFrequente(datas: (string | null | undefined)[]): string {
  const contagem = new Map<string, number>()
  for (const d of datas) {
    if (!d) continue
    contagem.set(d, (contagem.get(d) ?? 0) + 1)
  }
  let melhor = ''
  let max = 0
  for (const [d, c] of contagem) {
    if (c > max) { melhor = d; max = c }
  }
  return melhor || new Date().toISOString().slice(0, 10)
}

// Resumo automático enviado ao grupo de WhatsApp configurado em
// /distribuicao/tml/whatsapp toda vez que a planilha de saída é importada.
// Se nenhum grupo estiver configurado, não falha — apenas não envia.
async function enviarResumoDiario(filial: string, data: string): Promise<void> {
  const { data: filialRow } = await supabase
    .from('filiais')
    .select('grupo_tml_diario_whatsapp')
    .eq('nome', filial)
    .maybeSingle()
  const grupoId = filialRow?.grupo_tml_diario_whatsapp
  if (!grupoId) return

  const resumo = await gerarResumoDiario(filial, data)
  await enviarMensagemGrupo(grupoId, resumo)

  // Carta de controle visual (mapa de calor) — só envia se já houver algum
  // ponto calculável. Falha de imagem não derruba o resumo de texto.
  try {
    const serie = await serieCartaControleCDD(filial, data)
    if (serie.valores.some((v) => v !== null)) {
      const img = renderCartaControlePNG(serie)
      const [, m, d] = data.split('-')
      await enviarImagemGrupo(grupoId, img, `📈 Carta de Controle TML — ${d}/${m}`)
    }
  } catch {
    // ignora — o resumo de texto já foi enviado
  }
}

async function gerarNumero(filial: string): Promise<string> {
  const { count } = await supabase
    .from('alertas_tml')
    .select('*', { count: 'exact', head: true })
    .eq('filial', filial)
  const n = ((count ?? 0) + 1).toString().padStart(4, '0')
  const d = new Date()
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `TML-${ds}-${n}`
}

function UploadBox({
  titulo, descricao, onFile, isUploading,
}: {
  titulo: string
  descricao: string
  onFile: (file: File) => void
  isUploading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="border rounded-lg bg-white p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">{descricao}</p>
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-accent-500" />
        ) : (
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {isUploading ? 'Processando...' : 'Clique para selecionar o arquivo'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
      </div>
    </div>
  )
}

export default function DistribuicaoTML() {
  const { usuario } = useAuth()
  const [alertas, setAlertas] = useState<AlertaTML[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingEscala, setUploadingEscala] = useState(false)
  const [uploadingSaida, setUploadingSaida] = useState(false)
  const [uploadingChecklist, setUploadingChecklist] = useState(false)
  const [justificando, setJustificando] = useState<AlertaTML | null>(null)
  const [motivos, setMotivos] = useState<MotivoJustificativaTML[]>([])
  const [motivoSelecionado, setMotivoSelecionado] = useState('')
  const [textoJustificativa, setTextoJustificativa] = useState('')
  const [novoMotivo, setNovoMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [enviandoAlertaId, setEnviandoAlertaId] = useState<string | null>(null)
  const [enviandoResumoGerencial, setEnviandoResumoGerencial] = useState(false)
  const [enviandoResumoDiario, setEnviandoResumoDiario] = useState(false)

  const [historico, setHistorico] = useState<HistoricoTML[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(true)

  const [statusSaida, setStatusSaida] = useState<Map<SalaTML, StatusSalaTML> | null>(null)

  const fetchAlertas = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('alertas_tml')
      .select('*, supervisores_tml(nome, telefone)')
      .eq('filial', usuario.filial)
      .order('created_at', { ascending: false })
      .limit(200)
    setAlertas(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario])

  const fetchHistorico = useCallback(async () => {
    if (!usuario) return
    setLoadingHistorico(true)
    const { data } = await supabase
      .from('historico_tml')
      .select('*')
      .eq('filial', usuario.filial)
      .eq('data_saida', hojeISO())
      .order('created_at', { ascending: false })
      .limit(200)
    setHistorico(Array.isArray(data) ? data : [])
    setLoadingHistorico(false)
  }, [usuario])

  const fetchMotivos = useCallback(async () => {
    if (!usuario) return
    const { data } = await supabase
      .from('motivos_justificativa_tml')
      .select('*')
      .eq('filial', usuario.filial)
      .order('motivo')
    if (data && data.length > 0) {
      setMotivos(data)
    } else {
      setMotivos(MOTIVOS_PADRAO.map((motivo) => ({ id: motivo, filial: usuario.filial, motivo, created_at: '' })))
    }
  }, [usuario])

  const fetchStatusSaida = useCallback(async () => {
    if (!usuario) return
    const status = await statusSaidaPorSala(usuario.filial, hojeISO())
    setStatusSaida(status)
  }, [usuario])

  useEffect(() => { fetchAlertas() }, [fetchAlertas])
  useEffect(() => { fetchMotivos() }, [fetchMotivos])
  useEffect(() => { fetchHistorico() }, [fetchHistorico])
  useEffect(() => { fetchStatusSaida() }, [fetchStatusSaida])

  // Atualiza sozinho a cada 15s para refletir respostas do supervisor pelo
  // WhatsApp (clique no motivo) sem precisar apertar "Atualizar".
  useEffect(() => {
    const id = setInterval(() => {
      fetchAlertas()
      fetchHistorico()
      fetchStatusSaida()
    }, 15000)
    return () => clearInterval(id)
  }, [fetchAlertas, fetchHistorico, fetchStatusSaida])

  async function handleEscala(file: File) {
    if (!usuario) return
    setUploadingEscala(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const escalas = parseEscalaBuffer(buffer)
      if (escalas.length === 0) {
        throw new Error('Nenhum motorista escalado encontrado na planilha')
      }

      // Mapas cancelados saem da planilha nova, mas como o upsert só
      // insere/atualiza quem está nela, ficariam presos no banco com a escala
      // antiga. Por isso, antes de upsertar, removemos da(s) data(s) que essa
      // planilha cobre qualquer mapa que não esteja mais nela.
      const datas = [...new Set(escalas.map((e) => e.dataEntrega).filter((d): d is string => d != null))]
      const mapasNovos = escalas.map((e) => e.mapa)
      if (datas.length > 0) {
        const { error: delErr } = await supabase
          .from('escalas_tml')
          .delete()
          .eq('filial', usuario.filial)
          .in('data_entrega', datas)
          .not('mapa', 'in', `(${mapasNovos.join(',')})`)
        if (delErr) throw new Error(delErr.message)
      }

      const { error } = await supabase.from('escalas_tml').upsert(
        escalas.map((e) => ({
          filial: usuario.filial,
          mapa: e.mapa,
          placa: e.placa,
          matricula: e.matricula,
          data_entrega: e.dataEntrega,
          importado_em: new Date().toISOString(),
        })),
        { onConflict: 'filial,mapa' }
      )
      if (error) throw new Error(error.message)
      alert(`${escalas.length} registro(s) de escala importado(s).`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar escala')
    } finally {
      setUploadingEscala(false)
    }
  }

  async function handleSaida(file: File) {
    if (!usuario) return
    setUploadingSaida(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const saidas = parseSaidaBuffer(buffer)
      if (saidas.length === 0) {
        alert('Nenhum registro de saída encontrado na planilha.')
        return
      }

      const { error: upsertErr } = await supabase.from('saidas_tml').upsert(
        saidas.map((s) => ({
          filial: usuario.filial,
          mapa: s.mapa,
          placa: s.placa,
          matricula: s.matricula,
          data_saida: s.dataSaida,
          horario_saida: s.horarioSaida,
          importado_em: new Date().toISOString(),
        })),
        { onConflict: 'filial,mapa' }
      )
      if (upsertErr) throw new Error(upsertErr.message)

      const mapas = saidas.map((s) => s.mapa)

      const { data: escalas } = await supabase
        .from('escalas_tml')
        .select('mapa, placa, matricula')
        .eq('filial', usuario.filial)
        .in('mapa', mapas)
      const escalaPorMapa = new Map((escalas ?? []).map((e) => [e.mapa, e]))

      const matriculas = [...new Set(saidas.map((s) => s.matricula).filter((m): m is number => m != null))]
      const { data: roster } = await supabase
        .from('motoristas_sala_tml')
        .select('matricula, nome, sala')
        .eq('filial', usuario.filial)
        .in('matricula', matriculas)
      const salaPorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.sala]))
      const nomePorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.nome]))

      const { data: alertasExistentes } = await supabase
        .from('alertas_tml')
        .select('mapa')
        .eq('filial', usuario.filial)
        .in('mapa', mapas)
      const mapasJaAlertados = new Set((alertasExistentes ?? []).map((a) => a.mapa))

      const erros: string[] = []
      const diag = { jaAlertado: 0, semHorario: 0, semSala: 0, noPrazo: 0, semSupervisor: 0, pendentes: 0, invalido: 0 }
      const historicoImediato: Record<string, unknown>[] = []

      for (const saida of saidas) {
        if (mapasJaAlertados.has(saida.mapa)) { diag.jaAlertado++; continue }

        const escala = escalaPorMapa.get(saida.mapa)
        const matricula = saida.matricula ?? escala?.matricula ?? null
        const placa = saida.placa ?? escala?.placa ?? null
        const nome = matricula != null ? nomePorMatricula.get(matricula) ?? null : null

        if (!saida.horarioSaida) {
          diag.semHorario++
          historicoImediato.push({
            filial: usuario.filial, mapa: saida.mapa, sala: null, placa, matricula, nome,
            data_saida: saida.dataSaida, horario_saida: null, horario_limite: null, atraso_minutos: null,
            resultado: 'indefinido', observacao: 'Sem horário de saída na planilha',
          })
          continue
        }

        const sala = matricula != null ? salaPorMatricula.get(matricula) : undefined
        if (!isSalaTML(sala)) {
          diag.semSala++
          if (matricula != null) erros.push(`Mapa ${saida.mapa}: matrícula ${matricula} sem sala cadastrada`)
          historicoImediato.push({
            filial: usuario.filial, mapa: saida.mapa, sala: null, placa, matricula, nome,
            data_saida: saida.dataSaida, horario_saida: saida.horarioSaida, horario_limite: null, atraso_minutos: null,
            resultado: 'indefinido', observacao: 'Matrícula sem sala cadastrada no roster',
          })
          continue
        }

        if (saidaInvalida(sala, saida.horarioSaida)) {
          diag.invalido++
          historicoImediato.push({
            filial: usuario.filial, mapa: saida.mapa, sala, placa, matricula, nome,
            data_saida: saida.dataSaida, horario_saida: saida.horarioSaida, horario_limite: null, atraso_minutos: null,
            resultado: 'invalido', observacao: 'Saída registrada antes do horário matinal da sala',
          })
          continue
        }

        const atraso = atrasoMinutos(sala, saida.horarioSaida)
        const limite = horarioLimite(sala)

        if (atraso <= 0) {
          diag.noPrazo++
          historicoImediato.push({
            filial: usuario.filial, mapa: saida.mapa, sala, placa, matricula, nome,
            data_saida: saida.dataSaida, horario_saida: saida.horarioSaida, horario_limite: limite, atraso_minutos: atraso,
            resultado: 'no_prazo', observacao: null,
          })
          continue
        }

        const { data: supervisores } = await supabase
          .from('supervisores_tml')
          .select('id, nome, telefone')
          .eq('filial', usuario.filial)
          .eq('sala', sala)

        if (!supervisores?.length) {
          diag.semSupervisor++
          erros.push(`Mapa ${saida.mapa}: nenhum supervisor cadastrado para a sala ${SALA_TML_LABEL[sala]}`)
          historicoImediato.push({
            filial: usuario.filial, mapa: saida.mapa, sala, placa, matricula, nome,
            data_saida: saida.dataSaida, horario_saida: saida.horarioSaida, horario_limite: limite, atraso_minutos: atraso,
            resultado: 'atrasado', observacao: 'Nenhum supervisor cadastrado para a sala',
          })
          continue
        }

        diag.pendentes++
        const mensagem = montarMensagemTml({
          mapa: saida.mapa, placa, nome, matricula, sala,
          horario_limite: limite, horario_saida: saida.horarioSaida, atraso_minutos: atraso,
        })

        const numero = await gerarNumero(usuario.filial)
        const { data: alertaInserido, error: alertaErr } = await supabase
          .from('alertas_tml')
          .insert({
            filial: usuario.filial,
            numero,
            mapa: saida.mapa,
            sala,
            placa,
            matricula,
            nome,
            horario_limite: limite,
            horario_saida: saida.horarioSaida,
            atraso_minutos: atraso,
            supervisor_id: supervisores[0].id,
            mensagem_enviada: mensagem,
            status: 'pendente',
          })
          .select('id')
          .single()
        if (alertaErr) { erros.push(`Mapa ${saida.mapa}: ${alertaErr.message}`); continue }

        historicoImediato.push({
          filial: usuario.filial, mapa: saida.mapa, sala, placa, matricula, nome,
          data_saida: saida.dataSaida, horario_saida: saida.horarioSaida, horario_limite: limite, atraso_minutos: atraso,
          resultado: 'atrasado', observacao: null, alerta_id: alertaInserido?.id ?? null,
        })
      }

      if (historicoImediato.length > 0) {
        const { error: histErr } = await supabase
          .from('historico_tml')
          .upsert(historicoImediato, { onConflict: 'filial,mapa' })
        if (histErr) erros.push(`Histórico: ${histErr.message}`)
      }

      await enviarResumoDiario(usuario.filial, dataMaisFrequente(saidas.map((s) => s.dataSaida)))

      alert(
        `${saidas.length} saída(s) processada(s).\n\n` +
        `• ${diag.pendentes} motorista(s) perderam o TML — pendente de envio (use o botão "Enviar" na tela)\n` +
        `• ${diag.noPrazo} dentro do prazo (sem atraso)\n` +
        `• ${diag.semSala} sem sala (matrícula não está no roster)\n` +
        `• ${diag.semSupervisor} sem supervisor cadastrado na sala\n` +
        `• ${diag.semHorario} sem horário de saída\n` +
        `• ${diag.invalido} com saída inválida (antes da matinal — não entram na conta)\n` +
        `• ${diag.jaAlertado} já tinham alerta` +
        (erros.length ? `\n\nDetalhes:\n${erros.slice(0, 15).join('\n')}` : '')
      )

      await fetchAlertas()
      await fetchHistorico()
      await fetchStatusSaida()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar saída')
    } finally {
      setUploadingSaida(false)
    }
  }

  async function handleChecklist(file: File) {
    if (!usuario) return
    setUploadingChecklist(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const checklist = parseChecklistBuffer(buffer)
      if (checklist.length === 0) {
        alert('Nenhum registro de checklist encontrado na planilha.')
        return
      }

      const mapas = checklist.map((c) => c.mapa)
      const { data: escalas } = await supabase
        .from('escalas_tml')
        .select('mapa, matricula')
        .eq('filial', usuario.filial)
        .in('mapa', mapas)
      const matriculaPorMapa = new Map((escalas ?? []).map((e) => [e.mapa, e.matricula]))

      // Sala vem do cadastro de motoristas (mesma base usada na carta de
      // controle), não da coluna EQUIPE da planilha de checklist.
      const matriculas = [...new Set([...matriculaPorMapa.values()].filter((m): m is number => m != null))]
      const { data: roster } = await supabase
        .from('motoristas_sala_tml')
        .select('matricula, sala')
        .eq('filial', usuario.filial)
        .in('matricula', matriculas)
      const salaPorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.sala]))

      // Busca o horário REAL de fim da matinal (registrado no timer) pra cada
      // combinação sala+data presente no checklist importado.
      const datasComSala = [...new Set(
        checklist
          .map((c) => {
            const matricula = matriculaPorMapa.get(c.mapa) ?? null
            const sala = matricula != null ? salaPorMatricula.get(matricula) ?? null : null
            return isSalaTML(sala) && c.data ? `${sala}|${c.data}` : null
          })
          .filter((x): x is string => x != null)
      )]
      const salasNecessarias = [...new Set(datasComSala.map((k) => k.split('|')[0]))]
      const datasNecessarias = [...new Set(datasComSala.map((k) => k.split('|')[1]))]

      const { data: matinaisRaw } = salasNecessarias.length > 0
        ? await supabase
          .from('matinal_tml')
          .select('id, sala, data, horario_inicio, horario_final, finalizado_automaticamente')
          .eq('filial', usuario.filial)
          .in('sala', salasNecessarias)
          .in('data', datasNecessarias)
        : { data: [] }

      // Matinais iniciadas no timer mas nunca finalizadas: limita a duração a
      // MATINAL_AUTO_FINALIZA_MIN e grava de volta, marcando como automática.
      const matinaisAutoFinalizadas: { sala: string; data: string }[] = []
      const horarioFinalEfetivoPorChave = new Map<string, string>()
      for (const m of matinaisRaw ?? []) {
        let horarioFinalISO = m.horario_final as string | null
        if (!horarioFinalISO && m.horario_inicio) {
          const inicio = new Date(m.horario_inicio)
          const cap = new Date(inicio.getTime() + MATINAL_AUTO_FINALIZA_MIN * 60000)
          if (Date.now() >= cap.getTime()) {
            const meta = metaMatinalMinutos(m.data)
            await supabase.from('matinal_tml').update({
              horario_final: cap.toISOString(),
              meta_minutos: meta,
              duracao_minutos: MATINAL_AUTO_FINALIZA_MIN,
              estouro_duracao: true,
              finalizado_automaticamente: true,
            }).eq('id', m.id)
            horarioFinalISO = cap.toISOString()
            matinaisAutoFinalizadas.push({ sala: m.sala, data: m.data })
          }
        }
        if (horarioFinalISO) {
          const d = new Date(horarioFinalISO)
          const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          horarioFinalEfetivoPorChave.set(`${m.sala}|${m.data}`, hhmm)
        }
      }

      let semHorario = 0
      let semSala = 0
      const linhas = checklist.map((c) => {
        const matricula = matriculaPorMapa.get(c.mapa) ?? null
        const sala = matricula != null ? salaPorMatricula.get(matricula) ?? null : null
        if (!isSalaTML(sala)) semSala++
        if (!c.horarioInicio) semHorario++
        let tempoDeslocamento: number | null = null
        if (isSalaTML(sala) && c.horarioInicio && c.data) {
          const matinalFinal = horarioFinalEfetivoPorChave.get(`${sala}|${c.data}`) ?? horarioFinalMatinalPadrao(sala, c.data)
          tempoDeslocamento = tempoDeslocamentoComMatinalReal(matinalFinal, c.horarioInicio)
        }
        return {
          filial: usuario.filial,
          mapa: c.mapa,
          placa: c.placa,
          matricula,
          nome: c.nome,
          sala,
          data: c.data,
          horario_inicio: c.horarioInicio,
          horario_final: c.horarioFinal,
          tempo_deslocamento_minutos: tempoDeslocamento,
        }
      })

      const { error } = await supabase.from('checklist_tml').upsert(linhas, { onConflict: 'filial,mapa' })
      if (error) throw new Error(error.message)

      const avisoMatinal = matinaisAutoFinalizadas.length > 0
        ? `\n\n⚠️ ${matinaisAutoFinalizadas.length} matinal(is) não foram finalizadas no timer e tiveram a duração limitada a ${MATINAL_AUTO_FINALIZA_MIN} min automaticamente:\n` +
          matinaisAutoFinalizadas.map((m) => `• ${SALA_TML_LABEL[m.sala as SalaTML] ?? m.sala} — ${formatarDataBR(m.data)}`).join('\n') +
          `\nConfira em "Timer da Matinal" se o horário está correto.`
        : ''

      alert(
        `${checklist.length} registro(s) de checklist importado(s).\n\n` +
        `• ${semSala} sem sala identificada\n` +
        `• ${semHorario} sem horário de início do checklist` +
        avisoMatinal
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar checklist')
    } finally {
      setUploadingChecklist(false)
    }
  }

  async function handleEnviarResumoGerencial() {
    if (!usuario) return
    setEnviandoResumoGerencial(true)
    setErro('')
    try {
      const { data: filialRow } = await supabase
        .from('filiais')
        .select('grupo_tml_gerencia_whatsapp')
        .eq('nome', usuario.filial)
        .maybeSingle()
      const grupoId = filialRow?.grupo_tml_gerencia_whatsapp
      if (!grupoId) {
        setErro('Nenhum grupo configurado para o resumo gerencial. Configure em "Config. WhatsApp TML".')
        return
      }

      const hoje = new Date().toISOString().slice(0, 10)
      const resumo = await gerarResumoGerencial(usuario.filial, hoje)
      const resultado = await enviarMensagemGrupo(grupoId, resumo)
      if (!resultado.sucesso) throw new Error(resultado.erro)
      alert('Resumo gerencial enviado.')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar resumo gerencial')
    } finally {
      setEnviandoResumoGerencial(false)
    }
  }

  async function handleEnviarResumoDiario() {
    if (!usuario) return
    setEnviandoResumoDiario(true)
    setErro('')
    try {
      const { data: filialRow } = await supabase
        .from('filiais')
        .select('grupo_tml_diario_whatsapp')
        .eq('nome', usuario.filial)
        .maybeSingle()
      const grupoId = filialRow?.grupo_tml_diario_whatsapp
      if (!grupoId) {
        setErro('Nenhum grupo configurado para o resumo diário. Configure em "Config. WhatsApp TML".')
        return
      }

      const resumo = await gerarResumoDiario(usuario.filial, hojeISO())
      const resultado = await enviarMensagemGrupo(grupoId, resumo)
      if (!resultado.sucesso) throw new Error(resultado.erro)
      alert('Resumo diário enviado.')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar resumo diário')
    } finally {
      setEnviandoResumoDiario(false)
    }
  }

  async function handleEnviarAlerta(alerta: AlertaTML) {
    if (!usuario) return
    setEnviandoAlertaId(alerta.id)
    try {
      const mensagem = montarMensagemTml(alerta)
      const { data: supervisores } = await supabase
        .from('supervisores_tml')
        .select('id, nome, telefone')
        .eq('filial', usuario.filial)
        .eq('sala', alerta.sala)

      if (!supervisores?.length) {
        setErro(`Nenhum supervisor cadastrado para a sala ${SALA_TML_LABEL[alerta.sala] ?? alerta.sala}`)
        return
      }

      const opcoes = motivos
        .slice(0, 10)
        .map((m) => ({
          id: `tmlmotivo:${alerta.id}:${m.motivo}`,
          title: m.motivo.length > 24 ? `${m.motivo.slice(0, 23)}…` : m.motivo,
        }))

      const erros: string[] = []
      for (const sup of supervisores) {
        const resultado = await enviarListaOpcoesWhatsApp(
          sup.telefone,
          mensagem,
          'Motivo da justificativa',
          'Selecionar motivo',
          opcoes
        )
        if (!resultado.sucesso) erros.push(`${sup.nome}: ${resultado.erro}`)
      }

      const { error } = await supabase
        .from('alertas_tml')
        .update({ status: 'enviado', supervisor_id: supervisores[0].id })
        .eq('id', alerta.id)
      if (error) throw new Error(error.message)

      if (erros.length) {
        setErro(`Alerta enviado com falhas:\n${erros.join('\n')}`)
      }
      await fetchAlertas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar alerta')
    } finally {
      setEnviandoAlertaId(null)
    }
  }

  async function handleSalvarJustificativa() {
    if (!justificando || !textoJustificativa.trim()) return
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('alertas_tml')
        .update({
          justificativa: textoJustificativa.trim(),
          status: 'justificado',
          justificado_em: new Date().toISOString(),
        })
        .eq('id', justificando.id)
      if (error) throw new Error(error.message)
      setJustificando(null)
      setTextoJustificativa('')
      setMotivoSelecionado('')
      await fetchAlertas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar justificativa')
    } finally {
      setSalvando(false)
    }
  }

  async function handleAdicionarMotivo() {
    if (!usuario || !novoMotivo.trim()) return
    const motivo = novoMotivo.trim().toUpperCase()
    const { error } = await supabase
      .from('motivos_justificativa_tml')
      .upsert({ filial: usuario.filial, motivo }, { onConflict: 'filial,motivo' })
    if (!error) {
      setNovoMotivo('')
      await fetchMotivos()
    }
  }

  const stats = {
    total: alertas.length,
    pendenteEnvio: alertas.filter((a) => a.status === 'pendente').length,
    aguardandoJustificativa: alertas.filter((a) => a.status === 'enviado').length,
    justificados: alertas.filter((a) => a.status === 'justificado').length,
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Distribuição — Carta de Controle TML</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento automático de saída na portaria (COLORADO e SUB-FURIA)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/distribuicao/tml/analise" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <BarChart2 className="h-4 w-4" /> Análise
          </Link>
          <Link to="/distribuicao/tml/motoristas" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <UserCog className="h-4 w-4" /> Motoristas
          </Link>
          <Link to="/distribuicao/tml/supervisores" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <Users className="h-4 w-4" /> Supervisores
          </Link>
          <button onClick={fetchAlertas} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            onClick={handleEnviarResumoDiario}
            disabled={enviandoResumoDiario}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {enviandoResumoDiario ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar resumo diário
          </button>
          <button
            onClick={handleEnviarResumoGerencial}
            disabled={enviandoResumoGerencial}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {enviandoResumoGerencial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar resumo gerencial
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <UploadBox
          titulo="1. Escala do dia (03.11.49.02)"
          descricao="Define qual motorista/placa está escalado para cada mapa."
          onFile={handleEscala}
          isUploading={uploadingEscala}
        />
        <UploadBox
          titulo="2. Saída na portaria (03.11.20)"
          descricao="Compara o horário de saída com o limite da sala. Motoristas que perderem o TML ficam pendentes de envio do alerta na tabela abaixo."
          onFile={handleSaida}
          isUploading={uploadingSaida}
        />
        <UploadBox
          titulo="3. Checklist (HR INICIO)"
          descricao="Mede o tempo de deslocamento: quanto tempo depois da matinal o motorista começou o checklist."
          onFile={handleChecklist}
          isUploading={uploadingChecklist}
        />
      </div>

      {statusSaida && (
        <div className="border rounded-lg bg-white">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">Status de saída — hoje</h2>
          </div>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
            {[...statusSaida.entries()].map(([sala, s]) => (
              <div key={sala} className="p-4">
                <p className="text-sm font-medium mb-2">{SALA_TML_LABEL[sala]}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Saíram</p>
                    <p className="text-xl font-bold text-green-600">{s.saidas}/{s.esperado}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Faltam</p>
                    <p className="text-xl font-bold text-blue-600">{s.faltam}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">TML médio</p>
                    <p className="text-xl font-bold">{s.tmlMedio} min</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Alertas</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Pendente de envio</p>
          <p className="text-2xl font-bold text-blue-600">{stats.pendenteEnvio}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Aguardando justificativa</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.aguardandoJustificativa}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Justificados</p>
          <p className="text-2xl font-bold text-green-600">{stats.justificados}</p>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Alertas de TML</h2>
          <p className="text-xs text-muted-foreground">Motoristas que saíram após o limite de tolerância</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : alertas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto opacity-20 mb-3" />
            <p>Nenhum alerta registrado ainda.</p>
            <p className="text-sm mt-1">Importe a escala e a saída para começar o monitoramento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mapa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sala</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motorista</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Limite</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Saída</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atraso</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {alertas.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors align-top">
                    <td className="px-4 py-3 font-mono text-xs">{a.numero}</td>
                    <td className="px-4 py-3">{a.mapa}</td>
                    <td className="px-4 py-3">{SALA_TML_LABEL[a.sala] ?? a.sala}</td>
                    <td className="px-4 py-3">{a.placa ?? '—'}</td>
                    <td className="px-4 py-3">{a.nome ?? '—'} {a.matricula != null && <span className="text-muted-foreground">({a.matricula})</span>}</td>
                    <td className="px-4 py-3">{a.horario_limite}</td>
                    <td className="px-4 py-3">{a.horario_saida}</td>
                    <td className="px-4 py-3">{a.atraso_minutos} min</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                      {a.justificativa && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate" title={a.justificativa}>
                          {a.justificativa}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.status === 'pendente' && (
                        <button
                          onClick={() => handleEnviarAlerta(a)}
                          disabled={enviandoAlertaId === a.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-xs transition-colors ml-auto"
                        >
                          {enviandoAlertaId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {enviandoAlertaId === a.id ? 'Enviando...' : 'Enviar'}
                        </button>
                      )}
                      {a.status === 'enviado' && (
                        <button
                          onClick={() => { setJustificando(a); setTextoJustificativa(''); setMotivoSelecionado('') }}
                          className="px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors"
                        >
                          Registrar justificativa
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Histórico TML</h2>
          <p className="text-xs text-muted-foreground">
            Saídas processadas hoje, dentro ou fora da meta. Para consultar outros dias, acesse a{' '}
            <Link to="/distribuicao/tml/analise" className="text-accent-600 underline">Análise</Link>.
          </p>
        </div>
        {loadingHistorico ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : historico.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto opacity-20 mb-3" />
            <p>Nenhuma saída processada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mapa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sala</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motorista</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Limite</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Saída</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atraso</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historico.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/30 transition-colors align-top">
                    <td className="px-4 py-3">{h.mapa}</td>
                    <td className="px-4 py-3">{h.sala ?? '—'}</td>
                    <td className="px-4 py-3">{h.placa ?? '—'}</td>
                    <td className="px-4 py-3">{h.nome ?? '—'} {h.matricula != null && <span className="text-muted-foreground">({h.matricula})</span>}</td>
                    <td className="px-4 py-3">{h.horario_limite ?? '—'}</td>
                    <td className="px-4 py-3">{h.horario_saida ?? '—'}</td>
                    <td className="px-4 py-3">{h.atraso_minutos != null ? `${h.atraso_minutos} min` : '—'}</td>
                    <td className="px-4 py-3">
                      <ResultadoBadge resultado={h.resultado} />
                      {h.observacao && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate" title={h.observacao}>
                          {h.observacao}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {justificando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Registrar justificativa</h2>
              <button onClick={() => setJustificando(null)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">{justificando.numero} — Mapa {justificando.mapa}</p>
              <label className="block text-sm font-medium text-gray-700">Motivo</label>
              <div className="flex flex-wrap gap-2">
                {motivos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMotivoSelecionado(m.motivo)
                      setTextoJustificativa(m.motivo === 'OUTRO' ? '' : m.motivo)
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      motivoSelecionado === m.motivo ? 'bg-accent-500 text-white border-accent-500' : 'hover:bg-accent'
                    }`}
                  >
                    {m.motivo}
                  </button>
                ))}
              </div>

              {motivoSelecionado === 'OUTRO' && (
                <input
                  value={textoJustificativa}
                  onChange={(e) => setTextoJustificativa(e.target.value)}
                  placeholder="Descreva o motivo"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  autoFocus
                />
              )}

              <div className="pt-2 border-t">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Cadastrar novo motivo</label>
                <div className="flex gap-2">
                  <input
                    value={novoMotivo}
                    onChange={(e) => setNovoMotivo(e.target.value)}
                    placeholder="Ex: PARADA OBRIGATÓRIA"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <button onClick={handleAdicionarMotivo} disabled={!novoMotivo.trim()} className="px-3 py-2 rounded-lg text-sm border hover:bg-accent disabled:opacity-50 transition-colors">
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setJustificando(null)} disabled={salvando} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button
                onClick={handleSalvarJustificativa}
                disabled={salvando || !textoJustificativa.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
