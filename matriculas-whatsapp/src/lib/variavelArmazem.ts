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
    const cpf = apenasDigitos(rows[i][cpfIdx])
    if (!nome || cpf.length < 3) continue
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

export async function importarPontuacao(filial: string, data: string, buffer: ArrayBuffer): Promise<{ linhas: number; semCadastro: number }> {
  const linhas = parsePontuacaoBuffer(buffer)
  if (linhas.length === 0) throw new Error('Nenhuma pontuação encontrada. Confira se é o relatório de Remuneração Variável.')

  const [clusters, cadastro] = await Promise.all([buscarClusters(), buscarColaboradores(filial)])
  const agora = new Date().toISOString()
  let semCadastro = 0

  const rows = linhas.map((l) => {
    const cluster = clusterDoTotal(l.total, clusters)
    const valor = calcularValor(l.total, cluster)
    const colab = acharColaborador(l.nome, cadastro)
    if (!colab) semCadastro++
    return {
      filial, data, nome_relatorio: l.nome,
      colaborador_id: colab?.id ?? null, cpf: colab?.cpf ?? null,
      creditos: l.creditos, debitos: l.debitos, total: l.total,
      valor_por_1000: cluster?.valorPor1000 ?? null, valor_calculado: valor,
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
  porCluster: { pontMin: number; pontMax: number; valorPor1000: number; qtd: number }[]
}

export async function buscarResumoDia(filial: string, data: string): Promise<ResumoVariavel> {
  const [{ data: pont }, clusters] = await Promise.all([
    supabase.from('variavel_pontuacao')
      .select('nome_relatorio, total, valor_por_1000, valor_calculado, colaborador_id')
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
    acumuladoMes, porCluster,
  }
}

// ── Totem (consulta do colaborador) ──────────────────────────────────────
export interface ResultadoTotem {
  nome: string
  cpf: string
  total: number
  valorPor1000: number | null
  valor: number
  clusterMin: number | null
  clusterMax: number | null
  acumuladoMes: number
}

// Filtra por prefixo de CPF (os 3 primeiros dígitos) + pontuação do dia.
// Como 3 dígitos não são únicos, pode retornar mais de um — o totem lista
// pra pessoa escolher a dela.
export async function buscarTotem(filial: string, data: string, cpfPrefixo: string): Promise<ResultadoTotem[]> {
  const prefixo = apenasDigitos(cpfPrefixo)
  if (prefixo.length < 3) return []
  const clusters = await buscarClusters()

  const { data: pont } = await supabase.from('variavel_pontuacao')
    .select('nome_relatorio, cpf, total, valor_por_1000, valor_calculado')
    .eq('filial', filial).eq('data', data)
    .like('cpf', `${prefixo}%`)

  const inicioMes = data.slice(0, 8) + '01'
  const cpfs = [...new Set((pont ?? []).map((p) => p.cpf).filter((c): c is string => !!c))]
  const { data: mes } = cpfs.length > 0
    ? await supabase.from('variavel_pontuacao')
        .select('cpf, valor_calculado').eq('filial', filial).gte('data', inicioMes).lte('data', data).in('cpf', cpfs)
    : { data: [] as { cpf: string; valor_calculado: number }[] }
  const acumPorCpf = new Map<string, number>()
  for (const m of mes ?? []) acumPorCpf.set(m.cpf, (acumPorCpf.get(m.cpf) ?? 0) + Number(m.valor_calculado))

  return (pont ?? []).map((p) => {
    const cluster = clusterDoTotal(Number(p.total), clusters)
    return {
      nome: p.nome_relatorio, cpf: p.cpf ?? '',
      total: Number(p.total),
      valorPor1000: p.valor_por_1000 != null ? Number(p.valor_por_1000) : null,
      valor: Number(p.valor_calculado),
      clusterMin: cluster?.pontMin ?? null, clusterMax: cluster?.pontMax ?? null,
      acumuladoMes: acumPorCpf.get(p.cpf ?? '') ?? Number(p.valor_calculado),
    }
  })
}

export function formatarBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
