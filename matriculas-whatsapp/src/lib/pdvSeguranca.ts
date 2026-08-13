import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { enviarMensagemWhatsApp, aguardarEntreEnvios } from './zapi'

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

// Checklist da visita — grade única de chips (não duplica antes/depois).
// Rascunho inicial cobrindo os subgrupos já usados no relato do motorista
// mais alguns itens gerais de segurança de visita; dá pra ajustar depois,
// mesmo padrão do SUBGRUPOS_SEGURANCA_PADRAO acima (constante no código,
// não tem tela de configuração própria ainda).
export interface RiscoVisita { id: string; label: string; nivel: NivelCriticidade }
export const RISCOS_VISITA_PDV: RiscoVisita[] = [
  { id: 'violencia_urbana', label: 'Alto risco de violência urbana (roubo)', nivel: 'alto' },
  { id: 'sem_seguranca_local', label: 'Ausência de segurança/portaria em área de risco', nivel: 'alto' },
  { id: 'empilhamento_estoque', label: 'Risco de empilhamento no estoque', nivel: 'alto' },
  { id: 'estrutura_comprometida', label: 'Estrutura de prateleira/estoque comprometida', nivel: 'alto' },
  { id: 'acesso_escada_irregular', label: 'Acesso/escada irregular', nivel: 'medio' },
  { id: 'rampa_irregular', label: 'Rampa de acesso irregular', nivel: 'medio' },
  { id: 'rua_dificil_acesso', label: 'Rua de difícil acesso (manobra/visibilidade)', nivel: 'medio' },
  { id: 'iluminacao_inadequada', label: 'Iluminação inadequada no ponto de descarga', nivel: 'medio' },
  { id: 'sem_sinalizacao', label: 'Ausência de sinalização de segurança', nivel: 'medio' },
  { id: 'piso_escorregadio', label: 'Piso escorregadio ou com buracos', nivel: 'medio' },
  { id: 'fiacao_exposta', label: 'Fiação elétrica exposta', nivel: 'medio' },
  { id: 'animais_soltos', label: 'Animais soltos no local', nivel: 'medio' },
  { id: 'estacionamento_restrito', label: 'Restrições de estacionamento', nivel: 'leve' },
  { id: 'calcada_irregular', label: 'Calçada de acesso irregular', nivel: 'leve' },
  { id: 'dificuldade_cone', label: 'Dificuldade do uso do cone', nivel: 'leve' },
  { id: 'baldeio_excesso', label: 'Baldeio em excesso', nivel: 'leve' },
  { id: 'sem_espaco_manobra', label: 'Falta de espaço pra manobra do caminhão', nivel: 'leve' },
  { id: 'obstrucao_passagem', label: 'Obstrução de passagem por mercadoria/lixo', nivel: 'leve' },
  { id: 'sem_identificacao_pdv', label: 'Ausência de identificação do PDV', nivel: 'leve' },
  { id: 'descarga_sem_cobertura', label: 'Área de descarga sem cobertura (chuva)', nivel: 'leve' },
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
  instrucaoRegistrada: string | null
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
  // raw:true também no XLSX.read() em si (não só no sheet_to_json) — sem
  // isso, CSV corre o mesmo bug já corrigido no tmlParser.ts: a própria
  // ingestão de CSV do SheetJS faz auto-detecção ambígua de data (assume
  // formato americano MM/DD) antes do parser dd/mm-sempre deste módulo
  // rodar. Não afeta .xlsx binário (datas já vêm tipadas).
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true })
  const sheetName = workbook.SheetNames.find((n) => normalize(n).includes('export')) ?? workbook.SheetNames[0]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null })
  if (rows.length === 0) return []

  const header = rows[0].map(normalize)
  const pdvIdx = header.findIndex((c) => c.includes('codigo_pdv') || c.includes('codigo pdv'))
  const categoriaIdx = header.indexOf('categoria')
  const subcatIdx = header.findIndex((c) => c.includes('subcategoria'))
  const motoristaIdx = header.findIndex((c) => c.includes('codigo_motorista') || c.includes('codigo motorista'))
  const relatoIdx = header.findIndex((c) => c.includes('relato_motorista') || c.includes('relato motorista'))
  const instrucaoIdx = header.findIndex((c) => c.includes('instrucao'))
  const dataIdx = header.findIndex((c) => c.includes('data_de_criacao') || c.includes('data de criacao'))
  const statusIdx = header.indexOf('status')
  // Match "solto" — a coluna de prazo na planilha de origem nem sempre se
  // chama exatamente "prazo" (ex.: "prazo_resolucao", "data prazo"). Um
  // indexOf() exato deixava prazoIdx sempre -1 quando o nome real da
  // coluna era outro, e todo relato caía em "sem prazo" no % no prazo.
  const prazoIdx = header.findIndex((c) => c.includes('prazo'))
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
      instrucaoRegistrada: instrucaoIdx !== -1 ? String(row[instrucaoIdx] ?? '').trim() || null : null,
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
    supabase.from('pdv_seguranca_relatos').select('id, codigo_pdv, subgrupo, data_relato, origem_status, status, prazo_origem, instrucao_registrada')
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
      // prazo_origem/instrucao_registrada só passaram a ser gravados
      // depois — relato antigo (ou já reclassificado num deploy anterior a
      // essa correção) pode estar sem eles mesmo já tendo o dado na
      // planilha agora. Backfilla.
      if (!x.existente.prazo_origem && x.l.prazoOrigem) return true
      if (!x.existente.instrucao_registrada && x.l.instrucaoRegistrada) return true
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
        const patch: Record<string, unknown> = { origem_status: l.origemStatus, prazo_origem: l.prazoOrigem, instrucao_registrada: l.instrucaoRegistrada }
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
      instrucao_registrada: l.instrucaoRegistrada,
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
  nivelMedido: NivelMedido | null
  codigoMotorista: string | null
  instrucaoRegistrada: string | null
  dataRelato: string
  prazoVisita: string | null
  status: StatusRelato
  statusBees: string | null
  reincidente: boolean
  numeroOcorrencia: number
  riscosMarcados: string[] | null
  acaoRecomendada: string | null
  visitadoEm: string | null
}

// Painel operacional: nunca mostra histórico importado/cancelado da
// origem (poderiam ser milhares de linhas) — isso vive só na análise.
export async function listarRelatos(filial: string): Promise<RelatoLinha[]> {
  const { data, error } = await supabase
    .from('pdv_seguranca_relatos')
    .select('id, codigo_pdv, subgrupo, nivel_inicial, nivel_medido, codigo_motorista, instrucao_registrada, data_relato, prazo_visita, status, reincidente_apos, numero_ocorrencia, origem_status, riscos_marcados, acao_recomendada, visitado_em')
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
    nivelMedido: l.nivel_medido as NivelMedido | null,
    codigoMotorista: l.codigo_motorista,
    // Coluna K da planilha de origem — instrução já registrada pra esse
    // relato (quando existe), útil pra Segurança ver o que já foi
    // orientado antes de agendar visita.
    instrucaoRegistrada: l.instrucao_registrada,
    dataRelato: l.data_relato,
    prazoVisita: l.prazo_visita,
    status: l.status as StatusRelato,
    // "Status BEES" = coluna "status" (L) da própria planilha de relatos —
    // não é join com outra tabela. Atualiza a cada reimportação.
    statusBees: l.origem_status,
    reincidente: l.reincidente_apos != null,
    riscosMarcados: l.riscos_marcados,
    acaoRecomendada: l.acao_recomendada,
    visitadoEm: l.visitado_em,
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

// ── Finalização (Segurança) ──────────────────────────────────────────────
// Depois do checklist preenchido (status 'preenchido'): aprova, reabre com
// prazo novo de acordo com a criticidade medida na visita, ou marca não
// crítico (mesma regra de não avisar o motorista, reaproveita marcarNaoCritico).

export async function aprovarCaso(id: string, decididoPor: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'aprovado',
      finalizado_em: new Date().toISOString(),
      finalizado_por: decididoPor,
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

/**
 * Reabre o caso: a visita achou algo que não fecha o assunto (checklist
 * mostrou risco que não foi resolvido/aceito). Mesmo caso, novo ciclo —
 * volta pra triagem com prazo do zero calculado pela criticidade MEDIDA
 * na visita (não a inicial), e limpa os dados da visita anterior pra não
 * confundir com o novo checklist que vai ser preenchido.
 */
export async function reabrirCaso(id: string, decididoPor: string): Promise<{ error: string | null }> {
  const { data: atual, error: erroLeitura } = await supabase
    .from('pdv_seguranca_relatos')
    .select('nivel_medido, nivel_inicial, numero_ocorrencia')
    .eq('id', id)
    .maybeSingle()
  if (erroLeitura) return { error: erroLeitura.message }
  if (!atual) return { error: 'Relato não encontrado.' }

  const novoNivel = (atual.nivel_medido ?? atual.nivel_inicial) as NivelCriticidade | null
  const hoje = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'aguardando_triagem',
      nivel_inicial: novoNivel,
      prazo_visita: novoNivel ? somarDias(hoje, PRAZO_DIAS[novoNivel]) : null,
      numero_ocorrencia: (atual.numero_ocorrencia ?? 1) + 1,
      supervisor_id: null, agendado_em: null, agendado_por: null, link_token: null,
      visitado_em: null, nivel_medido: null, pontuacao_medida: null, riscos_marcados: null, acao_recomendada: null,
      decidido_por: decididoPor, decidido_em: new Date().toISOString(),
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

// Correção manual da data de fechamento de um caso já fechado (aprovado
// ou encerrado_historico) — pra ajustar registro que veio errado da
// origem/import sem precisar reabrir o caso nem mexer em mais nada.
export async function corrigirDataFechamento(id: string, novaDataISO: string): Promise<{ error: string | null }> {
  if (!novaDataISO) return { error: 'Data é obrigatória.' }
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({ finalizado_em: `${novaDataISO}T00:00:00` })
    .eq('id', id)
  return { error: error?.message ?? null }
}

// ── Agendamento de visita ────────────────────────────────────────────────
// Reaproveita supervisores_tml (já usado no módulo de TML) — sem cadastro
// próprio pro PDV Crítico. O usuário escolhe manualmente quem recebe o
// aviso (região do PDV × CDD fixo variam por operação, então não dá pra
// decidir isso sozinho).

export interface SupervisorPdv {
  id: string
  nome: string
  telefone: string
}

export async function listarSupervisoresPdv(filial: string): Promise<SupervisorPdv[]> {
  const { data, error } = await supabase
    .from('supervisores_tml')
    .select('id, nome, telefone')
    .eq('filial', filial)
    .order('nome')
  if (error) { console.error('listarSupervisoresPdv error:', error.message); return [] }
  return data ?? []
}

function gerarLinkToken(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface AgendarVisitaResultado {
  error: string | null
  linkToken?: string
  whatsappEnviado?: boolean
  whatsappErro?: string
}

export function montarMensagemAgendamentoVisita(
  relato: { codigoPdv: string; subgrupo: string; nivel: NivelCriticidade | null; prazoVisita: string | null; instrucaoRegistrada: string | null },
  link: string
): string {
  return (
    `🚨 *Visita PDV Crítico — ${NIVEL_LABEL[relato.nivel ?? 'leve']}*\n\n` +
    `PDV: *${relato.codigoPdv}*\n` +
    `Risco: ${relato.subgrupo}\n` +
    (relato.instrucaoRegistrada ? `Instrução já registrada: ${relato.instrucaoRegistrada}\n` : '') +
    (relato.prazoVisita ? `Prazo da visita: ${relato.prazoVisita.split('-').reverse().join('/')}\n` : '') +
    `\nPreencha o checklist da visita pelo link abaixo:\n${link}`
  )
}

/**
 * Agenda a visita: grava supervisor + gera o link público do checklist +
 * manda o aviso por WhatsApp. Se o envio falhar (número inválido, Z-API
 * fora do ar), o agendamento em si já foi salvo — só o aviso não saiu,
 * reportado separadamente pra quem chamou decidir se tenta de novo.
 */
export async function agendarVisita(
  relato: { id: string; codigoPdv: string; subgrupo: string; nivel: NivelCriticidade | null; prazoVisita: string | null; instrucaoRegistrada: string | null },
  supervisor: SupervisorPdv,
  agendadoPor: string
): Promise<AgendarVisitaResultado> {
  const linkToken = gerarLinkToken()
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'agendado',
      supervisor_id: supervisor.id,
      agendado_em: new Date().toISOString(),
      agendado_por: agendadoPor,
      link_token: linkToken,
    })
    .eq('id', relato.id)
  if (error) return { error: error.message }

  const link = `${window.location.origin}/pdv-critico/visita?token=${linkToken}`
  const mensagem = montarMensagemAgendamentoVisita(relato, link)

  const envio = await enviarMensagemWhatsApp(supervisor.telefone, mensagem)
  return { error: null, linkToken, whatsappEnviado: envio.sucesso, whatsappErro: envio.erro }
}

// ── Checklist público da visita (sem login) ──────────────────────────────
// Acessado pelo link enviado no WhatsApp — supervisor não faz login, só
// tem o token da URL como credencial. Consulta/gravação sempre por
// link_token, nunca por id direto (id não vaza pra URL).

export interface RelatoParaVisita {
  id: string
  codigoPdv: string
  subgrupo: string
  nivel: NivelCriticidade | null
  instrucaoRegistrada: string | null
  prazoVisita: string | null
  status: StatusRelato
}

export async function buscarRelatoPorToken(token: string): Promise<{ relato: RelatoParaVisita | null; error: string | null }> {
  if (!token) return { relato: null, error: 'Link inválido.' }
  const { data, error } = await supabase
    .from('pdv_seguranca_relatos')
    .select('id, codigo_pdv, subgrupo, nivel_inicial, instrucao_registrada, prazo_visita, status')
    .eq('link_token', token)
    .maybeSingle()
  if (error) return { relato: null, error: error.message }
  if (!data) return { relato: null, error: 'Link não encontrado — confira se copiou a URL completa.' }
  return {
    relato: {
      id: data.id, codigoPdv: data.codigo_pdv, subgrupo: data.subgrupo,
      nivel: data.nivel_inicial as NivelCriticidade | null,
      instrucaoRegistrada: data.instrucao_registrada, prazoVisita: data.prazo_visita,
      status: data.status as StatusRelato,
    },
    error: null,
  }
}

// Nível medido = o pior nível entre os riscos marcados na visita; nenhum
// risco marcado = "conforme" (visita não achou nada preocupante).
function calcularNivelMedido(riscosMarcados: string[]): NivelMedido {
  const niveis = riscosMarcados
    .map((id) => RISCOS_VISITA_PDV.find((r) => r.id === id)?.nivel)
    .filter((n): n is NivelCriticidade => !!n)
  if (niveis.includes('alto')) return 'alto'
  if (niveis.includes('medio')) return 'medio'
  if (niveis.includes('leve')) return 'leve'
  return 'conforme'
}

export async function enviarChecklistVisita(
  token: string,
  riscosMarcados: string[],
  acaoRecomendada: string
): Promise<{ error: string | null }> {
  const { relato, error: erroBusca } = await buscarRelatoPorToken(token)
  if (erroBusca || !relato) return { error: erroBusca ?? 'Link inválido.' }
  if (relato.status !== 'agendado') return { error: 'Esse checklist já foi preenchido.' }

  const nivelMedido = calcularNivelMedido(riscosMarcados)
  const { error } = await supabase
    .from('pdv_seguranca_relatos')
    .update({
      status: 'preenchido',
      visitado_em: new Date().toISOString(),
      nivel_medido: nivelMedido,
      riscos_marcados: riscosMarcados,
      acao_recomendada: acaoRecomendada.trim() || null,
    })
    .eq('link_token', token)
    .eq('status', 'agendado')
  return { error: error?.message ?? null }
}

// ── Aviso automático ao motorista (PDV aprovado na rota do dia) ─────────
// Mesmo gatilho do Farol de Mercados e PDVs Travas: dispara a cada import
// do BEES em Jornada e Tempo em Rota (distribuicao_bees_visitas tem
// mapa+pdv_codigo+data). Busca os casos 'aprovado' de NOVO a cada disparo
// — se o caso for reaberto, ele sai da lista sozinho e o aviso para sem
// precisar de nenhuma lógica extra de "cancelar". A tabela de dedupe
// (pdv_seguranca_avisos_motorista) evita reenviar o mesmo aviso pro mesmo
// motorista+PDV toda vez que o BEES é reimportado no mesmo dia.
export function montarMensagemAvisoMotoristaPdv(codigoPdv: string, subgrupo: string): string {
  return (
    `⚠️ *Atenção — PDV Crítico*\n\n` +
    `Você está indo pro PDV *${codigoPdv}*, que tem uma orientação de segurança registrada:\n` +
    `${subgrupo}\n\nRedobre a atenção nesse ponto.`
  )
}

export async function avisarMotoristasPdvCritico(filial: string, data: string): Promise<{ enviados: number; erros: string[] }> {
  const erros: string[] = []

  const { data: aprovados, error: erroAprovados } = await supabase
    .from('pdv_seguranca_relatos')
    .select('id, codigo_pdv, subgrupo')
    .eq('filial', filial).eq('status', 'aprovado')
  if (erroAprovados) return { enviados: 0, erros: [erroAprovados.message] }
  if (!aprovados || aprovados.length === 0) return { enviados: 0, erros: [] }
  // Zeros à esquerda variam entre a planilha de relato do motorista e o
  // export do BEES (um pode vir "0088213", o outro "88213") — sem
  // normalizar, o .in('pdv_codigo', ...) abaixo não casava NADA e a função
  // voltava silenciosa (0 enviados, 0 erros), sem nenhum sinal do motivo.
  const casoPorPdv = new Map(aprovados.map((a) => [normalizarCodigoPdv(a.codigo_pdv), a]))

  // Busca todas as visitas do dia (sem filtrar por pdv_codigo no servidor,
  // já que a comparação exata é o que estava quebrando) e casa em memória
  // pelo código normalizado.
  const { data: visitasBrutas, error: erroVisitas } = await supabase
    .from('distribuicao_bees_visitas')
    .select('mapa, pdv_codigo')
    .eq('filial', filial).eq('data', data)
  if (erroVisitas) return { enviados: 0, erros: [erroVisitas.message] }
  if (!visitasBrutas || visitasBrutas.length === 0) {
    return { enviados: 0, erros: ['Nenhuma visita do BEES encontrada pra essa data — confira se o import rodou pra essa filial/data.'] }
  }
  const visitas = visitasBrutas.filter((v) => casoPorPdv.has(normalizarCodigoPdv(v.pdv_codigo)))
  if (visitas.length === 0) {
    return { enviados: 0, erros: [`Nenhum PDV com caso aprovado apareceu na rota do dia (${visitasBrutas.length} visita(s) no BEES, ${casoPorPdv.size} PDV(s) aprovado(s), nenhum em comum).`] }
  }

  const mapas = [...new Set(visitas.map((v) => v.mapa).filter((m): m is number => m != null))]
  if (mapas.length === 0) return { enviados: 0, erros: ['Visitas encontradas mas sem número de mapa (tour_display_id) — não dá pra achar o motorista.'] }

  const [{ data: escalas }, { data: matriculasCad }, { data: rosterTml }, { data: jaAvisados }] = await Promise.all([
    supabase.from('escalas_tml').select('mapa, matricula').eq('filial', filial).eq('data_entrega', data).in('mapa', mapas),
    supabase.from('matriculas').select('numero, whatsapp').eq('filial', filial).eq('ativo', true),
    supabase.from('motoristas_sala_tml').select('matricula, telefone').eq('filial', filial),
    supabase.from('pdv_seguranca_avisos_motorista').select('matricula, codigo_pdv').eq('filial', filial).eq('data', data),
  ])
  const matriculaPorMapa = new Map((escalas ?? []).map((e) => [e.mapa, e.matricula]))
  const telefonePorNumero = new Map((matriculasCad ?? []).map((m) => [normalizarMatricula(String(m.numero)), m.whatsapp as string | null]))
  const telefonePorMatriculaTml = new Map((rosterTml ?? []).map((r) => [r.matricula, r.telefone as string | null]))
  const avisadoSet = new Set((jaAvisados ?? []).map((a) => `${a.matricula}|${a.codigo_pdv}`))

  let enviados = 0
  for (const v of visitas) {
    if (v.mapa == null) continue
    const matricula = matriculaPorMapa.get(v.mapa)
    if (matricula == null) continue
    const caso = casoPorPdv.get(normalizarCodigoPdv(v.pdv_codigo))
    if (!caso) continue
    const chave = `${matricula}|${v.pdv_codigo}`
    if (avisadoSet.has(chave)) continue

    const telefone = telefonePorNumero.get(normalizarMatricula(String(matricula))) ?? telefonePorMatriculaTml.get(matricula) ?? null
    if (!telefone) { erros.push(`Matrícula ${matricula} sem telefone cadastrado (PDV ${v.pdv_codigo})`); continue }

    const mensagem = montarMensagemAvisoMotoristaPdv(v.pdv_codigo, caso.subgrupo)
    const envio = await enviarMensagemWhatsApp(telefone, mensagem)
    if (!envio.sucesso) { erros.push(`Falha ao avisar matrícula ${matricula} (PDV ${v.pdv_codigo}): ${envio.erro}`); continue }

    await supabase.from('pdv_seguranca_avisos_motorista').upsert(
      { filial, data, matricula: String(matricula), codigo_pdv: v.pdv_codigo, relato_id: caso.id },
      { onConflict: 'filial,data,matricula,codigo_pdv' }
    )
    avisadoSet.add(chave)
    enviados++
    await aguardarEntreEnvios()
  }
  return { enviados, erros }
}

export interface AvisoMotoristaLinha {
  id: string
  data: string
  matricula: string
  nomeMotorista: string
  codigoPdv: string
  subgrupo: string | null
  enviadoEm: string
}

// Histórico de avisos já mandados (não é "fila" — é o log do que já saiu),
// pra responder "onde eu vejo que isso foi enviado?" sem precisar confiar
// só no console do navegador no momento do import.
export async function listarAvisosMotoristaPdv(filial: string, limite = 200): Promise<AvisoMotoristaLinha[]> {
  const { data, error } = await supabase
    .from('pdv_seguranca_avisos_motorista')
    .select('id, data, matricula, codigo_pdv, enviado_em, relato_id')
    .eq('filial', filial)
    .order('enviado_em', { ascending: false })
    .limit(limite)
  if (error) { console.error('listarAvisosMotoristaPdv error:', error.message); return [] }
  const linhas = data ?? []
  if (linhas.length === 0) return []

  const relatoIds = [...new Set(linhas.map((l) => l.relato_id).filter((id): id is string => !!id))]
  const [{ data: relatos }, nomePorMatricula] = await Promise.all([
    relatoIds.length > 0
      ? supabase.from('pdv_seguranca_relatos').select('id, subgrupo').in('id', relatoIds)
      : Promise.resolve({ data: [] as { id: string; subgrupo: string }[] }),
    buscarNomesColaboradoresPorMatricula(),
  ])
  const subgrupoPorRelato = new Map((relatos ?? []).map((r) => [r.id, r.subgrupo]))

  return linhas.map((l) => {
    const matriculaNorm = normalizarMatricula(l.matricula)
    return {
      id: l.id,
      data: l.data,
      matricula: l.matricula,
      nomeMotorista: nomePorMatricula.get(matriculaNorm) ?? `Matrícula ${l.matricula} (sem nome cadastrado)`,
      codigoPdv: l.codigo_pdv,
      subgrupo: l.relato_id ? (subgrupoPorRelato.get(l.relato_id) ?? null) : null,
      enviadoEm: l.enviado_em,
    }
  })
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
  id: string
  codigoPdv: string
  subgrupo: string
  status: string
  origemStatus: string | null
  nivel: NivelCriticidade | null
  codigoMotorista: string | null
  relatoMotorista: string | null
  instrucaoRegistrada: string | null
  reincidente: boolean
  dataRelato: string | null
  prazoOrigem: string | null
  finalizadoEm: string | null
  justificativaNaoCritico: string | null
}

export async function carregarRelatosAnalise(filial: string): Promise<LinhaAnaliseRelato[]> {
  // O PostgREST corta em 1000 linhas por página — com milhares de relatos
  // históricos, um único select() perderia o resto silenciosamente.
  type LinhaRaw = {
    id: string; codigo_pdv: string; subgrupo: string; status: string; origem_status: string | null
    nivel_inicial: NivelCriticidade | null; nivel_medido: NivelCriticidade | null
    codigo_motorista: string | null; relato_motorista: string | null; instrucao_registrada: string | null
    reincidente_apos: string | null
    data_relato: string | null; prazo_origem: string | null; finalizado_em: string | null
    justificativa_nao_critico: string | null
  }
  const PAGINA = 1000
  const linhas: LinhaRaw[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('pdv_seguranca_relatos')
      .select('id, codigo_pdv, subgrupo, status, origem_status, nivel_inicial, nivel_medido, codigo_motorista, relato_motorista, instrucao_registrada, reincidente_apos, data_relato, prazo_origem, finalizado_em, justificativa_nao_critico')
      .eq('filial', filial)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('carregarRelatosAnalise error:', error.message); break }
    linhas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return linhas.map((l) => ({
    id: l.id, codigoPdv: l.codigo_pdv, subgrupo: l.subgrupo, status: l.status, origemStatus: l.origem_status,
    nivel: l.nivel_medido ?? l.nivel_inicial,
    codigoMotorista: l.codigo_motorista, relatoMotorista: l.relato_motorista, instrucaoRegistrada: l.instrucao_registrada,
    reincidente: l.reincidente_apos != null,
    dataRelato: l.data_relato, prazoOrigem: l.prazo_origem,
    // finalizado_em volta do Supabase como timestamptz completo
    // ("2026-01-19T00:00:00+00:00"); truncando pra "yyyy-mm-dd" aqui (na
    // origem, uma vez só) garante que toda comparação/agrupamento por dia
    // e toda exibição (formatarDataBR trata "yyyy-mm-dd" sem conversão de
    // fuso) usem exatamente o mesmo dia — sem isso, formatarDataBR cai no
    // fallback que converte pro fuso do navegador, podendo mostrar um dia
    // diferente do que a comparação por dia realmente usou (ex.: Prazo e
    // Fechou aparentando ser o mesmo dia na tela, mas o caso ainda
    // marcado como fora do prazo).
    finalizadoEm: l.finalizado_em ? l.finalizado_em.slice(0, 10) : null,
    justificativaNaoCritico: l.justificativa_nao_critico,
  }))
}

// Zeros à esquerda variam entre fontes (planilha de relato x cadastro de
// Colaboradores) — mesmo normalizador usado em jornada.ts pra outras tabelas
// com matrícula, senão "0012345" nunca bate com "12345".
function normalizarMatricula(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}

// Mesma ideia de normalizarMatricula, pro código de PDV — a planilha de
// relato do motorista e o export do BEES vêm de sistemas diferentes e podem
// não bater exatamente em zeros à esquerda.
function normalizarCodigoPdv(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}

// Nome do colaborador por matrícula (tabela usada em Gente → Colaboradores)
// — mesmo padrão de lookup usado em statusAtivo.ts/frota.ts/farolCriticos.ts.
// Base histórica extensa pode trazer matrículas que não existem (ou ainda
// não foram cadastradas) em Colaboradores — nesse caso cai em "sem nome".
//
// Busca SEM filtrar por filial de propósito: a matrícula (código do
// motorista) da planilha de relato do PDV Crítico vem de um sistema de
// origem próprio, cujo código de filial/regional pode não bater com o
// valor de filial usado neste app — confirmado na prática (matrícula
// certamente cadastrada em Colaboradores não batia por causa disso).
// Matrícula de RH é única o suficiente pra buscar sem esse filtro.
export async function buscarNomesColaboradoresPorMatricula(): Promise<Map<string, string>> {
  // O PostgREST corta em 1000 linhas por página — sem filtro de filial
  // (de propósito, ver comentário acima) a tabela inteira de Colaboradores
  // de todas as filiais entra na consulta, e uma empresa grande passa de
  // 1000 fácil. Sem paginar aqui, boa parte dos colaboradores (matrícula
  // incluída) nunca voltava, e todo mundo aparecia como "sem nome".
  //
  // Colaboradores tem DUAS matrículas: `matricula` (LOG20, interna) e
  // `matricula_promax` (3 dígitos, sistema Promax). O codigo_motorista da
  // planilha de relato do PDV Crítico é de um sistema de origem externo —
  // bate com a matrícula Promax (mesmo formato de 3 dígitos), não com a
  // LOG20. Indexa pelas duas pra cobrir os dois casos.
  const PAGINA = 1000
  const mapa = new Map<string, string>()
  function registrar(matriculaBruta: unknown, nome: string) {
    if (matriculaBruta == null) return
    const chave = normalizarMatricula(String(matriculaBruta))
    if (!chave || !nome) return
    // matrícula não é única globalmente (só filial+nome é) — a mesma
    // matrícula pode aparecer em Colaboradores de mais de uma filial.
    // Sem essa proteção, uma linha duplicada/sem nome processada depois
    // sobrescrevia silenciosamente o nome certo já encontrado.
    if (!mapa.has(chave)) mapa.set(chave, nome)
  }
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('matricula, matricula_promax, nome')
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('buscarNomesColaboradoresPorMatricula error:', error.message); break }
    for (const c of data ?? []) {
      const nome = (c.nome ?? '').trim()
      registrar(c.matricula_promax, nome)
      registrar(c.matricula, nome)
    }
    if (!data || data.length < PAGINA) break
  }
  return mapa
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
  pdvsRecorrentes: { codigoPdv: string; total: number; reincidencias: number }[]
  porCriticidade: { nivel: string; total: number; noPrazo: number; foraPrazo: number; pctNoPrazo: number }[]
  tempoMedioFechamentoDias: number | null
  reincidenciaPorMes: { mes: string; total: number; reincidentes: number; pctReincidencia: number }[]
  motivosNaoCritico: { justificativa: string; total: number }[]
  totalNaoCritico: number
  funil: { status: string; total: number }[]
  topMotoristas: { matricula: string; nome: string; total: number }[]
  casosForaPrazo: { id: string; codigoPdv: string; subgrupo: string; nivel: string | null; dataRelato: string | null; prazoOrigem: string | null; finalizadoEm: string | null; diasAtraso: number | null }[]
}

function dataBateNoFiltro(dataISO: string | null, filtro: FiltroAnaliseData): boolean {
  if (!dataISO) return filtro.ano == null && filtro.mes == null
  if (filtro.ano != null && Number(dataISO.slice(0, 4)) !== filtro.ano) return false
  if (filtro.mes != null && Number(dataISO.slice(5, 7)) !== filtro.mes) return false
  return true
}

const FUNIL_ORDEM: StatusRelato[] = ['aguardando_triagem', 'agendado', 'preenchido', 'aprovado', 'nao_critico', 'encerrado_historico', 'cancelado']

export function calcularEstatisticasPdvCritico(
  todasLinhas: LinhaAnaliseRelato[],
  filtro: FiltroAnaliseData = { ano: null, mes: null },
  nomePorMatricula: Map<string, string> = new Map()
): EstatisticasPdvCritico {
  const anosDisponiveis = [...new Set(
    todasLinhas.map((l) => l.dataRelato ? Number(l.dataRelato.slice(0, 4)) : null).filter((a): a is number => a != null)
  )].sort((a, b) => b - a)

  const linhas = todasLinhas.filter((l) => dataBateNoFiltro(l.dataRelato, filtro))

  let fechadosNoPrazo = 0, fechadosForaPrazo = 0, fechadosSemPrazo = 0
  const fechadosPorMesMap = new Map<string, { total: number; noPrazo: number; foraPrazo: number }>()
  const fechadosPorAnoMap = new Map<string, { total: number; noPrazo: number; foraPrazo: number }>()
  const casosForaPrazo: EstatisticasPdvCritico['casosForaPrazo'] = []
  const fechados = linhas.filter((l) => l.status === 'aprovado' || l.status === 'encerrado_historico')
  for (const l of fechados) {
    const mesChave = l.finalizadoEm ? l.finalizadoEm.slice(0, 7) : (l.dataRelato ? l.dataRelato.slice(0, 7) : 'sem-data')
    const anoChave = mesChave.slice(0, 4)
    const m = fechadosPorMesMap.get(mesChave) ?? { total: 0, noPrazo: 0, foraPrazo: 0 }
    const a = fechadosPorAnoMap.get(anoChave) ?? { total: 0, noPrazo: 0, foraPrazo: 0 }
    m.total++; a.total++
    // Comparação por DIA, não por timestamp — só vira "fora do prazo" se
    // fechou pelo menos 1 dia depois do prazo. Fechado no mesmo dia do
    // prazo conta como no prazo mesmo que o horário seja mais tarde (o
    // slice(0,10) já descarta a hora dos dois lados antes de comparar).
    if (!l.prazoOrigem || !l.finalizadoEm) {
      fechadosSemPrazo++
    } else if (l.finalizadoEm.slice(0, 10) <= l.prazoOrigem) {
      fechadosNoPrazo++; m.noPrazo++; a.noPrazo++
    } else {
      fechadosForaPrazo++; m.foraPrazo++; a.foraPrazo++
      const diasAtraso = Math.round((new Date(`${l.finalizadoEm.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${l.prazoOrigem}T00:00:00Z`).getTime()) / 86400000)
      casosForaPrazo.push({
        id: l.id, codigoPdv: l.codigoPdv, subgrupo: l.subgrupo, nivel: l.nivel,
        dataRelato: l.dataRelato, prazoOrigem: l.prazoOrigem, finalizadoEm: l.finalizadoEm,
        diasAtraso,
      })
    }
    fechadosPorMesMap.set(mesChave, m)
    fechadosPorAnoMap.set(anoChave, a)
  }
  casosForaPrazo.sort((x, y) => (y.diasAtraso ?? 0) - (x.diasAtraso ?? 0))

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

  // PDVs recorrentes — quem mais aparece nos relatos (e quantas dessas
  // são reincidência de verdade, não só "chegou de novo").
  const pdvMap = new Map<string, { total: number; reincidencias: number }>()
  for (const l of linhas) {
    const p = pdvMap.get(l.codigoPdv) ?? { total: 0, reincidencias: 0 }
    p.total++
    if (l.reincidente) p.reincidencias++
    pdvMap.set(l.codigoPdv, p)
  }
  const pdvsRecorrentes = [...pdvMap.entries()]
    .map(([codigoPdv, p]) => ({ codigoPdv, total: p.total, reincidencias: p.reincidencias }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)

  // Criticidade × prazo — só entre os fechados, pra saber se um nível
  // mais alto é resolvido mais rápido (ou não) que um nível leve.
  const criticidadeMap = new Map<string, { total: number; noPrazo: number; foraPrazo: number }>()
  for (const l of fechados) {
    const chave = l.nivel ?? 'sem-nivel'
    const c = criticidadeMap.get(chave) ?? { total: 0, noPrazo: 0, foraPrazo: 0 }
    c.total++
    if (l.prazoOrigem && l.finalizadoEm) {
      if (l.finalizadoEm.slice(0, 10) <= l.prazoOrigem) c.noPrazo++
      else c.foraPrazo++
    }
    criticidadeMap.set(chave, c)
  }
  const ORDEM_NIVEL_LABEL = ['alto', 'medio', 'leve', 'sem-nivel']
  const porCriticidade = ORDEM_NIVEL_LABEL
    .filter((nivel) => criticidadeMap.has(nivel))
    .map((nivel) => {
      const c = criticidadeMap.get(nivel)!
      return {
        nivel, total: c.total, noPrazo: c.noPrazo, foraPrazo: c.foraPrazo,
        pctNoPrazo: (c.noPrazo + c.foraPrazo) > 0 ? Math.round((c.noPrazo / (c.noPrazo + c.foraPrazo)) * 1000) / 10 : 0,
      }
    })

  // Tempo médio de fechamento — não só "no prazo sim/não", quantos dias
  // em média entre o relato e o fechamento de fato.
  const diasFechamento: number[] = []
  for (const l of fechados) {
    if (!l.dataRelato || !l.finalizadoEm) continue
    const dias = Math.round((new Date(`${l.finalizadoEm.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${l.dataRelato}T00:00:00Z`).getTime()) / 86400000)
    if (dias >= 0) diasFechamento.push(dias)
  }
  const tempoMedioFechamentoDias = diasFechamento.length > 0
    ? Math.round((diasFechamento.reduce((acc, d) => acc + d, 0) / diasFechamento.length) * 10) / 10
    : null

  // Reincidência por mês — % dos relatos do mês que já eram reincidência
  // de um caso aprovado antes, pra ver se a orientação está pegando.
  const reincidenciaPorMesMap = new Map<string, { total: number; reincidentes: number }>()
  for (const l of linhas) {
    const mes = l.dataRelato ? l.dataRelato.slice(0, 7) : 'sem-data'
    const r = reincidenciaPorMesMap.get(mes) ?? { total: 0, reincidentes: 0 }
    r.total++
    if (l.reincidente) r.reincidentes++
    reincidenciaPorMesMap.set(mes, r)
  }
  const reincidenciaPorMes = [...reincidenciaPorMesMap.entries()]
    .map(([mes, r]) => ({
      mes, total: r.total, reincidentes: r.reincidentes,
      pctReincidencia: r.total > 0 ? Math.round((r.reincidentes / r.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  // Motivos de "Não crítico" — pra auditar se o critério usado faz sentido.
  const naoCriticos = linhas.filter((l) => l.status === 'nao_critico')
  const motivoMap = new Map<string, number>()
  for (const l of naoCriticos) {
    const motivo = l.justificativaNaoCritico?.trim() || '(sem justificativa registrada)'
    motivoMap.set(motivo, (motivoMap.get(motivo) ?? 0) + 1)
  }
  const motivosNaoCritico = [...motivoMap.entries()]
    .map(([justificativa, total]) => ({ justificativa, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)

  // Funil operacional — onde os casos do período estão agora, na ordem
  // do fluxo (não é histórico, é a foto atual do status).
  const funilCount = new Map<string, number>()
  for (const l of linhas) funilCount.set(l.status, (funilCount.get(l.status) ?? 0) + 1)
  const funil = FUNIL_ORDEM
    .filter((status) => funilCount.has(status))
    .map((status) => ({ status, total: funilCount.get(status)! }))

  // Top motoristas que relatam — matrícula pode não estar em Colaboradores
  // ainda (base histórica extensa importada de uma vez), cai em "sem nome".
  // Normaliza zero à esquerda igual ao mapa de nomes, senão "0012345" (da
  // planilha de relato) nunca casa com "12345" (cadastro de Colaboradores).
  const motoristaMap = new Map<string, number>()
  for (const l of linhas) {
    if (!l.codigoMotorista) continue
    const matricula = normalizarMatricula(l.codigoMotorista)
    if (!matricula) continue
    motoristaMap.set(matricula, (motoristaMap.get(matricula) ?? 0) + 1)
  }
  const topMotoristas = [...motoristaMap.entries()]
    .map(([matricula, total]) => ({ matricula, nome: nomePorMatricula.get(matricula) || `Matrícula ${matricula} (sem nome cadastrado)`, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)

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
    pdvsRecorrentes,
    porCriticidade,
    tempoMedioFechamentoDias,
    reincidenciaPorMes,
    motivosNaoCritico,
    totalNaoCritico: naoCriticos.length,
    funil,
    topMotoristas,
    casosForaPrazo,
  }
}
