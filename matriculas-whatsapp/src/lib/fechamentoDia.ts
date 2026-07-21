import { supabase } from './supabase'
import { buscarJornadaDoDia, SALA_JORNADA_PARA_TML, type SalaJornada } from './jornada'
import type { SalaTML } from './tml'
import { atrasoMinutos, saidaInvalida } from './tml'

export type KpiFechamento = 'devolucao_pdv' | 'jornada_liquida' | 'aderencia_raio' | 'tml' | 'rating' | 'iv_deslocamento'
export type SalaFechamento = SalaTML | 'CDD'

export const KPIS_FECHAMENTO: { key: KpiFechamento; label: string; unidade: 'percentual' | 'minutos' | 'nota'; automatico: boolean }[] = [
  { key: 'devolucao_pdv', label: 'Devolução PDV', unidade: 'percentual', automatico: false },
  { key: 'jornada_liquida', label: 'Jornada Líquida', unidade: 'percentual', automatico: false },
  { key: 'aderencia_raio', label: 'Aderência ao Raio', unidade: 'percentual', automatico: true },
  { key: 'tml', label: 'TML (pior caso do dia)', unidade: 'minutos', automatico: true },
  { key: 'rating', label: 'Rating', unidade: 'nota', automatico: false },
  { key: 'iv_deslocamento', label: 'IV — Tempo de Deslocamento', unidade: 'minutos', automatico: true },
]

export interface ParametroFechamento {
  kpi: KpiFechamento
  meta: number | null
  bench: number | null
  gatilho: number | null
  direcao: 'menor_melhor' | 'maior_melhor'
}

export interface ValorFechamento {
  sala: SalaFechamento
  data: string
  kpi: KpiFechamento
  valor: number | null
  origem: 'automatico' | 'manual'
  detalhe?: string | null
}

// ── Cálculo automático: Aderência ao Raio (jornada.ts já cruza escalas_tml +
// jornada_bees por mapa) — soma ponderada, não média simples do %/mapa. ─────
async function calcularAderenciaRaio(filial: string, data: string): Promise<Record<SalaTML, number | null>> {
  const linhas = await buscarJornadaDoDia(filial, data)
  const porSala: Record<SalaTML, { forA: number; entregas: number }> = {
    COLORADO: { forA: 0, entregas: 0 },
    'SUB-FURIA': { forA: 0, entregas: 0 },
  }
  for (const l of linhas) {
    const salaTml = SALA_JORNADA_PARA_TML[l.sala as SalaJornada]
    if (!salaTml || !l.entregasPrevistas) continue
    porSala[salaTml].forA += l.devForaRaio + l.entregaForaRaio
    porSala[salaTml].entregas += l.entregasPrevistas
  }
  return {
    COLORADO: porSala.COLORADO.entregas > 0 ? 1 - porSala.COLORADO.forA / porSala.COLORADO.entregas : null,
    'SUB-FURIA': porSala['SUB-FURIA'].entregas > 0 ? 1 - porSala['SUB-FURIA'].forA / porSala['SUB-FURIA'].entregas : null,
  }
}

export interface ResultadoTmlSala { valor: number | null; motorista: string | null }

// ── Cálculo automático: TML — não é a média da sala, e sim o PIOR caso do dia
// (o motorista que saiu mais tarde), contra a mesma meta de 30min usada na
// análise de Carta de Controle TML (REGRAS_TML/atrasoMinutos). Quem "bate a
// meta" na análise 30min é a régua toda da sala — o pior motorista do dia é
// o que decide se a sala bateu ou não. ──────────────────────────────────────
async function calcularTml(filial: string, data: string): Promise<Record<SalaTML, ResultadoTmlSala>> {
  const { data: historico } = await supabase
    .from('historico_tml')
    .select('sala, horario_saida, nome, matricula')
    .eq('filial', filial)
    .eq('data_saida', data)
  const porSala: Record<SalaTML, { atraso: number; nome: string | null; matricula: number | null }[]> = { COLORADO: [], 'SUB-FURIA': [] }
  for (const h of historico ?? []) {
    if (!h.sala || (h.sala !== 'COLORADO' && h.sala !== 'SUB-FURIA') || !h.horario_saida) continue
    const sala = h.sala as SalaTML
    if (saidaInvalida(sala, h.horario_saida)) continue
    porSala[sala].push({ atraso: atrasoMinutos(sala, h.horario_saida), nome: h.nome ?? null, matricula: h.matricula ?? null })
  }
  const pior = (arr: { atraso: number; nome: string | null; matricula: number | null }[]): ResultadoTmlSala => {
    if (arr.length === 0) return { valor: null, motorista: null }
    const max = arr.reduce((a, b) => (b.atraso > a.atraso ? b : a))
    return { valor: max.atraso, motorista: max.nome ?? (max.matricula != null ? `Matrícula ${max.matricula}` : null) }
  }
  return { COLORADO: pior(porSala.COLORADO), 'SUB-FURIA': pior(porSala['SUB-FURIA']) }
}

// ── Cálculo automático: IV — Tempo de Deslocamento (checklist_tml já traz o
// minuto calculado por saída, mesma régua da tela Tempo de Deslocamento) ────
async function calcularDeslocamento(filial: string, data: string): Promise<Record<SalaTML, number | null>> {
  const { data: checklist } = await supabase
    .from('checklist_tml')
    .select('sala, tempo_deslocamento_minutos')
    .eq('filial', filial)
    .eq('data', data)
  const porSala: Record<SalaTML, number[]> = { COLORADO: [], 'SUB-FURIA': [] }
  for (const c of checklist ?? []) {
    if (!c.sala || (c.sala !== 'COLORADO' && c.sala !== 'SUB-FURIA') || c.tempo_deslocamento_minutos == null) continue
    porSala[c.sala as SalaTML].push(c.tempo_deslocamento_minutos)
  }
  const media = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return { COLORADO: media(porSala.COLORADO), 'SUB-FURIA': media(porSala['SUB-FURIA']) }
}

// Recalcula os 3 KPIs automáticos (Aderência, TML, IV-Deslocamento) para as
// duas salas + CDD (média simples das salas, já que não há contagem bruta
// combinável de forma ponderada de forma simples aqui) e grava em
// fechamento_dia_valores. Os outros 3 KPIs (Devolução PDV, Jornada Líquida,
// Rating) não são tocados por essa função — são sempre manuais.
export async function recalcularAutomaticos(filial: string, data: string): Promise<void> {
  const [aderencia, tml, deslocamento] = await Promise.all([
    calcularAderenciaRaio(filial, data),
    calcularTml(filial, data),
    calcularDeslocamento(filial, data),
  ])

  const linhas: { filial: string; sala: SalaFechamento; data: string; kpi: KpiFechamento; valor: number | null; detalhe?: string | null; origem: 'automatico' }[] = []
  const combinar = (kpi: KpiFechamento, porSala: Record<SalaTML, number | null>) => {
    linhas.push({ filial, sala: 'COLORADO', data, kpi, valor: porSala.COLORADO, origem: 'automatico' })
    linhas.push({ filial, sala: 'SUB-FURIA', data, kpi, valor: porSala['SUB-FURIA'], origem: 'automatico' })
    const validos = [porSala.COLORADO, porSala['SUB-FURIA']].filter((v): v is number => v != null)
    linhas.push({ filial, sala: 'CDD', data, kpi, valor: validos.length > 0 ? validos.reduce((a, b) => a + b, 0) / validos.length : null, origem: 'automatico' })
  }
  combinar('aderencia_raio', aderencia)
  combinar('iv_deslocamento', deslocamento)

  // TML: pior caso por sala (não média) + o nome de quem puxou o atraso. O
  // CDD do dia é o pior entre as duas salas, não a média dos dois piores.
  linhas.push({ filial, sala: 'COLORADO', data, kpi: 'tml', valor: tml.COLORADO.valor, detalhe: tml.COLORADO.motorista, origem: 'automatico' })
  linhas.push({ filial, sala: 'SUB-FURIA', data, kpi: 'tml', valor: tml['SUB-FURIA'].valor, detalhe: tml['SUB-FURIA'].motorista, origem: 'automatico' })
  const piorCdd = [
    { ...tml.COLORADO, sala: 'Colorado' },
    { ...tml['SUB-FURIA'], sala: 'Sub-Fúria' },
  ].filter((r) => r.valor != null).sort((a, b) => (b.valor as number) - (a.valor as number))[0]
  linhas.push({
    filial, sala: 'CDD', data, kpi: 'tml',
    valor: piorCdd?.valor ?? null,
    detalhe: piorCdd ? `${piorCdd.motorista ?? '—'} (${piorCdd.sala})` : null,
    origem: 'automatico',
  })

  await supabase.from('fechamento_dia_valores').upsert(linhas, { onConflict: 'filial,sala,data,kpi' })
}

// Salva um valor manual (Devolução PDV, Jornada Líquida ou Rating) pra uma sala/CDD.
export async function salvarValorManual(filial: string, sala: SalaFechamento, data: string, kpi: KpiFechamento, valor: number | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fechamento_dia_valores').upsert(
    { filial, sala, data, kpi, valor, origem: 'manual', atualizado_em: new Date().toISOString() },
    { onConflict: 'filial,sala,data,kpi' },
  )
  return { error: error?.message ?? null }
}

// Segunda-feira da semana de `data` (ISO yyyy-mm-dd), pra montar a janela
// "seg → dia do fechamento" pedida pelo cliente.
export function segundaDaSemana(data: string): string {
  const d = new Date(`${data}T00:00:00`)
  const diaSemana = d.getDay() // 0=dom, 1=seg, ...
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

// Lista de dias úteis (seg → data), pra exibir as colunas diárias.
export function diasDaSemanaAte(data: string): string[] {
  const inicio = segundaDaSemana(data)
  const dias: string[] = []
  const cursor = new Date(`${inicio}T00:00:00`)
  const fim = new Date(`${data}T00:00:00`)
  while (cursor <= fim) {
    dias.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

// Busca os valores da semana (seg→data) + acumulado do mês, por sala.
export async function buscarValoresFechamento(
  filial: string, data: string,
): Promise<{ semana: ValorFechamento[]; acumMes: Record<SalaFechamento, Record<KpiFechamento, number | null>> }> {
  const inicioSemana = segundaDaSemana(data)
  const inicioMes = `${data.slice(0, 7)}-01`

  const [{ data: semanaRows }, { data: mesRows }] = await Promise.all([
    supabase.from('fechamento_dia_valores').select('sala, data, kpi, valor, origem, detalhe').eq('filial', filial).gte('data', inicioSemana).lte('data', data),
    supabase.from('fechamento_dia_valores').select('sala, kpi, valor').eq('filial', filial).gte('data', inicioMes).lte('data', data),
  ])

  const acumMes: Record<string, Record<string, number[]>> = {}
  for (const r of mesRows ?? []) {
    if (r.valor == null) continue
    acumMes[r.sala] ??= {}
    ;(acumMes[r.sala][r.kpi] ??= []).push(r.valor)
  }
  const acumFinal: any = {}
  for (const sala of ['COLORADO', 'SUB-FURIA', 'CDD']) {
    acumFinal[sala] = {}
    for (const k of KPIS_FECHAMENTO.map((k) => k.key)) {
      const arr = acumMes[sala]?.[k] ?? []
      acumFinal[sala][k] = arr.length > 0 ? arr.reduce((a: number, b: number) => a + b, 0) / arr.length : null
    }
  }

  return { semana: (semanaRows ?? []) as ValorFechamento[], acumMes: acumFinal }
}

export async function buscarParametros(filial: string): Promise<ParametroFechamento[]> {
  const { data } = await supabase.from('fechamento_dia_parametros').select('kpi, meta, bench, gatilho, direcao').eq('filial', filial)
  return (data ?? []) as ParametroFechamento[]
}

// Farol de 3 cores pra um valor contra Meta/Bench, respeitando a direção.
export function farolDoValor(valor: number | null, p: ParametroFechamento | undefined): 'g' | 'a' | 'r' | null {
  if (valor == null || !p || p.meta == null) return null
  const bateuMeta = p.direcao === 'maior_melhor' ? valor >= p.meta : valor <= p.meta
  if (bateuMeta) return 'g'
  if (p.bench == null) return 'r'
  const dentroDoBench = p.direcao === 'maior_melhor' ? valor >= p.bench : valor <= p.bench
  return dentroDoBench ? 'a' : 'r'
}

// ── Farol Motoristas: layout posicional do relatório (mesmo formato da
// planilha de referência do cliente) — 4 blocos lado a lado:
//   B/C/D/E/F  = Matrícula/Nome/Fora/Entregas/Resultado        (Aderência ao Raio)
//   H/I/J/K    = Matrícula/Nome/Dev.Fora do Raio/Fazer Relato? (Devolução Fora do Raio)
//   M/N/O      = Matrícula/Nome/TML                            (TML)
//   Q/R/S/T/U  = Matrícula/Nome/Entregas/Devolvidas/Resultados (Devolução)
// Cabeçalho na linha 3 (índice 2), dados a partir da linha 4 (índice 3).
export interface LinhaFarolMotorista {
  matricula: number | null
  nome: string | null
  aderenciaOk: boolean | null
  devolucaoForaRaioOk: boolean | null
  tmlOk: boolean | null
  devolucaoOk: boolean | null
}

function paraNumero(v: any): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function parseFarolMotoristas(linhasBrutas: any[][], parametros: ParametroFechamento[]): LinhaFarolMotorista[] {
  const metaAderencia = parametros.find((p) => p.kpi === 'aderencia_raio')?.meta ?? 0.95
  const metaTml = parametros.find((p) => p.kpi === 'tml')?.meta ?? 0
  const metaDevolucao = parametros.find((p) => p.kpi === 'devolucao_pdv')?.meta ?? 0.031

  const resultado: LinhaFarolMotorista[] = []
  for (let i = 3; i < linhasBrutas.length; i++) {
    const l = linhasBrutas[i]
    if (!l || l.length === 0) continue
    const matricula = paraNumero(l[1])
    const nome = l[2] != null ? String(l[2]).trim() : null
    if (!matricula && !nome) continue

    const resultadoAderencia = paraNumero(l[5])
    const aderenciaOk = resultadoAderencia != null ? resultadoAderencia / 100 >= metaAderencia : null

    const fazerRelato = l[10] != null ? String(l[10]).trim().toLowerCase() : null
    const devolucaoForaRaioOk = fazerRelato != null ? fazerRelato === 'ok' : null

    const tmlBruto = l[14]
    let tmlMinutos: number | null = null
    if (tmlBruto instanceof Date) tmlMinutos = tmlBruto.getHours() * 60 + tmlBruto.getMinutes()
    else if (typeof tmlBruto === 'number') tmlMinutos = Math.round(tmlBruto * 24 * 60) // fração de dia (serial do Excel)
    const tmlOk = tmlMinutos != null ? tmlMinutos <= metaTml + 30 : null // já soma a tolerância padrão da matinal

    const resultadoDevolucao = paraNumero(l[20])
    const devolucaoOk = resultadoDevolucao != null ? resultadoDevolucao / 100 <= metaDevolucao : null

    resultado.push({ matricula, nome, aderenciaOk, devolucaoForaRaioOk, tmlOk, devolucaoOk })
  }
  return resultado
}

export function classificarResultado(l: LinhaFarolMotorista): 'destaque' | 'bate_papo' | 'neutro' {
  const criterios = [l.aderenciaOk, l.devolucaoForaRaioOk, l.tmlOk, l.devolucaoOk].filter((v): v is boolean => v != null)
  if (criterios.length === 0) return 'neutro'
  const okCount = criterios.filter(Boolean).length
  if (okCount === criterios.length) return 'destaque'
  if (okCount <= 1) return 'bate_papo'
  return 'neutro'
}

// Texto de orientação pro grupo (destaques) e pro supervisor (bate-papo).
export function montarTextosOrientacao(
  linhas: { nome: string | null; sala: SalaFechamento; resultado: string | null }[],
  salaLabel: string, dataBR: string,
): { destaques: string; batePapo: string } {
  const destaques = linhas.filter((l) => l.resultado === 'destaque')
  const bate = linhas.filter((l) => l.resultado === 'bate_papo')

  const txtDestaques = destaques.length > 0
    ? `🏆 *Destaques — ${salaLabel} (${dataBR})*\nBateram todos os indicadores do dia:\n${destaques.map((d) => `• ${d.nome ?? '—'}`).join('\n')}`
    : ''
  const txtBatePapo = bate.length > 0
    ? `🎯 *Precisa de um bate-papo — ${salaLabel} (${dataBR})*\nPerderam a maioria (ou todos) os indicadores do dia:\n${bate.map((d) => `• ${d.nome ?? '—'}`).join('\n')}`
    : ''
  return { destaques: txtDestaques, batePapo: txtBatePapo }
}
