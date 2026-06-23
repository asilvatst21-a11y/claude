import { supabase } from './supabase'
import { isSalaTML, SALA_TML_LABEL, type SalaTML } from './tml'

const SALAS: SalaTML[] = ['COLORADO', 'SUB-FURIA']
const NOMES_MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function formatarDataBR(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function horaAtualBR(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Quantos mapas eram esperados em cada sala na data, a partir da escala
// (mapa → matrícula → sala no roster). Usado pra calcular "faltam" e a
// tendência de fechamento do resumo diário.
async function esperadoPorSala(filial: string, data: string): Promise<Map<SalaTML, number>> {
  const { data: escalas } = await supabase
    .from('escalas_tml')
    .select('mapa, matricula')
    .eq('filial', filial)
    .eq('data_entrega', data)

  const matriculas = [...new Set((escalas ?? []).map((e) => e.matricula).filter((m): m is number => m != null))]
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

// ── Resumo 1: disparado a cada importação da planilha de saída ────────────
export async function gerarResumoDiario(filial: string, data: string): Promise<string> {
  const esperado = await esperadoPorSala(filial, data)

  const { data: hist } = await supabase
    .from('historico_tml')
    .select('sala, resultado')
    .eq('filial', filial)
    .eq('data_saida', data)

  const porSala = new Map<SalaTML, { saidas: number; perdidos: number }>()
  for (const h of hist ?? []) {
    if (!isSalaTML(h.sala)) continue
    const k = porSala.get(h.sala) ?? { saidas: 0, perdidos: 0 }
    k.saidas++
    if (h.resultado === 'atrasado') k.perdidos++
    porSala.set(h.sala, k)
  }

  const { data: alertasHoje } = await supabase
    .from('alertas_tml')
    .select('justificativa, status')
    .eq('filial', filial)
    .gte('created_at', `${data}T00:00:00`)
    .lte('created_at', `${data}T23:59:59`)

  const motivos = new Map<string, number>()
  let aguardando = 0
  for (const a of alertasHoje ?? []) {
    if (a.status === 'justificado' && a.justificativa) {
      motivos.set(a.justificativa, (motivos.get(a.justificativa) ?? 0) + 1)
    } else if (a.status !== 'justificado') {
      aguardando++
    }
  }

  let texto = `📊 *ATUALIZAÇÃO TML — ${formatarDataBR(data)} ${horaAtualBR()}*\n`

  for (const sala of SALAS) {
    const total = esperado.get(sala) ?? 0
    const s = porSala.get(sala) ?? { saidas: 0, perdidos: 0 }
    const faltam = Math.max(total - s.saidas, 0)
    const pctSaiu = total > 0 ? Math.round((s.saidas / total) * 100) : 0
    const pctPerdido = s.saidas > 0 ? (s.perdidos / s.saidas) * 100 : 0

    texto += `\n🏢 ${SALA_TML_LABEL[sala]}\n`
    texto += `✅ Saíram: ${s.saidas}/${total} mapas (${pctSaiu}%)\n`
    texto += `⏳ Faltam: ${faltam} mapas\n`
    texto += `⚠️ TML perdidos até agora: ${s.perdidos} (${pctPerdido.toFixed(1)}% dos que já saíram)\n`
    if (s.saidas > 0 && faltam > 0) {
      const tendencia = Math.round((s.perdidos / s.saidas) * total)
      texto += `📈 Tendência: ~${tendencia} TMLs perdidos no total, no ritmo atual\n`
    }
  }

  texto += `\n📋 Motivos já justificados (ambas as salas):\n`
  const motivosOrdenados = [...motivos.entries()].sort((a, b) => b[1] - a[1])
  if (motivosOrdenados.length === 0) {
    texto += `• Nenhum ainda\n`
  } else {
    for (const [motivo, count] of motivosOrdenados) texto += `• ${motivo}: ${count}\n`
  }
  texto += `🕗 Aguardando justificativa: ${aguardando}`

  return texto
}

// ── Resumo 2: disparado manualmente quando o dia fecha, pra gerência ──────
export async function gerarResumoGerencial(filial: string, data: string): Promise<string> {
  const mesInicio = `${data.slice(0, 7)}-01`
  const mesIndex = Number(data.slice(5, 7)) - 1
  const nomeMes = NOMES_MES[mesIndex] ?? data.slice(5, 7)

  const { data: histMes } = await supabase
    .from('historico_tml')
    .select('sala, resultado, atraso_minutos, data_saida')
    .eq('filial', filial)
    .gte('data_saida', mesInicio)
    .lte('data_saida', data)

  const { data: alertasHoje } = await supabase
    .from('alertas_tml')
    .select('sala, justificativa')
    .eq('filial', filial)
    .gte('created_at', `${data}T00:00:00`)
    .lte('created_at', `${data}T23:59:59`)
    .not('justificativa', 'is', null)

  const hoje = new Map<SalaTML, { saidas: number; perdidos: number; somaAtraso: number; nAtraso: number }>()
  const mes = new Map<SalaTML, { saidas: number; perdidos: number }>()
  for (const h of histMes ?? []) {
    if (!isSalaTML(h.sala)) continue

    const km = mes.get(h.sala) ?? { saidas: 0, perdidos: 0 }
    km.saidas++
    if (h.resultado === 'atrasado') km.perdidos++
    mes.set(h.sala, km)

    if (h.data_saida === data) {
      const kh = hoje.get(h.sala) ?? { saidas: 0, perdidos: 0, somaAtraso: 0, nAtraso: 0 }
      kh.saidas++
      if (h.resultado === 'atrasado') {
        kh.perdidos++
        kh.somaAtraso += h.atraso_minutos ?? 0
        kh.nAtraso++
      }
      hoje.set(h.sala, kh)
    }
  }

  const motivosPorSala = new Map<SalaTML, Map<string, number>>()
  for (const a of alertasHoje ?? []) {
    if (!isSalaTML(a.sala) || !a.justificativa) continue
    if (!motivosPorSala.has(a.sala)) motivosPorSala.set(a.sala, new Map())
    const m = motivosPorSala.get(a.sala)!
    m.set(a.justificativa, (m.get(a.justificativa) ?? 0) + 1)
  }

  let texto = `📊 *RESULTADO TML DO DIA — ${formatarDataBR(data)}*\n`
  let totalSaidas = 0
  let totalPerdidos = 0

  for (const sala of SALAS) {
    const h = hoje.get(sala) ?? { saidas: 0, perdidos: 0, somaAtraso: 0, nAtraso: 0 }
    const m = mes.get(sala) ?? { saidas: 0, perdidos: 0 }
    totalSaidas += h.saidas
    totalPerdidos += h.perdidos

    const pctPerdidoHoje = h.saidas > 0 ? (h.perdidos / h.saidas) * 100 : 0
    const atrasoMedio = h.nAtraso > 0 ? Math.round(h.somaAtraso / h.nAtraso) : 0
    const pctMes = m.saidas > 0 ? (m.perdidos / m.saidas) * 100 : 0

    const motivos = [...(motivosPorSala.get(sala)?.entries() ?? [])].sort((a, b) => b[1] - a[1])
    const motivosTexto = h.perdidos > 0 && motivos.length > 0
      ? motivos.map(([motivo, c]) => `${motivo} ${Math.round((c / h.perdidos) * 100)}%`).join(' • ')
      : '—'

    texto += `\n🏢 ${SALA_TML_LABEL[sala]}\n`
    texto += `• Saídas: ${h.saidas} | TML perdidos: ${h.perdidos} (${pctPerdidoHoje.toFixed(1)}%)\n`
    texto += `• Atraso médio: ${atrasoMedio} min\n`
    texto += `• Motivos: ${motivosTexto}\n`
    texto += `• Acumulado de ${nomeMes}: ${m.perdidos} perdidos em ${m.saidas} saídas (${pctMes.toFixed(1)}%)\n`
  }

  const pctTotal = totalSaidas > 0 ? (totalPerdidos / totalSaidas) * 100 : 0
  texto += `\n📈 Total do dia: ${totalPerdidos} TML perdidos em ${totalSaidas} saídas (${pctTotal.toFixed(1)}%)`

  return texto
}
