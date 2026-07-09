import * as XLSX from 'xlsx'
import { supabase } from './supabase'

// ── Helpers ───────────────────────────────────────────────────────────────
function normalizarNome(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// "19.483,00" / "19483,00" / "1065" → number. Aceita o formato BR (vírgula
// decimal, ponto de milhar) e também número puro.
function parseNumeroBR(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim()
  if (!s) return 0
  const limpo = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isNaN(n) ? 0 : n
}

function apenasDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

// Mascara o CPF para exibição, deixando visíveis só os 3 primeiros dígitos
// (que a própria pessoa digitou) e os 2 últimos: 123.•••.•••-45
function mascararCpf(cpf: string | null | undefined): string {
  const d = apenasDigitos(cpf)
  if (d.length !== 11) return d ? '•••' : ''
  return `${d.slice(0, 3)}.•••.•••-${d.slice(9, 11)}`
}

function readRows(buffer: ArrayBuffer): unknown[][] {
  // raw:false é essencial aqui: o relatório traz número no formato BR
  // ("19.456,00") e, com raw:true, o SheetJS lê "19456,00" como 1945600
  // (interpreta a vírgula como separador de milhar). Com raw:false vem a
  // string original, que o parseNumeroBR converte corretamente.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null }) as unknown[][]
}

function acharColuna(header: string[], ...termos: string[]): number {
  const norm = header.map((c) => normalizarNome(c).toLowerCase())
  for (const t of termos) {
    const idx = norm.findIndex((c) => c.includes(t))
    if (idx !== -1) return idx
  }
  return -1
}

// ── Clusters ────────────────────────────────────────────────────────────
export interface Cluster {
  pontMin: number
  pontMax: number
  valorPor1000: number
}

export async function buscarClusters(): Promise<Cluster[]> {
  const { data } = await supabase
    .from('variavel_clusters')
    .select('pont_min, pont_max, valor_por_1000, ordem')
    .order('ordem')
  return (data ?? []).map((c) => ({ pontMin: c.pont_min, pontMax: c.pont_max, valorPor1000: c.valor_por_1000 }))
}

export function clusterDoTotal(total: number, clusters: Cluster[]): Cluster | null {
  return clusters.find((c) => total >= c.pontMin && total <= c.pontMax) ?? null
}

// O colaborador recebe TODOS os pontos pela faixa em que o total cai.
export function calcularValor(total: number, cluster: Cluster | null): number {
  if (!cluster || total <= 0) return 0
  return Math.round((total / 1000) * cluster.valorPor1000 * 100) / 100
}

// ── Cadastro de colaboradores ────────────────────────────────────────────
export interface ColaboradorArmazem {
  id: string
  nome: string
  cpf: string
  ativo: boolean
}

export interface ColaboradorImport {
  nome: string
  cpf: string
}

// Planilha de cadastro: procura colunas "nome" e "cpf" (em qualquer ordem).
export function parseColaboradoresBuffer(buffer: ArrayBuffer): ColaboradorImport[] {
  const rows = readRows(buffer)
  if (rows.length === 0) return []
  const header = rows[0].map((c) => String(c ?? ''))
  const nomeIdx = acharColuna(header, 'nome', 'colaborador', 'usuario')
  const cpfIdx = acharColuna(header, 'cpf', 'documento')
  if (nomeIdx === -1 || cpfIdx === -1) return []

  const out: ColaboradorImport[] = []
  for (let i = 1; i < rows.length; i++) {
    const nome = normalizarNome(rows[i][nomeIdx])
    const cpfBruto = apenasDigitos(rows[i][cpfIdx])
    if (!nome || cpfBruto.length < 3) continue
    // A planilha às vezes traz o CPF como número (não texto), o que derruba
    // os zeros à esquerda (ex.: "01234567890" vira "1234567890"). Sem o
    // padStart, o totem passa a buscar pelo prefixo errado pra esse CPF.
    const cpf = cpfBruto.padStart(11, '0')
    out.push({ nome, cpf })
  }
  return out
}

export async function importarColaboradores(filial: string, itens: ColaboradorImport[]): Promise<number> {
  if (itens.length === 0) throw new Error('Nenhum colaborador com nome e CPF encontrado na planilha.')
  // Dedup por CPF dentro do arquivo (o último ganha).
  const porCpf = new Map(itens.map((i) => [i.cpf, i]))
  const rows = [...porCpf.values()].map((i) => ({ filial, nome: i.nome, cpf: i.cpf, ativo: true }))
  const { error } = await supabase.from('armazem_colaboradores').upsert(rows, { onConflict: 'filial,cpf' })
  if (error) throw new Error(error.message)
  return rows.length
}

export async function buscarColaboradores(filial: string): Promise<ColaboradorArmazem[]> {
  const { data } = await supabase
    .from('armazem_colaboradores')
    .select('id, nome, cpf, ativo')
    .eq('filial', filial)
    .order('nome')
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, cpf: c.cpf, ativo: c.ativo }))
}

export async function salvarColaborador(filial: string, nome: string, cpf: string, id?: string): Promise<void> {
  const payload = { filial, nome: normalizarNome(nome), cpf: apenasDigitos(cpf), ativo: true }
  if (payload.cpf.length !== 11) throw new Error('CPF inválido — informe os 11 dígitos.')
  const { error } = id
    ? await supabase.from('armazem_colaboradores').update(payload).eq('id', id)
    : await supabase.from('armazem_colaboradores').upsert(payload, { onConflict: 'filial,cpf' })
  if (error) throw new Error(error.message)
}

export async function removerColaborador(id: string): Promise<void> {
  const { error } = await supabase.from('armazem_colaboradores').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Import da pontuação diária ───────────────────────────────────────────
export interface PontuacaoLinha {
  nome: string
  creditos: number
  debitos: number
  total: number
}

// Relatório: Usuário;Tipo;Créditos;Débitos;Total;Valor (CSV com ; e número BR).
export function parsePontuacaoBuffer(buffer: ArrayBuffer): PontuacaoLinha[] {
  const rows = readRows(buffer)
  if (rows.length === 0) return []
  const header = rows[0].map((c) => String(c ?? ''))
  const nomeIdx = acharColuna(header, 'usuario', 'colaborador', 'nome')
  const credIdx = acharColuna(header, 'credito')
  const debIdx = acharColuna(header, 'debito')
  const totalIdx = acharColuna(header, 'total')
  if (nomeIdx === -1 || totalIdx === -1) return []

  const out: PontuacaoLinha[] = []
  for (let i = 1; i < rows.length; i++) {
    const nome = normalizarNome(rows[i][nomeIdx])
    if (!nome) continue
    const creditos = credIdx !== -1 ? parseNumeroBR(rows[i][credIdx]) : 0
    const debitos = debIdx !== -1 ? parseNumeroBR(rows[i][debIdx]) : 0
    const total = parseNumeroBR(rows[i][totalIdx])
    out.push({ nome, creditos, debitos, total })
  }
  return out
}

// Casa o nome do relatório com o cadastro: exato, senão um sendo prefixo do
// outro (o relatório às vezes trunca o nome, ex.: "...DA SIL").
function acharColaborador(nomeRel: string, cadastro: ColaboradorArmazem[]): ColaboradorArmazem | null {
  const exato = cadastro.find((c) => c.nome === nomeRel)
  if (exato) return exato
  const prefixo = cadastro.find((c) => c.nome.startsWith(nomeRel) || nomeRel.startsWith(c.nome))
  return prefixo ?? null
}

// `rvDobrada`: quando true, o VALOR calculado daquele dia sai em dobro (a
// pontuação/faixa continuam normais — só o valor pago é que dobra).
export async function importarPontuacao(filial: string, data: string, buffer: ArrayBuffer, rvDobrada = false): Promise<{ linhas: number; semCadastro: number }> {
  const linhas = parsePontuacaoBuffer(buffer)
  if (linhas.length === 0) throw new Error('Nenhuma pontuação encontrada. Confira se é o relatório de Remuneração Variável.')

  const [clusters, cadastro] = await Promise.all([buscarClusters(), buscarColaboradores(filial)])
  const agora = new Date().toISOString()
  let semCadastro = 0

  const rows = linhas.map((l) => {
    const cluster = clusterDoTotal(l.total, clusters)
    const valor = calcularValor(l.total, cluster) * (rvDobrada ? 2 : 1)
    const colab = acharColaborador(l.nome, cadastro)
    if (!colab) semCadastro++
    return {
      filial, data, nome_relatorio: l.nome,
      colaborador_id: colab?.id ?? null, cpf: colab?.cpf ?? null,
      creditos: l.creditos, debitos: l.debitos, total: l.total,
      valor_por_1000: cluster?.valorPor1000 ?? null, valor_calculado: valor,
      rv_dobrada: rvDobrada,
      importado_em: agora,
    }
  })

  const { error } = await supabase.from('variavel_pontuacao').upsert(rows, { onConflict: 'filial,data,nome_relatorio' })
  if (error) throw new Error(error.message)
  return { linhas: rows.length, semCadastro }
}

// ── Dashboard do supervisor ──────────────────────────────────────────────
export interface LinhaDashboard {
  nome: string
  total: number
  valorPor1000: number | null
  valor: number
  temCadastro: boolean
}

export interface ResumoVariavel {
  linhas: LinhaDashboard[]
  totalPagar: number
  colaboradores: number
  pontuacaoTotal: number
  ticketMedio: number
  maior: number
  menor: number
  acumuladoMes: number
  rvDobrada: boolean
  porCluster: { pontMin: number; pontMax: number; valorPor1000: number; qtd: number }[]
}

export async function buscarResumoDia(filial: string, data: string): Promise<ResumoVariavel> {
  const [{ data: pont }, clusters] = await Promise.all([
    supabase.from('variavel_pontuacao')
      .select('nome_relatorio, total, valor_por_1000, valor_calculado, colaborador_id, rv_dobrada')
      .eq('filial', filial).eq('data', data),
    buscarClusters(),
  ])

  // Acumulado do mês (mesma filial, mesmo mês da data selecionada).
  const inicioMes = data.slice(0, 8) + '01'
  const { data: mesPont } = await supabase.from('variavel_pontuacao')
    .select('valor_calculado').eq('filial', filial).gte('data', inicioMes).lte('data', data)
  const acumuladoMes = (mesPont ?? []).reduce((s, r) => s + Number(r.valor_calculado), 0)

  const linhas: LinhaDashboard[] = (pont ?? [])
    .map((r) => ({
      nome: r.nome_relatorio,
      total: Number(r.total),
      valorPor1000: r.valor_por_1000 != null ? Number(r.valor_por_1000) : null,
      valor: Number(r.valor_calculado),
      temCadastro: !!r.colaborador_id,
    }))
    .sort((a, b) => b.total - a.total)

  const valores = linhas.map((l) => l.valor)
  const totalPagar = valores.reduce((s, v) => s + v, 0)
  const pontuacaoTotal = linhas.reduce((s, l) => s + l.total, 0)

  const porCluster = clusters.map((c) => ({
    pontMin: c.pontMin, pontMax: c.pontMax, valorPor1000: c.valorPor1000,
    qtd: linhas.filter((l) => l.total >= c.pontMin && l.total <= c.pontMax).length,
  }))

  return {
    linhas, totalPagar, colaboradores: linhas.length, pontuacaoTotal,
    ticketMedio: linhas.length > 0 ? totalPagar / linhas.length : 0,
    maior: valores.length > 0 ? Math.max(...valores) : 0,
    menor: valores.length > 0 ? Math.min(...valores) : 0,
    acumuladoMes,
    rvDobrada: (pont ?? []).some((r) => r.rv_dobrada === true),
    porCluster,
  }
}

// ── Histórico mensal (dashboard) ─────────────────────────────────────────
export interface DiaHistorico {
  data: string        // yyyy-mm-dd
  rotulo: string      // dd/mm
  totalPago: number
  colaboradores: number
  pontuacaoTotal: number
  pontuacaoMedia: number
  ticketMedio: number
  rvDobrada: boolean
}

export interface HistoricoMes {
  dias: DiaHistorico[]
  totalMes: number
  mediaDiaria: number
  diasComLancamento: number
  maiorDia: DiaHistorico | null
  mediaPontuacaoMes: number
  maiorDiaPontuacao: DiaHistorico | null
}

// Agrega a variável dia a dia dentro de um mês (mesISO = 'yyyy-mm').
export async function buscarHistoricoMes(filial: string, mesISO: string): Promise<HistoricoMes> {
  const [ano, mes] = mesISO.split('-').map(Number)
  const inicio = `${mesISO}-01`
  const prox = mes >= 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`

  const { data } = await supabase.from('variavel_pontuacao')
    .select('data, valor_calculado, total, rv_dobrada')
    .eq('filial', filial).gte('data', inicio).lt('data', prox)

  const porDia = new Map<string, { totalPago: number; pontos: number; colabs: number; rvDobrada: boolean }>()
  for (const r of data ?? []) {
    const dia = String(r.data)
    const acc = porDia.get(dia) ?? { totalPago: 0, pontos: 0, colabs: 0, rvDobrada: false }
    acc.totalPago += Number(r.valor_calculado)
    acc.pontos += Number(r.total)
    acc.colabs += 1
    if (r.rv_dobrada) acc.rvDobrada = true
    porDia.set(dia, acc)
  }

  const dias: DiaHistorico[] = [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, v]) => ({
      data: dia,
      rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`,
      totalPago: v.totalPago,
      colaboradores: v.colabs,
      pontuacaoTotal: v.pontos,
      pontuacaoMedia: v.colabs > 0 ? v.pontos / v.colabs : 0,
      ticketMedio: v.colabs > 0 ? v.totalPago / v.colabs : 0,
      rvDobrada: v.rvDobrada,
    }))

  const totalMes = dias.reduce((s, d) => s + d.totalPago, 0)
  const pontuacaoTotalMes = dias.reduce((s, d) => s + d.pontuacaoTotal, 0)
  const colaboradoresDiasMes = dias.reduce((s, d) => s + d.colaboradores, 0)
  const maiorDia = dias.reduce<DiaHistorico | null>((mx, d) => (!mx || d.totalPago > mx.totalPago ? d : mx), null)
  const maiorDiaPontuacao = dias.reduce<DiaHistorico | null>((mx, d) => (!mx || d.pontuacaoMedia > mx.pontuacaoMedia ? d : mx), null)

  return {
    dias,
    totalMes,
    mediaDiaria: dias.length > 0 ? totalMes / dias.length : 0,
    diasComLancamento: dias.length,
    maiorDia,
    // Média ponderada pelo nº de colaboradores de cada dia (não a média simples
    // das médias diárias), para não distorcer dias com poucos lançamentos.
    mediaPontuacaoMes: colaboradoresDiasMes > 0 ? pontuacaoTotalMes / colaboradoresDiasMes : 0,
    maiorDiaPontuacao,
  }
}

// ── Ranking de colaboradores num intervalo de datas ──────────────────────
export interface ColaboradorRanking {
  chave: string
  nome: string
  diasLancados: number
  pontuacaoTotal: number
  pontuacaoMedia: number
  valorTotal: number
  faltas: number // dias do período em que houve lançamento de ALGUÉM, mas não deste colaborador
}

export interface RankingPeriodo {
  colaboradores: ColaboradorRanking[]
  diasComLancamentoPeriodo: number
}

// Agrega por colaborador (colaborador_id quando existe, senão o nome do
// relatório) dentro de um intervalo de datas [dataIni, dataFim] inclusivo.
// `faltas` compara com o total de dias em que a filial teve QUALQUER
// lançamento no período — não com os dias corridos do calendário — porque
// dias sem nenhum import (ex.: fim de semana sem operação) não devem contar
// como falta de ninguém.
export async function buscarRankingColaboradores(filial: string, dataIni: string, dataFim: string): Promise<RankingPeriodo> {
  const { data } = await supabase.from('variavel_pontuacao')
    .select('nome_relatorio, colaborador_id, data, total, valor_calculado')
    .eq('filial', filial).gte('data', dataIni).lte('data', dataFim)

  const diasComLancamento = new Set<string>()
  const porColab = new Map<string, { nome: string; dias: number; pontos: number; valor: number }>()
  for (const r of data ?? []) {
    diasComLancamento.add(String(r.data))
    const chave = r.colaborador_id ?? r.nome_relatorio
    const acc = porColab.get(chave) ?? { nome: r.nome_relatorio, dias: 0, pontos: 0, valor: 0 }
    acc.dias += 1
    acc.pontos += Number(r.total)
    acc.valor += Number(r.valor_calculado)
    porColab.set(chave, acc)
  }

  const diasComLancamentoPeriodo = diasComLancamento.size
  const colaboradores = [...porColab.entries()].map(([chave, v]) => ({
    chave,
    nome: v.nome,
    diasLancados: v.dias,
    pontuacaoTotal: v.pontos,
    pontuacaoMedia: v.dias > 0 ? v.pontos / v.dias : 0,
    valorTotal: v.valor,
    faltas: Math.max(0, diasComLancamentoPeriodo - v.dias),
  }))

  return { colaboradores, diasComLancamentoPeriodo }
}

// ── Comparativo de desempenho vs. período anterior equivalente ──────────
export interface ComparativoColaborador {
  chave: string
  nome: string
  mediaAtual: number
  mediaAnterior: number | null
  variacaoPct: number | null // null = sem período anterior comparável; negativo = queda
}

function periodoAnteriorEquivalente(dataIni: string, dataFim: string): { ini: string; fim: string } {
  const ini = new Date(`${dataIni}T00:00:00`)
  const fim = new Date(`${dataFim}T00:00:00`)
  const dias = Math.round((fim.getTime() - ini.getTime()) / 86400000) + 1
  const anteriorFim = new Date(ini)
  anteriorFim.setDate(anteriorFim.getDate() - 1)
  const anteriorIni = new Date(anteriorFim)
  anteriorIni.setDate(anteriorIni.getDate() - (dias - 1))
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { ini: iso(anteriorIni), fim: iso(anteriorFim) }
}

// Compara a pontuação média de cada colaborador no período selecionado com a
// do período imediatamente anterior de mesma duração — para achar quem caiu
// (ou subiu) de desempenho.
export async function buscarComparativoDesempenho(filial: string, dataIni: string, dataFim: string): Promise<ComparativoColaborador[]> {
  const { ini: antIni, fim: antFim } = periodoAnteriorEquivalente(dataIni, dataFim)
  const [{ colaboradores: atual }, { colaboradores: anterior }] = await Promise.all([
    buscarRankingColaboradores(filial, dataIni, dataFim),
    buscarRankingColaboradores(filial, antIni, antFim),
  ])
  const mapAnterior = new Map(anterior.map((a) => [a.chave, a]))

  return atual.map((a) => {
    const ant = mapAnterior.get(a.chave)
    const mediaAnterior = ant?.pontuacaoMedia ?? null
    const variacaoPct = mediaAnterior != null && mediaAnterior > 0 ? ((a.pontuacaoMedia - mediaAnterior) / mediaAnterior) * 100 : null
    return { chave: a.chave, nome: a.nome, mediaAtual: a.pontuacaoMedia, mediaAnterior, variacaoPct }
  })
}

// ── Migração de cluster mês a mês ────────────────────────────────────────
export interface MigracaoColaborador {
  chave: string
  nome: string
  valorPor1000Anterior: number | null
  valorPor1000Atual: number | null
  direcao: 'subiu' | 'desceu' | 'igual' | 'novo' | 'saiu'
}

export function mesAnteriorDe(mesISO: string): string {
  const [ano, mes] = mesISO.split('-').map(Number)
  return mes <= 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`
}

function rangeDoMes(mesISO: string): { ini: string; fim: string } {
  const [ano, mes] = mesISO.split('-').map(Number)
  const ini = `${mesISO}-01`
  const prox = mes >= 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`
  const fimDate = new Date(`${prox}T00:00:00`)
  fimDate.setDate(fimDate.getDate() - 1)
  const fim = `${fimDate.getFullYear()}-${String(fimDate.getMonth() + 1).padStart(2, '0')}-${String(fimDate.getDate()).padStart(2, '0')}`
  return { ini, fim }
}

// Compara em qual faixa (cluster) a MÉDIA mensal de cada colaborador caiu no
// mês selecionado e no mês anterior, para identificar quem subiu ou desceu
// de faixa — não é o total acumulado, é a faixa que a média do mês indicaria.
export async function buscarMigracaoClusters(filial: string, mesAtualISO: string): Promise<MigracaoColaborador[]> {
  const mesAnteriorISO = mesAnteriorDe(mesAtualISO)
  const atualRange = rangeDoMes(mesAtualISO)
  const anteriorRange = rangeDoMes(mesAnteriorISO)

  const [clusters, { colaboradores: atual }, { colaboradores: anterior }] = await Promise.all([
    buscarClusters(),
    buscarRankingColaboradores(filial, atualRange.ini, atualRange.fim),
    buscarRankingColaboradores(filial, anteriorRange.ini, anteriorRange.fim),
  ])
  const clustersOrdenados = [...clusters].sort((a, b) => a.pontMin - b.pontMin)
  const idxCluster = (media: number): number | null => {
    const c = clusterDoTotal(media, clustersOrdenados)
    return c ? clustersOrdenados.findIndex((x) => x.pontMin === c.pontMin) : null
  }

  const mapAtual = new Map(atual.map((a) => [a.chave, a]))
  const mapAnterior = new Map(anterior.map((a) => [a.chave, a]))
  const chaves = new Set([...mapAtual.keys(), ...mapAnterior.keys()])

  const out: MigracaoColaborador[] = []
  for (const chave of chaves) {
    const a = mapAtual.get(chave)
    const p = mapAnterior.get(chave)
    const idxAtual = a ? idxCluster(a.pontuacaoMedia) : null
    const idxAnterior = p ? idxCluster(p.pontuacaoMedia) : null

    let direcao: MigracaoColaborador['direcao']
    if (a && !p) direcao = 'novo'
    else if (!a && p) direcao = 'saiu'
    else if (idxAtual != null && idxAnterior != null) direcao = idxAtual > idxAnterior ? 'subiu' : idxAtual < idxAnterior ? 'desceu' : 'igual'
    else direcao = 'igual'

    out.push({
      chave,
      nome: (a ?? p)!.nome,
      valorPor1000Anterior: idxAnterior != null ? clustersOrdenados[idxAnterior].valorPor1000 : null,
      valorPor1000Atual: idxAtual != null ? clustersOrdenados[idxAtual].valorPor1000 : null,
      direcao,
    })
  }
  return out
}

// ── Extrato (estratificação) de um colaborador num intervalo de datas ────
export interface DiaColaborador {
  data: string
  pontuacaoTotal: number
  valorPor1000: number | null
  valor: number
  rvDobrada: boolean
}

export interface ExtratoColaborador {
  nome: string
  dias: DiaColaborador[]
  diasLancados: number
  pontuacaoTotal: number
  pontuacaoMedia: number
  valorTotal: number
}

// `chave` é a mesma usada no ranking (colaborador_id, ou o nome do relatório
// quando não há cadastro vinculado).
export async function buscarExtratoColaborador(filial: string, dataIni: string, dataFim: string, chave: string): Promise<ExtratoColaborador> {
  const { data } = await supabase.from('variavel_pontuacao')
    .select('nome_relatorio, colaborador_id, data, total, valor_calculado, valor_por_1000, rv_dobrada')
    .eq('filial', filial).gte('data', dataIni).lte('data', dataFim)

  const linhas = (data ?? [])
    .filter((r) => (r.colaborador_id ?? r.nome_relatorio) === chave)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))

  const dias: DiaColaborador[] = linhas.map((r) => ({
    data: String(r.data),
    pontuacaoTotal: Number(r.total),
    valorPor1000: r.valor_por_1000 != null ? Number(r.valor_por_1000) : null,
    valor: Number(r.valor_calculado),
    rvDobrada: !!r.rv_dobrada,
  }))

  const pontuacaoTotal = dias.reduce((s, d) => s + d.pontuacaoTotal, 0)
  const valorTotal = dias.reduce((s, d) => s + d.valor, 0)

  return {
    nome: linhas[0]?.nome_relatorio ?? '',
    dias,
    diasLancados: dias.length,
    pontuacaoTotal,
    pontuacaoMedia: dias.length > 0 ? pontuacaoTotal / dias.length : 0,
    valorTotal,
  }
}

// ── Totem (consulta do colaborador) ──────────────────────────────────────
// A remuneração variável fecha em competência 21→20 (ex.: "07/2026" cobre
// 21/06/2026 a 20/07/2026 — o rótulo é o mês em que a janela TERMINA), não em
// mês calendário. Isto vale só para o totem por enquanto; o dashboard do
// supervisor (Histórico do mês / Ranking) segue em mês calendário.
export function competenciaAtual(): string {
  const d = new Date()
  let ano = d.getFullYear()
  let mes = d.getMonth() + 1
  if (d.getDate() >= 21) { mes += 1; if (mes > 12) { mes = 1; ano += 1 } }
  return `${ano}-${String(mes).padStart(2, '0')}`
}

export function competenciaAnterior(mesRotulo: string): string {
  return mesAnteriorDe(mesRotulo)
}

export function competenciaSeguinte(mesRotulo: string): string {
  const [ano, mes] = mesRotulo.split('-').map(Number)
  return mes >= 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`
}

export function rangeCompetencia(mesRotulo: string): { ini: string; fim: string } {
  const [ano, mes] = mesRotulo.split('-').map(Number)
  const anoIni = mes <= 1 ? ano - 1 : ano
  const mesIni = mes <= 1 ? 12 : mes - 1
  return { ini: `${anoIni}-${String(mesIni).padStart(2, '0')}-21`, fim: `${mesRotulo}-20` }
}

export interface DiaCompetencia {
  data: string
  pontuacaoTotal: number
  valorPor1000: number | null
  valor: number
  rvDobrada: boolean
}

export interface ResultadoTotemCompetencia {
  cpfReal: string // nunca exibir na tela — só serve para trocar de competência sem redigitar o CPF
  cpfMascarado: string
  nome: string
  dias: DiaCompetencia[] // ordenado por data crescente
  diasComLancamento: number
  pontuacaoTotal: number
  valorTotal: number
  mediaDiaria: number
  ultimoDia: DiaCompetencia | null
  maiorDia: DiaCompetencia | null
}

function agregarDiasCompetencia(cpfReal: string, nome: string, linhas: { data: string; total: number; valor_por_1000: number | null; valor_calculado: number; rv_dobrada?: boolean }[]): ResultadoTotemCompetencia {
  const dias: DiaCompetencia[] = linhas.map((r) => ({
    data: r.data,
    pontuacaoTotal: Number(r.total),
    valorPor1000: r.valor_por_1000 != null ? Number(r.valor_por_1000) : null,
    valor: Number(r.valor_calculado),
    rvDobrada: !!r.rv_dobrada,
  }))
  const pontuacaoTotal = dias.reduce((s, d) => s + d.pontuacaoTotal, 0)
  const valorTotal = dias.reduce((s, d) => s + d.valor, 0)
  const maiorDia = dias.reduce<DiaCompetencia | null>((mx, d) => (!mx || d.valor > mx.valor ? d : mx), null)
  return {
    cpfReal, cpfMascarado: mascararCpf(cpfReal), nome,
    dias, diasComLancamento: dias.length, pontuacaoTotal, valorTotal,
    mediaDiaria: dias.length > 0 ? valorTotal / dias.length : 0,
    ultimoDia: dias[dias.length - 1] ?? null,
    maiorDia,
  }
}

// Filtra por prefixo de CPF (os 3 primeiros dígitos) dentro da competência
// inteira. Como 3 dígitos não são únicos, pode retornar mais de uma pessoa —
// o totem lista pra pessoa escolher a dela.
export async function buscarTotemCompetencia(filial: string, cpfPrefixo: string, mesRotulo: string): Promise<ResultadoTotemCompetencia[]> {
  const prefixo = apenasDigitos(cpfPrefixo)
  if (prefixo.length < 3) return []
  const { ini, fim } = rangeCompetencia(mesRotulo)

  const { data } = await supabase.from('variavel_pontuacao')
    .select('nome_relatorio, cpf, data, total, valor_por_1000, valor_calculado, rv_dobrada')
    .eq('filial', filial).gte('data', ini).lte('data', fim)
    .like('cpf', `${prefixo}%`)
    .order('data')

  type Linha = { data: string; total: number; valor_por_1000: number | null; valor_calculado: number; rv_dobrada?: boolean }
  const porCpf = new Map<string, { nome: string; linhas: Linha[] }>()
  for (const r of data ?? []) {
    if (!r.cpf) continue
    const acc = porCpf.get(r.cpf) ?? { nome: r.nome_relatorio, linhas: [] as Linha[] }
    acc.linhas.push({ data: String(r.data), total: r.total, valor_por_1000: r.valor_por_1000, valor_calculado: r.valor_calculado, rv_dobrada: r.rv_dobrada })
    porCpf.set(r.cpf, acc)
  }

  return [...porCpf.entries()].map(([cpfReal, v]) => agregarDiasCompetencia(cpfReal, v.nome, v.linhas))
}

// Troca de competência sem redigitar o CPF (usa o cpfReal já obtido acima).
export async function buscarCompetenciaPorCpf(filial: string, cpfReal: string, mesRotulo: string): Promise<ResultadoTotemCompetencia> {
  const { ini, fim } = rangeCompetencia(mesRotulo)
  const { data } = await supabase.from('variavel_pontuacao')
    .select('nome_relatorio, data, total, valor_por_1000, valor_calculado, rv_dobrada')
    .eq('filial', filial).eq('cpf', cpfReal).gte('data', ini).lte('data', fim)
    .order('data')

  const linhas = (data ?? []).map((r) => ({ data: String(r.data), total: r.total, valor_por_1000: r.valor_por_1000, valor_calculado: r.valor_calculado, rv_dobrada: r.rv_dobrada }))
  const nome = data?.[0]?.nome_relatorio ?? ''
  return agregarDiasCompetencia(cpfReal, nome, linhas)
}

export function formatarBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
