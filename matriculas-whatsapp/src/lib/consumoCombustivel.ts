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

// ── Dias úteis de telemetria (1 motorista identificado, deslocamento e
// consumo reais) — base de todo o ranking ──────────────────────────────

export interface DiaUtilMotorista {
  nome: string; placa: string; dia: string; kml: number; distancia: number
  modelo: string | null; meta: number | null; centroCusto: string | null; idleSegundos: number | null
}

function extrairMotoristaUnico(raw: string | null): string | null {
  if (!raw || raw.includes(',')) return null // dia com mais de 1 motorista: sem como atribuir com segurança
  const m = raw.match(/^(.*?)\s*-\s*\d+$/)
  return m ? m[1].trim() : null
}

async function diasUteisMotorista(filial: string, dataIni: string, dataFim: string): Promise<DiaUtilMotorista[]> {
  const [abastecimentos, telemetria] = await Promise.all([
    listarAbastecimentos(filial, dataIni, dataFim),
    listarTelemetria(filial, dataIni, dataFim),
  ])
  const ref = referenciaPorPlaca(abastecimentos)

  const dias: DiaUtilMotorista[] = []
  for (const t of telemetria) {
    const nome = extrairMotoristaUnico(t.motoristas_raw)
    if (!nome) continue
    if ((t.distancia_percorrida ?? 0) < 30) continue
    if (!t.consumo_combustivel_litros || t.consumo_combustivel_litros <= 0) continue
    if (t.media_consumo_kml == null) continue
    const r = ref.get(t.placa)
    dias.push({
      nome, placa: t.placa, dia: t.dia, kml: t.media_consumo_kml, distancia: t.distancia_percorrida ?? 0,
      modelo: r?.modelo ?? null, meta: r?.meta ?? null, centroCusto: r?.centroCusto ?? null,
      idleSegundos: t.parado_ligado_segundos,
    })
  }
  return dias
}

// ── Ranking por motorista ───────────────────────────────────────────────

export interface RankingMotorista {
  nome: string; dias: number; kmlMedio: number; pctMeta: number | null; kmTotal: number
}

const MIN_DIAS_RANKING = 5

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
    if (linhas.length < MIN_DIAS_RANKING) continue
    const kmlMedio = linhas.reduce((s, l) => s + l.kml, 0) / linhas.length
    const pctMeta = linhas.reduce((s, l) => s + l.kml / (l.meta as number), 0) / linhas.length
    const kmTotal = linhas.reduce((s, l) => s + l.distancia, 0)
    ranking.push({ nome, dias: linhas.length, kmlMedio, pctMeta, kmTotal })
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
    .filter(([, linhas]) => linhas.length >= MIN_DIAS_RANKING)
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
