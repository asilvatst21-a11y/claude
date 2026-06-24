import { supabase } from './supabase'
import { horarioParaMinutos, minutosParaHorario, isSalaTML, type SalaTML } from './tml'

const SALAS: SalaTML[] = ['COLORADO', 'SUB-FURIA']

// Limites de controle da carta (em %) — linhas horizontais do mapa de calor.
const META = 100 // linha preta
const LIMITE = 80 // linha amarela

// ── Configuração da curva de meta (cronograma planejado de saída) ─────────
// Curva de meta acumulada por slot de 10 min desde o início da categoria
// (ex.: slot 0 = 40%, slot 1 = 80%, slot 2 = 90%, slot 3+ = 100%). Mesma
// curva para todas as categorias — só o horário de início muda.
export const META_CURVA_ACUMULADA: number[] = [0.4, 0.8, 0.9, 1.0]

// Horário em que cada categoria começa a seguir a curva de meta. Antes
// desse horário a meta da categoria é 0%.
export const INICIO_CURVA_POR_SALA: Record<SalaTML, string> = {
  COLORADO: '07:00',
  'SUB-FURIA': '08:00',
}

export interface SerieCartaControle {
  horarios: string[]
  valores: (number | null)[] // % por horário (null = meta ainda é 0 para ambas as categorias)
  data: string
  meta: number
  limite: number
}

// Total por categoria (contagem de mapas/veículos na escala do dia): mapa →
// matrícula → sala no roster.
async function totalPorSala(filial: string, data: string): Promise<Map<SalaTML, number>> {
  const { data: escalas } = await supabase
    .from('escalas_tml')
    .select('mapa, matricula')
    .eq('filial', filial)
    .eq('data_entrega', data)

  const matriculas = [
    ...new Set((escalas ?? []).map((e) => e.matricula).filter((m): m is number => m != null)),
  ]
  const { data: roster } = await supabase
    .from('motoristas_sala_tml')
    .select('matricula, sala')
    .eq('filial', filial)
    .in('matricula', matriculas.length > 0 ? matriculas : [-1])
  const salaPorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.sala]))

  const mapasPorSala = new Map<SalaTML, Set<number>>()
  for (const e of escalas ?? []) {
    const sala = e.matricula != null ? salaPorMatricula.get(e.matricula) : undefined
    if (!isSalaTML(sala)) continue
    if (!mapasPorSala.has(sala)) mapasPorSala.set(sala, new Set())
    mapasPorSala.get(sala)!.add(e.mapa)
  }
  return new Map(SALAS.map((s) => [s, mapasPorSala.get(s)?.size ?? 0]))
}

// % de meta acumulada para uma categoria em um dado nº de slots de 10 min
// desde o início da sua curva. Antes do início = 0%; após o fim da curva
// configurada, mantém o último valor (100%) até o fim do dia.
function metaAcumulada(slotsDesdeInicio: number): number {
  if (slotsDesdeInicio < 0) return 0
  const idx = Math.min(slotsDesdeInicio, META_CURVA_ACUMULADA.length - 1)
  return META_CURVA_ACUMULADA[idx]
}

// Série da carta de controle consolidada do CDD. Para cada janela de 10 min,
// "deveriam ter saído" = curva de meta acumulada × total da categoria (uma
// curva fixa por categoria, não uma demanda calculada); "saíram" = saídas
// válidas acumuladas. % = saíram ÷ deveriam ter saído.
export async function serieCartaControleCDD(
  filial: string,
  data: string
): Promise<SerieCartaControle> {
  const totais = await totalPorSala(filial, data)

  const { data: hist } = await supabase
    .from('historico_tml')
    .select('sala, resultado, horario_saida')
    .eq('filial', filial)
    .eq('data_saida', data)

  // Minutos de cada saída válida, por sala.
  const saidasPorSala = new Map<SalaTML, number[]>()
  for (const h of hist ?? []) {
    if (!isSalaTML(h.sala) || h.resultado === 'invalido' || !h.horario_saida) continue
    if (!saidasPorSala.has(h.sala)) saidasPorSala.set(h.sala, [])
    saidasPorSala.get(h.sala)!.push(horarioParaMinutos(h.horario_saida))
  }

  const gridStart = Math.min(
    ...SALAS.map((s) => horarioParaMinutos(INICIO_CURVA_POR_SALA[s]))
  )
  const fimRampa = Math.max(
    ...SALAS.map(
      (s) =>
        horarioParaMinutos(INICIO_CURVA_POR_SALA[s]) +
        (META_CURVA_ACUMULADA.length - 1) * 10
    )
  )
  const todasSaidas = [...saidasPorSala.values()].flat()
  const ultimaSaida = todasSaidas.length > 0 ? Math.max(...todasSaidas) : gridStart
  const fim = Math.max(ultimaSaida, fimRampa)

  const horarios: string[] = []
  const valores: (number | null)[] = []
  for (let t = gridStart; t <= fim; t += 10) {
    let esperadoAcumulado = 0
    let saidasAcumuladas = 0
    for (const sala of SALAS) {
      const inicioSala = horarioParaMinutos(INICIO_CURVA_POR_SALA[sala])
      const slots = Math.round((t - inicioSala) / 10)
      const totalSala = totais.get(sala) ?? 0
      esperadoAcumulado += Math.round(metaAcumulada(slots) * totalSala)
      saidasAcumuladas += (saidasPorSala.get(sala) ?? []).filter((m) => m <= t).length
    }
    horarios.push(minutosParaHorario(t))
    valores.push(esperadoAcumulado > 0 ? Math.round((saidasAcumuladas / esperadoAcumulado) * 100) : null)
  }

  return { horarios, valores, data, meta: META, limite: LIMITE }
}

// ── Render no canvas (navegador) → PNG base64 (data URL) ──────────────────
// Replica o modelo de carta de controle: mapa de calor vertical (vermelho 0%
// no topo → verde 100%+ embaixo), linha amarela no limite e preta na meta, e a
// série em azul com marcadores.
export function renderCartaControlePNG(serie: SerieCartaControle): string {
  const W = 1100
  const H = 620
  const scale = 2 // nitidez (retina)
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const padL = 70
  const padR = 30
  const padT = 86 // título + rótulos de horário no topo
  const padB = 46
  const plotL = padL
  const plotR = W - padR
  const plotT = padT
  const plotB = H - padB
  const plotW = plotR - plotL
  const plotH = plotB - plotT

  const PCT_MAX = 140
  const yPix = (pct: number) => plotT + (pct / PCT_MAX) * plotH
  const n = serie.horarios.length
  const innerPad = 28
  const xPix = (i: number) =>
    n <= 1 ? plotL + plotW / 2 : plotL + innerPad + (i / (n - 1)) * (plotW - innerPad * 2)

  // Mapa de calor (gradiente vertical: vermelho topo → verde embaixo)
  const grad = ctx.createLinearGradient(0, plotT, 0, plotB)
  grad.addColorStop(0.0, '#d73027') // 0%
  grad.addColorStop(0.25, '#f46d43')
  grad.addColorStop(0.45, '#fdae61') // ~63%
  grad.addColorStop(0.55, '#f7f700') // ~78% amarelo
  grad.addColorStop(0.6, '#a6d96a') // ~84%
  grad.addColorStop(0.71, '#3fae5a') // ~100%
  grad.addColorStop(1.0, '#1a9850') // 140%
  ctx.fillStyle = grad
  ctx.fillRect(plotL, plotT, plotW, plotH)

  // Linhas de controle
  ctx.lineWidth = 3
  ctx.strokeStyle = '#d9a300' // limite (amarelo)
  ctx.beginPath()
  ctx.moveTo(plotL, yPix(serie.limite))
  ctx.lineTo(plotR, yPix(serie.limite))
  ctx.stroke()
  ctx.strokeStyle = '#000000' // meta (preto)
  ctx.beginPath()
  ctx.moveTo(plotL, yPix(serie.meta))
  ctx.lineTo(plotR, yPix(serie.meta))
  ctx.stroke()

  // Rótulos do eixo Y (0%..140%)
  ctx.fillStyle = '#333'
  ctx.font = '12px Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let p = 0; p <= PCT_MAX; p += 20) {
    ctx.fillText(`${p}%`, plotL - 8, yPix(p))
  }

  // Rótulos do eixo X (horários, no topo)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#333'
  for (let i = 0; i < n; i++) {
    ctx.fillText(serie.horarios[i], xPix(i), plotT - 6)
  }

  // Série azul (apenas pontos com valor)
  const pts: { x: number; y: number; v: number }[] = []
  for (let i = 0; i < n; i++) {
    const v = serie.valores[i]
    if (v == null) continue
    pts.push({ x: xPix(i), y: yPix(v), v })
  }
  if (pts.length > 0) {
    ctx.strokeStyle = '#1f5fd6'
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()

    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = '#1f5fd6'
      ctx.stroke()
    }

    // Rótulos de % acima dos pontos
    ctx.fillStyle = '#10307a'
    ctx.font = 'bold 12px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (const p of pts) ctx.fillText(`${p.v}%`, p.x, p.y - 12)
  }

  // Título
  ctx.fillStyle = '#111'
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('CARTA DE CONTROLE TML', W / 2, 16)

  return canvas.toDataURL('image/png')
}
