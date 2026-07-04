import { supabase } from './supabase'
import { formatarDataBR } from './utils'

// Sala da Jornada reaproveita o cadastro já existente de motorista→sala do
// TML — não precisa de cadastro novo. Mapeamento confirmado com o cliente:
// INTERIOR = COLORADO, PETRÓPOLIS = SUB-FURIA, EXTERNOS = FRETEIRO (placa
// CRW ou motorista não cadastrado no roster interno).
export type SalaJornada = 'INTERIOR' | 'PETROPOLIS' | 'EXTERNOS'

export const SALAS_JORNADA: SalaJornada[] = ['INTERIOR', 'PETROPOLIS', 'EXTERNOS']

export const SALA_JORNADA_LABEL: Record<SalaJornada, string> = {
  INTERIOR: 'INTERIOR (COLORADO)',
  PETROPOLIS: 'PETRÓPOLIS (SUB-FURIA)',
  EXTERNOS: 'EXTERNOS (FRETEIRO)',
}

// A sala correspondente no TML, usada para achar o supervisor a notificar
// (supervisores_tml.sala só tem COLORADO/SUB-FURIA — EXTERNOS não tem
// supervisor individual cadastrado, só entra no resumo do CDD).
export const SALA_JORNADA_PARA_TML: Record<SalaJornada, 'COLORADO' | 'SUB-FURIA' | null> = {
  INTERIOR: 'COLORADO',
  PETROPOLIS: 'SUB-FURIA',
  EXTERNOS: null,
}

// Parâmetros de negócio da Jornada — confirmados com o cliente:
//   • Limite de jornada: 10h20 (620 min) desde a saída da portaria.
//   • Meta de aderência (entregas dentro do raio): > 95%.
// Hoje fixos aqui; se precisar variar por sala/dia, dá pra mover pra uma
// tabela de parâmetros como já existe pro TML (tml_meta_matinal).
export const JORNADA_LIMITE_MIN = 10 * 60 + 20
export const ADERENCIA_MINIMA = 0.95

export function salaJornada(
  placa: string | null,
  matricula: number | null,
  salaPorMatricula: Map<number, string>,
): SalaJornada {
  if (placa?.toUpperCase().startsWith('CRW')) return 'EXTERNOS'
  const sala = matricula != null ? salaPorMatricula.get(matricula) : undefined
  if (sala === 'COLORADO') return 'INTERIOR'
  if (sala === 'SUB-FURIA') return 'PETROPOLIS'
  return 'EXTERNOS'
}

function minutosParaHorario(minutos: number): string {
  const total = ((Math.round(minutos) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function horarioParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export type SituacaoJornada = 'batendo' | 'nao_bate' | 'em_rota'

export interface LinhaJornada {
  mapa: number
  placa: string | null
  matricula: number | null
  nome: string | null
  sala: SalaJornada
  tempoPrevMin: number | null
  horaSaidaPrev: string | null
  horaSaidaReal: string | null
  previsaoChegada: string | null
  trRealMin: number | null
  situacao: SituacaoJornada
  entregasPrevistas: number | null
  realizadas: number
  pendentes: number | null
  repasse: number
  devolucao: number
  devForaRaio: number
  entregaForaRaio: number
  menos4min: number
  not10s: number
  aderencia: number | null
  percConclusao: number | null
  tempoDirigindoMin: number | null
  mpdStatus: string | null
  rotaFinalizada: boolean
}

// Cruza plano (escalas_tml — lido ao vivo, sempre reflete o import mais
// recente do dia, inclusive a matrícula) + saída real (historico_tml) +
// execução (jornada_bees) + tempo planejado (jornada_roteirizador). Não
// existe cache de matrícula: o 03.11.49.02 é reimportado pelo menos 2x/dia
// pela Carta de Controle TML e o upsert por filial+mapa já garante que
// aqui sempre lemos o motorista mais atual daquele mapa.
export async function buscarJornadaDoDia(filial: string, data: string): Promise<LinhaJornada[]> {
  const [{ data: escalas }, { data: historico }, { data: bees }, { data: roteirizador }] = await Promise.all([
    supabase
      .from('escalas_tml')
      .select('mapa, placa, matricula, tempo_prev_min, hora_saida_prev, entregas_previstas, mpd_status')
      .eq('filial', filial)
      .eq('data_entrega', data),
    supabase
      .from('historico_tml')
      .select('mapa, horario_saida')
      .eq('filial', filial)
      .eq('data_saida', data),
    supabase
      .from('jornada_bees')
      .select('mapa, realizadas, devolucao, repasse, entrega_fora_raio, dev_fora_raio, menos_4min, not_10s')
      .eq('filial', filial)
      .eq('data', data),
    supabase
      .from('jornada_roteirizador')
      .select('mapa, tempo_dirigindo_min')
      .eq('filial', filial)
      .eq('data', data),
  ])

  const saidaPorMapa = new Map((historico ?? []).map((h) => [h.mapa, h.horario_saida as string | null]))
  const beesPorMapa = new Map((bees ?? []).map((b) => [b.mapa, b]))
  const rotPorMapa = new Map((roteirizador ?? []).map((r) => [r.mapa, r.tempo_dirigindo_min as number | null]))

  const matriculas = [...new Set((escalas ?? []).map((e) => e.matricula).filter((m): m is number => m != null))]
  const { data: roster } = await supabase
    .from('motoristas_sala_tml')
    .select('matricula, nome, sala')
    .eq('filial', filial)
    .in('matricula', matriculas.length > 0 ? matriculas : [-1])
  const salaPorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.sala]))
  const nomePorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.nome]))

  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes()

  return (escalas ?? [])
    .map((e) => {
      const b = beesPorMapa.get(e.mapa)
      const horaSaidaReal = saidaPorMapa.get(e.mapa) ?? null
      const horaBase = horaSaidaReal ?? e.hora_saida_prev
      const previsaoChegada = horaBase && e.tempo_prev_min != null
        ? minutosParaHorario(horarioParaMinutos(horaBase) + e.tempo_prev_min)
        : null

      let trRealMin: number | null = null
      if (horaSaidaReal) {
        trRealMin = agoraMin - horarioParaMinutos(horaSaidaReal)
        if (trRealMin < 0) trRealMin += 1440
      }

      const entregasPrevistas = e.entregas_previstas ?? null
      const realizadas = b?.realizadas ?? 0
      const devolucao = b?.devolucao ?? 0
      const repasse = b?.repasse ?? 0
      const entregaForaRaio = b?.entrega_fora_raio ?? 0
      const devForaRaio = b?.dev_fora_raio ?? 0
      const menos4min = b?.menos_4min ?? 0
      const not10s = b?.not_10s ?? 0

      const pendentes = entregasPrevistas != null ? Math.max(entregasPrevistas - realizadas - devolucao, 0) : null
      const aderencia = entregasPrevistas ? 1 - (devForaRaio + entregaForaRaio) / entregasPrevistas : null
      const percConclusao = entregasPrevistas ? 1 - (pendentes ?? 0) / entregasPrevistas : null

      // MPD (coluna Q do 03.11.49.02) = "PC Financeira" → a rota já foi
      // prestada contas/finalizada. É o sinal mais confiável de que o mapa
      // encerrou, melhor que estimar por % de conclusão.
      const rotaFinalizada = (e.mpd_status ?? '').toLowerCase().includes('pc financeira')

      // "Bate jornada": se a rota já foi finalizada (MPD = PC Financeira),
      // o resultado é definitivo — bateu se o tempo em rota ficou dentro do
      // limite de 10h20, senão não bateu. Se ainda não finalizou: estourou
      // o limite desde a saída → já dá pra cravar que não vai bater, não
      // importa o quanto já entregou; senão ainda está em rota.
      let situacao: SituacaoJornada = 'em_rota'
      if (rotaFinalizada) {
        situacao = trRealMin != null && trRealMin > JORNADA_LIMITE_MIN ? 'nao_bate' : 'batendo'
      } else if (trRealMin != null && trRealMin > JORNADA_LIMITE_MIN) {
        situacao = 'nao_bate'
      }

      return {
        mapa: e.mapa,
        placa: e.placa,
        matricula: e.matricula,
        nome: e.matricula != null ? nomePorMatricula.get(e.matricula) ?? null : null,
        sala: salaJornada(e.placa, e.matricula, salaPorMatricula),
        tempoPrevMin: e.tempo_prev_min,
        horaSaidaPrev: e.hora_saida_prev,
        horaSaidaReal,
        previsaoChegada,
        trRealMin,
        situacao,
        entregasPrevistas,
        realizadas,
        pendentes,
        repasse,
        devolucao,
        devForaRaio,
        entregaForaRaio,
        menos4min,
        not10s,
        aderencia,
        percConclusao,
        tempoDirigindoMin: rotPorMapa.get(e.mapa) ?? null,
        mpdStatus: e.mpd_status ?? null,
        rotaFinalizada,
      }
    })
    .sort((a, b) => a.mapa - b.mapa)
}

export interface KpisJornada {
  mapas: number
  previsaoChegadaMedia: string | null
  entregasTotal: number
  entregasRealizadas: number
  percConclusaoMedio: number | null
  devolucaoPct: number | null
  iv: number | null
}

export function calcularKpis(linhas: LinhaJornada[]): KpisJornada {
  const chegadas = linhas.map((l) => l.previsaoChegada).filter((x): x is string => !!x).map(horarioParaMinutos)
  const entregasTotal = linhas.reduce((s, l) => s + (l.entregasPrevistas ?? 0), 0)
  const entregasRealizadas = linhas.reduce((s, l) => s + l.realizadas, 0)
  const devolucaoTotal = linhas.reduce((s, l) => s + l.devolucao, 0)
  const menos4minTotal = linhas.reduce((s, l) => s + l.menos4min, 0)
  const concl = linhas.map((l) => l.percConclusao).filter((x): x is number => x != null)

  return {
    mapas: linhas.length,
    previsaoChegadaMedia: chegadas.length > 0 ? minutosParaHorario(chegadas.reduce((a, b) => a + b, 0) / chegadas.length) : null,
    entregasTotal,
    entregasRealizadas,
    percConclusaoMedio: concl.length > 0 ? concl.reduce((a, b) => a + b, 0) / concl.length : null,
    devolucaoPct: entregasTotal > 0 ? devolucaoTotal / entregasTotal : null,
    iv: entregasTotal > 0 ? menos4minTotal / entregasTotal : null,
  }
}

export function agruparPorSala(linhas: LinhaJornada[]): Map<SalaJornada, LinhaJornada[]> {
  const mapa = new Map<SalaJornada, LinhaJornada[]>(SALAS_JORNADA.map((s) => [s, []]))
  for (const l of linhas) mapa.get(l.sala)!.push(l)
  return mapa
}

function formatarPct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

// ── Mensagens de WhatsApp — disparadas automaticamente a cada import do BEES ──
// Curtas de propósito: 3 mensagens separadas por sala (Jornada / IV +
// Devolução / Aderência), cada uma só com o Top 5 do indicador — os dados
// já vêm filtrados pela sala do supervisor (nunca o total do CDD).

function formatarDuracao(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

export function montarMensagemJornadaSala(sala: SalaJornada, linhas: LinhaJornada[], data: string): string {
  const emRota = linhas
    .filter((l): l is LinhaJornada & { trRealMin: number } => l.trRealMin != null)
    .sort((a, b) => b.trRealMin - a.trRealMin)
    .slice(0, 5)

  let texto = `🚚 *JORNADA — ${SALA_JORNADA_LABEL[sala]}*\n${formatarDataBR(data)} · limite ${formatarDuracao(JORNADA_LIMITE_MIN)}\n\n`
  if (emRota.length === 0) {
    texto += `Nenhum mapa em rota ainda.`
    return texto
  }
  texto += `Top 5 — tempo em rota:\n`
  emRota.forEach((l, i) => {
    const estourou = l.trRealMin > JORNADA_LIMITE_MIN ? ' ⚠️' : ''
    texto += `${i + 1}. ${l.nome ?? l.placa ?? `Mapa ${l.mapa}`} — ${formatarDuracao(l.trRealMin)}${estourou}\n`
  })
  return texto
}

export function montarMensagemIvSala(sala: SalaJornada, linhas: LinhaJornada[], data: string): string {
  const kpi = calcularKpis(linhas)
  const top = linhas.filter((l) => l.menos4min > 0).sort((a, b) => b.menos4min - a.menos4min).slice(0, 5)

  let texto = `⚡ *IV E DEVOLUÇÃO — ${SALA_JORNADA_LABEL[sala]}*\n${formatarDataBR(data)}\n\n`
  texto += `IV da sala: ${formatarPct(kpi.iv)}\n`
  texto += `Devolução da sala: ${formatarPct(kpi.devolucaoPct)}\n`
  if (top.length === 0) {
    texto += `\nNenhuma entrega marcada como rápida demais (<4min).`
    return texto
  }
  texto += `\nTop 5 — entregas <4min:\n`
  top.forEach((l, i) => {
    texto += `${i + 1}. ${l.nome ?? l.placa ?? `Mapa ${l.mapa}`} — ${l.menos4min} entrega(s)\n`
  })
  return texto
}

export function montarMensagemAderenciaSala(sala: SalaJornada, linhas: LinhaJornada[], data: string): string {
  const top = linhas
    .filter((l): l is LinhaJornada & { aderencia: number } => l.aderencia != null)
    .sort((a, b) => a.aderencia - b.aderencia)
    .slice(0, 5)

  let texto = `🎯 *ADERÊNCIA — ${SALA_JORNADA_LABEL[sala]}*\n${formatarDataBR(data)} · meta ${formatarPct(ADERENCIA_MINIMA)}\n\n`
  if (top.length === 0) {
    texto += `Sem dados de aderência ainda.`
    return texto
  }
  texto += `Top 5 — menor aderência:\n`
  top.forEach((l, i) => {
    const abaixo = l.aderencia < ADERENCIA_MINIMA ? ' ⚠️' : ''
    texto += `${i + 1}. ${l.nome ?? l.placa ?? `Mapa ${l.mapa}`} — ${formatarPct(l.aderencia)}${abaixo}\n`
  })
  return texto
}

export function montarMensagemCdd(porSala: Map<SalaJornada, LinhaJornada[]>, data: string): string {
  const todas = [...porSala.values()].flat()
  const kpi = calcularKpis(todas)

  let texto = `📊 *RESUMO DA JORNADA — CDD*\n${formatarDataBR(data)}\n\n`
  texto += `🗺️ Mapas em rota: ${kpi.mapas}\n`
  texto += `📦 Entregas: ${kpi.entregasRealizadas}/${kpi.entregasTotal} (${formatarPct(kpi.percConclusaoMedio)} concl.)\n`
  texto += `🕓 Previsão média de chegada: ${kpi.previsaoChegadaMedia ?? '—'}\n`
  texto += `↩️ Devolução: ${formatarPct(kpi.devolucaoPct)}\n`
  texto += `⚡ IV: ${formatarPct(kpi.iv)}\n`

  texto += `\n*Por sala:*\n`
  for (const sala of SALAS_JORNADA) {
    const linhas = porSala.get(sala) ?? []
    if (linhas.length === 0) continue
    const k = calcularKpis(linhas)
    const naoBatem = linhas.filter((l) => l.situacao === 'nao_bate').length
    texto += `${SALA_JORNADA_LABEL[sala]}: ${formatarPct(k.percConclusaoMedio)} · ${naoBatem} não bate(m)\n`
  }

  const totalNaoBatem = todas.filter((l) => l.situacao === 'nao_bate').length
  if (totalNaoBatem > 0) {
    texto += `\n⚠️ *${totalNaoBatem} mapa(s) não batendo a jornada no total.*`
  }

  return texto
}
