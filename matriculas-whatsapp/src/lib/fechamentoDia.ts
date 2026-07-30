import { supabase } from './supabase'
import { valesSupabase } from './valesSupabase'
import { buscarJornadaDoDia, SALA_JORNADA_PARA_TML, JORNADA_LIMITE_MIN, type SalaJornada } from './jornada'
import type { SalaTML } from './tml'
import { REGRAS_TML, horarioParaMinutos, tempoDeslocamentoMinutos } from './tml'
import { variarTexto, enviarListaOpcoesWhatsApp, aguardarEntreEnvios } from './zapi'

export type KpiFechamento = 'devolucao_pdv' | 'jornada_liquida' | 'aderencia_raio' | 'tml' | 'rating' | 'iv_deslocamento'
export type SalaFechamento = SalaTML | 'CDD'

export const KPIS_FECHAMENTO: { key: KpiFechamento; label: string; unidade: 'percentual' | 'minutos' | 'nota'; automatico: boolean }[] = [
  { key: 'devolucao_pdv', label: 'Devolução PDV', unidade: 'percentual', automatico: true },
  { key: 'jornada_liquida', label: 'Jornada Líquida', unidade: 'percentual', automatico: true },
  { key: 'aderencia_raio', label: 'Aderência ao Raio', unidade: 'percentual', automatico: true },
  { key: 'tml', label: 'TML', unidade: 'minutos', automatico: true },
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
}

// ── Devolução PDV — upload do relatório de devolução (1 linha por nota
// devolvida, Mapa na coluna A e Data na coluna B — mesmo formato da planilha
// de referência do cliente). Salva a CONTAGEM por mapa+dia em
// fechamento_dia_devolucoes_pdv; o cálculo do % em si cruza essa contagem
// com as entregas do dia (fechamento_dia_mapas_dia — upload do 03.11.49.02,
// ver abaixo). ──────────────────────────────────────────────────────────────
export interface LinhaDevolucaoPdv {
  mapa: number
  data: string
}

function excelSerialParaISO(valor: unknown): string | null {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const ms = Math.round((valor - 25569) * 86400 * 1000)
    return new Date(ms).toISOString().slice(0, 10)
  }
  if (typeof valor === 'string') {
    const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    // dd/mm/yyyy (ou dd/mm/yy) — formato do CSV de origem (03.11.49.02 e
    // Devolução PDV vêm no padrão brasileiro). Sem isso, um upload em CSV
    // (em vez de .xlsx) faz o SheetJS "adivinhar" a string como data no
    // padrão americano (mm/dd) ao ler o arquivo, trocando dia por mês
    // sempre que o dia é ≤12 — bug real que zerava Jornada Líquida/
    // Devolução PDV de vários dias sem erro nenhum aparecer.
    const br = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (br) {
      const dia = br[1].padStart(2, '0')
      const mes = br[2].padStart(2, '0')
      const ano = br[3].length === 2 ? `20${br[3]}` : br[3]
      return `${ano}-${mes}-${dia}`
    }
  }
  return null
}

// Excel guarda hora como fração do dia (0.5 = meio-dia) — converte pra
// "HH:MM". Aceita também Date (caso o parser já tenha convertido) ou string
// "HH:MM" already pronta.
function excelHoraParaHHMM(valor: unknown): string | null {
  if (valor instanceof Date) {
    return `${String(valor.getHours()).padStart(2, '0')}:${String(valor.getMinutes()).padStart(2, '0')}`
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const fracaoDoDia = valor % 1
    const minutosTotais = Math.round(fracaoDoDia * 24 * 60)
    const h = Math.floor(minutosTotais / 60) % 24
    const m = minutosTotais % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof valor === 'string') {
    const m = valor.match(/^(\d{1,2}):(\d{2})/)
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  }
  return null
}

export function parseDevolucaoPdv(linhas: unknown[][]): LinhaDevolucaoPdv[] {
  const resultado: LinhaDevolucaoPdv[] = []
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i]
    if (!l || l[0] == null) continue
    const mapa = Number(l[0])
    const data = excelSerialParaISO(l[1])
    if (!Number.isFinite(mapa) || !data) continue
    resultado.push({ mapa, data })
  }
  return resultado
}

export async function salvarDevolucoesPdv(filial: string, linhas: LinhaDevolucaoPdv[]): Promise<{ error: string | null }> {
  const contagem = new Map<string, { mapa: number; data: string; devolucoes: number }>()
  for (const l of linhas) {
    const chave = `${l.mapa}|${l.data}`
    const atual = contagem.get(chave) ?? { mapa: l.mapa, data: l.data, devolucoes: 0 }
    atual.devolucoes++
    contagem.set(chave, atual)
  }
  const registros = [...contagem.values()].map((c) => ({ filial, mapa: c.mapa, data: c.data, devolucoes: c.devolucoes }))
  if (registros.length === 0) return { error: null }
  const { error } = await supabase.from('fechamento_dia_devolucoes_pdv').upsert(registros, { onConflict: 'filial,mapa,data' })
  return { error: error?.message ?? null }
}

// ── 03.11.49.02 — upload do mesmo relatório da Carta de Controle TML
// (Data Entrega, Nro do Mapa, Placa, Motorista, MPD, Hora MPD, Entregas).
// Alimenta 2 KPIs de uma vez: Jornada Líquida (bateu = MPD "PC financeira" e
// Hora MPD dentro do limite) e o denominador (entregas) da Devolução PDV.
export interface LinhaMapaDia {
  mapa: number
  data: string
  placa: string | null
  matricula: number | null
  mpd: string | null
  horaMpd: string | null
  entregas: number | null
}

// Colunas do 03.11.49.02: E=Data Entrega, G=Nro do Mapa, M=Placa,
// O=Motorista (matrícula), Q=MPD, R=Hora MPD, V=Entregas. Cabeçalho na
// linha 1, dados a partir da linha 2.
export function parseMapasDia(linhas: unknown[][]): LinhaMapaDia[] {
  const resultado: LinhaMapaDia[] = []
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i]
    if (!l || l[6] == null) continue
    const mapaBruto = Number(l[6])
    const data = excelSerialParaISO(l[4])
    if (!Number.isFinite(mapaBruto) || !data) continue
    const matricula = Number(l[14])
    const entregas = Number(l[21])
    resultado.push({
      mapa: Math.round(mapaBruto),
      data,
      placa: typeof l[12] === 'string' ? l[12].trim() : null,
      matricula: Number.isFinite(matricula) ? matricula : null,
      mpd: typeof l[16] === 'string' ? l[16] : null,
      horaMpd: excelHoraParaHHMM(l[17]),
      entregas: Number.isFinite(entregas) ? entregas : null,
    })
  }
  return resultado
}

// "Bateu jornada" = rota finalizada (MPD = "PC financeira", tolerando acento
// e pontuação, igual jornada.ts) e a Hora MPD dentro do limite de 10h20
// (JORNADA_LIMITE_MIN) a partir do início da matinal da sala — mesma régua
// pedida pelo cliente (Colorado 07:00+10h20=17:20, Sub-Fúria 08:00+10h20=18:20).
function bateuJornada(sala: SalaTML, mpd: string | null, horaMpd: string | null): boolean {
  if (!mpd || !horaMpd) return false
  const normalizado = mpd.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  if (!normalizado.includes('pc financ')) return false
  const limiteMin = horarioParaMinutos(REGRAS_TML[sala].matinal) + JORNADA_LIMITE_MIN
  return horarioParaMinutos(horaMpd) <= limiteMin
}

// Resolve a sala de cada mapa (placa CRW = freteiro/Externos, sem sala;
// senão cruza a matrícula com motoristas_sala_tml, igual buscarJornadaDoDia)
// e já grava o resultado de "bateu jornada" pronto, pra não recalcular a
// cada leitura.
export interface DiagnosticoMapasDia {
  total: number
  comSala: number
  semSala: number
  matriculasNaoEncontradas: number[]
}

// Retorna também um diagnóstico de quantos mapas ficaram SEM sala resolvida
// (placa de freteiro/CRW é esperado; matrícula fora do cadastro de
// motoristas_sala_tml não é — sem sala, o mapa não entra no cálculo de
// Jornada Líquida/Devolução PDV daquele dia, e o painel mostra "—" mesmo com
// o upload tendo dado certo).
export async function salvarMapasDia(filial: string, linhas: LinhaMapaDia[]): Promise<{ error: string | null; diagnostico: DiagnosticoMapasDia | null }> {
  if (linhas.length === 0) return { error: null, diagnostico: null }
  const matriculas = [...new Set(linhas.map((l) => l.matricula).filter((m): m is number => m != null))]
  const { data: roster, error: erroRoster } = await supabase
    .from('motoristas_sala_tml')
    .select('matricula, sala')
    .eq('filial', filial)
    .in('matricula', matriculas.length > 0 ? matriculas : [-1])
  if (erroRoster) return { error: erroRoster.message, diagnostico: null }
  const salaPorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.sala]))

  const matriculasNaoEncontradas = new Set<number>()
  const registros = linhas.map((l) => {
    const ehFreteiro = l.placa?.toUpperCase().startsWith('CRW') ?? false
    const salaBruta = ehFreteiro
      ? null
      : l.matricula != null ? salaPorMatricula.get(l.matricula) ?? null : null
    const sala = salaBruta === 'COLORADO' || salaBruta === 'SUB-FURIA' ? salaBruta : null
    if (!sala && !ehFreteiro && l.matricula != null) matriculasNaoEncontradas.add(l.matricula)
    return {
      filial, mapa: l.mapa, data: l.data, placa: l.placa, matricula: l.matricula,
      sala, mpd: l.mpd, hora_mpd: l.horaMpd, entregas: l.entregas,
      bateu_jornada: sala ? bateuJornada(sala, l.mpd, l.horaMpd) : null,
    }
  })
  const { error } = await supabase.from('fechamento_dia_mapas_dia').upsert(registros, { onConflict: 'filial,mapa,data' })
  const comSala = registros.filter((r) => r.sala != null).length
  const diagnostico: DiagnosticoMapasDia = {
    total: registros.length, comSala, semSala: registros.length - comSala,
    matriculasNaoEncontradas: [...matriculasNaoEncontradas],
  }
  return { error: error?.message ?? null, diagnostico }
}

// ── Cálculo automático: Jornada Líquida — % de mapas que bateram jornada
// (bateu_jornada, já resolvido no upload) sobre o total de mapas da sala
// no dia. ────────────────────────────────────────────────────────────────
async function calcularJornadaLiquida(filial: string, data: string): Promise<Record<SalaTML, number | null>> {
  const { data: mapas, error } = await supabase
    .from('fechamento_dia_mapas_dia')
    .select('sala, bateu_jornada')
    .eq('filial', filial)
    .eq('data', data)
  if (error) console.error(`calcularJornadaLiquida (${data}) select error:`, error.message)
  const porSala: Record<SalaTML, { total: number; bateu: number }> = {
    COLORADO: { total: 0, bateu: 0 },
    'SUB-FURIA': { total: 0, bateu: 0 },
  }
  for (const m of mapas ?? []) {
    if (m.sala !== 'COLORADO' && m.sala !== 'SUB-FURIA') continue
    const sala = m.sala as SalaTML
    porSala[sala].total++
    if (m.bateu_jornada) porSala[sala].bateu++
  }
  return {
    COLORADO: porSala.COLORADO.total > 0 ? porSala.COLORADO.bateu / porSala.COLORADO.total : null,
    'SUB-FURIA': porSala['SUB-FURIA'].total > 0 ? porSala['SUB-FURIA'].bateu / porSala['SUB-FURIA'].total : null,
  }
}

// ── Cálculo automático: Devolução PDV — total de devoluções do dia
// (fechamento_dia_devolucoes_pdv) / entregas do dia (fechamento_dia_mapas_dia,
// upload do 03.11.49.02 — já tem a sala de cada mapa resolvida). ──────────
async function calcularDevolucaoPdv(filial: string, data: string): Promise<Record<SalaTML, number | null>> {
  const [{ data: devolucoes, error: erroDevol }, { data: mapas, error: erroMapas }] = await Promise.all([
    supabase.from('fechamento_dia_devolucoes_pdv').select('mapa, devolucoes').eq('filial', filial).eq('data', data),
    supabase.from('fechamento_dia_mapas_dia').select('mapa, sala, entregas').eq('filial', filial).eq('data', data),
  ])
  if (erroDevol) console.error(`calcularDevolucaoPdv (${data}) devolucoes error:`, erroDevol.message)
  if (erroMapas) console.error(`calcularDevolucaoPdv (${data}) mapas error:`, erroMapas.message)

  const devolucoesPorMapa = new Map((devolucoes ?? []).map((d) => [d.mapa, d.devolucoes as number]))
  const porSala: Record<SalaTML, { devolucoes: number; entregas: number }> = {
    COLORADO: { devolucoes: 0, entregas: 0 },
    'SUB-FURIA': { devolucoes: 0, entregas: 0 },
  }
  for (const m of mapas ?? []) {
    if (m.sala !== 'COLORADO' && m.sala !== 'SUB-FURIA') continue
    const sala = m.sala as SalaTML
    porSala[sala].entregas += m.entregas ?? 0
    porSala[sala].devolucoes += devolucoesPorMapa.get(m.mapa) ?? 0
  }

  return {
    COLORADO: porSala.COLORADO.entregas > 0 ? porSala.COLORADO.devolucoes / porSala.COLORADO.entregas : null,
    'SUB-FURIA': porSala['SUB-FURIA'].entregas > 0 ? porSala['SUB-FURIA'].devolucoes / porSala['SUB-FURIA'].entregas : null,
  }
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

// ── Cálculo automático: TML — média de saída da sala, exatamente como a tela
// Distribuição › Análise TML calcula (tempoSaidaMinutos = minutos entre o
// início da matinal da sala e a saída real; exclui resultado='invalido').
// Meta = tolerância da sala (REGRAS_TML.toleranciaMin, hoje 30min). ─────────
async function calcularTml(filial: string, data: string): Promise<Record<SalaTML, number | null>> {
  const { data: historico, error } = await supabase
    .from('historico_tml')
    .select('sala, horario_saida, resultado')
    .eq('filial', filial)
    .eq('data_saida', data)
  if (error) console.error(`calcularTml (${data}) select error:`, error.message)
  const porSala: Record<SalaTML, number[]> = { COLORADO: [], 'SUB-FURIA': [] }
  for (const h of historico ?? []) {
    if (!h.sala || (h.sala !== 'COLORADO' && h.sala !== 'SUB-FURIA') || !h.horario_saida) continue
    if (h.resultado === 'invalido') continue
    const sala = h.sala as SalaTML
    const tempoSaida = horarioParaMinutos(h.horario_saida) - horarioParaMinutos(REGRAS_TML[sala].matinal)
    porSala[sala].push(tempoSaida)
  }
  const media = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return { COLORADO: media(porSala.COLORADO), 'SUB-FURIA': media(porSala['SUB-FURIA']) }
}

// ── Cálculo automático: IV — Tempo de Deslocamento, mesma régua da tela
// Tempo de Deslocamento. checklist_tml.tempo_deslocamento_minutos só fica
// preenchido quando alguém abre aquele dia na tela (ela recalcula usando o
// horário REAL de fim da matinal e grava de volta) — pra não depender disso,
// se a coluna ainda não tiver sido calculada, cai no cálculo simples
// (checklist − horário padrão da matinal da sala), igual o import inicial. ──
async function calcularDeslocamento(filial: string, data: string): Promise<Record<SalaTML, number | null>> {
  const { data: checklist, error } = await supabase
    .from('checklist_tml')
    .select('sala, horario_inicio, tempo_deslocamento_minutos')
    .eq('filial', filial)
    .eq('data', data)
  if (error) console.error(`calcularDeslocamento (${data}) select error:`, error.message)
  const porSala: Record<SalaTML, number[]> = { COLORADO: [], 'SUB-FURIA': [] }
  for (const c of checklist ?? []) {
    if (!c.sala || (c.sala !== 'COLORADO' && c.sala !== 'SUB-FURIA')) continue
    const sala = c.sala as SalaTML
    const tempo = c.tempo_deslocamento_minutos ?? (c.horario_inicio ? tempoDeslocamentoMinutos(sala, c.horario_inicio) : null)
    if (tempo != null) porSala[sala].push(tempo)
  }
  const media = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return { COLORADO: media(porSala.COLORADO), 'SUB-FURIA': media(porSala['SUB-FURIA']) }
}

// Recalcula os 5 KPIs automáticos (Aderência, TML, IV-Deslocamento,
// Devolução PDV, Jornada Líquida) para as duas salas + CDD (média simples
// das salas, já que não há contagem bruta combinável de forma ponderada de
// forma simples aqui) e grava em fechamento_dia_valores. Devolução PDV e
// Jornada Líquida dependem do upload prévio do 03.11.49.02/devolução — sem
// upload pro dia, o cálculo simplesmente não encontra mapas e o valor fica
// nulo. Só o Rating não é tocado por essa função — continua manual.
export async function recalcularAutomaticos(filial: string, data: string): Promise<{ error: string | null }> {
  const [aderencia, tml, deslocamento, devolucaoPdv, jornadaLiquida] = await Promise.all([
    calcularAderenciaRaio(filial, data),
    calcularTml(filial, data),
    calcularDeslocamento(filial, data),
    calcularDevolucaoPdv(filial, data),
    calcularJornadaLiquida(filial, data),
  ])

  const linhas: { filial: string; sala: SalaFechamento; data: string; kpi: KpiFechamento; valor: number | null; origem: 'automatico' }[] = []
  const combinar = (kpi: KpiFechamento, porSala: Record<SalaTML, number | null>) => {
    linhas.push({ filial, sala: 'COLORADO', data, kpi, valor: porSala.COLORADO, origem: 'automatico' })
    linhas.push({ filial, sala: 'SUB-FURIA', data, kpi, valor: porSala['SUB-FURIA'], origem: 'automatico' })
    const validos = [porSala.COLORADO, porSala['SUB-FURIA']].filter((v): v is number => v != null)
    linhas.push({ filial, sala: 'CDD', data, kpi, valor: validos.length > 0 ? validos.reduce((a, b) => a + b, 0) / validos.length : null, origem: 'automatico' })
  }
  combinar('aderencia_raio', aderencia)
  combinar('iv_deslocamento', deslocamento)
  combinar('tml', tml)
  combinar('devolucao_pdv', devolucaoPdv)
  combinar('jornada_liquida', jornadaLiquida)

  const { error } = await supabase.from('fechamento_dia_valores').upsert(linhas, { onConflict: 'filial,sala,data,kpi' })
  if (error) console.error(`recalcularAutomaticos (${data}) upsert error:`, error.message)
  return { error: error?.message ?? null }
}

// ── Aritmética de data em string "yyyy-mm-dd", sem passar por Date local ───
// `new Date('yyyy-mm-ddT00:00:00')` + `.setDate()/.toISOString()` depende do
// fuso do navegador — num fuso à frente de UTC, a volta pra string podia
// "andar" um dia (foi a causa do recálculo salvar num dia e a tela consultar
// outro). Tudo aqui usa Date.UTC explicitamente, imune ao fuso local.
function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

function diaDaSemanaUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=dom, 1=seg, ...
}

// Todos os dias de um período já têm o dado-fonte importado (historico_tml,
// jornada_bees, checklist_tml) — normalmente o mês inteiro até hoje, já que
// esses relatórios são importados diariamente na Análise TML. Sem isso, só
// o dia recalculado manualmente aparece na semana, e o "Acum. Mês" acaba
// sendo a média de 1 dia só em vez do mês inteiro. Roda um dia de cada vez
// (não em paralelo) pra não estourar o limite de conexões do Supabase.
export async function recalcularAutomaticosPeriodo(
  filial: string, dataInicio: string, dataFim: string,
  onProgresso?: (feito: number, total: number, diaAtual: string) => void,
): Promise<{ erros: { dia: string; mensagem: string }[] }> {
  const dias: string[] = []
  for (let cursor = dataInicio; cursor <= dataFim; cursor = somarDias(cursor, 1)) dias.push(cursor)
  const erros: { dia: string; mensagem: string }[] = []
  for (let i = 0; i < dias.length; i++) {
    const { error } = await recalcularAutomaticos(filial, dias[i])
    if (error) erros.push({ dia: dias[i], mensagem: error })
    onProgresso?.(i + 1, dias.length, dias[i])
  }
  return { erros }
}

// Primeiro dia do mês de `data` (yyyy-mm-01) — usado como início padrão do
// recálculo em lote (o mês corrente inteiro, até o dia do fechamento).
export function primeiroDiaDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`
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
  const diaSemana = diaDaSemanaUTC(data)
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  return somarDias(data, offset)
}

// Lista de dias úteis (seg → data), pra exibir as colunas diárias.
export function diasDaSemanaAte(data: string): string[] {
  const inicio = segundaDaSemana(data)
  const dias: string[] = []
  for (let cursor = inicio; cursor <= data; cursor = somarDias(cursor, 1)) dias.push(cursor)
  return dias
}

// Busca os valores da semana (seg→data) + acumulado do mês, por sala.
export async function buscarValoresFechamento(
  filial: string, data: string,
): Promise<{ semana: ValorFechamento[]; acumMes: Record<SalaFechamento, Record<KpiFechamento, number | null>>; erro: string | null }> {
  const inicioSemana = segundaDaSemana(data)
  const inicioMes = `${data.slice(0, 7)}-01`

  const [{ data: semanaRows, error: erroSemana }, { data: mesRows, error: erroMes }] = await Promise.all([
    supabase.from('fechamento_dia_valores').select('sala, data, kpi, valor, origem').eq('filial', filial).gte('data', inicioSemana).lte('data', data),
    supabase.from('fechamento_dia_valores').select('sala, kpi, valor').eq('filial', filial).gte('data', inicioMes).lte('data', data),
  ])
  if (erroSemana) console.error('buscarValoresFechamento (semana) error:', erroSemana.message)
  if (erroMes) console.error('buscarValoresFechamento (mês) error:', erroMes.message)

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

  return {
    semana: (semanaRows ?? []) as ValorFechamento[],
    acumMes: acumFinal,
    erro: erroSemana?.message ?? erroMes?.message ?? null,
  }
}

// ── Diagnóstico: mostra o que a query de IV-Deslocamento realmente encontra
// em checklist_tml por dia/sala, pra comparar contra a tela Tempo de
// Deslocamento sem precisar adivinhar onde a busca diverge. ────────────────
export interface DiagnosticoDeslocamentoDia {
  data: string
  porSala: Record<SalaTML, { total: number; comColuna: number; semColuna: number }>
}

export async function diagnosticarDeslocamento(filial: string, dataInicio: string, dataFim: string): Promise<{ dias: DiagnosticoDeslocamentoDia[]; erro: string | null }> {
  const { data: checklist, error } = await supabase
    .from('checklist_tml')
    .select('sala, data, horario_inicio, tempo_deslocamento_minutos')
    .eq('filial', filial)
    .gte('data', dataInicio)
    .lte('data', dataFim)
  if (error) console.error('diagnosticarDeslocamento select error:', error.message)

  const porDia = new Map<string, DiagnosticoDeslocamentoDia>()
  for (const c of checklist ?? []) {
    const dia = c.data as string
    if (!porDia.has(dia)) {
      porDia.set(dia, {
        data: dia,
        porSala: {
          COLORADO: { total: 0, comColuna: 0, semColuna: 0 },
          'SUB-FURIA': { total: 0, comColuna: 0, semColuna: 0 },
        },
      })
    }
    if (c.sala !== 'COLORADO' && c.sala !== 'SUB-FURIA') continue
    const s = porDia.get(dia)!.porSala[c.sala as SalaTML]
    s.total++
    if (c.tempo_deslocamento_minutos != null) s.comColuna++
    else s.semColuna++
  }
  return { dias: [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)), erro: error?.message ?? null }
}

export async function buscarParametros(filial: string): Promise<ParametroFechamento[]> {
  const { data } = await supabase.from('fechamento_dia_parametros').select('kpi, meta, bench, gatilho, direcao').eq('filial', filial)
  return (data ?? []) as ParametroFechamento[]
}

// Farol de 3 cores pra um valor contra Meta/Bench, respeitando a direção.
// (Nível agregado por sala/CDD — aba Painel. Farol por motorista usa
// classificarCriterio, com a faixa extra do Gatilho — ver abaixo.)
export function farolDoValor(valor: number | null, p: ParametroFechamento | undefined): 'g' | 'a' | 'r' | null {
  if (valor == null || !p || p.meta == null) return null
  const bateuMeta = p.direcao === 'maior_melhor' ? valor >= p.meta : valor <= p.meta
  if (bateuMeta) return 'g'
  if (p.bench == null) return 'r'
  const dentroDoBench = p.direcao === 'maior_melhor' ? valor >= p.bench : valor <= p.bench
  return dentroDoBench ? 'a' : 'r'
}

function normalizarNomeFarol(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export type TierFarol = 'destaque' | 'meta' | 'atencao' | 'bate_papo'

export interface CriterioFarol {
  valor: number | null
  tier: TierFarol | null
}

// Classifica um valor em 4 faixas (Bench/Meta/Gatilho, respeitando a
// direção do KPI):
//  - Destaque: melhor que o Bench.
//  - Meta: bateu a Meta, mas não o Bench.
//  - Atenção: não bateu a Meta, mas ainda não estourou o Gatilho — só
//    aparece no relatório, não gera bate-papo.
//  - Bate-papo: estourou o Gatilho — aciona o convite automático.
// Sem Meta cadastrada não dá pra classificar (null). Sem Gatilho, qualquer
// coisa que não bata a Meta já conta como Bate-papo (não sobra "Atenção").
export function classificarCriterio(valor: number | null, p: ParametroFechamento | undefined): CriterioFarol {
  if (valor == null || !p || p.meta == null) return { valor, tier: null }
  const maiorMelhor = p.direcao === 'maior_melhor'
  const passa = (alvo: number) => (maiorMelhor ? valor >= alvo : valor <= alvo)
  if (p.bench != null && passa(p.bench)) return { valor, tier: 'destaque' }
  if (passa(p.meta)) return { valor, tier: 'meta' }
  if (p.gatilho != null && passa(p.gatilho)) return { valor, tier: 'atencao' }
  return { valor, tier: 'bate_papo' }
}

export const KPI_LABEL_CURTO: Record<string, string> = {
  devolucao_pdv: 'Devolução PDV',
  aderencia_raio: 'Aderência ao Raio',
  tml: 'TML',
  iv_deslocamento: 'IV — Deslocamento',
}

function formatarValorGatilho(kpi: string, valor: number): string {
  if (kpi === 'devolucao_pdv' || kpi === 'aderencia_raio') return `${(valor * 100).toFixed(1)}%`
  if (kpi === 'tml' || kpi === 'iv_deslocamento') return `${Math.round(valor)} min`
  return String(valor)
}

// ── Farol Motoristas: por mapa, os mesmos critérios da planilha de
// referência (Aderência ao Raio, TML, Devolução) + IV-Deslocamento, apurados
// automaticamente a partir do que o próprio sistema já calculou pro dia
// (BEES/Jornada, 03.11.49.02 pra Devolução e Jornada, checklist_tml pra
// IV-Deslocamento, historico_tml pro TML em minutos) — nada de subir
// relatório à parte. Motorista e ajudantes vêm de mapa_equipe (import diário
// da aba "Base", já usado em Reposições); telefone do motorista vem de
// motoristas_sala_tml (matrícula), do ajudante vem do cadastro de Ajudantes
// (Vales), casado por nome.
export interface LinhaFarolMotorista {
  mapa: number
  matricula: number | null
  nome: string | null
  telefone: string | null
  ajudantes: { nome: string; telefone: string | null }[]
  sala: SalaTML
  aderencia: CriterioFarol
  tml: CriterioFarol
  devolucao: CriterioFarol
  ivDeslocamento: CriterioFarol
}

export async function gerarFarolAutomatico(
  filial: string, data: string, parametros: ParametroFechamento[],
): Promise<LinhaFarolMotorista[]> {
  const pAderencia = parametros.find((p) => p.kpi === 'aderencia_raio')
  const pDevolucao = parametros.find((p) => p.kpi === 'devolucao_pdv')
  const pIv = parametros.find((p) => p.kpi === 'iv_deslocamento')
  const pTml = parametros.find((p) => p.kpi === 'tml')

  const [
    linhasJornada,
    { data: historico, error: erroHist },
    { data: devolucoes, error: erroDevol },
    { data: equipe, error: erroEquipe },
    { data: mapasDia, error: erroMapas },
    { data: checklist, error: erroChecklist },
    { data: roster, error: erroRoster },
    { data: ajudantesCad, error: erroAjudantes },
  ] = await Promise.all([
    buscarJornadaDoDia(filial, data),
    supabase.from('historico_tml').select('mapa, sala, horario_saida, resultado').eq('filial', filial).eq('data_saida', data),
    supabase.from('fechamento_dia_devolucoes_pdv').select('mapa, devolucoes').eq('filial', filial).eq('data', data),
    supabase.from('mapa_equipe').select('mapa, motorista_nome, ajudante1_nome, ajudante1_matricula, ajudante2_nome, ajudante2_matricula').eq('filial', filial).eq('data', data),
    supabase.from('fechamento_dia_mapas_dia').select('mapa, entregas').eq('filial', filial).eq('data', data),
    supabase.from('checklist_tml').select('mapa, sala, horario_inicio, tempo_deslocamento_minutos').eq('filial', filial).eq('data', data),
    supabase.from('motoristas_sala_tml').select('matricula, telefone').eq('filial', filial),
    valesSupabase.from('ajudantes').select('codigo, nome, telefone'),
  ])
  if (erroHist) console.error(`gerarFarolAutomatico (${data}) historico error:`, erroHist.message)
  if (erroDevol) console.error(`gerarFarolAutomatico (${data}) devolucoes error:`, erroDevol.message)
  if (erroEquipe) console.error(`gerarFarolAutomatico (${data}) equipe error:`, erroEquipe.message)
  if (erroMapas) console.error(`gerarFarolAutomatico (${data}) mapas error:`, erroMapas.message)
  if (erroChecklist) console.error(`gerarFarolAutomatico (${data}) checklist error:`, erroChecklist.message)
  if (erroRoster) console.error(`gerarFarolAutomatico (${data}) roster error:`, erroRoster.message)
  if (erroAjudantes) console.error(`gerarFarolAutomatico (${data}) ajudantes error:`, erroAjudantes.message)

  // TML em minutos, por mapa — mesma régua de calcularTml (início da
  // matinal da sala até a saída real), só que por mapa em vez da média.
  const tmlMinutosPorMapa = new Map<number, number>()
  for (const h of historico ?? []) {
    if (!h.sala || (h.sala !== 'COLORADO' && h.sala !== 'SUB-FURIA') || !h.horario_saida) continue
    if (h.resultado === 'invalido') continue
    const sala = h.sala as SalaTML
    tmlMinutosPorMapa.set(h.mapa as number, horarioParaMinutos(h.horario_saida) - horarioParaMinutos(REGRAS_TML[sala].matinal))
  }
  const devolucoesPorMapa = new Map((devolucoes ?? []).map((d) => [d.mapa as number, d.devolucoes as number]))
  const equipePorMapa = new Map((equipe ?? []).map((e) => [String(e.mapa), e]))
  const entregasPorMapa = new Map((mapasDia ?? []).map((m) => [m.mapa as number, m.entregas as number | null]))
  const deslocamentoPorMapa = new Map(
    (checklist ?? [])
      .filter((c): c is typeof c & { sala: SalaTML } => c.sala === 'COLORADO' || c.sala === 'SUB-FURIA')
      .map((c) => [c.mapa as number, c.tempo_deslocamento_minutos ?? (c.horario_inicio ? tempoDeslocamentoMinutos(c.sala, c.horario_inicio) : null)]),
  )
  const telefonePorMatricula = new Map((roster ?? []).map((r) => [r.matricula as number, (r.telefone as string | null) ?? null]))
  // Matrícula é a chave preferida pro telefone do ajudante — o nome vindo do
  // import diário da Base às vezes é escrito diferente do cadastro oficial
  // de Ajudantes (abreviado, sem nome do meio etc.), o que já causou
  // ajudante "sem telefone" mesmo estando cadastrado certinho. Matrícula não
  // sofre esse problema; nome normalizado fica só de fallback quando a
  // matrícula não veio no import ou não bate com nenhum código cadastrado.
  const telefonePorMatriculaAjudante = new Map(
    (ajudantesCad ?? [])
      .filter((a) => a.codigo != null)
      .map((a) => [a.codigo as number, (a.telefone as string | null) ?? null]),
  )
  const telefonePorNomeAjudante = new Map((ajudantesCad ?? []).map((a) => [normalizarNomeFarol(a.nome as string), (a.telefone as string | null) ?? null]))

  const resultado: LinhaFarolMotorista[] = []
  for (const l of linhasJornada) {
    const sala = SALA_JORNADA_PARA_TML[l.sala as SalaJornada]
    if (!sala) continue // Externos/freteiro não entra no Farol (só Colorado/Sub-Fúria)

    const aderencia = classificarCriterio(l.aderencia, pAderencia)
    const tml = classificarCriterio(tmlMinutosPorMapa.get(l.mapa) ?? null, pTml)

    // Sem linha em fechamento_dia_devolucoes_pdv não quer dizer "sem dado" —
    // esse upload é 1 linha por NOTA DEVOLVIDA (ver importarDevolucoesPdv
    // acima), então um mapa sem nenhuma devolução simplesmente não aparece
    // no relatório. Sem esse fallback pra 0, esses mapas (a maioria, no dia
    // a dia) ficavam com "—" em vez de ✅. Só fica null quando nem entregas
    // do mapa são conhecidas (mapa não importado no 03.11.49.02 daquele dia).
    const entregas = entregasPorMapa.get(l.mapa) ?? l.entregasPrevistas
    const devolucoesMapa = devolucoesPorMapa.get(l.mapa) ?? 0
    const devolucao = classificarCriterio(entregas ? devolucoesMapa / entregas : null, pDevolucao)

    const ivDeslocamento = classificarCriterio(deslocamentoPorMapa.get(l.mapa) ?? null, pIv)

    const eq = equipePorMapa.get(String(l.mapa))
    const ajudantesInfo = [
      { nome: eq?.ajudante1_nome, matricula: eq?.ajudante1_matricula },
      { nome: eq?.ajudante2_nome, matricula: eq?.ajudante2_matricula },
    ].filter((a): a is { nome: string; matricula: string | null } => !!a.nome)
    const ajudantes = ajudantesInfo.map(({ nome, matricula }) => {
      const codigo = matricula != null ? Number(matricula) : NaN
      const achouPorMatricula = Number.isFinite(codigo) && telefonePorMatriculaAjudante.has(codigo)
      const telefone = achouPorMatricula
        ? telefonePorMatriculaAjudante.get(codigo)!
        : telefonePorNomeAjudante.get(normalizarNomeFarol(nome)) ?? null
      return { nome, telefone }
    })

    resultado.push({
      mapa: l.mapa,
      matricula: l.matricula,
      nome: eq?.motorista_nome ?? l.nome,
      telefone: l.matricula != null ? telefonePorMatricula.get(l.matricula) ?? null : null,
      ajudantes,
      sala,
      aderencia,
      tml,
      devolucao,
      ivDeslocamento,
    })
  }
  return resultado
}

export function classificarResultado(l: { aderencia: CriterioFarol; tml: CriterioFarol; devolucao: CriterioFarol; ivDeslocamento: CriterioFarol }): 'destaque' | 'bate_papo' | 'neutro' {
  const criterios = [l.aderencia, l.tml, l.devolucao, l.ivDeslocamento].filter((c) => c.tier != null)
  if (criterios.length === 0) return 'neutro'
  if (criterios.some((c) => c.tier === 'bate_papo')) return 'bate_papo'
  if (criterios.every((c) => c.tier === 'destaque')) return 'destaque'
  return 'neutro'
}

function formatarNomeComAjudantes(l: { nome: string | null; ajudantes: { nome: string; telefone: string | null }[] }): string {
  const partes = [l.nome ?? '—']
  if (l.ajudantes.length > 0) partes.push(`Ajudante${l.ajudantes.length > 1 ? 's' : ''}: ${l.ajudantes.map((a) => a.nome).join(', ')}`)
  return partes.join(' — ')
}

// Texto de orientação pro grupo/supervisor (destaques) e pro supervisor
// (bate-papo) — o resumo de bate-papo mostra "✅ já respondeu" pra quem já
// resolveu sozinho pelo bot, então o supervisor sabe quem ainda precisa
// cobrar pessoalmente.
export function montarTextosOrientacao(
  linhas: { mapa: number; nome: string | null; ajudantes: { nome: string; telefone: string | null }[]; sala: SalaFechamento; resultado: string | null }[],
  salaLabel: string, dataBR: string,
  statusPorMapa?: Map<number, { total: number; respondidas: number }>,
): { destaques: string; batePapo: string } {
  const destaques = linhas.filter((l) => l.resultado === 'destaque')
  const bate = linhas.filter((l) => l.resultado === 'bate_papo')

  const txtDestaques = destaques.length > 0
    ? `🏆 *Destaques — ${salaLabel} (${dataBR})*\nSuperaram o Bench em todos os indicadores do dia:\n${destaques.map((d) => `• ${formatarNomeComAjudantes(d)}`).join('\n')}`
    : ''
  const txtBatePapo = bate.length > 0
    ? `🎯 *Precisa de um bate-papo — ${salaLabel} (${dataBR})*\nEstouraram o gatilho em pelo menos um indicador:\n${bate.map((d) => {
        const st = statusPorMapa?.get(d.mapa)
        const anotacao = st && st.total > 0 && st.respondidas === st.total ? ' ✅ já respondeu' : ''
        return `• ${formatarNomeComAjudantes(d)}${anotacao}`
      }).join('\n')}`
    : ''
  return { destaques: txtDestaques, batePapo: txtBatePapo }
}

// ── Pendências de bate-papo (gatilho) — 1 linha por (mapa, kpi, pessoa) que
// estourou o Gatilho. Motorista sempre entra; ajudante entra em tudo,
// EXCETO IV-Deslocamento (métrica de condução, não do ajudante).
export interface PendenciaGatilho {
  mapa: number
  kpi: KpiFechamento
  pessoaTipo: 'motorista' | 'ajudante'
  pessoaNome: string
  pessoaTelefone: string | null
  valor: number | null
}

export function gerarPendenciasGatilho(linhas: LinhaFarolMotorista[]): PendenciaGatilho[] {
  const out: PendenciaGatilho[] = []
  for (const l of linhas) {
    const criteriosMotorista: { kpi: KpiFechamento; c: CriterioFarol; soMotorista?: boolean }[] = [
      { kpi: 'aderencia_raio', c: l.aderencia },
      { kpi: 'tml', c: l.tml },
      { kpi: 'devolucao_pdv', c: l.devolucao },
      { kpi: 'iv_deslocamento', c: l.ivDeslocamento, soMotorista: true },
    ]
    for (const { kpi, c, soMotorista } of criteriosMotorista) {
      if (c.tier !== 'bate_papo') continue
      out.push({ mapa: l.mapa, kpi, pessoaTipo: 'motorista', pessoaNome: l.nome ?? `Matrícula ${l.matricula ?? '—'}`, pessoaTelefone: l.telefone, valor: c.valor })
      if (soMotorista) continue
      for (const aj of l.ajudantes) {
        out.push({ mapa: l.mapa, kpi, pessoaTipo: 'ajudante', pessoaNome: aj.nome, pessoaTelefone: aj.telefone, valor: c.valor })
      }
    }
  }
  return out
}

interface PendenciaGravada {
  id: string
  mapa: number
  kpi: string
  pessoa_nome: string
  pessoa_telefone: string | null
  valor: number | null
  status: string
}

// Grava as pendências do dia (upsert — reprocessar o Farol não duplica nem
// mexe em quem já está 'coletando'/'respondido') e manda o convite via
// WhatsApp só pra quem ainda está 'aguardando'. Cada pessoa recebe UMA
// mensagem com a lista de todos os indicadores que estourou (não uma por
// indicador) — ela escolhe qual comentar primeiro pelo próprio WhatsApp.
// Textos variam a cada envio e o intervalo entre pessoas é de 5s — mitigação
// de spam da Meta, mesmo padrão já adotado nos outros disparos em massa.
export async function enviarConvitesGatilho(
  filial: string, data: string, linhasFarol: LinhaFarolMotorista[],
): Promise<{ enviados: number; semTelefone: number; falhaEnvio: number; erro: string | null }> {
  const pendencias = gerarPendenciasGatilho(linhasFarol)
  if (pendencias.length === 0) return { enviados: 0, semTelefone: 0, falhaEnvio: 0, erro: null }

  const { data: gravadas, error } = await supabase
    .from('fechamento_dia_gatilho_pendencias')
    .upsert(
      pendencias.map((p) => ({
        filial, data, mapa: p.mapa, kpi: p.kpi, pessoa_tipo: p.pessoaTipo, pessoa_nome: p.pessoaNome,
        pessoa_telefone: p.pessoaTelefone, valor: p.valor,
      })),
      { onConflict: 'filial,data,mapa,kpi,pessoa_nome', ignoreDuplicates: false },
    )
    .select('id, mapa, kpi, pessoa_nome, pessoa_telefone, valor, status')
  if (error) {
    console.error('enviarConvitesGatilho upsert error:', error.message)
    // Erro mais comum aqui: a migração supabase-migration-fechamento-dia-
    // gatilho.sql ainda não foi rodada (tabela não existe) — sem devolver o
    // erro pra tela, isso aparecia como "0 convites enviados" sem pista
    // nenhuma do motivo.
    return { enviados: 0, semTelefone: 0, falhaEnvio: 0, erro: error.message }
  }

  const pendentes = (gravadas ?? []).filter((g): g is PendenciaGravada => g.status === 'aguardando')
  const semTelefone = pendentes.filter((g) => !g.pessoa_telefone).length
  const porTelefone = new Map<string, PendenciaGravada[]>()
  for (const g of pendentes) {
    if (!g.pessoa_telefone) continue
    const arr = porTelefone.get(g.pessoa_telefone) ?? []
    arr.push(g)
    porTelefone.set(g.pessoa_telefone, arr)
  }

  let enviados = 0
  let falhaEnvio = 0
  for (const [telefone, itens] of porTelefone) {
    const nome = itens[0].pessoa_nome
    const primeiroNome = nome.trim().split(/\s+/)[0] || nome
    const listaTexto = itens.map((it) => `${KPI_LABEL_CURTO[it.kpi] ?? it.kpi}${it.valor != null ? ` (${formatarValorGatilho(it.kpi, it.valor)})` : ''}`).join(', ')
    const mensagem = variarTexto([
      `Oi, ${primeiroNome}! 👋 Hoje ${itens.length > 1 ? 'alguns indicadores seus ficaram' : 'um indicador seu ficou'} fora da meta: ${listaTexto}. Queremos ouvir sua sugestão pra melhorar — não é cobrança, é só isso mesmo. Qual você quer comentar?`,
      `${primeiroNome}, tudo bem? Reparamos que hoje ${listaTexto} ${itens.length > 1 ? 'ficaram' : 'ficou'} fora da meta. Gostaríamos da sua opinião sobre o que rolou — qual desses você comenta primeiro?`,
      `Opa, ${primeiroNome}! Vi que hoje ${listaTexto} ${itens.length > 1 ? 'ficaram' : 'ficou'} fora da meta. Sem cobrança, só queremos entender melhor — qual você quer falar?`,
    ])
    const opcoes = itens.map((it) => ({ id: `gatilho:${it.id}`, title: KPI_LABEL_CURTO[it.kpi] ?? it.kpi }))
    const r = await enviarListaOpcoesWhatsApp(telefone, mensagem, 'Indicadores fora da meta', 'Selecionar', opcoes)
    if (r.sucesso) enviados++
    else falhaEnvio++
    await aguardarEntreEnvios(5000)
  }
  return { enviados, semTelefone, falhaEnvio, erro: null }
}

// Status de resposta por mapa (pra anotar "✅ já respondeu" no resumo do
// supervisor) — considera respondido quando TODAS as pendências daquele
// mapa (motorista + ajudantes, em todos os indicadores estourados) já
// tiverem resposta.
export async function buscarStatusPendenciasPorMapa(filial: string, data: string): Promise<Map<number, { total: number; respondidas: number }>> {
  const { data: rows, error } = await supabase
    .from('fechamento_dia_gatilho_pendencias')
    .select('mapa, status')
    .eq('filial', filial)
    .eq('data', data)
  if (error) console.error('buscarStatusPendenciasPorMapa error:', error.message)
  const mapa = new Map<number, { total: number; respondidas: number }>()
  for (const r of rows ?? []) {
    const atual = mapa.get(r.mapa as number) ?? { total: 0, respondidas: 0 }
    atual.total++
    if (r.status === 'respondido') atual.respondidas++
    mapa.set(r.mapa as number, atual)
  }
  return mapa
}

export interface PendenciaGatilhoDetalhada {
  id: string
  mapa: number
  kpi: string
  pessoaTipo: 'motorista' | 'ajudante'
  pessoaNome: string
  pessoaTelefone: string | null
  valor: number | null
  status: 'aguardando' | 'coletando' | 'respondido'
  resposta: string | null
  respondidoEm: string | null
}

// Painel de acompanhamento das respostas do bate-papo — motorista e
// ajudante aparecem em linhas separadas (cada um responde por si), pra dar
// visibilidade de quem já respondeu, quem está no meio da conversa e quem
// ainda nem viu o convite.
export async function buscarPendenciasGatilhoDoDia(filial: string, data: string): Promise<PendenciaGatilhoDetalhada[]> {
  const { data: rows, error } = await supabase
    .from('fechamento_dia_gatilho_pendencias')
    .select('id, mapa, kpi, pessoa_tipo, pessoa_nome, pessoa_telefone, valor, status, resposta, respondido_em')
    .eq('filial', filial)
    .eq('data', data)
    .order('mapa', { ascending: true })
  if (error) {
    console.error('buscarPendenciasGatilhoDoDia error:', error.message)
    return []
  }
  return (rows ?? []).map((r) => ({
    id: r.id, mapa: r.mapa, kpi: r.kpi, pessoaTipo: r.pessoa_tipo, pessoaNome: r.pessoa_nome,
    pessoaTelefone: r.pessoa_telefone, valor: r.valor, status: r.status, resposta: r.resposta, respondidoEm: r.respondido_em,
  }))
}
