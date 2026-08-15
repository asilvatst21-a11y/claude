import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { parseCidadesEntregas } from './rotasRisco'

// ── Parsing helpers ─────────────────────────────────────────────────────

// Relatório de abastecimento (cartão combustível): vírgula decimal, formato
// BR — mesmo padrão usado no resto do sistema.
function parseNumeroBR(s: string | undefined | null): number | null {
  const v = (s ?? '').trim()
  if (!v) return null
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

// Boletim do Veículo (telemetria/rastreador): ponto decimal, formato
// internacional — fonte diferente do resto do sistema, não usa vírgula.
function parseNumeroPonto(s: string | undefined | null): number | null {
  const v = (s ?? '').trim()
  if (!v || v === '-') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function dataBrParaIso(s: string | undefined | null): string | null {
  const m = (s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

// "00:15:30" -> 930 segundos.
function horaParaSegundos(s: string | undefined | null): number | null {
  const m = (s ?? '').trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function acharColuna(header: string[], nome: string): number {
  return header.findIndex((h) => h.trim() === nome)
}

// ── Abastecimento (cartão combustível) ─────────────────────────────────

export interface AbastecimentoInsert {
  filial: string
  numero_abastecimento: string
  motorista: string | null
  cpf_motorista: string | null
  matricula: string | null
  perfil: string | null
  placa: string
  data: string
  hora: string | null
  combustivel: string | null
  valor_pago: number | null
  litros: number | null
  km_rodado: number | null
  km_litro: number | null
  meta_km_litro: number | null
  modelo_veiculo: string | null
  marca_veiculo: string | null
  centro_custo: string | null
  posto: string | null
  preco_litro_pago: number | null
}

// Relatório de abastecimento — CSV/planilha exportada com ";" e vírgula
// decimal, cabeçalho na primeira linha (colunas em português, nomes exatos
// do exportador do cartão combustível).
export function parseAbastecimentoCsv(texto: string, filial: string): AbastecimentoInsert[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length < 2) return []
  const header = linhas[0].split(';')
  const idx = (nome: string) => acharColuna(header, nome)
  const iNumero = idx('Nº Abastecimento'), iMotorista = idx('Motorista'), iCpf = idx('CPF Motorista'),
    iMatricula = idx('Matrícula'), iPerfil = idx('Perfil'), iPlaca = idx('Placa'), iData = idx('Data'),
    iHora = idx('Hora'), iCombustivel = idx('Combustível'), iValorPago = idx('Valor Pago'),
    iLitros = idx('Litros'), iKmRodado = idx('Km rodado'), iKmLitro = idx('KM / Litro'),
    iMeta = idx('Meta KM/litro'), iModelo = idx('Modelo veículo'), iMarca = idx('Marca veículo'),
    iCentroCusto = idx('Centro de Custo'), iPosto = idx('Posto'), iPrecoLitro = idx('R$/Litro Pago')

  const rows: AbastecimentoInsert[] = []
  for (const linha of linhas.slice(1)) {
    const cols = linha.split(';')
    const numero = (cols[iNumero] ?? '').trim()
    const placa = (cols[iPlaca] ?? '').trim()
    const dataIso = dataBrParaIso(cols[iData])
    if (!numero || !placa || !dataIso) continue
    rows.push({
      filial,
      numero_abastecimento: numero,
      motorista: (cols[iMotorista] ?? '').trim() || null,
      cpf_motorista: (cols[iCpf] ?? '').replace(/\D/g, '') || null,
      matricula: (cols[iMatricula] ?? '').trim() || null,
      perfil: (cols[iPerfil] ?? '').trim() || null,
      placa,
      data: dataIso,
      hora: (cols[iHora] ?? '').trim() || null,
      combustivel: (cols[iCombustivel] ?? '').trim() || null,
      valor_pago: parseNumeroBR(cols[iValorPago]),
      litros: parseNumeroBR(cols[iLitros]),
      km_rodado: parseNumeroBR(cols[iKmRodado]),
      km_litro: parseNumeroBR(cols[iKmLitro]),
      meta_km_litro: parseNumeroBR(cols[iMeta]),
      modelo_veiculo: (cols[iModelo] ?? '').trim() || null,
      marca_veiculo: (cols[iMarca] ?? '').trim() || null,
      centro_custo: (cols[iCentroCusto] ?? '').trim() || null,
      posto: (cols[iPosto] ?? '').trim() || null,
      preco_litro_pago: parseNumeroBR(cols[iPrecoLitro]),
    })
  }
  return rows
}

export async function importarAbastecimentos(rows: AbastecimentoInsert[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    const { error } = await supabase.from('combustivel_abastecimentos').upsert(lote, { onConflict: 'filial,numero_abastecimento' })
    if (error) return error.message
  }
  return null
}

// ── Telemetria diária (Boletim do Veículo) ─────────────────────────────

export interface TelemetriaInsert {
  filial: string
  placa: string
  dia: string
  motoristas_raw: string | null
  distancia_percorrida: number | null
  consumo_combustivel_litros: number | null
  media_consumo_kml: number | null
  hodometro_inicial: number | null
  hodometro_final: number | null
  parado_ligado_segundos: number | null
  excesso_velocidade: number | null
  aceleracao_brusca: number | null
  frenagem_brusca: number | null
  curva_brusca: number | null
}

// Boletim do Veículo (telemetria/rastreador) — CSV exportado em ISO-8859-1
// (acentuação quebra em UTF-8), ";" e ponto decimal (não vírgula — fonte
// diferente do resto do sistema).
export function parseTelemetriaCsv(texto: string, filial: string): TelemetriaInsert[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length < 2) return []
  const header = linhas[0].split(';')
  const idx = (nome: string) => acharColuna(header, nome)
  const iPlaca = idx('PLACA'), iMotoristas = idx('MOTORISTAS'), iDia = idx('DIA'),
    iDistancia = idx('DISTÂNCIA PERCORRIDA'), iConsumo = idx('CONSUMO DE COMBUSTIVEL'),
    iMedia = idx('MÉDIA CONSUMO'), iHodIni = idx('HODOMETRO INICIAL'), iHodFim = idx('HODOMETRO FINAL'),
    iParadoLigado = idx('PARADO LIGADO'), iExcVel = idx('EXCESSO DE VELOCIDADE'),
    iAcelBrusca = idx('ACELERAÇÃO BRUSCA'), iFreioBrusco = idx('FRENAGEM BRUSCA'), iCurvaBrusca = idx('CURVA BRUSCA')

  const rows: TelemetriaInsert[] = []
  for (const linha of linhas.slice(1)) {
    const cols = linha.split(';')
    const placa = (cols[iPlaca] ?? '').trim()
    const diaIso = dataBrParaIso(cols[iDia])
    if (!placa || !diaIso) continue
    rows.push({
      filial,
      placa,
      dia: diaIso,
      motoristas_raw: (cols[iMotoristas] ?? '').trim() || null,
      distancia_percorrida: parseNumeroPonto(cols[iDistancia]),
      consumo_combustivel_litros: parseNumeroPonto((cols[iConsumo] ?? '').replace(' L', '')),
      media_consumo_kml: parseNumeroPonto((cols[iMedia] ?? '').replace(' Km/L', '')),
      hodometro_inicial: parseNumeroPonto(cols[iHodIni]),
      hodometro_final: parseNumeroPonto(cols[iHodFim]),
      parado_ligado_segundos: horaParaSegundos(cols[iParadoLigado]),
      excesso_velocidade: parseNumeroPonto(cols[iExcVel]),
      aceleracao_brusca: parseNumeroPonto(cols[iAcelBrusca]),
      frenagem_brusca: parseNumeroPonto(cols[iFreioBrusco]),
      curva_brusca: parseNumeroPonto(cols[iCurvaBrusca]),
    })
  }
  return rows
}

export async function importarTelemetria(rows: TelemetriaInsert[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    const { error } = await supabase.from('frota_telemetria_diaria').upsert(lote, { onConflict: 'filial,placa,dia' })
    if (error) return error.message
  }
  return null
}

// ── Distância diária (GEOTAB — "Relatório detalhado de viagens") ───────
// Cobre veículos que o Boletim do Veículo não rastreia. É um relatório por
// VIAGEM (várias linhas por dia), sem litros — a distância diária é a soma
// das viagens do dia; o Km/L desses veículos vem de calcularDiasGeotab
// (por intervalo entre abastecimentos), não daqui diretamente.

export interface DistanciaDiariaGeotabInsert { filial: string; placa: string; dia: string; distancia_km: number }

function dataJsParaIso(d: unknown): string | null {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseViagensGeotabXlsx(buffer: ArrayBuffer, filial: string): DistanciaDiariaGeotabInsert[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = wb.Sheets['Report'] ?? wb.Sheets[wb.SheetNames[0]]
  const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][]

  const headerIdx = linhas.findIndex((l) => l[0] === 'Dispositivo')
  if (headerIdx === -1) return []
  const header = linhas[headerIdx] as string[]
  const iPlaca = header.indexOf('Dispositivo')
  const iInicio = header.indexOf('Data de início')
  const iDistancia = header.indexOf('Distância')

  // Soma as viagens (linhas) do mesmo dia — o relatório vem com uma linha
  // por trecho, não uma por dia.
  const porChave = new Map<string, { filial: string; placa: string; dia: string; distancia_km: number }>()
  for (const linha of linhas.slice(headerIdx + 1)) {
    const placa = String(linha[iPlaca] ?? '').trim()
    const dia = dataJsParaIso(linha[iInicio])
    const distancia = typeof linha[iDistancia] === 'number' ? (linha[iDistancia] as number) : null
    if (!placa || !dia || distancia == null) continue
    const chave = `${placa}|${dia}`
    const atual = porChave.get(chave)
    if (atual) atual.distancia_km += distancia
    else porChave.set(chave, { filial, placa, dia, distancia_km: distancia })
  }
  return [...porChave.values()]
}

export async function importarDistanciaDiariaGeotab(rows: DistanciaDiariaGeotabInsert[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    const { error } = await supabase.from('frota_distancia_diaria_geotab').upsert(lote, { onConflict: 'filial,placa,dia' })
    if (error) return error.message
  }
  return null
}

// ── Leitura (com paginação — nenhuma tabela aqui deve ficar presa ao
// limite padrão de 1000 linhas do PostgREST) ───────────────────────────

const PAGINA = 1000

async function listarAbastecimentos(filial: string, dataIni: string, dataFim: string): Promise<AbastecimentoInsert[]> {
  const linhas: AbastecimentoInsert[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('combustivel_abastecimentos')
      .select('placa, data, litros, km_litro, meta_km_litro, modelo_veiculo, centro_custo, preco_litro_pago, combustivel, perfil')
      .eq('filial', filial).gte('data', dataIni).lte('data', dataFim)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('listarAbastecimentos error:', error.message); break }
    linhas.push(...((data ?? []) as unknown as AbastecimentoInsert[]))
    if (!data || data.length < PAGINA) break
  }
  return linhas
}

interface TelemetriaRow {
  placa: string; dia: string; motoristas_raw: string | null; distancia_percorrida: number | null
  consumo_combustivel_litros: number | null; media_consumo_kml: number | null; parado_ligado_segundos: number | null
}

async function listarTelemetria(filial: string, dataIni: string, dataFim: string): Promise<TelemetriaRow[]> {
  const linhas: TelemetriaRow[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('frota_telemetria_diaria')
      .select('placa, dia, motoristas_raw, distancia_percorrida, consumo_combustivel_litros, media_consumo_kml, parado_ligado_segundos')
      .eq('filial', filial).gte('dia', dataIni).lte('dia', dataFim)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('listarTelemetria error:', error.message); break }
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return linhas
}

// ── Referência por placa (modelo, meta, centro de custo) ───────────────
// Derivada do próprio import de abastecimento — o valor mais frequente no
// período, já que um mesmo modelo/meta se repete em todo abastecimento
// daquela placa.

interface RefPlaca { modelo: string | null; meta: number | null; centroCusto: string | null }

function maisFrequente<T>(valores: T[]): T | null {
  if (valores.length === 0) return null
  const contagem = new Map<T, number>()
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1)
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function referenciaPorPlaca(abastecimentos: AbastecimentoInsert[]): Map<string, RefPlaca> {
  const porPlaca = new Map<string, AbastecimentoInsert[]>()
  for (const a of abastecimentos) {
    if (!porPlaca.has(a.placa)) porPlaca.set(a.placa, [])
    porPlaca.get(a.placa)!.push(a)
  }
  const ref = new Map<string, RefPlaca>()
  for (const [placa, linhas] of porPlaca) {
    const modelos = linhas.map((l) => l.modelo_veiculo).filter((m): m is string => !!m)
    const metas = linhas.map((l) => l.meta_km_litro).filter((m): m is number => m != null)
    const centros = linhas.map((l) => l.centro_custo).filter((c): c is string => !!c)
    ref.set(placa, { modelo: maisFrequente(modelos), meta: maisFrequente(metas), centroCusto: maisFrequente(centros) })
  }
  return ref
}

// ── Meta de Km/L por placa — cadastro próprio, editável ─────────────────
// A meta não vem mais do relatório de abastecimento (pode faltar em
// reimportações, ou mudar com o tempo sem o relatório antigo saber) — vem
// só daqui. Semeada automaticamente na primeira leitura com o melhor palpite
// disponível (o que já estava nos abastecimentos importados), placa sem
// nada conhecido entra com 0 pra ajuste manual.

export interface MetaPlaca { placa: string; modelo: string | null; meta: number }

export async function buscarMetasPlaca(filial: string): Promise<MetaPlaca[]> {
  const [{ data: cadastradas }, abastecimentos] = await Promise.all([
    supabase.from('frota_meta_km_litro').select('placa, modelo_veiculo, meta_km_litro').eq('filial', filial),
    listarAbastecimentos(filial, subtrairDias(hojeIsoUtc(), 365), hojeIsoUtc()),
  ])
  const refAbastecimento = referenciaPorPlaca(abastecimentos)
  const jaTem = new Map((cadastradas ?? []).map((c) => [c.placa, { modelo: c.modelo_veiculo as string | null, meta: c.meta_km_litro as number }]))

  const placas = new Set([...jaTem.keys(), ...refAbastecimento.keys()])
  const resultado: MetaPlaca[] = []
  const novasParaSemear: { filial: string; placa: string; modelo_veiculo: string | null; meta_km_litro: number }[] = []
  for (const placa of placas) {
    const existente = jaTem.get(placa)
    if (existente) {
      resultado.push({ placa, modelo: existente.modelo ?? refAbastecimento.get(placa)?.modelo ?? null, meta: existente.meta })
      continue
    }
    const r = refAbastecimento.get(placa)
    const metaSemente = r?.meta ?? 0
    resultado.push({ placa, modelo: r?.modelo ?? null, meta: metaSemente })
    novasParaSemear.push({ filial, placa, modelo_veiculo: r?.modelo ?? null, meta_km_litro: metaSemente })
  }
  if (novasParaSemear.length > 0) {
    await supabase.from('frota_meta_km_litro').upsert(novasParaSemear, { onConflict: 'filial,placa' })
  }
  return resultado.sort((a, b) => a.placa.localeCompare(b.placa))
}

export async function salvarMetaPlaca(filial: string, placa: string, modelo: string | null, meta: number, atualizadoPor: string | null): Promise<string | null> {
  const { error } = await supabase.from('frota_meta_km_litro').upsert(
    { filial, placa, modelo_veiculo: modelo, meta_km_litro: meta, atualizado_em: new Date().toISOString(), atualizado_por: atualizadoPor },
    { onConflict: 'filial,placa' },
  )
  return error?.message ?? null
}

async function buscarMetasComoMapa(filial: string): Promise<Map<string, number>> {
  const { data } = await supabase.from('frota_meta_km_litro').select('placa, meta_km_litro').eq('filial', filial)
  return new Map((data ?? []).map((r) => [r.placa, r.meta_km_litro as number]))
}

// ── Motorista por placa+dia, via 03.11.49.02 (Escala do dia) ───────────
// Mais confiável que o campo MOTORISTAS do Boletim do Veículo: a Escala é
// a designação oficial de quem rodou aquela placa naquele dia, enquanto o
// Boletim só lista quem logou no rastreador (fica em branco ou some do dia
// inteiro quando o caminhão é dividido e o motorista não identifica —
// derrubava dias reais do ranking).

// Matrícula sempre normalizada pra string nas duas funções abaixo — o
// Supabase serializa BIGINT (motoristas_sala_tml.matricula) como string
// pro client JS, mas INTEGER (escalas_tml.matricula) como number. Comparar
// os dois tipos direto (ou usar como chave de Map sem normalizar) nunca
// bate, e todo mundo cai fora do ranking silenciosamente.
function normalizarMatricula(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim().replace(/^0+/, '')
  return s || null
}

async function motoristaPorPlacaDia(filial: string, dataIni: string, dataFim: string): Promise<Map<string, string>> {
  const linhas: { placa: string; data_entrega: string; matricula: number | null }[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('escalas_tml')
      .select('placa, data_entrega, matricula')
      .eq('filial', filial).gte('data_entrega', dataIni).lte('data_entrega', dataFim)
      .not('placa', 'is', null).not('matricula', 'is', null)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('motoristaPorPlacaDia error:', error.message); break }
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  // Uma placa pode ter mais de um mapa no mesmo dia — tudo bem, desde que
  // seja sempre o mesmo motorista. Se aparecer matrícula diferente pro
  // mesmo par placa+dia, não dá pra saber qual rodou quanto: descarta.
  const porChave = new Map<string, Set<string>>()
  for (const l of linhas) {
    const matricula = normalizarMatricula(l.matricula)
    if (!matricula) continue
    const chave = `${l.placa}|${l.data_entrega}`
    if (!porChave.has(chave)) porChave.set(chave, new Set())
    porChave.get(chave)!.add(matricula)
  }
  const resultado = new Map<string, string>()
  for (const [chave, matriculas] of porChave) {
    if (matriculas.size === 1) resultado.set(chave, [...matriculas][0])
  }
  return resultado
}

async function nomePorMatricula(filial: string): Promise<Map<string, string>> {
  const [{ data: roster }, { data: cadastrados }] = await Promise.all([
    supabase.from('motoristas_sala_tml').select('matricula, nome').eq('filial', filial),
    supabase.from('matriculas').select('numero, nome').eq('filial', filial).eq('ativo', true),
  ])
  const mapa = new Map<string, string>()
  for (const c of cadastrados ?? []) {
    const matricula = normalizarMatricula(c.numero)
    if (c.nome && matricula) mapa.set(matricula, c.nome)
  }
  // motoristas_sala_tml por último: é a base mais usada pra identificar
  // quem dirige TML, então prevalece sobre `matriculas` quando os dois têm
  // a mesma matrícula cadastrada.
  for (const r of roster ?? []) {
    const matricula = normalizarMatricula(r.matricula)
    if (r.nome && matricula) mapa.set(matricula, r.nome)
  }
  return mapa
}

// ── Dias úteis de telemetria (motorista vindo da Escala do dia, deslocamento
// e consumo reais) — base de todo o ranking ─────────────────────────────

export interface DiaUtilMotorista {
  nome: string; placa: string; dia: string; kml: number; distancia: number
  modelo: string | null; meta: number | null; centroCusto: string | null; idleSegundos: number | null
}

interface DistanciaDiariaRow { placa: string; dia: string; distancia_km: number }

async function listarDistanciaGeotab(filial: string, dataIni: string, dataFim: string): Promise<DistanciaDiariaRow[]> {
  const linhas: DistanciaDiariaRow[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('frota_distancia_diaria_geotab')
      .select('placa, dia, distancia_km')
      .eq('filial', filial).gte('dia', dataIni).lte('dia', dataFim)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('listarDistanciaGeotab error:', error.message); break }
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return linhas
}

// Km/L não vem pronto de nenhuma fonte de telemetria — nem o "MÉDIA CONSUMO"
// do Boletim, nem qualquer relatório GEOTAB. As duas só entram como
// DISTÂNCIA DIÁRIA REAL; o Km/L é sempre calculado aqui, por INTERVALO
// ENTRE ABASTECIMENTOS (km real do intervalo ÷ litros comprados no
// abastecimento que fechou o intervalo) — mesmo valor pros dias do
// intervalo, mas atribuído dia a dia ao motorista certo via Escala do dia.
// Evita depender do sensor de combustível de cada rastreador (fontes
// diferentes, calibração diferente) e usa o litro realmente comprado.
function calcularDiasPorIntervalo(
  abastecimentos: AbastecimentoInsert[],
  distanciaPorChave: Map<string, number>,
  idlePorChave: Map<string, number | null>,
  motoristaPorChave: Map<string, string>,
  nomes: Map<string, string>,
  ref: Map<string, RefPlaca>,
): DiaUtilMotorista[] {
  const diasPorPlaca = new Map<string, string[]>()
  for (const chave of distanciaPorChave.keys()) {
    const [placa, dia] = chave.split('|')
    if (!diasPorPlaca.has(placa)) diasPorPlaca.set(placa, [])
    diasPorPlaca.get(placa)!.push(dia)
  }

  const abastPorPlaca = new Map<string, AbastecimentoInsert[]>()
  for (const a of abastecimentos) {
    if (!a.litros || a.litros <= 0) continue
    if (!abastPorPlaca.has(a.placa)) abastPorPlaca.set(a.placa, [])
    abastPorPlaca.get(a.placa)!.push(a)
  }

  const resultado: DiaUtilMotorista[] = []
  for (const [placa, diasBrutos] of diasPorPlaca) {
    const abast = (abastPorPlaca.get(placa) ?? []).slice().sort((a, b) => a.data.localeCompare(b.data))
    if (abast.length === 0) continue
    const diasOrdenados = [...new Set(diasBrutos)].sort()
    const r = ref.get(placa)

    // O primeiro abastecimento visto no período só serve pra ANCORAR o
    // início do intervalo seguinte — não fecha intervalo nenhum sozinho.
    // Sem isso, os dias de telemetria anteriores a ele (rodados com o
    // tanque cheio de um abastecimento que a gente não viu) eram divididos
    // pelos litros desse primeiro abastecimento, que só encheu uma fração
    // do tanque — Km/L inflado artificialmente (chegava a 500%+ da meta).
    // Teto de plausibilidade: um abastecimento pequeno (completar o tanque,
    // não enchê-lo) fechando um intervalo longo dá Km/L impossível — ex.:
    // 36L fechando 13 dias de um caminhão rodando ~690km vira "19 km/L".
    // Sem abastecimento de referência nesse intervalo pra saber que aquele
    // foi parcial, o jeito é descartar intervalo cujo Km/L calculado passa
    // muito da meta do veículo (ou de um teto genérico, se a meta não for
    // conhecida) — mesmo limite usado antes pra sinalizar abastecimento com
    // hodômetro suspeito.
    const tetoKml = r?.meta != null ? r.meta * 1.8 : 9
    let dataAnterior: string | null = null
    for (const a of abast) {
      if (dataAnterior != null) {
        const diasIntervalo = diasOrdenados.filter((d) => d > (dataAnterior as string) && d <= a.data)
        const kmIntervalo = diasIntervalo.reduce((s, d) => s + (distanciaPorChave.get(`${placa}|${d}`) ?? 0), 0)
        if (kmIntervalo > 0) {
          const kmlIntervalo = kmIntervalo / (a.litros as number)
          if (kmlIntervalo > tetoKml) { dataAnterior = a.data; continue }
          for (const d of diasIntervalo) {
            const distanciaDia = distanciaPorChave.get(`${placa}|${d}`) ?? 0
            if (distanciaDia < 30) continue
            const matricula = motoristaPorChave.get(`${placa}|${d}`)
            if (matricula == null) continue
            const nome = nomes.get(matricula)
            if (!nome) continue
            resultado.push({
              nome, placa, dia: d, kml: kmlIntervalo, distancia: distanciaDia,
              modelo: r?.modelo ?? null, meta: r?.meta ?? null, centroCusto: r?.centroCusto ?? null,
              idleSegundos: idlePorChave.get(`${placa}|${d}`) ?? null,
            })
          }
        }
      }
      dataAnterior = a.data
    }
  }
  return resultado
}

// Dias no início do período sem um abastecimento anterior visível ficavam
// sem âncora pra fechar intervalo nenhum (o primeiro abastecimento do
// período só ANCORA, não fecha — ver comentário em calcularDiasPorIntervalo)
// e eram descartados inteiros, mesmo pra quem realmente rodou. Busca
// abastecimentos com folga pra trás do início do período só pra servir de
// âncora — os dias considerados no ranking continuam limitados a
// dataIni..dataFim (vêm da telemetria/GEOTAB, que não usa essa folga).
const FOLGA_ANCORA_DIAS = 60

function subtrairDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function hojeIsoUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function diasUteisMotorista(filial: string, dataIni: string, dataFim: string): Promise<DiaUtilMotorista[]> {
  const [abastecimentos, telemetriaBoletim, distanciaGeotab, motoristaPorChave, nomes, metasCadastradas] = await Promise.all([
    listarAbastecimentos(filial, subtrairDias(dataIni, FOLGA_ANCORA_DIAS), dataFim),
    listarTelemetria(filial, dataIni, dataFim),
    listarDistanciaGeotab(filial, dataIni, dataFim),
    motoristaPorPlacaDia(filial, dataIni, dataFim),
    nomePorMatricula(filial),
    buscarMetasComoMapa(filial),
  ])
  const ref = referenciaPorPlaca(abastecimentos)
  // Meta vem do cadastro próprio (frota_meta_km_litro), não do que o
  // relatório de abastecimento trouxer — pode faltar em reimportações ou
  // ficar desatualizado se a meta mudar com o tempo.
  for (const [placa, r] of ref) {
    const metaCadastrada = metasCadastradas.get(placa)
    r.meta = metaCadastrada != null && metaCadastrada > 0 ? metaCadastrada : null
  }

  // Distância diária real, unificando as duas fontes — Boletim tem
  // prioridade quando (raramente) as duas cobrirem a mesma placa+dia.
  const distanciaPorChave = new Map<string, number>()
  const idlePorChave = new Map<string, number | null>()
  for (const t of telemetriaBoletim) {
    if (t.distancia_percorrida == null) continue
    const chave = `${t.placa}|${t.dia}`
    distanciaPorChave.set(chave, t.distancia_percorrida)
    idlePorChave.set(chave, t.parado_ligado_segundos)
  }
  for (const g of distanciaGeotab) {
    const chave = `${g.placa}|${g.dia}`
    if (!distanciaPorChave.has(chave)) distanciaPorChave.set(chave, g.distancia_km)
  }

  return calcularDiasPorIntervalo(abastecimentos, distanciaPorChave, idlePorChave, motoristaPorChave, nomes, ref)
}

// ── Ranking por motorista ───────────────────────────────────────────────

export interface RankingMotorista {
  nome: string; dias: number; kmlMedio: number; pctMeta: number | null; kmTotal: number; amostraPequena: boolean
}

// Só um aviso visual agora, não filtra mais ninguém de fora — abaixo disso
// a posição no ranking pode estar distorcida por poucos dias de dado.
export const MIN_DIAS_CONFIAVEL = 10

export async function buscarRankingConsumo(filial: string, dataIni: string, dataFim: string): Promise<{
  porPct: RankingMotorista[]; porKml: RankingMotorista[]; kmlMedioFrota: number | null; pctDentroDaMeta: number | null; diasUteis: number
}> {
  const dias = await diasUteisMotorista(filial, dataIni, dataFim)
  const comMeta = dias.filter((d) => d.meta != null)

  const porNome = new Map<string, DiaUtilMotorista[]>()
  for (const d of comMeta) {
    if (!porNome.has(d.nome)) porNome.set(d.nome, [])
    porNome.get(d.nome)!.push(d)
  }

  const ranking: RankingMotorista[] = []
  for (const [nome, linhas] of porNome) {
    const kmlMedio = linhas.reduce((s, l) => s + l.kml, 0) / linhas.length
    const pctMeta = linhas.reduce((s, l) => s + l.kml / (l.meta as number), 0) / linhas.length
    const kmTotal = linhas.reduce((s, l) => s + l.distancia, 0)
    ranking.push({ nome, dias: linhas.length, kmlMedio, pctMeta, kmTotal, amostraPequena: linhas.length < MIN_DIAS_CONFIAVEL })
  }

  const kmlMedioFrota = dias.length > 0 ? dias.reduce((s, d) => s + d.kml, 0) / dias.length : null
  const pctDentroDaMeta = comMeta.length > 0 ? comMeta.filter((d) => d.kml / (d.meta as number) >= 1).length / comMeta.length : null

  return {
    porPct: [...ranking].sort((a, b) => (b.pctMeta ?? 0) - (a.pctMeta ?? 0)),
    porKml: [...ranking].sort((a, b) => b.kmlMedio - a.kmlMedio),
    kmlMedioFrota, pctDentroDaMeta, diasUteis: dias.length,
  }
}

// ── Por modelo de veículo / por centro de custo ─────────────────────────

export interface KmlPorGrupo { grupo: string; dias: number; kmlMedio: number; meta: number | null }

export async function buscarPorModelo(filial: string, dataIni: string, dataFim: string): Promise<KmlPorGrupo[]> {
  const dias = await diasUteisMotorista(filial, dataIni, dataFim)
  const porModelo = new Map<string, DiaUtilMotorista[]>()
  for (const d of dias) {
    const chave = d.modelo ?? '(sem modelo)'
    if (!porModelo.has(chave)) porModelo.set(chave, [])
    porModelo.get(chave)!.push(d)
  }
  return [...porModelo.entries()]
    .map(([grupo, linhas]) => ({
      grupo, dias: linhas.length, kmlMedio: linhas.reduce((s, l) => s + l.kml, 0) / linhas.length,
      meta: linhas.find((l) => l.meta != null)?.meta ?? null,
    }))
    .sort((a, b) => b.dias - a.dias)
}

export async function buscarPorCentroCusto(filial: string, dataIni: string, dataFim: string): Promise<KmlPorGrupo[]> {
  const dias = await diasUteisMotorista(filial, dataIni, dataFim)
  const porCentro = new Map<string, DiaUtilMotorista[]>()
  for (const d of dias) {
    const chave = (d.centroCusto ?? '(sem centro)').toUpperCase().replace('Ú', 'U')
    if (!porCentro.has(chave)) porCentro.set(chave, [])
    porCentro.get(chave)!.push(d)
  }
  return [...porCentro.entries()]
    .map(([grupo, linhas]) => ({ grupo, dias: linhas.length, kmlMedio: linhas.reduce((s, l) => s + l.kml, 0) / linhas.length, meta: null }))
    .sort((a, b) => b.kmlMedio - a.kmlMedio)
}

// ── Impacto em R$ ────────────────────────────────────────────────────────

export interface ImpactoRS { nome: string; litrosExtras: number; impactoRS: number }

export async function buscarImpactoRS(filial: string, dataIni: string, dataFim: string): Promise<{
  porMotorista: ImpactoRS[]; totalPeriodo: number; precoMedioLitro: number | null
}> {
  const [abastecimentos, ranking] = await Promise.all([
    listarAbastecimentos(filial, dataIni, dataFim),
    buscarRankingConsumo(filial, dataIni, dataFim),
  ])
  const precos = abastecimentos.map((a) => a.preco_litro_pago).filter((p): p is number => p != null)
  const precoMedioLitro = precos.length > 0 ? precos.reduce((s, p) => s + p, 0) / precos.length : null
  if (precoMedioLitro == null) return { porMotorista: [], totalPeriodo: 0, precoMedioLitro: null }

  const porMotorista = ranking.porPct
    .map((r) => {
      // meta implícita no pctMeta: kmlMedio / pctMeta = meta média ponderada
      const metaMedia = r.pctMeta && r.pctMeta > 0 ? r.kmlMedio / r.pctMeta : null
      if (!metaMedia) return null
      const litrosReais = r.kmTotal / r.kmlMedio
      const litrosSeNaMeta = r.kmTotal / metaMedia
      const litrosExtras = litrosReais - litrosSeNaMeta
      return { nome: r.nome, litrosExtras, impactoRS: litrosExtras * precoMedioLitro }
    })
    .filter((x): x is ImpactoRS => x != null)
    .sort((a, b) => b.impactoRS - a.impactoRS)

  const totalPeriodo = porMotorista.filter((m) => m.impactoRS > 0).reduce((s, m) => s + m.impactoRS, 0)
  return { porMotorista, totalPeriodo, precoMedioLitro }
}

// ── Tempo parado com motor ligado (idle) ────────────────────────────────

export interface IdleMotorista { nome: string; minutosMediaDia: number; horasTotal: number }

export async function buscarIdleTime(filial: string, dataIni: string, dataFim: string): Promise<{ porMotorista: IdleMotorista[]; totalHorasFrota: number }> {
  const dias = await diasUteisMotorista(filial, dataIni, dataFim)
  const porNome = new Map<string, DiaUtilMotorista[]>()
  for (const d of dias) {
    if (d.idleSegundos == null) continue
    if (!porNome.has(d.nome)) porNome.set(d.nome, [])
    porNome.get(d.nome)!.push(d)
  }
  const porMotorista = [...porNome.entries()]
    .filter(([, linhas]) => linhas.length >= MIN_DIAS_CONFIAVEL)
    .map(([nome, linhas]) => {
      const totalSeg = linhas.reduce((s, l) => s + (l.idleSegundos ?? 0), 0)
      return { nome, minutosMediaDia: totalSeg / linhas.length / 60, horasTotal: totalSeg / 3600 }
    })
    .sort((a, b) => b.minutosMediaDia - a.minutosMediaDia)
  const totalHorasFrota = porMotorista.reduce((s, m) => s + m.horasTotal, 0)
  return { porMotorista, totalHorasFrota }
}

// ── Km/L por rota (cidade principal de entrega, via escalas_tml) ───────

export interface KmlPorRota { cidade: string; dias: number; kmlMedio: number }

// Cidade com maior número de entregas no dia — mesmo formato usado em
// Rotas de Risco ("PATY DO ALFERES (17) / PETROPOLIS (1)").
function cidadePrincipal(raw: string | null): string | null {
  const cidades = parseCidadesEntregas(raw)
  if (cidades.length === 0) return null
  const contagens = [...(raw ?? '').matchAll(/([^/]+?)\s*\((\d+)\)/g)].map((m) => ({ nome: m[1].trim(), n: Number(m[2]) }))
  if (contagens.length === 0) return cidades[0]
  return contagens.sort((a, b) => b.n - a.n)[0].nome
}

export async function buscarKmlPorRota(filial: string, dataIni: string, dataFim: string): Promise<KmlPorRota[]> {
  const [dias, escalas] = await Promise.all([
    diasUteisMotorista(filial, dataIni, dataFim),
    (async () => {
      const linhas: { placa: string; data_entrega: string; cidades_entregas: string | null }[] = []
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await supabase
          .from('escalas_tml')
          .select('placa, data_entrega, cidades_entregas')
          .eq('filial', filial).gte('data_entrega', dataIni).lte('data_entrega', dataFim)
          .not('placa', 'is', null)
          .range(inicio, inicio + PAGINA - 1)
        if (error) { console.error('buscarKmlPorRota escalas_tml error:', error.message); break }
        linhas.push(...(data ?? []))
        if (!data || data.length < PAGINA) break
      }
      return linhas
    })(),
  ])

  const cidadePorPlacaDia = new Map<string, string>()
  for (const e of escalas) {
    const cidade = cidadePrincipal(e.cidades_entregas)
    if (cidade) cidadePorPlacaDia.set(`${e.placa}|${e.data_entrega}`, cidade)
  }

  const porCidade = new Map<string, DiaUtilMotorista[]>()
  for (const d of dias) {
    const cidade = cidadePorPlacaDia.get(`${d.placa}|${d.dia}`)
    if (!cidade) continue
    if (!porCidade.has(cidade)) porCidade.set(cidade, [])
    porCidade.get(cidade)!.push(d)
  }

  return [...porCidade.entries()]
    .filter(([, linhas]) => linhas.length >= 3)
    .map(([cidade, linhas]) => ({ cidade, dias: linhas.length, kmlMedio: linhas.reduce((s, l) => s + l.kml, 0) / linhas.length }))
    .sort((a, b) => a.kmlMedio - b.kmlMedio)
}

// ── Ranking por placa (mês fechado) + "minha média" pelo bot ───────────
// O ranking por motorista sofre quando a pessoa roda muitos caminhões
// diferentes (cada placa+dia precisa da própria âncora de abastecimento).
// O ranking por placa acumula muito mais dias por linha — é a base mais
// confiável pra apontar caminhão problemático, e também o que o bot usa
// pra responder "qual minha média": a média não é da pessoa, é da placa
// que ela mais rodou no mês fechado (mais robusta que tentar achar um
// histórico direto por motorista).

export function mesFechadoAtual(): { inicio: string; fim: string } {
  const hoje = new Date()
  const ano = hoje.getUTCFullYear()
  const mes = hoje.getUTCMonth() // 0-based; mês atual
  const inicio = new Date(Date.UTC(ano, mes - 1, 1))
  const fim = new Date(Date.UTC(ano, mes, 0)) // dia 0 do mês atual = último dia do mês anterior
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) }
}

function mediaKmlPonderada(linhas: DiaUtilMotorista[]): number {
  const kmTotal = linhas.reduce((s, l) => s + l.distancia, 0)
  const litrosTotal = linhas.reduce((s, l) => s + l.distancia / l.kml, 0)
  return litrosTotal > 0 ? kmTotal / litrosTotal : linhas.reduce((s, l) => s + l.kml, 0) / linhas.length
}

export interface RankingPlaca {
  placa: string; modelo: string | null; dias: number; kmlMedio: number; pctMeta: number | null; kmTotal: number
  motoristaPrincipal: string | null; diasMotoristaPrincipal: number
}

export async function buscarRankingPorPlacaMesFechado(filial: string): Promise<RankingPlaca[]> {
  const { inicio, fim } = mesFechadoAtual()
  const dias = await diasUteisMotorista(filial, inicio, fim)

  const porPlaca = new Map<string, DiaUtilMotorista[]>()
  for (const d of dias) {
    if (!porPlaca.has(d.placa)) porPlaca.set(d.placa, [])
    porPlaca.get(d.placa)!.push(d)
  }

  const resultado: RankingPlaca[] = []
  for (const [placa, linhas] of porPlaca) {
    const kmlMedio = mediaKmlPonderada(linhas)
    const meta = linhas.find((l) => l.meta != null)?.meta ?? null
    const porNome = new Map<string, number>()
    for (const l of linhas) porNome.set(l.nome, (porNome.get(l.nome) ?? 0) + 1)
    let motoristaPrincipal: string | null = null
    let diasMotoristaPrincipal = 0
    for (const [nome, n] of porNome) {
      if (n > diasMotoristaPrincipal) { motoristaPrincipal = nome; diasMotoristaPrincipal = n }
    }
    resultado.push({
      placa, modelo: linhas[0].modelo, dias: linhas.length, kmlMedio,
      pctMeta: meta ? kmlMedio / meta : null, kmTotal: linhas.reduce((s, l) => s + l.distancia, 0),
      motoristaPrincipal, diasMotoristaPrincipal,
    })
  }
  return resultado.sort((a, b) => (b.pctMeta ?? 0) - (a.pctMeta ?? 0))
}

export interface MinhaMediaPlaca { placa: string; kmlMedio: number; pctMeta: number | null; meta: number | null; diasNaPlaca: number }

// Usado pelo bot (Aurora) — "qual minha média" responde pela placa que o
// motorista mais dirigiu no mês fechado, não por uma média pessoal direta
// (que pode não ter amostra nenhuma pra boa parte da frota).
export async function buscarMinhaMediaPlaca(filial: string, matricula: string): Promise<MinhaMediaPlaca | null> {
  const { inicio, fim } = mesFechadoAtual()
  const matriculaNorm = normalizarMatricula(matricula)
  if (!matriculaNorm) return null
  const [dias, nomes] = await Promise.all([diasUteisMotorista(filial, inicio, fim), nomePorMatricula(filial)])
  const nome = nomes.get(matriculaNorm)
  if (!nome) return null

  const diasDele = dias.filter((d) => d.nome === nome)
  if (diasDele.length === 0) return null

  const porPlaca = new Map<string, DiaUtilMotorista[]>()
  for (const d of diasDele) {
    if (!porPlaca.has(d.placa)) porPlaca.set(d.placa, [])
    porPlaca.get(d.placa)!.push(d)
  }
  let melhorPlaca = ''
  let melhorLinhas: DiaUtilMotorista[] = []
  for (const [placa, linhas] of porPlaca) {
    if (linhas.length > melhorLinhas.length) { melhorPlaca = placa; melhorLinhas = linhas }
  }
  const kmlMedio = mediaKmlPonderada(melhorLinhas)
  const meta = melhorLinhas.find((l) => l.meta != null)?.meta ?? null
  return { placa: melhorPlaca, kmlMedio, pctMeta: meta ? kmlMedio / meta : null, meta, diasNaPlaca: melhorLinhas.length }
}
