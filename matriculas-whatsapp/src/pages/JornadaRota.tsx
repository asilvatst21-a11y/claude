import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import html2canvas from 'html2canvas'
import {
  Upload, Loader2, RefreshCw, Link2, CheckCircle, AlertTriangle, Clock,
  Route, Send, Calendar, Settings2, Search, ChevronDown, ChevronRight, Image as ImageIcon, Copy, X, TrafficCone,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { parseBeesBuffer, parseBeesVisitasPorPdv, parseRoteirizadorBuffer } from '../lib/tmlParser'
import { enviarMensagemWhatsApp, enviarImagemGrupo, listarGrupos, aguardarEntreEnvios, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import {
  buscarJornadaDoDia, calcularKpis, agruparPorSala,
  montarMensagemJornadaSala, montarMensagemIvSala, montarMensagemAderenciaSala,
  montarMensagemAlertaAderenciaMotorista, ADERENCIA_MINIMA, JORNADA_LIMITE_MIN,
  SALAS_JORNADA, SALA_JORNADA_LABEL, SALA_JORNADA_PARA_TML, formatarDuracao,
  type LinhaJornada, type SalaJornada, type SituacaoJornada, type KpisJornada, type StatusPrevisao,
} from '../lib/jornada'
import { formatarDataBR } from '../lib/utils'
import { formatarBRL } from '../lib/variavelArmazem'
import { ENVIOS_JORNADA_PAUSADOS } from '../lib/whatsappStatus'
import { buscarStatusColaboradoresPorNome, buscarStatusColaboradoresPorTelefone, buscarStatusColaboradoresPorMatricula, podeEnviarPara } from '../lib/statusAtivo'
import {
  buscarFarol, statusEnvioFarol, registrarEnvioFarol,
  type FarolLinha, type StatusFarol, type CategoriaWatchlist,
} from '../lib/farolCriticos'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarPct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

// Indicadores que viram vermelho na tabela quando não estão batendo a meta.
function foraDaMeta(l: LinhaJornada) {
  return {
    aderencia: l.aderencia != null && l.aderencia < ADERENCIA_MINIMA,
    prevChegada: l.tempoPrevMin != null && l.tempoPrevMin > JORNADA_LIMITE_MIN,
    devolucao: l.devolucao > 0,
    foraRaio: l.entregaForaRaio + l.devForaRaio > 0,
    menos4min: l.menos4min > 0,
    not10s: l.not10s > 0,
  }
}

type CampoOrdenacao =
  | 'mapa' | 'saida' | 'previsaoChegada' | 'trRealMin' | 'entregasPrevistas'
  | 'realizadas' | 'pendentes' | 'devolucao' | 'foraRaio' | 'menos4min' | 'not10s'
  | 'aderencia' | 'percConclusao'

const OPCOES_ORDENACAO: { valor: CampoOrdenacao; label: string }[] = [
  { valor: 'mapa', label: 'Mapa' },
  { valor: 'saida', label: 'Saída' },
  { valor: 'previsaoChegada', label: 'Prev. cheg.' },
  { valor: 'trRealMin', label: 'TR Real' },
  { valor: 'entregasPrevistas', label: 'Entregas' },
  { valor: 'realizadas', label: 'Realizadas' },
  { valor: 'pendentes', label: 'Pendentes' },
  { valor: 'devolucao', label: 'Devolução' },
  { valor: 'foraRaio', label: 'F.Raio' },
  { valor: 'menos4min', label: '<4min' },
  { valor: 'not10s', label: 'Not<10s' },
  { valor: 'aderencia', label: 'Aderência' },
  { valor: 'percConclusao', label: '% Concl.' },
]

function valorOrdenacao(l: LinhaJornada, campo: CampoOrdenacao): number {
  switch (campo) {
    case 'mapa': return l.mapa
    case 'saida': {
      const h = l.horaSaidaReal ?? l.horaSaidaPrev
      return h ? Number(h.replace(':', '')) : -1
    }
    case 'previsaoChegada': return l.previsaoChegada ? Number(l.previsaoChegada.replace(':', '')) : -1
    case 'trRealMin': return l.trRealMin ?? -1
    case 'entregasPrevistas': return l.entregasPrevistas ?? -1
    case 'realizadas': return l.realizadas
    case 'pendentes': return l.pendentes ?? -1
    case 'devolucao': return l.devolucao
    case 'foraRaio': return l.entregaForaRaio + l.devForaRaio
    case 'menos4min': return l.menos4min
    case 'not10s': return l.not10s
    case 'aderencia': return l.aderencia ?? -1
    case 'percConclusao': return l.percConclusao ?? -1
  }
}

function SituacaoBadge({ situacao, rotaFinalizada }: { situacao: SituacaoJornada; rotaFinalizada?: boolean }) {
  const selo = rotaFinalizada ? (
    <span title="Confirmado pelo MPD (PC Financeira) — rota já prestou contas" className="ml-1 text-[10px] text-muted-foreground">
      ✓ MPD
    </span>
  ) : null
  if (situacao === 'batendo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
        <CheckCircle className="h-3 w-3" /> Batendo{selo}
      </span>
    )
  }
  if (situacao === 'nao_bate') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100">
        <AlertTriangle className="h-3 w-3" /> Não bate{selo}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-700 bg-gray-100">
      <Clock className="h-3 w-3" /> Em rota
    </span>
  )
}

// Compara a previsão dinâmica (ritmo real projetado) ou o horário real de
// chegada (quando já finalizou) contra a previsão estática do plano. Sem
// entregas suficientes ainda pra confiar no ritmo, mostra "—".
// O horário entra no próprio texto do badge (não só no title/tooltip) —
// a imagem enviada ao grupo não tem como passar o mouse em cima.
function StatusPrevisaoBadge({
  status, previsaoDinamica, concluido,
}: {
  status: StatusPrevisao | null
  previsaoDinamica: string | null
  concluido: boolean
}) {
  const horario = previsaoDinamica ? ` (${previsaoDinamica})` : ''
  if (concluido) {
    const atrasado = status === 'atrasado'
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${atrasado ? 'text-red-700 bg-red-100' : 'text-green-700 bg-green-100'}`}>
        <CheckCircle className="h-3 w-3" /> Finalizado{horario}
      </span>
    )
  }
  if (status === 'adiantado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
        <CheckCircle className="h-3 w-3" /> Adiantado{horario}
      </span>
    )
  }
  if (status === 'atrasado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100">
        <AlertTriangle className="h-3 w-3" /> Atrasado{horario}
      </span>
    )
  }
  if (status === 'no_prazo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-700 bg-gray-100">
        <Clock className="h-3 w-3" /> No Prazo{horario}
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">—</span>
}

function ImportBox({
  titulo, descricao, onFile, isUploading, statusLine,
}: {
  titulo: string
  descricao: string
  onFile: (file: File) => void
  isUploading: boolean
  statusLine: string | null
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
        <p className="text-sm font-medium">{isUploading ? 'Processando...' : 'Clique para importar'}</p>
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
      {statusLine && <p className="text-xs text-muted-foreground mt-2">{statusLine}</p>}
    </div>
  )
}

// Marcador de caminhão (mesmo desenho do ícone Truck do lucide-react) — cada
// ponto da Carta de Controle é um mapa em rota, faz mais sentido que uma
// bolinha genérica. Cor segue a mesma lógica de "bate jornada" (verde/
// amarelo/vermelho).
function CaminhaoMarcador({ x, y, cor, titulo }: { x: number; y: number; cor: string; titulo: string }) {
  const s = 14
  return (
    <g
      transform={`translate(${x - s / 2} ${y - s / 2}) scale(${s / 24})`}
      stroke={cor}
      strokeWidth={2.4}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{titulo}</title>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </g>
  )
}

// Cor do caminhão na Carta de Controle: verde = 100% concluído (dentro do
// prazo), amarelo = ainda em rota mas dentro do limite de 10h20, vermelho =
// estourou o limite de 10h20 — em rota ou já concluído depois da hora.
function corConclusao(l: { concl: number; trRealMin: number | null }): string {
  const estourou = l.trRealMin != null && l.trRealMin > JORNADA_LIMITE_MIN
  if (estourou) return '#ef4444'
  return l.concl >= 1 ? '#22c55e' : '#eab308'
}

// Carta de controle: X = % de conclusão da rota, Y = previsão de chegada
// (horário), esticado até 21h pra cobrir entregas até o fim da noite.
function CartaControle({ linhas }: { linhas: LinhaJornada[] }) {
  const pontos = linhas
    .map((l) => {
      if (!l.previsaoChegada || l.percConclusao == null) return null
      const [h, m] = l.previsaoChegada.split(':').map(Number)
      return { mapa: l.mapa, minutos: h * 60 + m, concl: l.percConclusao, trRealMin: l.trRealMin }
    })
    .filter((p): p is { mapa: number; minutos: number; concl: number; trRealMin: number | null } => p !== null)

  if (pontos.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sem dados suficientes pra desenhar a carta ainda.</p>
  }

  const minMin = Math.min(...pontos.map((p) => p.minutos)) - 30
  const maxMin = Math.max(21 * 60, Math.max(...pontos.map((p) => p.minutos)) + 30)
  const W = 720, H = 300, padL = 50, padR = 20, padT = 14, padB = 30
  const plotW = W - padL - padR, plotH = H - padT - padB
  const x = (concl: number) => padL + concl * plotW
  const y = (min: number) => padT + ((min - minMin) / Math.max(maxMin - minMin, 1)) * plotH

  const horasEixo: number[] = []
  for (let m = Math.ceil(minMin / 60) * 60; m <= maxMin; m += 60) horasEixo.push(m)

  // Zonas de horário (única faixa de fundo, no eixo Y): melhor até 16h,
  // meio-termo até 18h30, ruim depois disso.
  const clampMin = (m: number) => Math.min(Math.max(m, minMin), maxMin)
  const yMelhor = y(clampMin(16 * 60))
  const yRuim = y(clampMin(18 * 60 + 30))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} fontFamily="system-ui" fontSize="10">
      <rect x={padL} y={padT} width={plotW} height={yMelhor - padT} fill="#dcfce7" opacity={0.5} />
      <rect x={padL} y={yMelhor} width={plotW} height={yRuim - yMelhor} fill="#fef9c3" opacity={0.5} />
      <rect x={padL} y={yRuim} width={plotW} height={H - padB - yRuim} fill="#fee2e2" opacity={0.5} />
      {Array.from({ length: 11 }, (_, i) => i * 10).map((pct) => (
        <line key={pct} x1={x(pct / 100)} y1={padT} x2={x(pct / 100)} y2={H - padB} stroke="#e2e8f0" strokeDasharray={pct === 0 || pct === 100 ? undefined : '2 3'} />
      ))}
      {horasEixo.map((m) => (
        <line key={m} x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke="#f1f5f9" />
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#cbd5e1" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#cbd5e1" />
      {Array.from({ length: 11 }, (_, i) => i * 10).map((pct) => (
        <text key={pct} x={x(pct / 100)} y={H - padB + 14} textAnchor="middle" fill="#94a3b8">{pct}%</text>
      ))}
      {horasEixo.map((m) => (
        <text key={m} x={padL - 6} y={y(m) + 3} textAnchor="end" fill="#94a3b8">
          {String(Math.floor(m / 60) % 24).padStart(2, '0')}:00
        </text>
      ))}
      {pontos.map((p) => (
        <g key={p.mapa}>
          <text x={x(p.concl)} y={y(p.minutos) - 8} textAnchor="middle" fill="#64748b" fontSize="8.5">
            {String(Math.floor(p.minutos / 60)).padStart(2, '0')}:{String(p.minutos % 60).padStart(2, '0')}
          </text>
          <CaminhaoMarcador
            x={x(p.concl)}
            y={y(p.minutos)}
            cor={corConclusao(p)}
            titulo={`Mapa ${p.mapa} — ${formatarPct(p.concl)} conclusão, prev. ${String(Math.floor(p.minutos / 60)).padStart(2, '0')}:${String(p.minutos % 60).padStart(2, '0')}`}
          />
        </g>
      ))}
    </svg>
  )
}

// Versão da Carta de Controle pronta pra virar imagem — mesmo gráfico da
// tela (X = previsão de chegada, Y = % de conclusão, caminhão colorido por
// situação), envolvido num card com cabeçalho/legenda, igual ao padrão dos
// outros exports.
const CartaControleExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  data: string
  linhas: LinhaJornada[]
}>(function CartaControleExportTemplate({ filial, data, linhas }, ref) {
  if (linhas.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  const legenda: { cor: string; label: string }[] = [
    { cor: '#22c55e', label: '100% concluído' },
    { cor: '#eab308', label: 'Em rota (< 10h20)' },
    { cor: '#ef4444', label: '> 10h20 (em rota ou concluído)' },
  ]

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '780px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '18px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Jornada e Tempo em Rota</p>
          <h1 style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Carta de Controle da Jornada</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0, lineHeight: 1.5 }}>{filial}<br />{formatarDataBR(data)}</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px 6px' }}>
        <CartaControle linhas={linhas} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', marginTop: '10px', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          {legenda.map((l) => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#475569' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.cor, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
        <p style={{ fontSize: '9.5px', color: '#94a3b8', margin: 0 }}>Eixo X: % de conclusão · Eixo Y: previsão de chegada</p>
      </div>
    </div>
  )
})

// Imagem enviada ao grupo do CDD no lugar da mensagem de texto — acumulado
// (geral ou só da sala, conforme `titulo`) no topo, depois a relação de
// mapas ordenada por % de conclusão (do menor pro maior, pra quem está mais
// atrasado aparecer primeiro). Mesmo critério de "fora da meta" da tela, em
// vermelho.
const JornadaExportTemplate = forwardRef<HTMLDivElement, {
  titulo: string
  filial: string
  data: string
  kpis: KpisJornada
  linhas: LinhaJornada[]
}>(function JornadaExportTemplate({ titulo, filial, data, kpis, linhas }, ref) {
  const th: React.CSSProperties = { padding: '5px 6px', fontSize: '8px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '4px 6px', fontSize: '9px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap' }
  const bad: React.CSSProperties = { color: '#dc2626', fontWeight: 700 }

  if (linhas.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  const ordenadas = [...linhas].sort((a, b) => (a.percConclusao ?? -1) - (b.percConclusao ?? -1))

  const stats: { label: string; valor: string; cor?: string }[] = [
    { label: 'Mapas', valor: String(kpis.mapas) },
    { label: 'Entregas', valor: `${kpis.entregasRealizadas}/${kpis.entregasTotal}` },
    { label: '% Concl.', valor: formatarPct(kpis.percConclusaoMedio), cor: '#16a34a' },
    { label: 'Devolução', valor: formatarPct(kpis.devolucaoPct), cor: '#dc2626' },
    { label: 'IV', valor: formatarPct(kpis.iv), cor: '#dc2626' },
  ]

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '1080px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '18px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Jornada e Tempo em Rota</p>
          <h1 style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Resumo da Operação — {titulo}</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0, lineHeight: 1.5 }}>{filial}<br />{formatarDataBR(data)}</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {stats.map((c) => (
          <div key={c.label} style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 700 }}>{c.label}</p>
            <p style={{ fontSize: '17px', fontWeight: 800, color: c.cor ?? '#0f172a', margin: 0 }}>{c.valor}</p>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={th}>Mapa</th>
            <th style={th}>Placa</th>
            <th style={th}>Motorista</th>
            <th style={th}>Sala</th>
            <th style={th}>Saída</th>
            <th style={th}>Prev. cheg.</th>
            <th style={th}>Previsão</th>
            <th style={{ ...th, textAlign: 'right' }}>TR Real</th>
            <th style={th}>Bate Jornada?</th>
            <th style={{ ...th, textAlign: 'right' }}>Entr.</th>
            <th style={{ ...th, textAlign: 'right' }}>Realiz.</th>
            <th style={{ ...th, textAlign: 'right' }}>Pend.</th>
            <th style={{ ...th, textAlign: 'right' }}>Devol.</th>
            <th style={{ ...th, textAlign: 'right' }}>F.Raio</th>
            <th style={{ ...th, textAlign: 'right' }}>&lt;4min</th>
            <th style={{ ...th, textAlign: 'right' }}>Not&lt;10s</th>
            <th style={{ ...th, textAlign: 'right' }}>Aderênc.</th>
            <th style={{ ...th, textAlign: 'right' }}>% Concl.</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l, i) => {
            const alerta = foraDaMeta(l)
            const foraRaio = l.entregaForaRaio + l.devForaRaio
            return (
              <tr key={l.mapa} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{l.mapa}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{l.placa ?? '—'}</td>
                <td style={td}>{l.nome ?? '—'}</td>
                <td style={td}>{SALA_JORNADA_LABEL[l.sala]}</td>
                <td style={td}>{l.horaSaidaReal ?? l.horaSaidaPrev ?? '—'}</td>
                <td style={{ ...td, ...(alerta.prevChegada ? bad : {}) }}>{l.previsaoChegada ?? '—'}</td>
                <td style={td}>
                  {(() => {
                    const concluido = l.percConclusao != null && l.percConclusao >= 1
                    const horario = l.previsaoChegadaDinamica ? ` (${l.previsaoChegadaDinamica})` : ''
                    const atrasado = l.statusPrevisao === 'atrasado'
                    let texto: string
                    let bg: string, fg: string
                    if (concluido) {
                      texto = `Finalizado${horario}`
                      bg = atrasado ? '#fee2e2' : '#dcfce7'; fg = atrasado ? '#b91c1c' : '#15803d'
                    } else if (l.statusPrevisao === 'adiantado') {
                      texto = `Adiantado${horario}`; bg = '#dcfce7'; fg = '#15803d'
                    } else if (l.statusPrevisao === 'atrasado') {
                      texto = `Atrasado${horario}`; bg = '#fee2e2'; fg = '#b91c1c'
                    } else if (l.statusPrevisao === 'no_prazo') {
                      texto = `No Prazo${horario}`; bg = '#f1f5f9'; fg = '#475569'
                    } else {
                      texto = '—'; bg = '#f1f5f9'; fg = '#475569'
                    }
                    return (
                      <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '999px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', background: bg, color: fg }}>
                        {texto}
                      </span>
                    )
                  })()}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{l.trRealMin != null ? formatarDuracao(l.trRealMin) : '—'}</td>
                <td style={td}>
                  <span style={{
                    display: 'inline-block', padding: '1px 7px', borderRadius: '999px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase',
                    background: l.situacao === 'batendo' ? '#dcfce7' : l.situacao === 'nao_bate' ? '#fee2e2' : '#f1f5f9',
                    color: l.situacao === 'batendo' ? '#15803d' : l.situacao === 'nao_bate' ? '#b91c1c' : '#475569',
                  }}>
                    {l.situacao === 'batendo' ? 'Batendo' : l.situacao === 'nao_bate' ? 'Não bate' : 'Em rota'}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{l.entregasPrevistas ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{l.realizadas}</td>
                <td style={{ ...td, textAlign: 'right' }}>{l.pendentes ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right', ...(alerta.devolucao ? bad : {}) }}>{l.devolucao}</td>
                <td style={{ ...td, textAlign: 'right', ...(alerta.foraRaio ? bad : {}) }}>{foraRaio}</td>
                <td style={{ ...td, textAlign: 'right', ...(alerta.menos4min ? bad : {}) }}>{l.menos4min}</td>
                <td style={{ ...td, textAlign: 'right', ...(alerta.not10s ? bad : {}) }}>{l.not10s}</td>
                <td style={{ ...td, textAlign: 'right', ...(alerta.aderencia ? bad : {}) }}>{formatarPct(l.aderencia)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatarPct(l.percConclusao)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ paddingTop: '10px', marginTop: '14px', borderTop: '1px solid #e2e8f0', fontSize: '9.5px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(data)} · ordenado por % de conclusão (menor pro maior)
      </div>
    </div>
  )
})

const FAROL_STATUS_CSS: Record<StatusFarol, { bg: string; border: string; fg: string }> = {
  pendente: { bg: '#fefce8', border: '#fde68a', fg: '#854d0e' },
  iniciado: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
  concluido: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
  atencao: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
  sem_mapa: { bg: '#f1f5f9', border: '#e2e8f0', fg: '#64748b' },
}
const FAROL_STATUS_ORDEM: Record<StatusFarol, number> = { atencao: 0, pendente: 1, iniciado: 2, sem_mapa: 3, concluido: 4 }
const FAROL_CATEGORIA_CURTA: Record<CategoriaWatchlist, string> = {
  pdv_critico: 'Crítico', mercado_sellerze: 'Seller Zé', mercado_trava: 'Trava',
}
const FAROL_CATEGORIA_CSS: Record<CategoriaWatchlist, { bg: string; fg: string }> = {
  pdv_critico: { bg: '#fee2e2', fg: '#b91c1c' },
  mercado_sellerze: { bg: '#ede9fe', fg: '#6d28d9' },
  mercado_trava: { bg: '#fef3c7', fg: '#92400e' },
}

// Imagem enviada ao grupo do Farol de Críticos a cada import do BEES —
// só PDVs com mapa hoje (venda do dia); quem não roda hoje só polui a
// imagem e não diz nada sobre o dia. Quem está em Atenção/Pendente
// aparece primeiro, mesmo critério de priorização dos exports de Jornada.
const FarolExportTemplate = forwardRef<HTMLDivElement, { filial: string; data: string; linhas: FarolLinha[] }>(
  function FarolExportTemplate({ filial, data, linhas }, ref) {
    const doDia = linhas.filter((l) => l.mapa != null)
    if (doDia.length === 0) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

    const ordenadas = [...doDia].sort((a, b) => FAROL_STATUS_ORDEM[a.statusFarol] - FAROL_STATUS_ORDEM[b.statusFarol])
    const kpis: Record<StatusFarol, number> = { pendente: 0, iniciado: 0, concluido: 0, atencao: 0, sem_mapa: 0 }
    for (const l of doDia) kpis[l.statusFarol]++
    const concluidos = kpis.concluido
    const pctConcluido = doDia.length > 0 ? Math.round((concluidos / doDia.length) * 100) : 0

    const th: React.CSSProperties = { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left', whiteSpace: 'nowrap' }
    const td: React.CSSProperties = { padding: '11px 12px', fontSize: '13px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' }
    const badge = (bg: string, fg: string, border?: string): React.CSSProperties => ({
      display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
      border: `1px solid ${border ?? bg}`, background: bg, color: fg, whiteSpace: 'nowrap', lineHeight: 1.3,
    })

    return (
      <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '1160px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #1e3a5f', paddingBottom: '16px', marginBottom: '22px' }}>
          <div>
            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>Farol de Mercados e PDVs Críticos</p>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Status de Entrega do Dia</h1>
          </div>
          <p style={{ fontSize: '15px', color: '#475569', textAlign: 'right', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>{filial}<br />{formatarDataBR(data)}</p>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          {(['pendente', 'iniciado', 'concluido', 'atencao'] as StatusFarol[]).map((s) => {
            const c = FAROL_STATUS_CSS[s]
            const label = s === 'pendente' ? 'Pendente' : s === 'iniciado' ? 'Iniciado' : s === 'concluido' ? 'Concluído' : 'Atenção'
            return (
              <div key={s} style={{ flex: 1, borderRadius: '10px', padding: '14px 16px', border: `1px solid ${c.border}`, background: c.bg }}>
                <p style={{ fontSize: '28px', fontWeight: 800, margin: 0, lineHeight: 1, color: c.fg }}>{kpis[s]}</p>
                <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', margin: '5px 0 0', color: c.fg }}>{label}</p>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>{concluidos}/{doDia.length} concluídos</span>
          <div style={{ flex: 1, height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pctConcluido}%`, background: 'linear-gradient(90deg,#16a34a,#22c55e)' }} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>{pctConcluido}%</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#1e3a5f' }}>
              <th style={th}>PDV</th><th style={th}>Categoria</th><th style={{ ...th, textAlign: 'center' }}>Mapa</th><th style={th}>Motorista</th>
              <th style={{ ...th, textAlign: 'center' }}>Placa</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Valor NF</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l, i) => {
              const c = FAROL_STATUS_CSS[l.statusFarol]
              const cat = FAROL_CATEGORIA_CSS[l.categoria]
              return (
                <tr key={l.watchlistId} style={{ background: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{l.nome}</span>
                    <br /><span style={{ color: '#94a3b8', fontSize: '11px' }}>{l.codigo}</span>
                  </td>
                  <td style={td}><span style={badge(cat.bg, cat.fg)}>{FAROL_CATEGORIA_CURTA[l.categoria]}</span></td>
                  <td style={{ ...td, textAlign: 'center' }}>{l.mapa}</td>
                  <td style={td}>{l.motorista ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{l.placa ?? '—'}</td>
                  <td style={td}><span style={badge(c.bg, c.fg, c.border)}>{l.statusLabel}</span></td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{l.valorNota != null ? formatarBRL(l.valorNota) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', marginTop: '14px', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Farol de Mercados e PDVs Críticos · só PDVs com mapa hoje · atualizado a cada import do BEES</p>
          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Gerado automaticamente</p>
        </div>
      </div>
    )
  }
)

export default function JornadaRota() {
  const { usuario } = useAuth()
  const [dataOperacao, setDataOperacao] = useState(hojeISO)
  const [linhas, setLinhas] = useState<LinhaJornada[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingBees, setUploadingBees] = useState(false)
  const [uploadingRot, setUploadingRot] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [filtroSala, setFiltroSala] = useState<SalaJornada | 'todos'>('todos')
  const [relatorioAberto, setRelatorioAberto] = useState(true)
  const [ordenarPor, setOrdenarPor] = useState<CampoOrdenacao>('mapa')
  const [ordemDesc, setOrdemDesc] = useState(false)
  const [configAberta, setConfigAberta] = useState(false)
  const [grupoJornada, setGrupoJornada] = useState('')
  const [grupoJornadaOriginal, setGrupoJornadaOriginal] = useState('')
  const [numeroExtraAderencia, setNumeroExtraAderencia] = useState('')
  const [numeroExtraAderenciaOriginal, setNumeroExtraAderenciaOriginal] = useState('')
  const [ultimoImportBees, setUltimoImportBees] = useState<string | null>(null)
  const [ultimoImportRot, setUltimoImportRot] = useState<string | null>(null)
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroGrupos, setErroGrupos] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [imagemAtual, setImagemAtual] = useState<{ titulo: string; kpis: KpisJornada; linhas: LinhaJornada[] } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartLinhas, setChartLinhas] = useState<LinhaJornada[]>([])
  const [gerandoCopiar, setGerandoCopiar] = useState(false)
  const [copiarAberto, setCopiarAberto] = useState(false)
  const [copiarTexto, setCopiarTexto] = useState('')
  const [copiarImagens, setCopiarImagens] = useState<{ titulo: string; img: string }[]>([])
  const [copiarFeedback, setCopiarFeedback] = useState<string | null>(null)
  const farolExportRef = useRef<HTMLDivElement>(null)
  const [farolImagemAtual, setFarolImagemAtual] = useState<FarolLinha[] | null>(null)
  const [testandoFarol, setTestandoFarol] = useState(false)

  const fetchJornada = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const lista = await buscarJornadaDoDia(usuario.filial, dataOperacao)
    setLinhas(lista)
    setLoading(false)
  }, [usuario, dataOperacao])

  const fetchConfig = useCallback(async () => {
    if (!usuario) return
    const { data } = await supabase
      .from('filiais')
      .select('grupo_jornada_whatsapp, numero_extra_aderencia_whatsapp')
      .eq('nome', usuario.filial)
      .maybeSingle()
    const v = data?.grupo_jornada_whatsapp ?? ''
    setGrupoJornada(v)
    setGrupoJornadaOriginal(v)
    const n = data?.numero_extra_aderencia_whatsapp ?? ''
    setNumeroExtraAderencia(n)
    setNumeroExtraAderenciaOriginal(n)
  }, [usuario])

  async function buscarGruposZapi() {
    setBuscandoGrupos(true)
    setErroGrupos(null)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscandoGrupos(false)
    if (erro) { setErroGrupos(erro); return }
    if (gs.length === 0) { setErroGrupos('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function copiarId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const fetchUltimosImports = useCallback(async () => {
    if (!usuario) return
    const [{ data: b }, { data: r }] = await Promise.all([
      supabase.from('jornada_bees').select('importado_em').eq('filial', usuario.filial).eq('data', dataOperacao).order('importado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('jornada_roteirizador').select('importado_em').eq('filial', usuario.filial).eq('data', dataOperacao).order('importado_em', { ascending: false }).limit(1).maybeSingle(),
    ])
    setUltimoImportBees(b?.importado_em ?? null)
    setUltimoImportRot(r?.importado_em ?? null)
  }, [usuario, dataOperacao])

  useEffect(() => { fetchJornada() }, [fetchJornada])
  useEffect(() => { fetchConfig() }, [fetchConfig])
  useEffect(() => { fetchUltimosImports() }, [fetchUltimosImports])

  async function handleImportarBees(file: File) {
    if (!usuario) return
    setUploadingBees(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const agregados = parseBeesBuffer(buffer)
      if (agregados.length === 0) {
        throw new Error('Nenhum registro encontrado na planilha. Confira se é o export do BEES (Tracking).')
      }

      const agora = new Date().toISOString()
      const rows = agregados.map((a) => ({
        filial: usuario.filial,
        mapa: a.mapa,
        data: dataOperacao,
        realizadas: a.realizadas,
        devolucao: a.devolucao,
        repasse: a.repasse,
        entrega_fora_raio: a.entregaForaRaio,
        dev_fora_raio: a.devForaRaio,
        menos_4min: a.menos4min,
        not_10s: a.not10s,
        tempo_real_medio_min: a.tempoRealMedioMin,
        ultima_finalizacao: a.ultimaFinalizacao,
        importado_em: agora,
      }))
      const { error } = await supabase.from('jornada_bees').upsert(rows, { onConflict: 'filial,mapa,data' })
      if (error) throw new Error(error.message)

      // Mesmo arquivo, mantendo a linha por PDV — alimenta o Farol de
      // Mercados e PDVs Críticos (Distribuição). Não bloqueia o import
      // principal se falhar: só registra no console.
      try {
        const visitas = parseBeesVisitasPorPdv(buffer)
        if (visitas.length > 0) {
          await supabase.from('distribuicao_bees_visitas').delete().eq('filial', usuario.filial).eq('data', dataOperacao)
          const visitaRows = visitas.map((v) => ({
            filial: usuario.filial, data: dataOperacao, mapa: v.mapa,
            pdv_codigo: v.pdvCodigo, pdv_nome: v.pdvNome, status: v.status,
            importado_em: agora,
          }))
          const BATCH = 500
          for (let i = 0; i < visitaRows.length; i += BATCH) {
            const { error: erroVisitas } = await supabase.from('distribuicao_bees_visitas').insert(visitaRows.slice(i, i + BATCH))
            if (erroVisitas) { console.error('[Jornada] falha ao salvar visitas por PDV:', erroVisitas.message); break }
          }
        }
      } catch (e) {
        console.error('[Jornada] falha ao processar BEES por PDV:', e)
      }

      await fetchJornada()
      await fetchUltimosImports()

      // Envio automático a cada import do BEES (Tracking), conforme combinado.
      const errosEnvio = await enviarMensagensAutomatico()
      if (errosEnvio.length > 0) console.error('[Jornada] falhas no envio automático:', errosEnvio)

      // Imagem do Farol de Mercados e PDVs Críticos — mesmo gatilho do
      // import do BEES. Não bloqueia o import se falhar, mas avisa no alerta
      // final (exceto motivos esperados, como já ter finalizado hoje).
      let avisoFarol = ''
      try {
        const resultado = await enviarImagemFarolCriticos()
        if (!resultado.ok && resultado.motivo !== 'Envio já finalizado hoje (todos os PDVs já estavam concluídos).') {
          avisoFarol = `\n\n⚠️ Farol de Críticos não enviado: ${resultado.motivo}`
        }
      } catch (e) {
        console.error('[Jornada] falha ao enviar imagem do Farol de Críticos:', e)
        avisoFarol = `\n\n⚠️ Farol de Críticos não enviado: ${e instanceof Error ? e.message : String(e)}`
      }

      alert(
        `${agregados.length} mapa(s) atualizado(s) a partir do BEES. Mensagens enviadas por sala + resumo do CDD.` +
        avisoFarol +
        (errosEnvio.length > 0 ? `\n\n⚠️ Falhas no envio:\n${errosEnvio.join('\n')}` : '')
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o BEES')
    } finally {
      setUploadingBees(false)
    }
  }

  async function handleImportarRoteirizador(file: File) {
    if (!usuario) return
    setUploadingRot(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const linhasArquivo = parseRoteirizadorBuffer(buffer)
      if (linhasArquivo.length === 0) {
        throw new Error('Nenhuma placa encontrada na planilha. Confira se é o export do Roteirizador.')
      }

      // O Roteirizador não traz o mapa — casa por placa com a escala do
      // mesmo dia (mesma lógica que a planilha original faz por VLOOKUP).
      const placas = [...new Set(linhasArquivo.map((l) => l.placa))]
      const { data: escalas } = await supabase
        .from('escalas_tml')
        .select('mapa, placa')
        .eq('filial', usuario.filial)
        .eq('data_entrega', dataOperacao)
        .in('placa', placas)
      const mapaPorPlaca = new Map((escalas ?? []).map((e) => [e.placa, e.mapa]))

      const agora = new Date().toISOString()
      const rows: { filial: string; mapa: number; placa: string; data: string; tempo_dirigindo_min: number | null; importado_em: string }[] = []
      let semMapa = 0
      for (const l of linhasArquivo) {
        const mapa = mapaPorPlaca.get(l.placa)
        if (mapa == null) { semMapa++; continue }
        rows.push({ filial: usuario.filial, mapa, placa: l.placa, data: dataOperacao, tempo_dirigindo_min: l.tempoDirigindoMin, importado_em: agora })
      }
      if (rows.length === 0) {
        throw new Error('Nenhuma placa do Roteirizador bateu com a escala do dia. Importe a escala (03.11.49.02) antes.')
      }

      const { error } = await supabase.from('jornada_roteirizador').upsert(rows, { onConflict: 'filial,mapa,data' })
      if (error) throw new Error(error.message)

      await fetchJornada()
      await fetchUltimosImports()

      alert(
        `${rows.length} rota(s) do Roteirizador vinculada(s) ao mapa do dia.` +
        (semMapa > 0 ? `\n\n⚠️ ${semMapa} placa(s) não encontrada(s) na escala de ${formatarDataBR(dataOperacao)}.` : '')
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o Roteirizador')
    } finally {
      setUploadingRot(false)
    }
  }

  // Gera e manda a imagem do Farol de Mercados e PDVs Críticos pro grupo
  // configurado. Repete a cada import do BEES; para sozinha quando todos os
  // PDVs da watchlist do dia já estiverem "Concluído" nessa mesma data.
  // Cada "saída antecipada" loga o motivo no console — sem isso, um erro
  // aqui (migração não rodada, grupo não configurado, Z-API fora do ar)
  // acontecia calado, sem nenhum jeito de diagnosticar.
  async function enviarImagemFarolCriticos(): Promise<{ ok: boolean; motivo: string }> {
    if (!usuario) return { ok: false, motivo: 'Sem usuário logado.' }

    const { data: filialConfig, error: erroFilial } = await supabase
      .from('filiais').select('grupo_farol_criticos_whatsapp').eq('nome', usuario.filial).maybeSingle()
    if (erroFilial) {
      console.error('[Farol Críticos] falha ao ler grupo configurado (rodou a migração?):', erroFilial.message)
      return { ok: false, motivo: `Erro ao ler configuração: ${erroFilial.message}` }
    }
    const grupo = filialConfig?.grupo_farol_criticos_whatsapp
    if (!grupo) {
      console.warn('[Farol Críticos] nenhum grupo configurado — configure em Farol de Críticos → Config. WhatsApp.')
      return { ok: false, motivo: 'Nenhum grupo de WhatsApp configurado pro Farol de Críticos.' }
    }

    const { finalizado } = await statusEnvioFarol(usuario.filial, dataOperacao)
    if (finalizado) {
      console.info('[Farol Críticos] envio já finalizado hoje (todos concluídos) — não reenvia.')
      return { ok: false, motivo: 'Envio já finalizado hoje (todos os PDVs já estavam concluídos).' }
    }

    const farol = await buscarFarol(usuario.filial, dataOperacao)
    // Só entra na imagem/no critério de "tudo concluído" quem tem mapa hoje
    // (venda do dia) — o resto da watchlist (sem mapa) não diz nada sobre o
    // dia e, se contasse, o envio nunca "finalizaria" (item sem mapa nunca
    // fica concluído).
    const farolDoDia = farol.filter((l) => l.mapa != null)
    if (farolDoDia.length === 0) {
      console.warn('[Farol Críticos] nenhum PDV da watchlist com mapa hoje em', dataOperacao)
      return { ok: false, motivo: 'Nenhum PDV da watchlist com mapa hoje — nada pra mostrar.' }
    }

    flushSync(() => setFarolImagemAtual(farolDoDia))
    await new Promise((r) => setTimeout(r, 60))
    if (!farolExportRef.current) {
      console.error('[Farol Críticos] template de exportação não renderizou.')
      return { ok: false, motivo: 'Falha interna ao gerar a imagem (template não renderizou).' }
    }
    const canvas = await html2canvas(farolExportRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
    const img = canvas.toDataURL('image/png')
    setFarolImagemAtual(null)

    const envio = await enviarImagemGrupo(grupo, img, `📊 Farol de Críticos — ${formatarDataBR(dataOperacao)}`)
    if (!envio.sucesso) {
      console.error('[Farol Críticos] Z-API recusou o envio da imagem:', envio.erro)
      return { ok: false, motivo: `Z-API recusou o envio: ${envio.erro ?? 'erro desconhecido'}` }
    }

    const tudoConcluido = farolDoDia.every((l) => l.statusFarol === 'concluido')
    await registrarEnvioFarol(usuario.filial, dataOperacao, tudoConcluido)
    return { ok: true, motivo: 'Enviado.' }
  }

  async function enviarMensagensAutomatico(): Promise<string[]> {
    if (!usuario) return []
    if (ENVIOS_JORNADA_PAUSADOS) return []
    const erros: string[] = []
    const lista = await buscarJornadaDoDia(usuario.filial, dataOperacao)
    const porSala = agruparPorSala(lista)

    const [{ data: filialConfig }, statusPorNome, statusPorTelefone, statusPorMatricula] = await Promise.all([
      supabase
        .from('filiais')
        .select('grupo_jornada_whatsapp, numero_extra_aderencia_whatsapp')
        .eq('nome', usuario.filial)
        .maybeSingle(),
      buscarStatusColaboradoresPorNome(usuario.filial),
      buscarStatusColaboradoresPorTelefone(usuario.filial),
      buscarStatusColaboradoresPorMatricula(usuario.filial),
    ])
    // Aceita mais de um número no mesmo campo, separados por vírgula/;/quebra de linha.
    const numerosExtra = (filialConfig?.numero_extra_aderencia_whatsapp ?? '')
      .split(/[,;\n]/).map((n: string) => n.trim()).filter(Boolean)

    for (const sala of SALAS_JORNADA) {
      const linhasSala = porSala.get(sala) ?? []
      if (linhasSala.length === 0) continue
      const salaTml = SALA_JORNADA_PARA_TML[sala]
      if (!salaTml) continue
      const { data: supervisoresRaw } = await supabase
        .from('supervisores_tml')
        .select('nome, telefone')
        .eq('filial', usuario.filial)
        .eq('sala', salaTml)
      const supervisores = []
      for (const s of supervisoresRaw ?? []) {
        if (await podeEnviarPara({
          origem: 'jornada_supervisor_sala', filial: usuario.filial, mapaStatus: statusPorNome, nome: s.nome, telefone: s.telefone, detalhe: `Sala ${sala}`,
          mapaStatusPorTelefone: statusPorTelefone,
        })) {
          supervisores.push(s)
        }
      }

      // 3 mensagens curtas por sala — cada uma só com o Top 5 do seu
      // indicador, em vez de uma mensagem única com tudo.
      const msgJornada = montarMensagemJornadaSala(sala, linhasSala, dataOperacao)
      const msgIv = montarMensagemIvSala(sala, linhasSala, dataOperacao)
      const msgAderencia = montarMensagemAderenciaSala(sala, linhasSala, dataOperacao)
      for (const sup of supervisores) {
        if (msgJornada) await enviarMensagemWhatsApp(sup.telefone, msgJornada)
        await enviarMensagemWhatsApp(sup.telefone, msgIv)
        await enviarMensagemWhatsApp(sup.telefone, msgAderencia)
        await aguardarEntreEnvios()
      }
      // Números extra: recebem a aderência das duas salas (uma mensagem por sala, cada um).
      for (const numeroExtra of numerosExtra) {
        const r = await enviarMensagemWhatsApp(numeroExtra, msgAderencia)
        if (!r.sucesso) erros.push(`Número extra ${numeroExtra} (${SALA_JORNADA_LABEL[sala]}): ${r.erro ?? 'falha desconhecida'}`)
        await aguardarEntreEnvios()
      }
    }

    // Alerta direto pro motorista (não pro supervisor) quando a aderência
    // do próprio mapa fica abaixo da meta de 95%. Como esta função roda a
    // cada import do BEES (várias vezes ao longo do dia), para de mandar
    // assim que a rota chega a 100% — senão o motorista recebe o mesmo
    // aviso repetido a cada atualização mesmo depois de já ter terminado.
    for (const l of lista) {
      if (l.aderencia == null || l.aderencia >= ADERENCIA_MINIMA) continue
      if (l.percConclusao != null && l.percConclusao >= 1) continue
      if (!l.telefone) continue
      const pode = await podeEnviarPara({
        origem: 'jornada_aderencia_motorista', filial: usuario.filial, mapaStatus: statusPorNome, nome: l.nome, telefone: l.telefone, detalhe: `Mapa ${l.mapa}`,
        matricula: l.matricula, mapaStatusPorMatricula: statusPorMatricula,
      })
      if (!pode) continue
      await enviarMensagemWhatsApp(l.telefone, montarMensagemAlertaAderenciaMotorista(l, dataOperacao))
      await aguardarEntreEnvios()
    }

    if (filialConfig?.grupo_jornada_whatsapp) {
      // No lugar da mensagem de texto: 3 imagens em sequência — geral +
      // uma por sala (só as salas com supervisor mapeado; EXTERNOS entra
      // apenas no geral). Cada imagem substitui o `imagemAtual` via
      // flushSync (aplica o DOM na hora, sem esperar o próximo render) e
      // só então é capturada com html2canvas.
      const imagens: { titulo: string; kpis: KpisJornada; linhas: LinhaJornada[] }[] = [
        { titulo: 'Geral', kpis: calcularKpis(lista), linhas: lista },
      ]
      for (const sala of SALAS_JORNADA) {
        if (!SALA_JORNADA_PARA_TML[sala]) continue
        const linhasSala = porSala.get(sala) ?? []
        if (linhasSala.length === 0) continue
        imagens.push({ titulo: SALA_JORNADA_LABEL[sala], kpis: calcularKpis(linhasSala), linhas: linhasSala })
      }

      for (const item of imagens) {
        flushSync(() => setImagemAtual(item))
        if (!exportRef.current) continue
        const canvas = await html2canvas(exportRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
        const img = canvas.toDataURL('image/png')
        await enviarImagemGrupo(filialConfig.grupo_jornada_whatsapp, img, `📊 Jornada — ${item.titulo} — ${formatarDataBR(dataOperacao)}`)
      }
      setImagemAtual(null)

      // 4ª imagem: a Carta de Controle (mesma do topo da tela), com o dia
      // inteiro (todas as salas juntas, igual aparece na página).
      flushSync(() => setChartLinhas(lista))
      if (chartRef.current) {
        const canvasChart = await html2canvas(chartRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
        const imgChart = canvasChart.toDataURL('image/png')
        await enviarImagemGrupo(filialConfig.grupo_jornada_whatsapp, imgChart, `📈 Carta de Controle da Jornada — ${formatarDataBR(dataOperacao)}`)
      }
      setChartLinhas([])
    }
    return erros
  }

  async function handleEnviarManual() {
    if (ENVIOS_JORNADA_PAUSADOS) {
      alert('Envio em massa pausado: o WhatsApp ficou 24h em análise por disparo em massa. Use "Gerar imagem e texto p/ copiar".')
      return
    }
    setEnviando(true)
    setErro('')
    try {
      const erros = await enviarMensagensAutomatico()
      alert(
        erros.length > 0
          ? `Mensagens enviadas por sala + resumo do CDD.\n\n⚠️ Falhas:\n${erros.join('\n')}`
          : 'Mensagens enviadas por sala + resumo do CDD.'
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar mensagens')
    } finally {
      setEnviando(false)
    }
  }

  // Monta os mesmos textos/imagens do disparo automático, mas sem chamar a
  // Z-API — pra copiar e mandar manualmente nos grupos/supervisores enquanto
  // o envio em massa está pausado (ver whatsappStatus.ts).
  async function handleGerarParaCopiar() {
    if (!usuario) return
    setGerandoCopiar(true)
    setErro('')
    try {
      const lista = await buscarJornadaDoDia(usuario.filial, dataOperacao)
      const porSala = agruparPorSala(lista)

      let texto = ''
      for (const sala of SALAS_JORNADA) {
        const linhasSala = porSala.get(sala) ?? []
        if (linhasSala.length === 0) continue
        const msgJornada = montarMensagemJornadaSala(sala, linhasSala, dataOperacao)
        const msgIv = montarMensagemIvSala(sala, linhasSala, dataOperacao)
        const msgAderencia = montarMensagemAderenciaSala(sala, linhasSala, dataOperacao)
        texto += `\n\n━━━━━━━━━━━━━━━━━━━\n${SALA_JORNADA_LABEL[sala]}\n━━━━━━━━━━━━━━━━━━━\n`
        if (msgJornada) texto += `\n${msgJornada}\n`
        texto += `\n${msgIv}\n\n${msgAderencia}`
      }
      setCopiarTexto(texto.trim())

      const imagensCalc: { titulo: string; kpis: KpisJornada; linhas: LinhaJornada[] }[] = [
        { titulo: 'Geral', kpis: calcularKpis(lista), linhas: lista },
      ]
      for (const sala of SALAS_JORNADA) {
        if (!SALA_JORNADA_PARA_TML[sala]) continue
        const linhasSala = porSala.get(sala) ?? []
        if (linhasSala.length === 0) continue
        imagensCalc.push({ titulo: SALA_JORNADA_LABEL[sala], kpis: calcularKpis(linhasSala), linhas: linhasSala })
      }

      const imagens: { titulo: string; img: string }[] = []
      for (const item of imagensCalc) {
        flushSync(() => setImagemAtual(item))
        if (!exportRef.current) continue
        const canvas = await html2canvas(exportRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
        imagens.push({ titulo: `Jornada — ${item.titulo}`, img: canvas.toDataURL('image/png') })
      }
      setImagemAtual(null)

      flushSync(() => setChartLinhas(lista))
      if (chartRef.current) {
        const canvasChart = await html2canvas(chartRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
        imagens.push({ titulo: 'Carta de Controle da Jornada', img: canvasChart.toDataURL('image/png') })
      }
      setChartLinhas([])

      setCopiarImagens(imagens)
      setCopiarFeedback(null)
      setCopiarAberto(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar mensagens e imagens')
    } finally {
      setGerandoCopiar(false)
    }
  }

  async function handleCopiarTextoJornada() {
    try {
      await navigator.clipboard.writeText(copiarTexto)
      setCopiarFeedback('Texto copiado!')
    } catch {
      setCopiarFeedback('Não foi possível copiar — selecione o texto manualmente.')
    }
    setTimeout(() => setCopiarFeedback(null), 2500)
  }

  async function handleCopiarImagemJornada(img: string) {
    try {
      const resp = await fetch(img)
      const blob = await resp.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopiarFeedback('Imagem copiada!')
    } catch {
      setCopiarFeedback('Não foi possível copiar a imagem — use "Baixar imagem".')
    }
    setTimeout(() => setCopiarFeedback(null), 2500)
  }

  async function handleSalvarGrupo() {
    if (!usuario) return
    const v = grupoJornada.trim()
    const n = numeroExtraAderencia.trim()
    await supabase.from('filiais').update({
      grupo_jornada_whatsapp: v || null,
      numero_extra_aderencia_whatsapp: n || null,
    }).eq('nome', usuario.filial)
    setGrupoJornadaOriginal(v)
    setNumeroExtraAderenciaOriginal(n)
    alert('Configuração salva.')
  }

  const kpis = useMemo(() => calcularKpis(linhas), [linhas])
  const porSala = useMemo(() => agruparPorSala(linhas), [linhas])
  const linhasFiltradas = useMemo(() => {
    const base = filtroSala === 'todos' ? linhas : linhas.filter((l) => l.sala === filtroSala)
    const sinal = ordemDesc ? -1 : 1
    return [...base].sort((a, b) => sinal * (valorOrdenacao(a, ordenarPor) - valorOrdenacao(b, ordenarPor)))
  }, [linhas, filtroSala, ordenarPor, ordemDesc])
  // Sem tempo previsto/entregas previstas não dá pra calcular previsão de
  // chegada, aderência nem % conclusão — geralmente porque essa escala foi
  // importada antes do parser ler essas 3 colunas novas.
  const semDadosDePlano = useMemo(
    () => linhas.filter((l) => l.tempoPrevMin == null || l.entregasPrevistas == null).length,
    [linhas],
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Distribuição</p>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Route className="h-5 w-5 text-accent-600" /> Jornada e Tempo em Rota
          </h1>
          <p className="text-sm text-muted-foreground">
            Escala e saída já vêm de{' '}
            <Link to="/distribuicao/tml" className="text-accent-600 underline">Distribuição → Carta de Controle TML</Link>
            {' '}(sempre a importação mais recente do dia). Aqui só sobem BEES e Roteirizador.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setConfigAberta((v) => !v)} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <Settings2 className="h-4 w-4" /> Config. WhatsApp
          </button>
          <button
            onClick={handleEnviarManual}
            disabled={enviando || linhas.length === 0 || ENVIOS_JORNADA_PAUSADOS}
            title={ENVIOS_JORNADA_PAUSADOS ? 'Envio em massa pausado (WhatsApp em análise 24h)' : undefined}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar por sala + CDD
          </button>
          <button
            onClick={handleGerarParaCopiar}
            disabled={gerandoCopiar || linhas.length === 0}
            title="Gera a imagem/texto pra você mandar manualmente, sem depender do envio automático"
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {gerandoCopiar ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            Gerar imagem e texto p/ copiar
          </button>
          <button onClick={fetchJornada} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            onClick={async () => {
              setTestandoFarol(true)
              try {
                const r = await enviarImagemFarolCriticos()
                alert(r.ok ? '✅ Imagem do Farol de Críticos enviada.' : `⚠️ Não enviou: ${r.motivo}`)
              } catch (e) {
                alert(`⚠️ Erro ao testar: ${e instanceof Error ? e.message : String(e)}`)
              }
              setTestandoFarol(false)
            }}
            disabled={testandoFarol}
            title="Dispara a imagem do Farol de Críticos agora, com o motivo na tela se não enviar — útil pra diagnosticar sem esperar o próximo import do BEES"
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-teal-300 bg-teal-50 text-teal-800 text-sm hover:bg-teal-100 transition-colors disabled:opacity-50"
          >
            {testandoFarol ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrafficCone className="h-4 w-4" />}
            Testar Farol de Críticos
          </button>
        </div>
      </div>

      {ENVIOS_JORNADA_PAUSADOS && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3">
          ⚠️ Envio pelo WhatsApp está pausado (conta em análise 24h por disparo em massa).
          Use "Gerar imagem e texto p/ copiar" pra mandar manualmente nos grupos/supervisores.
        </div>
      )}

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      {!loading && semDadosDePlano > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {semDadosDePlano} mapa(s) sem tempo previsto/entregas previstas — por isso a previsão de chegada,
            a aderência e o % de conclusão ficam vazios pra eles. Isso acontece quando a escala foi importada
            antes dessas 3 colunas existirem. Reimporte a escala de hoje (03.11.49.02) em{' '}
            <Link to="/distribuicao/tml" className="underline font-medium">Carta de Controle TML</Link> pra corrigir.
          </span>
        </div>
      )}

      {configAberta && (
        <div className="border rounded-lg bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <label className="block text-sm font-medium">Grupo de WhatsApp — resumo do CDD</label>
              <p className="text-xs text-muted-foreground mt-0.5">
                O envio por sala já usa o telefone de cada supervisor cadastrado em{' '}
                <Link to="/distribuicao/tml/supervisores" className="text-accent-600 underline">Supervisores TML</Link>.
                Este grupo recebe só o resumo consolidado do CDD.
              </p>
            </div>
            <button
              onClick={buscarGruposZapi}
              disabled={buscandoGrupos}
              className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
            >
              {buscandoGrupos ? <Loader2 className="h-4 w-4 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {buscandoGrupos ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
            </button>
          </div>

          {erroGrupos && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-all">{erroGrupos}</span>
            </div>
          )}

          <GroupPicker
            label="Grupo do resumo do CDD"
            value={grupoJornada}
            onChange={setGrupoJornada}
            grupos={grupos}
            onCopy={copiarId}
            copiado={copiado}
          />

          <div>
            <label className="block text-sm font-medium">Números extra — aderência das duas salas</label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
              Opcional. Esses números recebem a mensagem de aderência de COLORADO e de SUB-FURIA, além dos
              supervisores de cada sala. Pra adicionar mais de um, separe por vírgula. O grupo de
              monitoramento (acima) não recebe a mensagem de aderência — só o resumo em imagem do CDD.
            </p>
            <input
              type="text"
              value={numeroExtraAderencia}
              onChange={(e) => setNumeroExtraAderencia(e.target.value)}
              placeholder="Ex.: 5511999999999, 5511988888888"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSalvarGrupo}
              disabled={grupoJornada.trim() === grupoJornadaOriginal && numeroExtraAderencia.trim() === numeroExtraAderenciaOriginal}
              className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="border rounded-lg bg-white px-4 py-3 flex flex-wrap items-center gap-3">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <label className="text-sm font-medium whitespace-nowrap">Data da operação</label>
        <input
          type="date"
          value={dataOperacao}
          onChange={(e) => setDataOperacao(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        />
        <p className="text-xs text-muted-foreground">Usada nos imports do BEES e do Roteirizador desta tela.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ImportBox
          titulo="1. BEES (Tracking AMBEV)"
          descricao="Execução das entregas por PDV. Ao importar, envia automaticamente por sala + resumo do CDD."
          onFile={handleImportarBees}
          isUploading={uploadingBees}
          statusLine={ultimoImportBees ? `Atualizado às ${new Date(ultimoImportBees).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Ainda não importado hoje'}
        />
        <ImportBox
          titulo="2. Roteirizador"
          descricao="Tempo planejado por placa — base da previsão de chegada e da dispersão de tempo."
          onFile={handleImportarRoteirizador}
          isUploading={uploadingRot}
          statusLine={ultimoImportRot ? `Atualizado às ${new Date(ultimoImportRot).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Ainda não importado hoje'}
        />
        <div className="border rounded-lg bg-white p-4">
          <h3 className="text-sm font-semibold">3. Escala + saída (03.11.49.02 / 03.11.20)</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Plano e horário real de saída — vêm de outra tela.</p>
          <div className="border rounded-lg bg-muted/40 p-6 text-center">
            <Link2 className="h-6 w-6 mx-auto mb-2 text-accent-600" />
            <p className="text-sm font-medium">Sincronizado automaticamente</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sempre lê a importação mais recente do dia — nada a subir aqui.
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{linhas.length} mapa(s) hoje</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Mapas</p>
          <p className="text-2xl font-bold">{kpis.mapas}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Prev. chegada média</p>
          <p className="text-2xl font-bold">{kpis.previsaoChegadaMedia ?? '—'}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Entregas</p>
          <p className="text-2xl font-bold">{kpis.entregasRealizadas}<span className="text-sm font-normal text-muted-foreground">/{kpis.entregasTotal}</span></p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">% conclusão rota</p>
          <p className="text-2xl font-bold">{formatarPct(kpis.percConclusaoMedio)}</p>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">Carta de controle da jornada</h2>
            <p className="text-xs text-muted-foreground">Cada bolinha é um mapa — previsão de chegada × % de conclusão</p>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 100% concluído</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Em rota (&lt; 10h20)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &gt; 10h20 (em rota ou concluído)</span>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
          ) : (
            <CartaControle linhas={linhas} />
          )}
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <button onClick={() => setRelatorioAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
          {relatorioAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <h2 className="font-semibold text-sm">Relatório por mapa</h2>
        </button>
        {relatorioAberto && (
        <>
        <div className="px-4 py-2 border-b flex flex-wrap items-center gap-1.5">
          {([
            ['todos', `Todas (${linhas.length})`],
            ...SALAS_JORNADA.map((s) => [s, `${SALA_JORNADA_LABEL[s]} (${(porSala.get(s) ?? []).length})`] as const),
          ] as const).map(([valor, label]) => (
            <button
              key={valor}
              onClick={() => setFiltroSala(valor as SalaJornada | 'todos')}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filtroSala === valor ? 'bg-accent-500 text-white border-accent-500' : 'hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Ordenar por</label>
            <select
              value={ordenarPor}
              onChange={(e) => setOrdenarPor(e.target.value as CampoOrdenacao)}
              className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white"
            >
              {OPCOES_ORDENACAO.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setOrdemDesc((v) => !v)}
              title={ordemDesc ? 'Decrescente' : 'Crescente'}
              className="px-2 py-1 rounded-md border text-xs hover:bg-accent transition-colors"
            >
              {ordemDesc ? '↓ Desc.' : '↑ Cresc.'}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : linhasFiltradas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum mapa. Importe a escala do dia em Carta de Controle TML e depois o BEES aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Mapa</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Placa</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Motorista</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Sala</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Saída</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Prev. cheg.</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Previsão</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">TR Real</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Bate Jornada?</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Entr.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Realiz.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Pend.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Devol.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">F.Raio</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">&lt;4min</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Not&lt;10s</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Aderênc.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">% Concl.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhasFiltradas.map((l) => {
                  const alerta = foraDaMeta(l)
                  const ruim = 'text-red-600 font-semibold'
                  return (
                  <tr key={l.mapa} className={`hover:bg-muted/30 transition-colors ${l.situacao === 'nao_bate' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-2 py-1.5">{l.mapa}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold">{l.placa ?? '—'}</td>
                    <td className="px-2 py-1.5">{l.nome ?? '—'}</td>
                    <td className="px-2 py-1.5">{SALA_JORNADA_LABEL[l.sala]}</td>
                    <td className="px-2 py-1.5">{l.horaSaidaReal ?? l.horaSaidaPrev ?? '—'}</td>
                    <td className={`px-2 py-1.5 ${alerta.prevChegada ? ruim : ''}`}>{l.previsaoChegada ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      <StatusPrevisaoBadge
                        status={l.statusPrevisao}
                        previsaoDinamica={l.previsaoChegadaDinamica}
                        concluido={l.percConclusao != null && l.percConclusao >= 1}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">{l.trRealMin != null ? formatarDuracao(l.trRealMin) : '—'}</td>
                    <td className="px-2 py-1.5"><SituacaoBadge situacao={l.situacao} rotaFinalizada={l.rotaFinalizada} /></td>
                    <td className="px-2 py-1.5 text-right">{l.entregasPrevistas ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">{l.realizadas}</td>
                    <td className="px-2 py-1.5 text-right">{l.pendentes ?? '—'}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.devolucao ? ruim : ''}`}>{l.devolucao}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.foraRaio ? ruim : ''}`}>{l.entregaForaRaio + l.devForaRaio}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.menos4min ? ruim : ''}`}>{l.menos4min}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.not10s ? ruim : ''}`}>{l.not10s}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.aderencia ? ruim : ''}`}>{formatarPct(l.aderencia)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatarPct(l.percConclusao)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}
      </div>

      <JornadaExportTemplate
        ref={exportRef}
        titulo={imagemAtual?.titulo ?? 'Geral'}
        filial={usuario?.filial ?? ''}
        data={dataOperacao}
        kpis={imagemAtual?.kpis ?? kpis}
        linhas={imagemAtual?.linhas ?? []}
      />
      <CartaControleExportTemplate ref={chartRef} filial={usuario?.filial ?? ''} data={dataOperacao} linhas={chartLinhas} />
      <FarolExportTemplate ref={farolExportRef} filial={usuario?.filial ?? ''} data={dataOperacao} linhas={farolImagemAtual ?? []} />

      {copiarAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Jornada e Tempo em Rota — copiar e enviar manualmente</h2>
              <button onClick={() => setCopiarAberto(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Texto (por sala — Jornada, IV e Aderência)</label>
                  <button onClick={handleCopiarTextoJornada} className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent">
                    <Copy className="h-3.5 w-3.5" /> Copiar texto
                  </button>
                </div>
                <textarea readOnly value={copiarTexto} rows={12} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono" />
              </div>
              {copiarImagens.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem imagens geradas.</p>
              ) : (
                copiarImagens.map((item) => (
                  <div key={item.titulo}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700">{item.titulo}</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleCopiarImagemJornada(item.img)} className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent">
                          <Copy className="h-3.5 w-3.5" /> Copiar imagem
                        </button>
                        <a href={item.img} download={`${item.titulo.toLowerCase().replace(/\s+/g, '-')}-${dataOperacao}.png`} className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent">
                          Baixar imagem
                        </a>
                      </div>
                    </div>
                    <img src={item.img} alt={item.titulo} className="w-full border rounded-lg" />
                  </div>
                ))
              )}
              {copiarFeedback && <p className="text-xs text-green-600">{copiarFeedback}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setCopiarAberto(false)} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
