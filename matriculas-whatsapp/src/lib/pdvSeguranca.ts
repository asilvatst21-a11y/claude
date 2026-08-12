import * as XLSX from 'xlsx'
import { supabase } from './supabase'

// ── PDV Crítico (Segurança) ─────────────────────────────────────────────
// Relato do motorista (categoria/subgrupo) já existe hoje fora deste app —
// entra aqui por upload periódico da planilha de origem. Só a categoria
// "Segurança" vira caso neste módulo; as demais (Produtividade, Qualidade,
// Cordialidade, Outros) seguem pro time responsável e nunca são gravadas
// aqui.

export type NivelCriticidade = 'alto' | 'medio' | 'leve'
export type NivelMedido = NivelCriticidade | 'conforme'
export type StatusRelato =
  | 'aguardando_triagem' | 'agendado' | 'preenchido' | 'aprovado' | 'nao_critico'
  | 'encerrado_historico'  // CLOSED na origem (ou encerrado manualmente com data retroativa) — nunca passou por visita
  | 'cancelado'             // CANCELED na origem — só registro de análise, nunca vira caso

export const NIVEL_LABEL: Record<NivelCriticidade, string> = { alto: 'NC Alto', medio: 'NC Médio', leve: 'NC Leve' }
export const NIVEL_MEDIDO_LABEL: Record<NivelMedido, string> = { alto: 'NC Alto', medio: 'NC Médio', leve: 'NC Leve', conforme: 'Conforme' }
export const STATUS_LABEL: Record<StatusRelato, string> = {
  aguardando_triagem: 'Aguardando triagem',
  agendado: 'Visita agendada',
  preenchido: 'Aguarda finalização',
  aprovado: 'Encerrado',
  nao_critico: 'Não crítico · sem visita',
  encerrado_historico: 'Encerrado (histórico)',
  cancelado: 'Cancelado na origem',
}

// Status que não entram na fila operacional — só existem pra análise
// (histórico importado ou registro de cancelamento da origem).
const STATUS_FORA_DO_PAINEL: StatusRelato[] = ['encerrado_historico', 'cancelado']

// Prazo da visita a partir do nível inicial — editável no código até
// virar tela de configuração própria; hoje reflete o mockup aprovado.
export const PRAZO_DIAS: Record<NivelCriticidade, number> = { alto: 2, medio: 7, leve: 30 }

// Sugestão inicial (mockup aprovado) — usada só pra semear a config na
// primeira vez que a filial abre a tela; depois disso é 100% editável.
export const SUBGRUPOS_SEGURANCA_PADRAO: { subgrupo: string; nivel: NivelCriticidade }[] = [
  { subgrupo: 'Alto risco de violência urbana (roubo)', nivel: 'alto' },
  { subgrupo: 'Risco de empilhamento no estoque', nivel: 'alto' },
  { subgrupo: 'Acesso / Escada / Rampa irregular', nivel: 'medio' },
  { subgrupo: 'Rua de difícil acesso', nivel: 'medio' },
  { subgrupo: 'Restrições de estacionamento', nivel: 'leve' },
  { subgrupo: 'Calçada de acesso irregular', nivel: 'leve' },
  { subgrupo: 'Dificuldade do uso do cone', nivel: 'leve' },
  { subgrupo: 'Baldeio em excesso', nivel: 'leve' },
]

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

// normalize() já tira acento — comparar contra uma constante SEM tirar
// acento dela mesma (bug real: "segurança" nunca batia com o resultado
// normalizado "seguranca", e todo relato caía em "outras áreas").
const CATEGORIA_SEGURANCA = normalize('Segurança')

// A planilha de origem grafa o mesmo subgrupo de formas diferentes (ex.:
// "Rampa irregular" vs "Acesso / Escada / Rampa irregular") — sem
// canonicalizar, cada variação vira uma "categoria" nova sem nível
// configurado e a criticidade nunca é aplicada. Casa por pedaço (o nome
// costuma vir separado por "/"): se qualquer pedaço do nome bruto bate
// (igual ou contido) com qualquer pedaço de um subgrupo já cadastrado,
// usa o nome canônico já cadastrado em vez do bruto.
function pedacosDoSubgrupo(s: string): string[] {
  return normalize(s).split('/').map((p) => p.trim()).filter(Boolean)
}

function canonicalizarSubgrupo(bruto: string, canonicos: string[]): string {
  const brutoNorm = normalize(bruto)
  for (const c of canonicos) {
    if (normalize(c) === brutoNorm) return c
  }
  const brutoPedacos = pedacosDoSubgrupo(bruto)
  for (const c of canonicos) {
    const cPedacos = pedacosDoSubgrupo(c)
    if (cPedacos.some((cp) => brutoPedacos.some((bp) => bp === cp || bp.includes(cp) || cp.includes(bp)))) {
      return c
    }
  }
  return bruto
}

// Célula de data real do Excel: extrai ano/mês/dia em UTC (seguro pra
// datas de calendário normais — o deslocamento por fuso só afeta células
// de HORÁRIO puro ancoradas em 1899, não datas reais como esta).
function excelDateParaISO(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
  }
  return null
}

export interface RelatoImportado {
  codigoPdv: string
  categoria: string
  subgrupo: string
  codigoMotorista: string | null
  relatoMotorista: string | null
  dataRelato: string | null
  origemStatus: string | null
  prazoOrigem: string | null
  ultimaAtualizacao: string | null
}

/**
 * Planilha de relatos do motorista (ex.: export "Export (2)") — colunas:
 * pais, REGIONAL, OPERAÇÃO, cdd, data_de_criacao, codigo_pdv, categoria,
 * subcategoria, codigo_motorista, relato_motorista, instrucao_registrada,
 * status, prazo, ultima_atualizacao, mes, tipo, transportadora, partition.
 */
export function parseRelatosPdvBuffer(buffer: ArrayBuffer): RelatoImportado[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames.find((n) => normalize(n).includes('export')) ?? workbook.SheetNames[0]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null })
  if (rows.length === 0) return []

  const header = rows[0].map(normalize)
  const pdvIdx = header.findIndex((c) => c.includes('codigo_pdv') || c.includes('codigo pdv'))
  const categoriaIdx = header.indexOf('categoria')
  const subcatIdx = header.findIndex((c) => c.includes('subcategoria'))
  const motoristaIdx = header.findIndex((c) => c.includes('codigo_motorista') || c.includes('codigo motorista'))
  const relatoIdx = header.findIndex((c) => c.includes('relato_motorista') || c.includes('relato motorista'))
  const dataIdx = header.findIndex((c) => c.includes('data_de_criacao') || c.includes('data de criacao'))
  const statusIdx = header.indexOf('status')
  const prazoIdx = header.indexOf('prazo')
  const ultimaAtualizacaoIdx = header.findIndex((c) => c.includes('ultima_atualizacao') || c.includes('ultima atualizacao'))
  if (pdvIdx === -1 || categoriaIdx === -1 || subcatIdx === -1) return []

  const out: RelatoImportado[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const codigoPdv = String(row[pdvIdx] ?? '').trim()
    const categoria = String(row[categoriaIdx] ?? '').trim()
    const subgrupo = String(row[subcatIdx] ?? '').trim()
    if (!codigoPdv || !categoria || !subgrupo) continue
    out.push({
      codigoPdv,
      categoria,
      subgrupo,
      codigoMotorista: motoristaIdx !== -1 ? String(row[motoristaIdx] ?? '').trim() || null : null,
      relatoMotorista: relatoIdx !== -1 ? String(row[relatoIdx] ?? '').trim() || null : null,
      dataRelato: dataIdx !== -1 ? excelDateParaISO(row[dataIdx]) : null,
      origemStatus: statusIdx !== -1 ? String(row[statusIdx] ?? '').trim() || null : null,
      prazoOrigem: prazoIdx !== -1 ? excelDateParaISO(row[prazoIdx]) : null,
      ultimaAtualizacao: ultimaAtualizacaoIdx !== -1 ? excelDateParaISO(row[ultimaAtualizacaoIdx]) : null,
    })
  }
  return out
}

// ── Config: nível inicial por subgrupo ──────────────────────────────────

export interface NivelSubgrupo {
  id: string
  filial: string
  subgrupo: string
  nivel: NivelCriticidade
}

export async function listarNiveisSubgrupo(filial: string): Promise<NivelSubgrupo[]> {
  const { data, error } = await supabase
    .from('pdv_seguranca_niveis_subgrupo')
    .select('*')
    .eq('filial', filial)
    .order('subgrupo')
  if (error) { console.error('listarNiveisSubgrupo error:', error.message); return [] }
  return data ?? []
}

export async function salvarNivelSubgrupo(filial: string, subgrupo: string, nivel: NivelCriticidade): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('pdv_seguranca_niveis_subgrupo')
    .upsert({ filial, subgrupo, nivel, updated_at: new Date().toISOString() }, { onConflict: 'filial,subgrupo' })
  return { error: error?.message ?? null }
}

// Semeia a sugestão padrão só pros subgrupos que a filial ainda não configurou.
export async function semearNiveisPadrao(filial: string): Promise<void> {
  const existentes = new Set((await listarNiveisSubgrupo(filial)).map((n) => n.subgrupo))
  const faltando = SUBGRUPOS_SEGURANCA_PADRAO.filter((s) => !existentes.has(s.subgrupo))
  if (faltando.length === 0) return
  await supabase.from('pdv_seguranca_niveis_subgrupo').insert(
    faltando.map((s) => ({ filial, subgrupo: s.subgrupo, nivel: s.nivel }))
  )
}

// ── Import dos relatos ───────────────────────────────────────────────────

function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export interface ResultadoImportRelatos {
  seguranca: number         // total de novos relatos de Segurança processados (ativos + históricos + cancelados)
  ativos: number            // entraram na fila operacional (aguardando triagem)
  fechadosHistorico: number // já vieram CLOSED na origem — vira registro fechado, sem triagem, só análise
  outrasAreas: number
  jaExistiam: number
  semData: number
  canceladosNaOrigem: number
  reincidencias: number
  erroAtualizacao?: string
}

const NIVEL_ORDEM: Record<NivelCriticidade, number> = { leve: 0, medio: 1, alto: 2 }
const ORDEM_NIVEL: NivelCriticidade[] = ['leve', 'medio', 'alto']

function escalarNivel(nivel: NivelCriticidade): NivelCriticidade {
  return ORDEM_NIVEL[Math.min(NIVEL_ORDEM[nivel] + 1, 2)]
}

/**
 * Importa relatos de PDV. Só grava categoria "Segurança" — o resto é só
 * contado (some pro time responsável, não vira linha aqui). Nunca
 * sobrescreve o CASO de um relato que já existe (mesma chave filial+pdv+
 * subgrupo+data) — um caso em andamento não pode ser resetado por uma
 * reimportação. A única coisa que É atualizada num relato já existente é
 * o "Status BEES" (coluna "status" da própria planilha, que reflete o
 * estado no sistema de origem e pode mudar a cada reimportação).
 *
 * Relatos NOVOS que já chegam CANCELED ou CLOSED na origem nunca entram
 * na fila operacional (nunca viram "aguardando triagem"): CANCELED vira
 * um registro terminal 'cancelado' e CLOSED vira 'encerrado_historico' —
 * ambos gravados só pra alimentar a análise (% cancelado por subgrupo/mês,
 * % fechado no prazo usando prazo/ultima_atualizacao da própria planilha).
 * Só OPEN/IN_PROGRESS (ou qualquer status desconhecido) abrem triagem de
 * verdade.
 *
 * Reincidência: quando o mesmo PDV+subgrupo já teve um caso APROVADO
 * (concluído) antes da data deste novo relato, é sinal de que a
 * orientação recomendada não está sendo seguida na entrega — o novo caso
 * é marcado como reincidente e a criticidade escala um nível.
 */
export async function importarRelatosPdv(file: File, filial: string): Promise<ResultadoImportRelatos> {
  const buffer = await file.arrayBuffer()
  const linhas = parseRelatosPdvBuffer(buffer)
  if (linhas.length === 0) throw new Error('Nenhum relato reconhecido na planilha.')

  const niveis = new Map((await listarNiveisSubgrupo(filial)).map((n) => [n.subgrupo, n.nivel]))
  const subgruposCanonicos = [...niveis.keys()]

  const resultado: ResultadoImportRelatos = {
    seguranca: 0, ativos: 0, fechadosHistorico: 0, outrasAreas: 0, jaExistiam: 0, semData: 0, canceladosNaOrigem: 0, reincidencias: 0,
  }
  const candidatasComRepetidas = linhas
    .filter((l) => {
      if (normalize(l.categoria) !== CATEGORIA_SEGURANCA) { resultado.outrasAreas++; return false }
      if (!l.dataRelato) { resultado.semData++; return false }
      return true
    })
    .map((l) => ({ ...l, subgrupo: canonicalizarSubgrupo(l.subgrupo, subgruposCanonicos) }))
  if (candidatasComRepetidas.length === 0) return resultado

  // A planilha de origem traz o mesmo relato repetido em mais de uma linha
  // (ex.: atualizações sucessivas do mesmo caso) — sem isso o INSERT em
  // lote quebra na constraint única, já que duas linhas do próprio arquivo
  // caem na mesma chave filial+pdv+subgrupo+data.
  const porChave = new Map(candidatasComRepetidas.map((l) => [`${l.codigoPdv}|${l.subgrupo}|${l.dataRelato}`, l]))
  const candidatas = [...porChave.values()]

  const codigosPdv = [...new Set(candidatas.map((l) => l.codigoPdv))]
  const [{ data: existentesRaw }, { data: historicoRaw }] = await Promise.all([
    supabase.from('pdv_seguranca_relatos').select('id, codigo_pdv, subgrupo, data_relato, origem_status, status, prazo_origem')
      .eq('filial', filial).in('codigo_pdv', codigosPdv),
    // Histórico completo (qualquer status) desses PDVs — usado tanto pra
    // contar a ocorrência quanto pra achar o último caso já aprovado.
    supabase.from('pdv_seguranca_relatos').select('id, codigo_pdv, subgrupo, status, finalizado_em')
      .eq('filial', filial).in('codigo_pdv', codigosPdv),
  ])
  // Canonicaliza o subgrupo dos relatos JÁ GRAVADOS também — linhas
  // importadas antes da canonicalização existir podem ter ficado salvas
  // com o texto bruto (ex.: "Rampa irregular" em vez de "Acesso / Escada
  // / Rampa irregular"). Sem isso, a chave de comparação não bate mais
  // depois que a canonicalização entrou, o relato reimportado é tratado
  // como "novo" (vira linha duplicada) e o caso antigo nunca é achado
  // pra reclassificar — ele fica preso em "Aguardando triagem" pra sempre.
  const existentesPorChave = new Map((existentesRaw ?? []).map((r) => [
    `${r.codigo_pdv}|${canonicalizarSubgrupo(r.subgrupo, subgruposCanonicos)}|${r.data_relato}`, r,
  ]))

  const novas = candidatas.filter((l) => !existentesPorChave.has(`${l.codigoPdv}|${l.subgrupo}|${l.dataRelato}`))
  resultado.jaExistiam = candidatas.length - novas.length
  resultado.seguranca = novas.length

  // Relatos que já existem: em princípio só o Status BEES pode mudar — um
  // caso em andamento (agendado/preenchido/aprovado/não crítico) nunca é
  // sobrescrito só porque a origem mudou de status. A EXCEÇÃO é um caso
  // que nunca saiu da triagem (ainda "aguardando_triagem", nada foi feito
  // com ele aqui): se a origem agora mostra CANCELED/CLOSED, reclassifica
  // pra 'cancelado'/'encerrado_historico' também — sem isso, relatos
  // importados antes dessa regra existir ficavam presos em "Aguardando
  // triagem" pra sempre mesmo já resolvidos/cancelados na origem.
  const paraAtualizarStatus = candidatas
    .map((l) => ({ l, existente: existentesPorChave.get(`${l.codigoPdv}|${l.subgrupo}|${l.dataRelato}`) }))
    .filter((x) => {
      if (!x.existente) return false
      if (x.existente.origem_status !== x.l.origemStatus) return true
      // prazo_origem só passou a ser gravado depois — relato antigo (ou já
      // reclassificado num deploy anterior a essa correção) pode estar sem
      // ele mesmo já tendo o dado na planilha agora. Backfilla.
      if (!x.existente.prazo_origem && x.l.prazoOrigem) return true
      // Status BEES já bate com a última reimportação, mas se o caso
      // ainda está preso em "aguardando_triagem" apesar da origem já
      // mostrar CANCELED/CLOSED, precisa tentar reclassificar de novo
      // (aconteceu de a atualização anterior só ter tocado o Status BEES,
      // sem reclassificar o status do caso).
      const origemNorm = normalize(x.l.origemStatus)
      const precisaReclassificar = origemNorm === 'canceled' || origemNorm === 'cancelado' || origemNorm === 'closed'
      return x.existente.status === 'aguardando_triagem' && precisaReclassificar
    })
  const CONCORRENCIA = 15
  for (let i = 0; i < paraAtualizarStatus.length; i += CONCORRENCIA) {
    const resultados = await Promise.all(
      paraAtualizarStatus.slice(i, i + CONCORRENCIA).map(({ l, existente }) => {
        const origemNorm = normalize(l.origemStatus)
        const isCancelado = origemNorm === 'canceled' || origemNorm === 'cancelado'
        const isFechadoHistorico = origemNorm === 'closed'
        // prazo_origem também é campo "fonte" (coluna M da planilha) — sem
        // atualizar aqui, um relato reclassificado ficava com prazo_origem
        // nulo pra sempre (ele foi gravado antes desse campo existir) e
        // caía em "sem prazo", nunca entrando no % fechado no prazo/fora.
        const patch: Record<string, unknown> = { origem_status: l.origemStatus, prazo_origem: l.prazoOrigem }
        if (existente!.status === 'aguardando_triagem' && (isCancelado || isFechadoHistorico)) {
          patch.status = isCancelado ? 'cancelado' : 'encerrado_historico'
          patch.finalizado_em = l.ultimaAtualizacao ?? l.dataRelato
          if (isCancelado) resultado.canceladosNaOrigem++
          else resultado.fechadosHistorico++
        }
        return supabase.from('pdv_seguranca_relatos').update(patch).eq('id', existente!.id)
      })
    )
    // Erro de update aqui era engolido silenciosamente — se a
    // reclassificação falhar (RLS, constraint etc.), precisa aparecer,
    // não só "continuar em aguardando triagem" sem explicação nenhuma.
    for (const r of resultados) {
      if (r.error) { console.error('pdv_seguranca_relatos update error:', r.error.message); resultado.erroAtualizacao = r.error.message }
    }
  }

  const historicoPorChave = new Map<string, typeof historicoRaw>()
  for (const h of historicoRaw ?? []) {
    const chave = `${h.codigo_pdv}|${canonicalizarSubgrupo(h.subgrupo, subgruposCanonicos)}`
    const lista = historicoPorChave.get(chave) ?? []
    lista.push(h)
    historicoPorChave.set(chave, lista as any)
  }

  // Relatos NOVOS que já chegam CANCELED/CLOSED na origem nunca abrem
  // triagem — viram registro terminal (cancelado / encerrado_historico)
  // gravado só pra alimentar a análise. OPEN/IN_PROGRESS (ou status
  // desconhecido) seguem pro fluxo normal de triagem.
  const rows = novas.map((l) => {
    const origemNorm = normalize(l.origemStatus)
    const isCancelado = origemNorm === 'canceled' || origemNorm === 'cancelado'
    const isFechadoHistorico = origemNorm === 'closed'

    const chave = `${l.codigoPdv}|${l.subgrupo}`
    const historico = (historicoPorChave.get(chave) ?? []) as { id: string; status: string; finalizado_em: string | null }[]
    const ultimoAprovado = historico
      .filter((h) => h.status === 'aprovado' && h.finalizado_em && h.finalizado_em < `${l.dataRelato}T23:59:59`)
      .sort((a, b) => (b.finalizado_em! > a.finalizado_em! ? 1 : -1))[0]

    let nivel = niveis.get(l.subgrupo) ?? null
    if (ultimoAprovado) {
      resultado.reincidencias++
      if (nivel) nivel = escalarNivel(nivel)
    }

    if (isCancelado) resultado.canceladosNaOrigem++
    else if (isFechadoHistorico) resultado.fechadosHistorico++
    else resultado.ativos++

    return {
      filial,
      codigo_pdv: l.codigoPdv,
      categoria: l.categoria,
      subgrupo: l.subgrupo,
      codigo_motorista: l.codigoMotorista,
      relato_motorista: l.relatoMotorista,
      data_relato: l.dataRelato,
      origem_status: l.origemStatus,
      prazo_origem: l.prazoOrigem,
      nivel_inicial: nivel,
      prazo_visita: nivel ? somarDias(l.dataRelato!, PRAZO_DIAS[nivel]) : null,
      status: isCancelado ? ('cancelado' as const) : isFechadoHistorico ? ('encerrado_historico' as const) : ('aguardando_triagem' as const),
      finalizado_em: (isCancelado || isFechadoHistorico) ? (l.ultimaAtualizacao ?? l.dataRelato) : null,
      reincidente_apos: ultimoAprovado?.id ?? null,
      numero_ocorrencia: historico.length + 1,
    }
  })
  const BATCH = 300
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('pdv_seguranca_relatos').insert(rows.slice(i, i + BATCH))
    if (error) throw new Error(`Erro ao salvar relatos: ${error.message}`)
  }
  return resultado
}

// ── Painel de relatos ────────────────────────────────────────────────────

export interface RelatoLinha {
  id: string
  codigoPdv: string
  subgrupo: string
  nivel: NivelCriticidade | null
  codigoMotorista: string | null
  dataRelato: string
  prazoVisita: string | null
  status: StatusRelato
  statusBees: string | null
  reincidente: boolean
  numeroOcorrencia: number
}

// Painel operacional: nunca mostra histórico importado/cancelado da
// origem (poderiam ser milhares de linhas) — isso vive só na análise.
export async function listarRelatos(filial: string): Promise<RelatoLinha[]> {
  const { data, error } = await supabase
    .from('pdv_seguranca_relatos')
    .select('id, codigo_pdv, subgrupo, nivel_inicial, nivel_medido, codigo_motorista, data_relato, prazo_visita, status, reincidente_apos, numero_ocorrencia, origem_status')
    .eq('filial', filial)
    .not('status', 'in', `(${STATUS_FORA_DO_PAINEL.join(',')})`)
    .order('data_relato', { ascending: false })
    .limit(300)
  if (error) { console.error('listarRelatos error:', error.message); return [] }
  const linhas = data ?? []

  return linhas.map((l) => ({
    id: l.id,
    codigoPdv: l.codigo_pdv,
    subgrupo: l.subgrupo,
    nivel: (l.nivel_medido ?? l.nivel_inicial) as NivelCriticidade | null,
    codigoMotorista: l.codigo_motorista,
    dataRelato: l.data_relato,
    prazoVisita: l.prazo_visita,
    status: l.status as StatusRelato,
    // "Status BEES" = coluna "status" (L) da própria planilha de relatos —
    // não é join com outra tabela. Atualiza a cada reimportação.
    statusBees: l.origem_status,
    reincidente: l.reincidente_apos != null,
    numeroOcorrencia: l.numero_ocorrencia ?? 1,
  }))
}

export async function marcarNaoCritico(id: string, justificativa: string, decididoPor: string): Promise<{ error: string | null }> {
  if (!justificativa.trim()) return { error: 'Justificativa é obrigatória.' }
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'nao_critico',
      justificativa_nao_critico: justificativa.trim(),
      decidido_por: decididoPor,
      decidido_em: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

// Encerramento manual retroativo: caso o relato tenha chegado OPEN/
// IN_PROGRESS na origem mas já tenha sido resolvido na prática antes de
// entrar no fluxo, dá pra encerrar direto (sem checklist de visita) com
// uma data de fechamento escolhida — inclusive no passado.
export async function encerrarComDataRetroativa(id: string, dataFechamentoISO: string, decididoPor: string): Promise<{ error: string | null }> {
  if (!dataFechamentoISO) return { error: 'Data de fechamento é obrigatória.' }
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'encerrado_historico',
      finalizado_em: `${dataFechamentoISO}T00:00:00`,
      finalizado_por: decididoPor,
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

// ── Dashboard de análise ─────────────────────────────────────────────────
// Cobre o que fica de fora do painel operacional: relatos já fechados
// (aprovado/encerrado_historico, no prazo × fora do prazo usando prazo/
// ultima_atualizacao da própria planilha) e cancelados na origem
// (por subgrupo e por mês), além do dia da semana que mais recebe relato
// (todos os status, não só os fechados/cancelados). Busca tudo uma vez só
// e filtra por ano/mês no cliente — evita ida ao banco a cada troca de
// filtro.

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export interface LinhaAnaliseRelato {
  subgrupo: string
  status: string
  dataRelato: string | null
  prazoOrigem: string | null
  finalizadoEm: string | null
}

export async function carregarRelatosAnalise(filial: string): Promise<LinhaAnaliseRelato[]> {
  // O PostgREST corta em 1000 linhas por página — com milhares de relatos
  // históricos, um único select() perderia o resto silenciosamente.
  type LinhaRaw = { subgrupo: string; status: string; data_relato: string | null; prazo_origem: string | null; finalizado_em: string | null }
  const PAGINA = 1000
  const linhas: LinhaRaw[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('pdv_seguranca_relatos')
      .select('subgrupo, status, data_relato, prazo_origem, finalizado_em')
      .eq('filial', filial)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('carregarRelatosAnalise error:', error.message); break }
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return linhas.map((l) => ({
    subgrupo: l.subgrupo, status: l.status, dataRelato: l.data_relato,
    prazoOrigem: l.prazo_origem, finalizadoEm: l.finalizado_em,
  }))
}

export interface FiltroAnaliseData {
  ano: number | null
  mes: number | null  // 1-12
}

export interface EstatisticasPdvCritico {
  totalFechados: number
  fechadosNoPrazo: number
  fechadosForaPrazo: number
  fechadosSemPrazo: number
  pctNoPrazo: number
  fechadosPorMes: { mes: string; total: number; noPrazo: number; foraPrazo: number; pctNoPrazo: number }[]
  fechadosPorAno: { ano: string; total: number; noPrazo: number; foraPrazo: number; pctNoPrazo: number }[]
  statusDisponiveis: string[]
  porStatusESubgrupo: Record<string, { subgrupo: string; total: number }[]>
  porStatusEMes: Record<string, { mes: string; total: number }[]>
  relatosPorDiaSemana: { diaSemana: string; total: number }[]
  anosDisponiveis: number[]
}

function dataBateNoFiltro(dataISO: string | null, filtro: FiltroAnaliseData): boolean {
  if (!dataISO) return filtro.ano == null && filtro.mes == null
  if (filtro.ano != null && Number(dataISO.slice(0, 4)) !== filtro.ano) return false
  if (filtro.mes != null && Number(dataISO.slice(5, 7)) !== filtro.mes) return false
  return true
}

export function calcularEstatisticasPdvCritico(todasLinhas: LinhaAnaliseRelato[], filtro: FiltroAnaliseData = { ano: null, mes: null }): EstatisticasPdvCritico {
  const anosDisponiveis = [...new Set(
    todasLinhas.map((l) => l.dataRelato ? Number(l.dataRelato.slice(0, 4)) : null).filter((a): a is number => a != null)
  )].sort((a, b) => b - a)

  const linhas = todasLinhas.filter((l) => dataBateNoFiltro(l.dataRelato, filtro))

  let fechadosNoPrazo = 0, fechadosForaPrazo = 0, fechadosSemPrazo = 0
  const fechadosPorMesMap = new Map<string, { total: number; noPrazo: number; foraPrazo: number }>()
  const fechadosPorAnoMap = new Map<string, { total: number; noPrazo: number; foraPrazo: number }>()
  const fechados = linhas.filter((l) => l.status === 'aprovado' || l.status === 'encerrado_historico')
  for (const l of fechados) {
    const mesChave = l.finalizadoEm ? l.finalizadoEm.slice(0, 7) : (l.dataRelato ? l.dataRelato.slice(0, 7) : 'sem-data')
    const anoChave = mesChave.slice(0, 4)
    const m = fechadosPorMesMap.get(mesChave) ?? { total: 0, noPrazo: 0, foraPrazo: 0 }
    const a = fechadosPorAnoMap.get(anoChave) ?? { total: 0, noPrazo: 0, foraPrazo: 0 }
    m.total++; a.total++
    if (!l.prazoOrigem || !l.finalizadoEm) {
      fechadosSemPrazo++
    } else if (l.finalizadoEm.slice(0, 10) <= l.prazoOrigem) {
      fechadosNoPrazo++; m.noPrazo++; a.noPrazo++
    } else {
      fechadosForaPrazo++; m.foraPrazo++; a.foraPrazo++
    }
    fechadosPorMesMap.set(mesChave, m)
    fechadosPorAnoMap.set(anoChave, a)
  }

  // Quebra por subgrupo/mês vale pra QUALQUER status (não só cancelado) —
  // a tela filtra por status escolhido, preparado pra quando existirem
  // mais status além de cancelado/encerrado_historico.
  const statusDisponiveis = [...new Set(linhas.map((l) => l.status))].sort()
  const porStatusESubgrupo: Record<string, Map<string, number>> = {}
  const porStatusEMes: Record<string, Map<string, number>> = {}
  for (const l of linhas) {
    const subMap = porStatusESubgrupo[l.status] ?? (porStatusESubgrupo[l.status] = new Map())
    subMap.set(l.subgrupo, (subMap.get(l.subgrupo) ?? 0) + 1)
    const mesMap = porStatusEMes[l.status] ?? (porStatusEMes[l.status] = new Map())
    const mes = l.dataRelato ? l.dataRelato.slice(0, 7) : 'sem-data'
    mesMap.set(mes, (mesMap.get(mes) ?? 0) + 1)
  }
  const porStatusESubgrupoFinal: Record<string, { subgrupo: string; total: number }[]> = {}
  for (const [status, mapa] of Object.entries(porStatusESubgrupo)) {
    porStatusESubgrupoFinal[status] = [...mapa.entries()].map(([subgrupo, total]) => ({ subgrupo, total })).sort((a, b) => b.total - a.total)
  }
  const porStatusEMesFinal: Record<string, { mes: string; total: number }[]> = {}
  for (const [status, mapa] of Object.entries(porStatusEMes)) {
    porStatusEMesFinal[status] = [...mapa.entries()].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))
  }

  const diaSemanaTotais = new Array(7).fill(0)
  for (const l of linhas) {
    if (!l.dataRelato) continue
    diaSemanaTotais[new Date(`${l.dataRelato}T00:00:00Z`).getUTCDay()]++
  }

  const totalComPrazo = fechadosNoPrazo + fechadosForaPrazo
  return {
    totalFechados: fechados.length,
    fechadosNoPrazo, fechadosForaPrazo, fechadosSemPrazo,
    pctNoPrazo: totalComPrazo > 0 ? Math.round((fechadosNoPrazo / totalComPrazo) * 1000) / 10 : 0,
    fechadosPorMes: [...fechadosPorMesMap.entries()]
      .map(([mes, m]) => ({
        mes, total: m.total, noPrazo: m.noPrazo, foraPrazo: m.foraPrazo,
        pctNoPrazo: (m.noPrazo + m.foraPrazo) > 0 ? Math.round((m.noPrazo / (m.noPrazo + m.foraPrazo)) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    fechadosPorAno: [...fechadosPorAnoMap.entries()]
      .map(([ano, a]) => ({
        ano, total: a.total, noPrazo: a.noPrazo, foraPrazo: a.foraPrazo,
        pctNoPrazo: (a.noPrazo + a.foraPrazo) > 0 ? Math.round((a.noPrazo / (a.noPrazo + a.foraPrazo)) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.ano.localeCompare(b.ano)),
    statusDisponiveis,
    porStatusESubgrupo: porStatusESubgrupoFinal,
    porStatusEMes: porStatusEMesFinal,
    relatosPorDiaSemana: DIAS_SEMANA_LABEL.map((diaSemana, i) => ({ diaSemana, total: diaSemanaTotais[i] })),
    anosDisponiveis,
  }
}
