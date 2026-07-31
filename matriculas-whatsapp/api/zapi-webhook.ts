/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

// ── Configuração ────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL  ?? process.env.VITE_SUPABASE_URL  ?? ''
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE     ?? process.env.VITE_ZAPI_INSTANCE     ?? ''
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN        ?? process.env.VITE_ZAPI_TOKEN        ?? ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? process.env.VITE_ZAPI_CLIENT_TOKEN ?? ''

const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL   = 'claude-haiku-4-5'

// Transcrição de áudio — o Z-API não transcreve nativamente, então baixamos o
// áudio e usamos o Whisper da Groq (tier gratuito). Se GROQ_API_KEY não estiver
// configurada, o bot pede para o motorista mandar por texto.
const GROQ_API_KEY          = process.env.GROQ_API_KEY ?? ''
// whisper-large-v3-turbo é mais rápido/barato, mas erra bastante em jargão de
// logística ("expedido" virando "expirido", "PDP", "Google" etc.) em áudio de
// WhatsApp com ruído de fundo. whisper-large-v3 (sem o "turbo") é mais lento
// mas bem mais preciso pra esse tipo de áudio curto — vale a troca aqui.
const GROQ_TRANSCRIBE_MODEL = process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3'
// "Prompt" do Whisper: não é uma instrução, é uma amostra de vocabulário pra
// enviesar o reconhecimento — ajuda demais com termos/siglas do domínio que
// o modelo geral erra (PDP, PDV, MPD, TML, Bees) e com o sotaque/expressões
// mais comuns nas respostas dos motoristas.
const GROQ_TRANSCRIBE_PROMPT =
  'Transcrição em português do Brasil de um motorista ou ajudante de entregas falando sobre o dia de trabalho: ' +
  'PDP, PDV, mapa, rota, entrega, devolução, expedido, cliente, motorista, ajudante, atraso, trânsito, gatilho.'

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

// URL pública do app — usada pra montar os links de autoatendimento (ex.:
// Consulta de Pendências, Variável do Armazém) mandados pela Aurora. Sem
// APP_BASE_URL configurada no Vercel, cai pro domínio de produção conhecido
// — sem isso, o link saía como caminho relativo ("/consulta-pendencias"),
// que não abre nada quando clicado direto do WhatsApp.
const APP_BASE_URL = (process.env.APP_BASE_URL ?? process.env.VITE_APP_URL ?? 'https://painelanalitico.vercel.app').replace(/\/$/, '')

const CONFIRM_TTL_MIN = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Envio de mensagens ──────────────────────────────────────────────────────────

// A Z-API responde HTTP 200 em várias falhas reais (instância desconectada,
// número fora do WhatsApp, token errado, limite da conta), sinalizando o
// problema só no CORPO: {"error": "..."}. Checar apenas resp.ok escondia
// essas falhas — e, nos envios com fallback abaixo, impedia o fallback de
// texto puro de rodar. Devolve a mensagem de erro, ou null quando deu certo.
async function falhaEnvioZapi(resp: Response): Promise<string | null> {
  const bruto = await resp.text().catch(() => '')
  let corpo: { error?: string } | null = null
  try {
    corpo = bruto ? JSON.parse(bruto) : null
  } catch {
    /* resposta não-JSON — trata pelo status HTTP abaixo */
  }
  if (!resp.ok) return corpo?.error ?? bruto.slice(0, 300) ?? `HTTP ${resp.status}`
  return corpo?.error ?? null
}

async function enviar(destino: string, message: string): Promise<void> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: destino, message }),
    })
    const erro = await falhaEnvioZapi(resp)
    if (erro) console.error('enviar falhou:', resp.status, erro)
  } catch (e) {
    console.error('enviar exception:', e)
  }
}

const enviarGrupo = enviar

// Pausa entre envios num loop que manda mensagem pra vários destinatários
// (lembretes em lote) — sem isso, o loop dispara tudo em sequência quase
// instantânea, o padrão que costuma derrubar a conta por suspeita de spam.
function aguardarEntreEnvios(ms = 1500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Envia mensagem com botões interativos (send-button-list). Como botões andam
// instáveis em grupos no WhatsApp, o próprio texto da mensagem já instrui a
// resposta (SIM/NÃO, OK/NOK) e, se a API falhar, caímos para texto puro.
interface BotaoZ { id: string; label: string }
async function enviarBotoes(destino: string, message: string, botoes: BotaoZ[]): Promise<void> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-button-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: destino, message, buttonList: { buttons: botoes } }),
    })
    const erro = await falhaEnvioZapi(resp)
    if (erro) {
      console.error('send-button-list falhou:', resp.status, erro)
      await enviar(destino, message) // fallback: texto (instruções já estão na mensagem)
    }
  } catch (e) {
    console.error('enviarBotoes exception:', e)
    await enviar(destino, message)
  }
}

// Envia lista de opções (send-option-list) — usada nos passos da justificativa
// de TML (escolher a área e depois o motivo). O WhatsApp limita a lista a ~10
// linhas; o chamador é responsável por paginar.
interface OpcaoZ { id: string; title: string; description?: string }
async function enviarOpcoes(destino: string, message: string, titulo: string, botaoLabel: string, opcoes: OpcaoZ[]): Promise<void> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-option-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: destino, message, optionList: { title: titulo, buttonLabel: botaoLabel, options: opcoes } }),
    })
    const erro = await falhaEnvioZapi(resp)
    if (erro) {
      console.error('send-option-list falhou:', resp.status, erro)
      await enviar(destino, message)
    }
  } catch (e) {
    console.error('enviarOpcoes exception:', e)
    await enviar(destino, message)
  }
}


// ── Helpers ─────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
}

// Clique em botão OU numa lista de opções — o Z-API manda o id escolhido em
// campos diferentes dependendo do tipo de mensagem interativa
// (buttonsResponseMessage.buttonId, listResponseMessage.selectedRowId ou,
// em algumas versões, aninhado em listResponse.singleSelectReply.selectedRowId).
// Checa todos pra não depender de qual formato a instância está mandando.
function extrairBotaoResposta(body: any): string {
  return String(
    body?.buttonsResponseMessage?.buttonId ??
    body?.listResponseMessage?.selectedRowId ??
    body?.listResponse?.singleSelectReply?.selectedRowId ??
    ''
  )
}

// Extrai a resposta do usuário: texto livre OU clique em botão
function extrairResposta(body: any): 'sim' | 'nao' | null {
  const buttonId: string = norm(extrairBotaoResposta(body))
  if (buttonId === 'sim') return 'sim'
  if (buttonId === 'nao') return 'nao'

  const texto = norm(String(body?.text?.message ?? '').trim())
  if (texto === 'sim' || texto === 'ok' || texto === 'confirmar') return 'sim'
  if (/^n[ao]+$/.test(texto) || texto === 'cancelar') return 'nao'

  return null
}

// Extrai o conteúdo textual da mensagem — texto digitado, legenda de imagem/vídeo
// OU transcrição de áudio (Z-API)
function extrairTexto(body: any): string {
  return String(
    body?.text?.message ??
    body?.image?.caption ??
    body?.video?.caption ??
    body?.document?.caption ??
    body?.audio?.transcription ??
    body?.audio?.transcriptionText ??
    body?.transcription ??
    body?.message ??
    body?.body ??
    ''
  ).trim()
}

function temAudioSemTexto(body: any): boolean {
  const ehAudio = !!(body?.audio?.audioUrl || body?.audio?.url || body?.type === 'AudioMessage')
  return ehAudio && !extrairTexto(body)
}

function extrairAudioUrl(body: any): string {
  return String(body?.audio?.audioUrl ?? body?.audio?.url ?? '').trim()
}

// Imagem enviada pelo motorista (foto do painel na frota leve).
function extrairImagemUrl(body: any): string {
  return String(body?.image?.imageUrl ?? body?.image?.url ?? body?.image?.thumbnailUrl ?? '').trim()
}

function temImagem(body: any): boolean {
  return !!extrairImagemUrl(body) || body?.type === 'ImageMessage'
}

// Baixa o áudio do Z-API e transcreve via Whisper da Groq (endpoint compatível
// com a OpenAI). Retorna o texto transcrito ou null se falhar / sem chave.
async function transcreverAudio(url: string): Promise<string | null> {
  if (!GROQ_API_KEY || !url) return null
  try {
    const audioResp = await fetch(url)
    if (!audioResp.ok) {
      console.error('Falha ao baixar áudio:', audioResp.status)
      return null
    }
    const buf = await audioResp.arrayBuffer()
    const blob = new Blob([buf], { type: audioResp.headers.get('content-type') ?? 'audio/ogg' })

    const form = new FormData()
    form.append('file', blob, 'audio.ogg')
    form.append('model', GROQ_TRANSCRIBE_MODEL)
    form.append('language', 'pt')
    form.append('response_format', 'json')
    form.append('temperature', '0')
    form.append('prompt', GROQ_TRANSCRIBE_PROMPT)

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
    })
    if (!resp.ok) {
      console.error('Groq transcribe error:', resp.status, await resp.text().catch(() => ''))
      return null
    }
    const data: any = await resp.json()
    const texto = String(data?.text ?? '').trim()
    return texto || null
  } catch (e) {
    console.error('transcreverAudio exception:', e)
    return null
  }
}

// Extrai colaborador + motivo + data opcional do formato multi-linha (fluxo punitivo)
function parseComando(texto: string): { nome: string; motivo: string; data?: string } | null {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  let nome = ''
  let motivo = ''
  let data: string | undefined

  for (const linha of linhas) {
    const n = norm(linha)
    if (n.startsWith('fluxo:') || n.startsWith('#fluxo')) {
      nome = linha.replace(/^[^:]*:/, '').trim()
    } else if (n.startsWith('motivo')) {
      motivo = linha.replace(/^[^\-:–—]*[\-:–—]/, '').trim()
    } else if (n.startsWith('data')) {
      const raw = linha.replace(/^[^\-:–—]*[\-:–—]/, '').trim()
      const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
      if (m) {
        const ano = new Date().getFullYear()
        data = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      }
    }
  }

  if (!nome || !motivo) return null
  return { nome, motivo, ...(data ? { data } : {}) }
}

// ── Extração de reposição via IA (Claude Haiku + structured outputs) ──────────────

interface ReposicaoIA {
  eh_reposicao: boolean
  multiplos_itens: boolean
  codigo_pdv: string
  mapa: string
  produto: string
  quantidade: string
  tipo_reposicao: 'falta' | 'inversao' | 'avaria' | 'troca' | 'remessa' | 'indefinido'
  embalagem: 'unidade' | 'fardo' | 'indefinido'
}

const TIPO_LABEL: Record<string, string> = {
  falta: 'Falta', inversao: 'Inversão', avaria: 'Avaria', troca: 'Troca', remessa: 'Simples Remessa', indefinido: 'Não informado',
}

const EMBALAGEM_LABEL: Record<string, string> = {
  unidade: 'Unidade', fardo: 'Fardo', indefinido: 'Não informado',
}

// Rede de segurança pra embalagem: a IA às vezes se confunde quando o NOME
// do produto no catálogo menciona "Caixa C/12 Un" (a embalagem em que o
// produto normalmente é vendido) e classifica como "fardo" mesmo quando o
// motorista escreveu literalmente "Quantidade: 2 Unidades" — o texto que a
// pessoa digitou é a fonte da verdade, não o nome do produto. Procura
// primeiro numa linha "Quantidade: N <palavra>" (formato do bot de
// confirmação); sem achar, cai pra procurar em qualquer lugar do texto.
// Retorna null quando não há nenhuma palavra de embalagem explícita — nesse
// caso mantém o que a IA decidiu.
function detectarEmbalagemExplicita(texto: string): 'unidade' | 'fardo' | null {
  const linhaQtd = texto.match(/quantidade\s*[:\-]?\s*\d+\s*([a-zçãáéíóúâêô.]+)/i)?.[1]
  const candidato = linhaQtd ?? texto
  if (/\bfardos?\b|\bpacotes?\b|\bengradados?\b|\bcaixas?\s+fechadas?\b/i.test(candidato)) return 'fardo'
  if (/\bunidades?\b|\bun\.?\b/i.test(candidato)) return 'unidade'
  return null
}

// Busca os 40 produtos mais recentes do catálogo para enriquecer o prompt da IA.
// Se a tabela estiver vazia (antes da primeira importação), retorna lista vazia.
// Remove acentos e baixa caixa, para casar com o catálogo (que é todo sem acento).
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
}

// Expande sinônimos/abreviações comuns dos motoristas para os tokens usados nos
// nomes (catálogo/faturamento). Ex.: "litro" aparece como "1l"; "litrao" idem.
function expandirSinonimos(palavra: string): string[] {
  const SIN: Record<string, string[]> = {
    ap:        ['ap', 'antarctica'],     // Antárctica
    antartica: ['antartica', 'antarctica'],
    bc:        ['bc', 'brahma chopp'],   // Brahma Chopp
    sk:        ['sk', 'skol'],           // Skol
    gca:       ['gca', 'guarana'],       // Guaraná Antarctica
    litro:  ['litro', '1l'],
    litrao: ['litrao', '1l'],
    latao:  ['latao', '473'],         // latão = 473ml
    lata:   ['lata', '350'],          // lata = 350ml
  }
  return SIN[palavra] ?? [palavra]
}

// Descobre a data mais recente de vendas importadas (o CSV diário traz a data do arquivo).
async function ultimaDataVendas(): Promise<string | null> {
  const { data } = await supabase
    .from('vendas_dia')
    .select('data')
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.data ?? null
}

// Retorna os produtos vendidos para um PDV na última data importada.
// Inclui o nome completo do catálogo (descricao) e o nome abreviado do
// faturamento (nomeCsv), que costuma usar a mesma sigla do motorista (ex: "BC").
async function produtosVendidosPdv(pdvCod: number, data: string): Promise<{ codigo: number; descricao: string; nomeCsv: string }[]> {
  const { data: vendas } = await supabase
    .from('vendas_dia')
    .select('produto_codigo, produto_nome')
    .eq('data', data)
    .eq('pdv_codigo', pdvCod)
  if (!vendas || vendas.length === 0) return []
  const codigos = [...new Set(vendas.map((v: any) => v.produto_codigo).filter(Boolean))]
  // Busca o nome canônico no catálogo
  const { data: cat } = await supabase.from('produtos').select('codigo, descricao').in('codigo', codigos)
  const mapa = new Map((cat ?? []).map((p: any) => [p.codigo, p.descricao]))
  return codigos.map((c: any) => {
    const nomeCsv = String(vendas.find((v: any) => v.produto_codigo === c)?.produto_nome ?? '')
    return {
      codigo: c,
      descricao: mapa.get(c) ?? nomeCsv,
      nomeCsv,
    }
  })
}

// Busca o mapa real do PDV no faturamento do dia (fonte da verdade, vinda do
// CSV importado), para confrontar com o mapa que o motorista digitou.
async function buscarMapaRealPdv(pdvCod: number, data: string): Promise<string | null> {
  const { data: rows } = await supabase
    .from('vendas_dia')
    .select('mapa')
    .eq('data', data)
    .eq('pdv_codigo', pdvCod)
    .not('mapa', 'is', null)
    .limit(1)
  return normMapa(rows?.[0]?.mapa) || null
}

// Monta um pequeno catálogo de referência pra IA, priorizando o que o PDV comprou.
async function buscarProdutosContexto(pdvCodigo: string): Promise<string> {
  try {
    const data = await ultimaDataVendas()
    const pdvCod = parseInt((pdvCodigo ?? '').replace(/\D/g, ''))
    if (data && pdvCod) {
      const vendidos = await produtosVendidosPdv(pdvCod, data)
      if (vendidos.length > 0) {
        const lista = vendidos.filter(v => v.descricao).map(v => `${v.codigo} - ${v.descricao}`).join('\n')
        return `\n\nProdutos que ESTE PDV (${pdvCod}) comprou no pedido. Use estes nomes ao identificar o produto:\n${lista}`
      }
    }
    return ''
  } catch {
    return ''
  }
}

type VendasInfo =
  | { situacao: 'sem-csv' }                       // nenhum CSV importado
  | { situacao: 'pdv-sem-venda'; data: string }   // PDV não está no faturamento do dia
  | { situacao: 'ok'; data: string; produtoNoPedido: boolean; produtoCanon: string | null }

// Avalia o PDV/produto contra o faturamento do dia e já tenta identificar o produto.
async function avaliarVendas(pdvCodigo: string, termoProduto: string): Promise<VendasInfo> {
  const data = await ultimaDataVendas()
  if (!data) return { situacao: 'sem-csv' }

  const pdvCod = parseInt((pdvCodigo ?? '').replace(/\D/g, ''))
  if (!pdvCod) return { situacao: 'pdv-sem-venda', data }

  const vendidos = await produtosVendidosPdv(pdvCod, data)
  if (vendidos.length === 0) return { situacao: 'pdv-sem-venda', data }

  // Casa o termo do motorista com algum produto comprado pelo PDV.
  // Busca por PALAVRAS (todas presentes), comparando contra o nome completo do
  // catálogo E o nome abreviado do faturamento (que usa a mesma sigla do
  // motorista, ex: "BC"). Sinônimos comuns são expandidos (ex.: "litro" → "1l").
  //
  // O termo pode chegar como código puro ("8793"), no formato já padronizado
  // pelo próprio sistema ("8793 - H2OH LIMAO...") ou só com palavras
  // ("h2oh litro"). Extrai o código APENAS quando ele aparece no início, isolado
  // ou seguido de "-". NÃO usa replace(/\D/g) porque isso concatenaria dígitos
  // soltos do nome (o "2" de H2OH, o "1,5" de 1,5L) gerando um código inválido,
  // e o código não pode entrar em `palavras` (nenhum nome de produto o contém,
  // o que faria o `every` abaixo falhar sempre).
  const mCod = termoProduto.match(/^\s*0*(\d{2,7})\s*(?:-|$)/)
  const codTermo = mCod ? parseInt(mCod[1]) : NaN
  const termoTexto = mCod ? termoProduto.slice(mCod[0].length) : termoProduto
  const palavras = semAcento(termoTexto).split(/\s+/).filter(p => p.length >= 2)
  const hay = (v: { descricao: string; nomeCsv: string }) => semAcento(`${v.descricao} ${v.nomeCsv}`)
  const casa = (palavra: string, h: string) => expandirSinonimos(palavra).some(syn => h.includes(syn))

  let matches = vendidos.filter(v => {
    if (codTermo && v.codigo === codTermo) return true
    if (palavras.length === 0) return false
    const h = hay(v)
    return palavras.every(p => casa(p, h))
  })
  // Fallback: se nenhuma casou com todas as palavras, tenta com a 1ª palavra.
  if (matches.length === 0 && palavras.length > 1) {
    matches = vendidos.filter(v => casa(palavras[0], hay(v)))
  }

  const produtoNoPedido = matches.length > 0
  // Só padroniza se a identificação for inequívoca (exatamente 1 produto compatível)
  const produtoCanon = matches.length === 1 ? `${matches[0].codigo} - ${matches[0].descricao}` : null
  return { situacao: 'ok', data, produtoNoPedido, produtoCanon }
}

// Normaliza um número de mapa para comparação (só dígitos, sem zeros à esquerda).
function normMapa(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '').replace(/^0+/, '')
}

// Telefones do CME: além de quem enviou a solicitação original, esses números
// também podem responder SIM/NÃO/embalagem/cancelar por qualquer motorista no
// grupo de reposição (ex: confirmar em nome de um motorista que não respondeu).
const CME_TELEFONES = ['24992356187', '24992806017']

function ehTelefoneCME(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, '')
  return CME_TELEFONES.some(n => digitos.endsWith(n))
}

// Busca a equipe (motorista + ajudantes) do mapa na Base importada mais recente
// da filial e monta as linhas para a confirmação. Retorna null se não houver correspondência.
async function buscarEquipeMapa(mapa: string | null, filial: string): Promise<string | null> {
  const alvo = normMapa(mapa)
  if (!alvo) return null
  const { data: ult } = await supabase
    .from('mapa_equipe').select('data').eq('filial', filial).order('data', { ascending: false }).limit(1).maybeSingle()
  if (!ult?.data) return null
  const { data: rows } = await supabase.from('mapa_equipe').select('*').eq('data', ult.data).eq('filial', filial)
  const row = (rows ?? []).find((r: any) => normMapa(r.mapa) === alvo)
  if (!row) return null
  const linhas: string[] = []
  if (row.motorista_nome) linhas.push(`🚚 Motorista: ${row.motorista_nome}`)
  const ajs = [row.ajudante1_nome, row.ajudante2_nome].filter(Boolean)
  if (ajs.length) linhas.push(`🧑‍🔧 Ajudante${ajs.length > 1 ? 's' : ''}: ${ajs.join(', ')}`)
  return linhas.length ? linhas.join('\n') : null
}

// Valida se o mapa informado existe na base (mapa_equipe) importada mais recente da filial.
//  'sem_base'       → tabela vazia / planilha do dia não importada → NÃO bloqueia
//  'nao_encontrado' → há base, mas o mapa não casa → bloqueia e pede correção
//  'ok'             → mapa encontrado
async function validarMapaBase(mapa: string | null, filial: string): Promise<'sem_base' | 'nao_encontrado' | 'ok'> {
  const { data: ult } = await supabase
    .from('mapa_equipe').select('data').eq('filial', filial).order('data', { ascending: false }).limit(1).maybeSingle()
  if (!ult?.data) return 'sem_base'
  const alvo = normMapa(mapa)
  if (!alvo) return 'nao_encontrado'
  const { data: rows } = await supabase.from('mapa_equipe').select('mapa').eq('data', ult.data).eq('filial', filial)
  const achou = (rows ?? []).some((r: any) => normMapa(r.mapa) === alvo)
  return achou ? 'ok' : 'nao_encontrado'
}

// Busca o nome fantasia do PDV no catálogo.
async function buscarNomePdv(codigo: string): Promise<string | null> {
  if (!codigo) return null
  const cod = parseInt(codigo.replace(/\D/g, ''))
  if (!cod) return null
  const { data } = await supabase.from('pdvs').select('nome_fantasia').eq('codigo', cod).maybeSingle()
  return data?.nome_fantasia?.trim() || null
}

// Lança (não retorna null) em falha de infra — sem chave, erro HTTP, exceção —
// para que tratarReposicao consiga distinguir "não é reposição" (eh_reposicao=
// false) de "não consegui processar" e avisar o grupo em vez de ficar mudo.
async function extrairReposicaoIA(texto: string): Promise<ReposicaoIA> {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada')
    throw new Error('ANTHROPIC_API_KEY não configurada')
  }
  try {
    // Pré-extrai um possível código de PDV do texto bruto para buscar os produtos
    // que esse PDV comprou e dar à IA o vocabulário certo de produtos.
    const pdvMatch = texto.match(/\b(?:pdv|cliente|loja|cli)\D{0,3}(\d{3,6})\b/i)?.[1]
      ?? texto.match(/\b(\d{4,6})\b/)?.[1] ?? ''
    const catalogo = await buscarProdutosContexto(pdvMatch)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system:
          'Você analisa mensagens de motoristas de entrega enviadas em um grupo de WhatsApp. ' +
          'A mensagem pode ser uma solicitação de reposição de produto (falta, inversão, avaria, troca ou simples remessa) ' +
          'ou apenas uma conversa qualquer. Extraia os campos solicitados. ' +
          'Se a mensagem NÃO for uma solicitação de reposição, defina eh_reposicao=false. ' +
          'multiplos_itens: defina true SOMENTE quando a mensagem pedir reposição de mais de um produto DISTINTO ' +
          '(ex: "falta 2 cx de H2OH e 3 fardos de Skol"). Quantidade alta de um mesmo produto NÃO conta como múltiplos itens. ' +
          'Quando multiplos_itens=true, preencha os demais campos apenas com o primeiro item (ou deixe vazios se ambíguo). ' +
          'Campos não informados devem ficar como string vazia. ' +
          'tipo_reposicao: "falta" (produto não entregue/faltou), "inversao" (veio o item errado na carga/separação), ' +
          '"avaria" (produto quebrado/amassado/vazado/estragado), "troca" (cliente pediu troca/devolução do produto), ' +
          '"remessa" (pedido simples de envio extra de produto ao cliente, sem nenhum problema associado — ' +
          'ex: "cliente pediu mais 2 cx de skol", "manda uma remessa simples de 5 un de guaraná pro pdv X"), ' +
          'ou "indefinido" se não der pra saber. ' +
          'embalagem: "unidade" (produto avulso, unidade, garrafa/lata solta) ou "fardo" (fardo, pacote, caixa fechada, engradado); ' +
          'use "indefinido" se a mensagem não deixar claro se é unidade ou fardo. ' +
          'IMPORTANTE: a palavra que o motorista usou pra quantidade (ex.: "2 Unidades", "3 Fardos") sempre vale mais que ' +
          'a embalagem típica citada no NOME do produto do catálogo (ex.: um produto chamado "Caixa C/12 Un" pode ' +
          'perfeitamente estar sendo reportado como "2 Unidades" faltando, não como fardo/caixa). ' +
          'Para o campo "produto", use o nome padronizado do catálogo se conseguir identificar, ' +
          'incluindo o código numérico se mencionado.' + catalogo,
        messages: [{ role: 'user', content: texto }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                eh_reposicao:    { type: 'boolean' },
                multiplos_itens: { type: 'boolean' },
                codigo_pdv:      { type: 'string' },
                mapa:            { type: 'string' },
                produto:         { type: 'string' },
                quantidade:      { type: 'string' },
                tipo_reposicao:  { type: 'string', enum: ['falta', 'inversao', 'avaria', 'troca', 'remessa', 'indefinido'] },
                embalagem:       { type: 'string', enum: ['unidade', 'fardo', 'indefinido'] },
              },
              required: ['eh_reposicao', 'multiplos_itens', 'codigo_pdv', 'mapa', 'produto', 'quantidade', 'tipo_reposicao', 'embalagem'],
              additionalProperties: false,
            },
          },
        },
      }),
    })
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '')
      console.error('Claude HTTP error:', resp.status, corpo)
      throw new Error(`Claude HTTP ${resp.status}`)
    }
    const data: any = await resp.json()
    if (data.stop_reason === 'refusal') { console.error('Claude refusal'); throw new Error('Claude refusal') }
    const bloco = (data.content ?? []).find((b: any) => b.type === 'text')
    if (!bloco?.text) throw new Error('Claude sem bloco de texto')
    return JSON.parse(bloco.text) as ReposicaoIA
  } catch (e) {
    console.error('extrairReposicaoIA exception:', e)
    throw e
  }
}

// Resumo a partir do registro pendente (já com embalagem definida).
function resumoConfirmacao(pend: any, equipe?: string | null): string {
  const linhas = [`📦 *Confirmação de Reposição*`, `👤 ${pend.motorista_nome ?? 'Motorista'}`]
  linhas.push(`🔁 Tipo: ${TIPO_LABEL[pend.tipo_reposicao ?? 'indefinido'] ?? 'Não informado'}`)
  linhas.push(`📦 Embalagem: ${EMBALAGEM_LABEL[pend.embalagem ?? 'indefinido'] ?? 'Não informado'}`)
  if (pend.codigo_pdv)  linhas.push(`🏪 PDV: ${pend.codigo_pdv}`)
  if (pend.mapa)        linhas.push(`🗺️ Mapa: ${pend.mapa}`)
  if (equipe)           linhas.push(equipe)
  if (pend.produto)     linhas.push(`📋 Produto: ${pend.produto}`)
  if (pend.quantidade)  linhas.push(`📊 Qtde: ${pend.quantidade}`)
  linhas.push('\nEstá correto? Toque em *Sim* / *Não* ou responda *SIM* para confirmar ou *NÃO* para cancelar.')
  return linhas.join('\n')
}

// Resposta do controle no grupo de validação: OK/NOK (botão ou texto).
// O id da reposição pode vir embutido no buttonId (vok:<id> / vnok:<id>).
function extrairValidacao(body: any): { decisao: 'ok' | 'nok'; repId: string | null } | null {
  const rawBtn = String(body?.buttonsResponseMessage?.buttonId ?? '')
  if (rawBtn.startsWith('vok:'))  return { decisao: 'ok',  repId: rawBtn.slice(4) || null }
  if (rawBtn.startsWith('vnok:')) return { decisao: 'nok', repId: rawBtn.slice(5) || null }

  const t = norm(rawBtn) || norm(extrairTexto(body))
  if (t === 'ok' || t === 'sim' || t === 'valido' || t === 'validar' || t === 'aprovado' || t === 'aprovar') return { decisao: 'ok', repId: null }
  if (t === 'nok' || t === 'nao' || t === 'negar' || t === 'negado' || t === 'reprovado' || t === 'reprovar') return { decisao: 'nok', repId: null }
  return null
}

// Resposta do motorista à pergunta "Unidade ou Fardo?" (botão ou texto).
function extrairEmbalagem(body: any): 'unidade' | 'fardo' | null {
  const btn = norm(String(body?.buttonsResponseMessage?.buttonId ?? ''))
  if (btn === 'unidade') return 'unidade'
  if (btn === 'fardo') return 'fardo'
  const t = norm(extrairTexto(body))
  if (/^(unidade|unid|und?|uni)$/.test(t)) return 'unidade'
  if (/^(fardo|fd|pacote|caixa|cx|engradado)$/.test(t)) return 'fardo'
  return null
}

// Baseia o próximo número no MAIOR sequencial já usado hoje (não na
// contagem de linhas) — contar linhas quebra assim que alguma reposição do
// meio da sequência é excluída (ex.: pela tela de Reposições), pois a
// contagem cai mas o sequencial mais alto continua existindo, gerando
// sempre o mesmo número (já usado) a cada tentativa.
async function gerarNumeroReposicao(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { data } = await supabase
    .from('reposicoes')
    .select('numero')
    .like('numero', `REP-${hoje}-%`)
    .order('numero', { ascending: false })
    .limit(1)
  const ultimoSeq = data?.[0]?.numero ? parseInt(data[0].numero.slice(-3), 10) || 0 : 0
  const seq = String(ultimoSeq + 1).padStart(3, '0')
  return `REP-${hoje}-${seq}`
}

// ── Campos obrigatórios da reposição ──────────────────────────────────────────────
// Antes de montar a confirmação, o bot exige os 6 campos. Os que faltarem são
// pedidos ao motorista numa única mensagem.
const CAMPO_LABEL: Record<string, string> = {
  tipo_reposicao: 'Tipo (Falta, Inversão, Avaria, Troca ou Simples Remessa)',
  embalagem:      'Embalagem (Unidade ou Fardo)',
  codigo_pdv:     'PDV (código do cliente)',
  produto:        'Produto',
  mapa:           'Mapa',
  quantidade:     'Quantidade',
}

function camposFaltantes(pend: any): string[] {
  const falta: string[] = []
  if (!pend.tipo_reposicao || pend.tipo_reposicao === 'indefinido') falta.push('tipo_reposicao')
  if (!pend.embalagem || pend.embalagem === 'indefinido')           falta.push('embalagem')
  if (!pend.codigo_pdv)  falta.push('codigo_pdv')
  if (!pend.produto)     falta.push('produto')
  if (!pend.mapa)        falta.push('mapa')
  if (!pend.quantidade)  falta.push('quantidade')
  return falta
}

function textoPedido(nome: string, falta: string[]): string {
  if (falta.length === 1) {
    return `📝 ${nome}, para registrar a reposição ainda falta informar:\n• *${CAMPO_LABEL[falta[0]]}*\n\nPor favor, envie essa informação.`
  }
  const lista = falta.map(c => `• *${CAMPO_LABEL[c]}*`).join('\n')
  return `📝 ${nome}, para registrar a reposição ainda faltam estas informações:\n${lista}\n\n` +
    `Por favor, envie todas numa única mensagem.\nEx: *PDV 11509, Mapa 277834, Qtde 5, Fardo, Falta*.`
}

// Detecta o tipo de reposição em texto livre (usado ao coletar campos faltantes).
function extrairTipo(texto: string): ReposicaoIA['tipo_reposicao'] | null {
  const t = norm(texto)
  if (/\b(falta|faltou|faltando|nao veio|n veio)\b/.test(t)) return 'falta'
  if (/\b(invers|trocad[oa] na carga|veio errad|item errad)\b/.test(t)) return 'inversao'
  if (/\b(avaria|quebrad|amassad|vazad|estragad|estourad)\b/.test(t)) return 'avaria'
  if (/\b(troca|devoluc|devolv)\b/.test(t)) return 'troca'
  if (/\b(remessa|remessa simples|simples remessa)\b/.test(t)) return 'remessa'
  return null
}

// Detecta a quantidade em texto livre (usado ao coletar campos faltantes).
// Cobre "1 cx", "2 caixas", "5 fardos", "3 un", "1cx", e número isolado ("5").
function extrairQuantidade(texto: string): string | null {
  const t = norm(texto)
  const m = t.match(/\b(\d+)\s*(cx|caixas?|fd|fardos?|un|und|unid|unidades?|pc|pct|pacotes?|dz|duzias?|grades?|fardo|caixa)\b/)
  if (m) return `${m[1]} ${m[2]}`
  // Número isolado (resposta direta a "qual a quantidade?")
  const soNum = t.match(/^(\d{1,4})$/)
  if (soNum) return soNum[1]
  return null
}

// Mescla nos campos AINDA faltantes do pendente os valores recém-extraídos.
function mesclarCampos(pend: any, novo: Partial<ReposicaoIA>): Record<string, any> {
  const upd: Record<string, any> = {}
  if ((!pend.tipo_reposicao || pend.tipo_reposicao === 'indefinido') && novo.tipo_reposicao && novo.tipo_reposicao !== 'indefinido') upd.tipo_reposicao = novo.tipo_reposicao
  if ((!pend.embalagem || pend.embalagem === 'indefinido') && novo.embalagem && novo.embalagem !== 'indefinido') upd.embalagem = novo.embalagem
  if (!pend.codigo_pdv && novo.codigo_pdv) upd.codigo_pdv = novo.codigo_pdv
  if (!pend.produto    && novo.produto)    upd.produto    = novo.produto
  if (!pend.mapa       && novo.mapa)       upd.mapa       = novo.mapa
  if (!pend.quantidade && novo.quantidade) upd.quantidade = novo.quantidade
  return upd
}

// Com todos os campos presentes: identifica produto/PDV, avisa do confronto e
// mostra a confirmação (Sim/Não). Atualiza o registro com os nomes padronizados.
async function finalizarColeta(pend: any, grupoId: string, nome: string): Promise<void> {
  const pdvOriginal = String(pend.codigo_pdv ?? '')
  const [vendas, nomePdv] = await Promise.all([
    avaliarVendas(pdvOriginal, String(pend.produto ?? '')),
    buscarNomePdv(pdvOriginal),
  ])
  const dataBR = (d: string) => d.split('-').reverse().join('/')

  // BLOQUEIO: PDV não está no faturamento do dia → não confirma, pede correção.
  if (vendas.situacao === 'pdv-sem-venda') {
    await supabase.from('reposicao_confirmacoes').update({ status: 'rejeitado' }).eq('id', pend.id)
    await enviar(grupoId,
      `⛔ ${nome}, o PDV *${pdvOriginal || '?'}* não tem venda registrada no faturamento de ${dataBR(vendas.data)}.\n` +
      `Corrija o número do PDV e *reenvie a solicitação*, ou entre em contato com o *monitoramento*.`)
    return
  }
  // BLOQUEIO: produto não consta no pedido do PDV → não confirma, pede correção.
  if (vendas.situacao === 'ok' && !vendas.produtoNoPedido) {
    await supabase.from('reposicao_confirmacoes').update({ status: 'rejeitado' }).eq('id', pend.id)
    await enviar(grupoId,
      `⛔ ${nome}, o produto *${pend.produto}* não consta no pedido do PDV *${pdvOriginal}* em ${dataBR(vendas.data)}.\n` +
      `Corrija o produto e *reenvie a solicitação*, ou entre em contato com o *monitoramento*.`)
    return
  }

  // BLOQUEIO: o PDV está no faturamento, mas com um mapa diferente do informado
  // → o motorista provavelmente digitou o mapa errado. Em vez de só recusar,
  // sugere o mapa correto (vindo do faturamento) e pede confirmação.
  if (vendas.situacao === 'ok') {
    const pdvCod = parseInt(pdvOriginal.replace(/\D/g, ''))
    const mapaReal = pdvCod ? await buscarMapaRealPdv(pdvCod, vendas.data) : null
    if (mapaReal && normMapa(mapaReal) !== normMapa(pend.mapa)) {
      await supabase.from('reposicao_confirmacoes')
        .update({ status: 'confirmando_mapa', mapa_sugerido: mapaReal }).eq('id', pend.id)
      await enviarBotoes(grupoId,
        `⚠️ ${nome}, o PDV *${pdvOriginal}* consta no mapa *${mapaReal}* no faturamento de hoje, não no mapa *${pend.mapa}* que você informou.\n` +
        `Deseja corrigir a reposição para o mapa *${mapaReal}*?`,
        [{ id: 'sim', label: '✅ Sim, corrigir' }, { id: 'nao', label: '❌ Não, está certo' }])
      return
    }
  }

  // BLOQUEIO: mapa informado não existe na base do dia → não confirma, pede correção.
  // (Só bloqueia quando há base importada; se a planilha do dia não foi subida, segue.)
  const mapaStatus = await validarMapaBase(pend.mapa, pend.filial)
  if (mapaStatus === 'nao_encontrado') {
    await supabase.from('reposicao_confirmacoes').update({ status: 'rejeitado' }).eq('id', pend.id)
    await enviar(grupoId,
      `⛔ ${nome}, o mapa *${pend.mapa ?? '?'}* não foi encontrado na base de hoje.\n` +
      `Confira o número do mapa e *reenvie a solicitação*, ou entre em contato com o *monitoramento*.`)
    return
  }

  // OK (ou sem faturamento importado): padroniza e mostra a confirmação.
  let produto = pend.produto
  if (vendas.situacao === 'ok' && vendas.produtoCanon) produto = vendas.produtoCanon
  let codigoPdv = pdvOriginal
  if (nomePdv && !codigoPdv.includes(nomePdv)) codigoPdv = `${pdvOriginal} - ${nomePdv}`

  const { data: upd } = await supabase
    .from('reposicao_confirmacoes')
    .update({ produto, codigo_pdv: codigoPdv, status: 'aguardando' })
    .eq('id', pend.id)
    .select('*')
    .single()
  const reg = upd ?? { ...pend, produto, codigo_pdv: codigoPdv }

  const equipe = await buscarEquipeMapa(reg.mapa, reg.filial)
  await enviarBotoes(grupoId, resumoConfirmacao(reg, equipe), [
    { id: 'sim', label: '✅ Sim' },
    { id: 'nao', label: '❌ Não' },
  ])
}

// Pergunta os campos faltantes (botões quando só falta a embalagem) e salva como 'coletando'.
async function pedirCampos(pendId: string, grupoId: string, nome: string, falta: string[]): Promise<void> {
  await supabase.from('reposicao_confirmacoes').update({ status: 'coletando' }).eq('id', pendId)
  if (falta.length === 1 && falta[0] === 'embalagem') {
    await enviarBotoes(grupoId,
      `📦 ${nome}, esse produto é *Unidade* ou *Fardo*?\nToque na opção ou responda *Unidade* ou *Fardo*.`,
      [{ id: 'unidade', label: '📦 Unidade' }, { id: 'fardo', label: '📦 Fardo' }])
  } else {
    await enviar(grupoId, textoPedido(nome, falta))
  }
}

// ── Fluxo de reposição (grupo de motoristas) ──────────────────────────────────────

async function tratarReposicao(
  body: any, grupoId: string, filial: string, texto: string,
  senderName: string, participante: string,
): Promise<{ ok: boolean; action: string }> {
  const limitePend = () => new Date(Date.now() - CONFIRM_TTL_MIN * 60_000).toISOString()

  // Conteúdo textual da mensagem (transcreve áudio se necessário)
  let conteudo = texto
  if (!conteudo && temAudioSemTexto(body)) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (transcrito) conteudo = transcrito
  }

  // 0) Confirmação de correção de mapa: o PDV está em outro mapa no faturamento
  // e perguntamos se o motorista quer corrigir a reposição para o mapa certo.
  // O CME também pode responder em nome do motorista, então só filtra por
  // telefone quando quem respondeu NÃO é um dos números do CME.
  let queryPendMapa = supabase
    .from('reposicao_confirmacoes')
    .select('*')
    .eq('grupo_id', grupoId)
    .eq('status', 'confirmando_mapa')
    .gte('created_at', limitePend())
  if (!ehTelefoneCME(participante)) queryPendMapa = queryPendMapa.eq('motorista_telefone', participante)
  const { data: pendMapa } = await queryPendMapa
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendMapa) {
    const resp = extrairResposta(body)
    const nomeMot = pendMapa.motorista_nome || senderName || 'Motorista'
    if (resp === 'sim') {
      await supabase.from('reposicao_confirmacoes')
        .update({ mapa: pendMapa.mapa_sugerido, status: 'coletando' }).eq('id', pendMapa.id)
      await finalizarColeta({ ...pendMapa, mapa: pendMapa.mapa_sugerido }, grupoId, nomeMot)
      return { ok: true, action: 'repos-mapa-corrigido' }
    }
    if (resp === 'nao') {
      await supabase.from('reposicao_confirmacoes').update({ status: 'rejeitado' }).eq('id', pendMapa.id)
      await enviar(grupoId, `⛔ ${nomeMot}, confira o número do mapa e *reenvie a solicitação* com o mapa correto.`)
      return { ok: true, action: 'repos-mapa-mantido' }
    }
    await enviarBotoes(grupoId,
      `⚠️ Por favor, responda *Sim* para corrigir o mapa para *${pendMapa.mapa_sugerido}* ou *Não* para manter e corrigir manualmente.`,
      [{ id: 'sim', label: '✅ Sim, corrigir' }, { id: 'nao', label: '❌ Não, está certo' }])
    return { ok: true, action: 'repos-mapa-repetir-pergunta' }
  }

  // 0.1) Coleta de campos faltantes: existe um pendente 'coletando' deste motorista?
  // (ou, se quem respondeu for do CME, o pendente mais recente do grupo)
  let queryPendColeta = supabase
    .from('reposicao_confirmacoes')
    .select('*')
    .eq('grupo_id', grupoId)
    .eq('status', 'coletando')
    .gte('created_at', limitePend())
  if (!ehTelefoneCME(participante)) queryPendColeta = queryPendColeta.eq('motorista_telefone', participante)
  const { data: pendColeta } = await queryPendColeta
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendColeta) {
    // Cancelamento explícito
    if (extrairResposta(body) === 'nao') {
      await supabase.from('reposicao_confirmacoes').update({ status: 'cancelado' }).eq('id', pendColeta.id)
      await enviar(grupoId, `❌ ${pendColeta.motorista_nome ?? ''}, solicitação cancelada. Pode enviar novamente.`)
      return { ok: true, action: 'repos-coleta-cancelada' }
    }

    // Extrai valores da resposta: botão/texto de embalagem e tipo + IA para o resto
    const novo: Partial<ReposicaoIA> = {}
    const emb = extrairEmbalagem(body)
    if (emb) novo.embalagem = emb
    const tip = extrairTipo(conteudo)
    if (tip) novo.tipo_reposicao = tip
    const qtd = extrairQuantidade(conteudo)
    if (qtd) novo.quantidade = qtd
    if (conteudo) {
      // Roda a IA no texto ACUMULADO (mensagem original + resposta atual) para dar
      // contexto — um fragmento isolado como "1 cx" sozinho é ambíguo.
      const contexto = [pendColeta.mensagem_original, conteudo].filter(Boolean).join('. ')
      const iaResp = await extrairReposicaoIA(contexto)
      if (iaResp) {
        novo.codigo_pdv = novo.codigo_pdv || iaResp.codigo_pdv
        novo.produto    = novo.produto    || iaResp.produto
        novo.mapa       = novo.mapa       || iaResp.mapa
        novo.quantidade = novo.quantidade || iaResp.quantidade
        if (!novo.tipo_reposicao && iaResp.tipo_reposicao !== 'indefinido') novo.tipo_reposicao = iaResp.tipo_reposicao
        if (!novo.embalagem && iaResp.embalagem !== 'indefinido') novo.embalagem = iaResp.embalagem
      }
      if (!novo.embalagem) {
        const embalagemExplicita = detectarEmbalagemExplicita(contexto)
        if (embalagemExplicita) novo.embalagem = embalagemExplicita
      }
    }

    const upd = mesclarCampos(pendColeta, novo)
    const merged = { ...pendColeta, ...upd }
    if (Object.keys(upd).length > 0) {
      await supabase.from('reposicao_confirmacoes').update(upd).eq('id', pendColeta.id)
    }

    const falta = camposFaltantes(merged)
    const nome = pendColeta.motorista_nome || senderName || 'Motorista'
    if (falta.length > 0) {
      await pedirCampos(pendColeta.id, grupoId, nome, falta)
      return { ok: true, action: 'repos-coletando' }
    }
    await finalizarColeta(merged, grupoId, nome)
    return { ok: true, action: 'repos-coleta-completa' }
  }

  // 1) Resposta SIM / NÃO a uma confirmação pendente deste motorista
  // (ou, se quem respondeu for do CME, a confirmação mais recente do grupo)
  const resposta = extrairResposta(body)
  if (resposta) {
    const limite = new Date(Date.now() - CONFIRM_TTL_MIN * 60_000).toISOString()
    let queryPend = supabase
      .from('reposicao_confirmacoes')
      .select('*')
      .eq('grupo_id', grupoId)
      .eq('status', 'aguardando')
      .gte('created_at', limite)
    if (!ehTelefoneCME(participante)) queryPend = queryPend.eq('motorista_telefone', participante)
    const { data: pend } = await queryPend
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!pend) return { ok: true, action: 'repos-sem-pendencia' }

    // Reivindica a confirmação de forma atômica (update condicional no status
    // atual) ANTES de processar. O Z-API às vezes reentrega o mesmo webhook
    // (ou o motorista toca duas vezes no botão) — sem isso, duas chamadas
    // concorrentes liam a mesma pendência "aguardando", geravam o mesmo
    // número de reposição (gerarNumeroReposicao não é atômico) e uma das
    // duas falhava no insert com "❌ Erro ao registrar", além de mensagens
    // duplicadas. Se ninguém mais reivindicar, `claimed` vem vazio e essa
    // chamada simplesmente para aqui, sem reprocessar nem responder de novo.
    const { data: claimed } = await supabase
      .from('reposicao_confirmacoes')
      .update({ status: 'processando' })
      .eq('id', pend.id)
      .eq('status', 'aguardando')
      .select('id')
      .maybeSingle()
    if (!claimed) return { ok: true, action: 'repos-ja-processado' }

    if (resposta === 'nao') {
      await supabase.from('reposicao_confirmacoes').update({ status: 'cancelado' }).eq('id', pend.id)
      await enviar(grupoId, `❌ ${pend.motorista_nome ?? ''}, solicitação cancelada. Pode enviar novamente.`)
      return { ok: true, action: 'repos-cancelado' }
    }

    const tipo = pend.tipo_reposicao ?? 'indefinido'

    // Falta/Inversão (e indefinido) precisam de conferência do controle — mas só
    // quando a embalagem for Fardo ou Caixa. Unidade fica só registrada, sem
    // conferência. A conferência agora é feita na tela de Reposições do site
    // (o controle ajusta quantidade/embalagem/produto invertido e só então o
    // site envia para o grupo de validação no WhatsApp) — o webhook não manda
    // mais direto para o grupo de validação.
    const precisaValidacao = (tipo === 'falta' || tipo === 'inversao' || tipo === 'indefinido') &&
      (pend.embalagem === 'fardo' || pend.embalagem === 'caixa')

    // Tenta algumas vezes com um número novo se colidir com um já existente
    // (ex.: outra reposição registrada bem no mesmo instante).
    let novaRep: { id: string; numero: string } | null = null
    let insErr: { code?: string; message?: string } | null = null
    for (let tentativa = 0; tentativa < 3 && !novaRep; tentativa++) {
      const numero = await gerarNumeroReposicao()
      const resultado = await supabase.from('reposicoes').insert({
        numero,
        filial,
        motorista_nome: pend.motorista_nome,
        motorista_telefone: pend.motorista_telefone || participante,
        codigo_pdv: pend.codigo_pdv || null,
        cliente: pend.codigo_pdv || null,
        mapa: pend.mapa || null,
        produto: pend.produto || null,
        quantidade: pend.quantidade || null,
        tipo_reposicao: tipo,
        embalagem: pend.embalagem || null,
        motivo: TIPO_LABEL[tipo] ?? null,
        mensagem_original: pend.mensagem_original,
        status: precisaValidacao ? 'pendente' : 'registrado',
      }).select('id, numero').single()
      insErr = resultado.error
      novaRep = resultado.data
      if (insErr && insErr.code !== '23505') break // só retenta em colisão de número único
    }
    if (insErr || !novaRep) {
      console.error('Erro ao inserir reposição:', insErr)
      // Devolve pro status "aguardando" pra um reenvio do "sim" poder tentar de novo.
      await supabase.from('reposicao_confirmacoes').update({ status: 'aguardando' }).eq('id', pend.id)
      await enviar(grupoId, '❌ Erro ao registrar. Tente novamente.')
      return { ok: false, action: 'repos-erro' }
    }
    const numero = novaRep.numero
    await supabase.from('reposicao_confirmacoes').update({ status: 'confirmado' }).eq('id', pend.id)

    if (precisaValidacao) {
      await enviar(grupoId,
        `✅ *${numero}* registrada para ${pend.motorista_nome ?? ''}!\nAguardando conferência do controle.`)
    } else {
      await enviar(grupoId, `✅ *${numero}* registrada para ${pend.motorista_nome ?? ''}!`)
    }
    return { ok: true, action: 'repos-confirmado' }
  }

  // 2) Mensagem nova — exige áudio transcrito
  if (!conteudo && temAudioSemTexto(body)) {
    await enviar(grupoId, '🎤 Recebi um áudio mas não consegui transcrever. Pode mandar por texto ou reenviar o áudio?')
    return { ok: true, action: 'repos-audio-sem-texto' }
  }
  if (!conteudo) return { ok: true, action: 'repos-vazio' }

  // 3) IA interpreta a mensagem livre
  let ia: ReposicaoIA
  try {
    ia = await extrairReposicaoIA(conteudo)
  } catch (e) {
    // Falha de infra (sem chave, erro HTTP, exceção) — não dá pra saber se era
    // reposição. Avisa o grupo em vez de ficar mudo, pra não parecer que o bot
    // ignorou a solicitação.
    console.error('Reposição: falha ao interpretar mensagem:', e)
    await enviar(grupoId, `⚠️ ${senderName || 'Olá'}, não consegui processar sua mensagem agora. Tente reenviar em instantes; se persistir, contate o *monitoramento*.`)
    return { ok: true, action: 'repos-ia-erro' }
  }
  const embalagemExplicita = detectarEmbalagemExplicita(conteudo)
  if (embalagemExplicita) ia.embalagem = embalagemExplicita
  if (!ia.eh_reposicao) {
    // Não é solicitação de reposição → bot fica em silêncio (evita poluir o grupo)
    return { ok: true, action: 'repos-nao-aplicavel' }
  }

  // O fluxo trabalha com um item por vez. Se a mensagem trouxer mais de um
  // produto, pede que o motorista reenvie uma solicitação por mensagem.
  if (ia.multiplos_itens) {
    const nomeMot = senderName || 'Motorista'
    await enviar(grupoId,
      `⚠️ ${nomeMot}, identifiquei mais de um item nessa mensagem.\nPor favor, envie *uma solicitação por vez* (um produto por mensagem) para que cada reposição seja registrada corretamente.`)
    return { ok: true, action: 'repos-multiplos-itens' }
  }

  // Cria o registro com os campos crus (sem padronizar ainda — isso ocorre na
  // finalização, quando todos os campos obrigatórios estiverem presentes).
  const nome = senderName || 'Motorista'
  const { data: pendRow } = await supabase.from('reposicao_confirmacoes').insert({
    filial,
    grupo_id: grupoId,
    motorista_telefone: participante,
    motorista_nome: nome,
    mensagem_original: conteudo,
    codigo_pdv: ia.codigo_pdv || null,
    mapa: ia.mapa || null,
    produto: ia.produto || null,
    quantidade: ia.quantidade || null,
    tipo_reposicao: ia.tipo_reposicao === 'indefinido' ? null : ia.tipo_reposicao,
    embalagem: ia.embalagem === 'indefinido' ? null : ia.embalagem,
    status: 'coletando',
  }).select('*').single()
  if (!pendRow) return { ok: false, action: 'repos-erro-insert' }

  // Falta algum dos 6 campos obrigatórios? Pede todos numa única mensagem.
  const falta = camposFaltantes(pendRow)
  if (falta.length > 0) {
    await pedirCampos(pendRow.id, grupoId, nome, falta)
    return { ok: true, action: 'repos-coletando' }
  }

  // Tudo presente → identifica, avisa e mostra confirmação
  await finalizarColeta(pendRow, grupoId, nome)
  return { ok: true, action: 'repos-aguardando' }
}

// ── Fluxo de validação (grupo de controle) ────────────────────────────────────────
// O controle responde OK/NOK e isso atualiza o status da reposição no painel.
async function tratarValidacao(body: any, grupoId: string): Promise<{ ok: boolean; action: string }> {
  const v = extrairValidacao(body)
  if (!v) return { ok: true, action: 'validacao-sem-resposta' }

  // Localiza a reposição: por id (vindo do botão) ou a pendente de validação
  // mais recente (fallback quando a resposta veio por texto).
  let rep: any = null
  if (v.repId) {
    const { data } = await supabase.from('reposicoes').select('*').eq('id', v.repId).maybeSingle()
    rep = data
  } else {
    const { data } = await supabase.from('reposicoes')
      .select('*')
      .eq('status', 'pendente')
      .in('tipo_reposicao', ['falta', 'inversao', 'indefinido'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    rep = data
  }

  if (!rep) return { ok: true, action: 'validacao-sem-pendencia' }
  if (rep.status !== 'pendente') {
    await enviar(grupoId, `⚠️ *${rep.numero}* já estava como *${rep.status}*.`)
    return { ok: true, action: 'validacao-ja-resolvida' }
  }

  // Controle negou (NOK) → registra como negado direto, sem passo manual.
  const novoStatus = v.decisao === 'ok' ? 'validado' : 'negado'
  await supabase.from('reposicoes').update({
    status: novoStatus,
    validador_resposta: v.decisao === 'ok' ? 'Controle: OK (WhatsApp)' : 'Controle: NOK (WhatsApp)',
    validado_em: new Date().toISOString(),
  }).eq('id', rep.id)

  await enviar(grupoId, v.decisao === 'ok'
    ? `✅ *${rep.numero}* validada pelo controle.`
    : `❌ *${rep.numero}* negada pelo controle.`)
  return { ok: true, action: `validacao-${novoStatus}` }
}

// ── Fluxo punitivo (grupo de gestão) ──────────────────────────────────────────────

async function tratarFluxo(
  body: any, grupoId: string, filial: string, texto: string,
  senderName: string, participante: string,
): Promise<{ ok: boolean; action: string }> {
  const n = norm(texto)

  if (n.startsWith('fluxo:') || n.startsWith('#fluxo')) {
    const parsed = parseComando(texto)
    if (!parsed) {
      await enviarGrupo(grupoId,
        '⚠️ Formato inválido.\nUse o padrão:\n\n*Fluxo: NOME DO COLABORADOR*\n*Motivo - MOTIVO*\n*Data: DD/MM* _(opcional)_\n\nEx:\nFluxo: João Silva\nMotivo - Falta\nData: 09/06')
      return { ok: true, action: 'usage' }
    }
    const { data: conf } = await supabase.from('fluxo_confirmacoes').insert({
      filial, grupo_id: grupoId,
      colaborador_nome: parsed.nome, motivo: parsed.motivo,
      data_acao: parsed.data ?? null,
      solicitante_nome: senderName || null, solicitante_telefone: participante || null,
      status: 'aguardando',
    }).select('id').single()

    const dataInfo = parsed.data ? `\n📅 Data: ${parsed.data.split('-').reverse().join('/')}` : ''
    await enviarBotoes(grupoId,
      `📋 *Confirmação de Fluxo*\n👤 Colaborador: ${parsed.nome}\n⚠️ Motivo: ${parsed.motivo}${dataInfo}\n\nToque em *SIM* / *NÃO* ou responda *SIM* para confirmar ou *NÃO* para cancelar.`,
      [{ id: 'sim', label: '✅ SIM' }, { id: 'nao', label: '❌ NÃO' }])
    return { ok: true, action: 'aguardando' }
  }

  const resposta = extrairResposta(body)
  if (resposta) {
    const limite = new Date(Date.now() - CONFIRM_TTL_MIN * 60_000).toISOString()
    const { data: pend } = await supabase
      .from('fluxo_confirmacoes').select('*')
      .eq('grupo_id', grupoId).eq('status', 'aguardando')
      .gte('created_at', limite).order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (!pend) return { ok: true, action: 'no-pending-confirmation' }

    if (resposta === 'nao') {
      await supabase.from('fluxo_confirmacoes').update({ status: 'cancelado' }).eq('id', pend.id)
      await enviarGrupo(grupoId, `❌ Solicitação cancelada para *${pend.colaborador_nome}*.`)
      return { ok: true, action: 'cancelado' }
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const { data: fluxo } = await supabase.from('fluxo_punitivo').insert({
      filial, colaborador_nome: pend.colaborador_nome,
      origem: 'Grupo', tipo_acao: null, status: 'Solicitado',
      motivo: pend.motivo, data_acao: pend.data_acao ?? hoje, observacao: null,
      registrado_por: pend.solicitante_nome ? `${pend.solicitante_nome} (via grupo)` : 'WhatsApp (grupo)',
      source_id: pend.id,
    }).select('id').single()

    await supabase.from('fluxo_confirmacoes')
      .update({ status: 'confirmado', fluxo_id: fluxo?.id ?? null }).eq('id', pend.id)
    await enviarGrupo(grupoId,
      `✅ Fluxo criado para *${pend.colaborador_nome}* (${pend.motivo}).\nJá está como *pendente* no sistema para o responsável definir a ação.`)
    return { ok: true, action: 'confirmado' }
  }

  return { ok: true, action: 'no-command' }
}

// ── TML: resposta do supervisor no chat individual ────────────────────────────────
// O alerta é enviado como lista de opções (send-option-list — o WhatsApp só
// permite 3 botões inline por mensagem, então mais que isso exige lista).
// Cada opção tem id "tmlmotivo:<alertaId>:<motivo>" (alertaId = UUID, 36
// caracteres), então o clique já identifica exatamente qual alerta atualizar.
// Se o supervisor responder em texto livre (ex.: motivo "OUTRO"), usamos o
// último alerta "enviado" daquele número.
function ultimosDigitos(s: string, n = 8): string {
  return String(s ?? '').replace(/\D/g, '').slice(-n)
}

// Números digitados manualmente em cadastro (ex.: telefone do palestrante) não
// vêm com o "55" na frente, ao contrário do telefone que chega no payload do
// próprio Z-API (já no formato certo). Sem isso o envio falha silenciosamente.
function normalizarTelefoneBR(numero: string): string {
  const limpo = String(numero ?? '').replace(/\D/g, '')
  return limpo.startsWith('55') ? limpo : `55${limpo}`
}

async function registrarJustificativaTml(alertaId: string, motivo: string, remetente: string): Promise<{ ok: boolean; action: string }> {
  const { data: alerta } = await supabase
    .from('alertas_tml')
    .select('id, numero, status')
    .eq('id', alertaId)
    .maybeSingle()

  if (!alerta) {
    await enviar(remetente, '⚠️ Não encontrei esse alerta no sistema.')
    return { ok: true, action: 'alert-not-found' }
  }
  if (alerta.status === 'justificado') {
    await enviar(remetente, `ℹ️ O alerta ${alerta.numero ?? ''} já estava justificado.`)
    return { ok: true, action: 'already-justified' }
  }

  const { error: errUpdate } = await supabase.from('alertas_tml').update({
    justificativa: motivo,
    status: 'justificado',
    justificado_em: new Date().toISOString(),
  }).eq('id', alertaId)

  if (errUpdate) {
    console.error('[webhook] alertas_tml update error:', errUpdate.message)
    await enviar(remetente, '⚠️ Ocorreu um erro ao salvar o motivo no sistema. Tente novamente ou avise o controle.')
    return { ok: false, action: 'db-error', error: errUpdate.message } as any
  }

  await enviar(remetente, `✅ Motivo registrado no sistema: *${motivo}*`)
  return { ok: true, action: 'justificado' }
}

// Novo fluxo: o supervisor responde em TEXTO LIVRE. Guardamos a resposta no
// alerta (sem finalizar) e o controle classifica o motivo pela tabela no site.
async function registrarRespostaSupervisorTml(alertaId: string, texto: string, remetente: string): Promise<{ ok: boolean; action: string }> {
  const { data: alerta } = await supabase
    .from('alertas_tml')
    .select('id, numero, status, resposta_supervisor')
    .eq('id', alertaId)
    .maybeSingle()
  if (!alerta) return { ok: true, action: 'alert-not-found' }

  // Anexa à resposta anterior (caso o supervisor mande em várias mensagens).
  const anterior = (alerta.resposta_supervisor ?? '').trim()
  const novo = anterior ? `${anterior}\n${texto}` : texto

  const { error: errUpdate } = await supabase.from('alertas_tml').update({
    resposta_supervisor: novo,
    respondido_em: new Date().toISOString(),
    // Só muda o status se ainda estava aguardando; não reabre um já justificado.
    ...(alerta.status === 'enviado' ? { status: 'respondido' } : {}),
  }).eq('id', alertaId)

  if (errUpdate) {
    console.error('[webhook] alertas_tml resposta update error:', errUpdate.message)
    await enviar(remetente, '⚠️ Erro ao registrar sua resposta. Tente novamente ou avise o controle.')
    return { ok: false, action: 'db-error', error: errUpdate.message } as any
  }

  await enviar(remetente, '✅ Resposta recebida! O controle vai classificar o motivo no sistema. Obrigado.')
  return { ok: true, action: 'resposta-registrada' }
}

// Mesmo fluxo de resposta livre, só que para a Fixação de Motorista (a placa
// rodou com um motorista diferente do fixado em frota_placas).
async function registrarRespostaSupervisorFixacaoMotorista(alertaId: string, texto: string, remetente: string): Promise<{ ok: boolean; action: string }> {
  const { data: alerta } = await supabase
    .from('alertas_fixacao_motorista')
    .select('id, numero, status, resposta_supervisor')
    .eq('id', alertaId)
    .maybeSingle()
  if (!alerta) return { ok: true, action: 'alert-not-found' }

  const anterior = (alerta.resposta_supervisor ?? '').trim()
  const novo = anterior ? `${anterior}\n${texto}` : texto

  const { error: errUpdate } = await supabase.from('alertas_fixacao_motorista').update({
    resposta_supervisor: novo,
    respondido_em: new Date().toISOString(),
    ...(alerta.status === 'enviado' ? { status: 'respondido' } : {}),
  }).eq('id', alertaId)

  if (errUpdate) {
    console.error('[webhook] alertas_fixacao_motorista resposta update error:', errUpdate.message)
    await enviar(remetente, '⚠️ Erro ao registrar sua resposta. Tente novamente ou avise o controle.')
    return { ok: false, action: 'db-error', error: errUpdate.message } as any
  }

  await enviar(remetente, '✅ Resposta recebida! O controle vai registrar a justificativa no sistema. Obrigado.')
  return { ok: true, action: 'resposta-registrada' }
}

function formatarDataBRSimples(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano.slice(2)}`
}

// Resumo de aderência do dia (geral + por sala + placas NOK com motivo) pro
// supervisor de frota. Recalcula o cruzamento direto do historico_tml x
// frota_placas (mesma lógica de cruzarMotorista em src/lib/frota.ts) em vez
// de importar daquele módulo, que carrega xlsx e o client Supabase do
// browser — incompatíveis com este endpoint serverless.
async function enviarResumoAderenciaFixacaoMotorista(filial: string, data: string): Promise<void> {
  const { data: filialRow } = await supabase
    .from('filiais')
    .select('telefone_supervisor_frota')
    .eq('nome', filial)
    .maybeSingle()
  const telefone = (filialRow?.telefone_supervisor_frota ?? '').trim()
  if (!telefone) return

  const [{ data: historico }, { data: placas }, { data: alertas }] = await Promise.all([
    supabase.from('historico_tml').select('placa, matricula, sala').eq('filial', filial).eq('data_saida', data),
    supabase.from('frota_placas').select('placa, matricula_motorista, matricula_motorista_2').eq('filial', filial).eq('ativo', true),
    supabase.from('alertas_fixacao_motorista').select('placa, justificativa').eq('filial', filial).eq('data', data).order('placa'),
  ])

  const porPlacaCad = new Map((placas ?? []).map((p) => [p.placa, p]))
  let okGeral = 0
  let totalGeral = 0
  const porSala = new Map<string, { ok: number; total: number }>()

  for (const h of historico ?? []) {
    if (!h.placa || !h.sala || h.matricula == null) continue
    const cad = porPlacaCad.get(h.placa)
    if (!cad) continue
    const m1 = (cad.matricula_motorista ?? '').trim()
    const m2 = (cad.matricula_motorista_2 ?? '').trim()
    if (!m1 && !m2) continue

    const bate = String(h.matricula) === m1 || String(h.matricula) === m2
    totalGeral++
    if (bate) okGeral++
    const s = porSala.get(h.sala) ?? { ok: 0, total: 0 }
    s.total++
    if (bate) s.ok++
    porSala.set(h.sala, s)
  }
  if (totalGeral === 0) return

  const linhasSala = [...porSala.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sala, v]) => `• ${sala}: ${Math.round((v.ok / v.total) * 100)}% (${v.ok}/${v.total})`)
    .join('\n')

  const linhasDivergencia = (alertas ?? [])
    .map((a) => `• ${a.placa} - ${a.justificativa ?? 'Aguardando justificativa'}`)
    .join('\n')

  const texto =
    `📊 *FIXAÇÃO DE MOTORISTA — RESUMO DO DIA*\n` +
    `📅 ${formatarDataBRSimples(data)}\n\n` +
    `🎯 Aderência geral: ${Math.round((okGeral / totalGeral) * 100)}% (${okGeral}/${totalGeral} placas)\n\n` +
    `🏢 Por sala:\n${linhasSala}\n\n` +
    `🚨 Divergências (PLACA - MOTIVO):\n${linhasDivergencia || 'Nenhuma'}`

  await enviar(telefone, texto)
}

// Dispara o resumo de aderência pro supervisor de frota assim que a última
// divergência pendente da filial+dia for justificada — ou seja, quando não
// sobrar nenhum alerta com status diferente de "justificado" nessa data.
async function verificarEEnviarResumoFixacaoMotorista(filial: string, data: string): Promise<void> {
  const { data: pendentes } = await supabase
    .from('alertas_fixacao_motorista')
    .select('id')
    .eq('filial', filial)
    .eq('data', data)
    .neq('status', 'justificado')
  if (pendentes && pendentes.length > 0) return
  await enviarResumoAderenciaFixacaoMotorista(filial, data)
}

// Clique num motivo da lista enviada na Fixação de Motorista. Finaliza o
// alerta direto com o motivo escolhido — "OUTRO" é tratado à parte (pede
// resposta escrita em vez de finalizar aqui).
async function registrarJustificativaFixacaoMotorista(alertaId: string, motivo: string, remetente: string): Promise<{ ok: boolean; action: string }> {
  const { data: alerta } = await supabase
    .from('alertas_fixacao_motorista')
    .select('id, numero, status, filial, data')
    .eq('id', alertaId)
    .maybeSingle()

  if (!alerta) {
    await enviar(remetente, '⚠️ Não encontrei esse alerta no sistema.')
    return { ok: true, action: 'alert-not-found' }
  }
  if (alerta.status === 'justificado') {
    await enviar(remetente, `ℹ️ O alerta ${alerta.numero ?? ''} já estava justificado.`)
    return { ok: true, action: 'already-justified' }
  }

  const { error: errUpdate } = await supabase.from('alertas_fixacao_motorista').update({
    justificativa: motivo,
    status: 'justificado',
    justificado_em: new Date().toISOString(),
  }).eq('id', alertaId)

  if (errUpdate) {
    console.error('[webhook] alertas_fixacao_motorista justificativa update error:', errUpdate.message)
    await enviar(remetente, '⚠️ Erro ao salvar o motivo no sistema. Tente novamente ou avise o controle.')
    return { ok: false, action: 'db-error', error: errUpdate.message } as any
  }

  await enviar(remetente, `✅ Motivo registrado no sistema: *${motivo}*`)
  await verificarEEnviarResumoFixacaoMotorista(alerta.filial, alerta.data)
  return { ok: true, action: 'justificado' }
}

// Passo 2 da justificativa: escolhida a área (UGC), manda a lista de motivos
// daquela área. Pagina de 9 em 9 (limite ~10 linhas da lista do WhatsApp),
// acrescentando uma linha "Ver mais" quando ainda houver motivos.
const MOTIVOS_POR_PAGINA = 9
async function enviarMotivosUgcTml(alertaId: string, ugc: string, offset: number, remetente: string): Promise<{ ok: boolean; action: string }> {
  const { data: alerta } = await supabase
    .from('alertas_tml')
    .select('id, filial, status')
    .eq('id', alertaId)
    .maybeSingle()
  if (!alerta) {
    await enviar(remetente, '⚠️ Não encontrei esse alerta no sistema.')
    return { ok: true, action: 'alert-not-found' }
  }
  if (alerta.status === 'justificado') {
    await enviar(remetente, 'ℹ️ Esse alerta já estava justificado.')
    return { ok: true, action: 'already-justified' }
  }

  const { data: motivos } = await supabase
    .from('motivos_justificativa_tml')
    .select('motivo')
    .eq('filial', alerta.filial)
    .eq('ugc', ugc)
    .order('motivo')
  const lista = (motivos ?? []).map((m: any) => m.motivo as string)
  if (!lista.length) {
    await enviar(remetente, `⚠️ Nenhum motivo cadastrado para a área *${ugc}*.`)
    return { ok: true, action: 'no-motivos' }
  }

  const pagina = lista.slice(offset, offset + MOTIVOS_POR_PAGINA)
  const opcoes: OpcaoZ[] = pagina.map((motivo) => ({
    id: `tmlmotivo:${alertaId}:${motivo}`,
    title: motivo.length > 24 ? `${motivo.slice(0, 23)}…` : motivo,
    description: motivo.length > 24 ? motivo : undefined,
  }))
  const proximo = offset + MOTIVOS_POR_PAGINA
  if (proximo < lista.length) {
    opcoes.push({ id: `tmlmais:${alertaId}:${ugc}:${proximo}`, title: '➡️ Ver mais motivos' })
  }

  await enviarOpcoes(remetente, `Motivos de *${ugc}* — escolha um:`, ugc, 'Selecionar motivo', opcoes)
  return { ok: true, action: 'motivos-enviados' }
}

// Versão de teste do passo 2: lista os motivos da área sem exigir alerta e sem
// permitir registro — usada pelo botão "Enviar teste" do painel. Os motivos têm
// id "tmltestemotivo:<motivo>", que apenas confirma o recebimento.
async function enviarMotivosUgcTesteTml(filial: string, ugc: string, offset: number, remetente: string): Promise<{ ok: boolean; action: string }> {
  const { data: motivos } = await supabase
    .from('motivos_justificativa_tml')
    .select('motivo')
    .eq('filial', filial)
    .eq('ugc', ugc)
    .order('motivo')
  const lista = (motivos ?? []).map((m: any) => m.motivo as string)
  if (!lista.length) {
    await enviar(remetente, `⚠️ (teste) Nenhum motivo cadastrado para a área *${ugc}*.`)
    return { ok: true, action: 'teste-no-motivos' }
  }
  const pagina = lista.slice(offset, offset + MOTIVOS_POR_PAGINA)
  const opcoes: OpcaoZ[] = pagina.map((motivo) => ({
    id: `tmltestemotivo:${motivo}`,
    title: motivo.length > 24 ? `${motivo.slice(0, 23)}…` : motivo,
    description: motivo.length > 24 ? motivo : undefined,
  }))
  const proximo = offset + MOTIVOS_POR_PAGINA
  if (proximo < lista.length) {
    opcoes.push({ id: `tmltestemais:${filial}:${ugc}:${proximo}`, title: '➡️ Ver mais motivos' })
  }
  await enviarOpcoes(remetente, `🧪 *TESTE* — Motivos de *${ugc}*:`, ugc, 'Selecionar motivo', opcoes)
  return { ok: true, action: 'teste-motivos' }
}

// ── Conversa humanizada com o motorista que perdeu o TML ──────────────────────────
// Disparada manualmente pelo controle (tela de Alertas TML). O bot conduz
// duas perguntas em sequência — o que aconteceu, e que solução ele propõe —
// aceitando resposta em texto OU áudio (transcrito via Whisper/Groq). O
// estado da conversa fica em conversas_motorista_tml e avança a cada
// resposta. Retorna null se o número não tem conversa aberta (aí o webhook
// cai no fluxo normal de supervisor em tratarTml).
async function tratarConversaMotorista(body: any, remetente: string): Promise<{ ok: boolean; action: string } | null> {
  const digitos = ultimosDigitos(remetente)
  if (!digitos) return null

  const { data: conversas } = await supabase
    .from('conversas_motorista_tml')
    .select('id, nome, estado, telefone')
    .neq('estado', 'concluido')
    .order('iniciado_em', { ascending: false })
  const conversa = (conversas ?? []).find((c: any) => ultimosDigitos(c.telefone) === digitos)
  if (!conversa) return null

  // Resposta do motorista: texto digitado OU áudio (transcrito).
  let texto = extrairTexto(body).trim()
  let porAudio = false
  if (!texto && temAudioSemTexto(body)) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (!transcrito) {
      await enviar(remetente, 'Recebi seu áudio, mas não consegui entender direito aqui. 😕 Pode mandar de novo ou escrever em texto, por favor?')
      return { ok: true, action: 'motorista-audio-falhou' }
    }
    texto = transcrito
    porAudio = true
  }
  if (!texto) {
    // Clique de botão/lista de outro fluxo (ex.: menu da Aurora) não é
    // resposta a essa conversa — devolve null em vez de reivindicar a
    // mensagem e deixá-la sem resposta nenhuma.
    if (extrairBotaoResposta(body)) return null
    return { ok: true, action: 'motorista-sem-conteudo' }
  }

  const primeiro = String(conversa.nome ?? '').trim().split(/\s+/)[0] ?? ''
  const nomeCap = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : ''

  if (conversa.estado === 'aguardando_motivo') {
    const { error } = await supabase.from('conversas_motorista_tml').update({
      motivo: texto, motivo_por_audio: porAudio, estado: 'aguardando_solucao',
    }).eq('id', conversa.id)
    if (error) {
      console.error('[webhook] conversa motorista motivo error:', error.message)
      await enviar(remetente, 'Ops, tive um probleminha pra registrar aqui. Pode tentar mandar de novo?')
      return { ok: false, action: 'db-error' } as any
    }
    await enviar(remetente,
      'Entendi, obrigado por contar. 🙏\n\n' +
      'Pensando pra frente: você acha que dá pra fazer alguma coisa diferente pra isso não se repetir? Pode ser algo simples, qualquer ideia sua ajuda.')
    return { ok: true, action: 'motorista-motivo-registrado' }
  }

  if (conversa.estado === 'aguardando_solucao') {
    const { error } = await supabase.from('conversas_motorista_tml').update({
      solucao: texto, solucao_por_audio: porAudio, estado: 'concluido', concluido_em: new Date().toISOString(),
    }).eq('id', conversa.id)
    if (error) {
      console.error('[webhook] conversa motorista solucao error:', error.message)
      await enviar(remetente, 'Ops, tive um probleminha pra registrar aqui. Pode tentar mandar de novo?')
      return { ok: false, action: 'db-error' } as any
    }
    const saud = nomeCap ? `Show, ${nomeCap}!` : 'Show!'
    await enviar(remetente,
      `${saud} Anotei aqui certinho. Valeu por dividir isso com a gente — é assim que a operação melhora. Bom trabalho hoje e boa rota! 🚛`)
    return { ok: true, action: 'motorista-solucao-registrada' }
  }

  return { ok: true, action: 'motorista-estado-desconhecido' }
}

async function tratarTml(body: any, remetente: string): Promise<{ ok: boolean; action: string }> {
  const rawBtn = extrairBotaoResposta(body)
  // ── Modo teste (botão "Enviar teste" do painel): não mexe em alertas reais ──
  if (rawBtn.startsWith('tmltestemotivo:')) {
    const motivo = rawBtn.slice('tmltestemotivo:'.length).trim()
    if (motivo) await enviar(remetente, `✅ *Teste recebido!*\nMotivo: *${motivo}*\n_(nenhum alerta foi alterado — isto é só um teste)_`)
    return { ok: true, action: 'teste-motivo' }
  }
  if (rawBtn.startsWith('tmltesteugc:')) {
    const resto = rawBtn.slice('tmltesteugc:'.length)
    const i = resto.indexOf(':')
    const filial = i >= 0 ? resto.slice(0, i) : ''
    const ugc = i >= 0 ? resto.slice(i + 1).trim() : ''
    if (!filial || !ugc) return { ok: true, action: 'invalid-button' }
    return await enviarMotivosUgcTesteTml(filial, ugc, 0, remetente)
  }
  if (rawBtn.startsWith('tmltestemais:')) {
    const resto = rawBtn.slice('tmltestemais:'.length)
    const sep = resto.lastIndexOf(':')
    const offset = sep >= 0 ? parseInt(resto.slice(sep + 1), 10) || 0 : 0
    const head = sep >= 0 ? resto.slice(0, sep) : resto
    const i = head.indexOf(':')
    const filial = i >= 0 ? head.slice(0, i) : ''
    const ugc = i >= 0 ? head.slice(i + 1) : ''
    if (!filial || !ugc) return { ok: true, action: 'invalid-button' }
    return await enviarMotivosUgcTesteTml(filial, ugc, offset, remetente)
  }

  if (rawBtn.startsWith('tmlmotivo:')) {
    const resto = rawBtn.slice('tmlmotivo:'.length)
    const alertaId = resto.slice(0, 36)
    const motivo = resto.slice(37).trim()
    if (!alertaId || !motivo) return { ok: true, action: 'invalid-button' }
    return await registrarJustificativaTml(alertaId, motivo, remetente)
  }
  // Clique num motivo da lista da Fixação de Motorista
  if (rawBtn.startsWith('fixmotivo:')) {
    const resto = rawBtn.slice('fixmotivo:'.length)
    const alertaId = resto.slice(0, 36)
    const motivo = resto.slice(37).trim()
    if (!alertaId || !motivo) return { ok: true, action: 'invalid-button' }
    if (motivo === 'OUTRO') {
      await enviar(remetente, '✍️ Por favor, responda esta mensagem explicando o motivo da divergência.')
      return { ok: true, action: 'fixacao-outro-solicitado' }
    }
    return await registrarJustificativaFixacaoMotorista(alertaId, motivo, remetente)
  }
  // Passo 1 → 2: clicou na área (UGC)
  if (rawBtn.startsWith('tmlugc:')) {
    const resto = rawBtn.slice('tmlugc:'.length)
    const alertaId = resto.slice(0, 36)
    const ugc = resto.slice(37).trim()
    if (!alertaId || !ugc) return { ok: true, action: 'invalid-button' }
    return await enviarMotivosUgcTml(alertaId, ugc, 0, remetente)
  }
  // "Ver mais" dentro de uma área
  if (rawBtn.startsWith('tmlmais:')) {
    const resto = rawBtn.slice('tmlmais:'.length)
    const alertaId = resto.slice(0, 36)
    const rest = resto.slice(37)
    const sep = rest.lastIndexOf(':')
    const ugc = sep >= 0 ? rest.slice(0, sep) : rest
    const offset = sep >= 0 ? parseInt(rest.slice(sep + 1), 10) || 0 : 0
    if (!alertaId || !ugc) return { ok: true, action: 'invalid-button' }
    return await enviarMotivosUgcTml(alertaId, ugc, offset, remetente)
  }

  const texto = extrairTexto(body).trim()
  if (!texto) return { ok: true, action: 'no-command' }

  // Saudação/comando da Aurora tem prioridade — um supervisor com alerta
  // pendente que manda "oi" quer o menu, não está respondendo o alerta.
  // Sem essa checagem, "oi" virava resposta livre do alerta mais recente e
  // a Aurora nunca chegava a rodar (bug real: o menu não aparecia pra quem
  // tinha qualquer alerta de TML/Fixação em aberto).
  if (ehSaudacaoAurora(texto) || ehTrocarAssuntoAurora(texto) || ehEncerrarAurora(texto)) return { ok: true, action: 'no-command' }

  const digitos = ultimosDigitos(remetente)
  if (!digitos) return { ok: true, action: 'no-command' }

  const { data: supervisores } = await supabase.from('supervisores_tml').select('id, telefone')
  const supervisor = (supervisores ?? []).find((s: any) => ultimosDigitos(s.telefone) === digitos)
  if (!supervisor) return { ok: true, action: 'no-command' }

  // Pega o alerta mais recente aguardando resposta deste supervisor (enviado
  // ou já respondido, para permitir complementar a resposta). O supervisor
  // pode ter alertas pendentes de dois tipos — TML perdido e Fixação de
  // Motorista —, então compara os dois e responde ao mais recente.
  const [{ data: alertaTml }, { data: alertaFixacao }] = await Promise.all([
    supabase
      .from('alertas_tml')
      .select('id, created_at')
      .eq('supervisor_id', supervisor.id)
      .in('status', ['enviado', 'respondido'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('alertas_fixacao_motorista')
      .select('id, created_at')
      .eq('supervisor_id', supervisor.id)
      .in('status', ['enviado', 'respondido'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!alertaTml && !alertaFixacao) return { ok: true, action: 'no-pending-alert' }

  if (alertaFixacao && (!alertaTml || alertaFixacao.created_at > alertaTml.created_at)) {
    return await registrarRespostaSupervisorFixacaoMotorista(alertaFixacao.id, texto, remetente)
  }
  return await registrarRespostaSupervisorTml(alertaTml!.id, texto, remetente)
}

// ── Controle de Saída da Frota Leve (grupo dedicado) ──────────────────────────────
// Fluxo: o motorista manda "registro" → o bot oferece Saída / Retorno. Na saída
// coleta placa, KM, hora, destino, previsão e a foto do painel (lê o KM da foto
// e confere). Bloqueia nova saída na MESMA placa enquanto houver viagem em rota.
// Quando a previsão expira sem o check de retorno, o bot pergunta se já voltou.

// Sessões de coleta abandonadas expiram (o veículo "em_rota" NÃO usa este TTL —
// esse é buscado por status, sem prazo, já que a viagem pode durar horas).
const FROTA_LEVE_TTL_MIN = 180

const FROTA_LEVE_COLETANDO = ['coletando_saida', 'aguardando_foto_saida', 'coletando_retorno', 'aguardando_foto_retorno']

function soDigitos(s: string): string {
  return String(s ?? '').replace(/\D/g, '')
}

// Normaliza uma placa (ABC-1234 antigo ou ABC1D23 Mercosul) para "ABC-1234".
function extrairPlaca(s: string): string | null {
  const t = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = t.match(/[A-Z]{3}\d[A-Z0-9]\d{2}/)
  if (!m) return null
  const p = m[0]
  return `${p.slice(0, 3)}-${p.slice(3)}`
}

// Extrai o KM (aceita "km 45230", "KM: 45.230", "hodômetro 45230").
function extrairKm(s: string): number | null {
  const m = String(s ?? '').match(/(?:km|quilomet|hod[oô]met)\D{0,5}(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})/i)
  if (m) {
    const n = parseInt(soDigitos(m[1]))
    return Number.isFinite(n) ? n : null
  }
  return null
}

// Uma mensagem que é basicamente só um número (correção de KM digitada).
function kmDeNumeroSolto(s: string): number | null {
  const t = String(s ?? '').trim()
  if (!/^\s*\d{1,3}(?:[.\s]\d{3})*\s*$|^\s*\d{2,7}\s*$/.test(t)) return null
  const n = parseInt(soDigitos(t))
  return Number.isFinite(n) ? n : null
}

// Converte a previsão de retorno em minutos ("2 horas", "1h30", "90 min", "2").
function parsePrevisaoMin(s: string): number | null {
  const t = norm(s)
  let m = t.match(/(\d+)\s*h(?:oras?)?\s*(\d{1,2})?/)
  if (m) return parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0)
  m = t.match(/(\d+)\s*min/)
  if (m) return parseInt(m[1])
  m = t.match(/(\d+(?:[.,]\d+)?)\s*hora/)
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60)
  m = t.match(/^\s*(\d{1,3})\s*$/)
  if (m) { const n = parseInt(m[1]); return n <= 12 ? n * 60 : n }  // número solto: ≤12 = horas
  return null
}

function extrairHora(s: string): string | null {
  const m = String(s ?? '').match(/(\d{1,2})[:h](\d{2})/)
  if (!m) return null
  const h = parseInt(m[1]), mm = parseInt(m[2])
  if (h > 23 || mm > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function horaAgoraBR(): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// Quebra a mensagem em tokens (uma linha OU um item separado por vírgula/;).
// Não quebra em ':' de propósito — o horário "09:35" tem ':' e não é separador.
function tokensCampos(texto: string): string[] {
  return String(texto ?? '').split(/\r?\n|;|,/).map(t => t.trim()).filter(Boolean)
}

// Remove a palavra-rótulo do início do token, devolvendo só o valor ("Destino: PDV" → "PDV").
function valorAposRotulo(token: string, rotulo: RegExp): string {
  return token.replace(rotulo, '').replace(/^\s*[:=\-]\s*/, '').trim()
}

interface CamposSaida { placa?: string | null; km?: number | null; hora?: string | null; destino?: string | null; previsao?: number | null }

function parseCamposSaida(texto: string): CamposSaida {
  const out: CamposSaida = {}
  for (const tok of tokensCampos(texto)) {
    const n = norm(tok)
    // Ordem importa: "previsão/retorno" antes de "hora" (senão "2 horas" cai no ramo da hora).
    if (/plac/.test(n))                        { const p = extrairPlaca(tok); if (p) out.placa = p }
    else if (/\bkm\b|quilomet|hod[oô]met/.test(n)) { const k = extrairKm(tok) ?? (parseInt(soDigitos(tok)) || null); if (k != null) out.km = k }
    else if (/previs|retorn/.test(n))          { const pv = parsePrevisaoMin(valorAposRotulo(tok, /.*?(previs\w*|retorno)/i)); if (pv != null) out.previsao = pv }
    else if (/sa[ií]da|hora/.test(n))          { const h = extrairHora(tok); if (h) out.hora = h }
    else if (/destin|local/.test(n))           { const d = valorAposRotulo(tok, /.*?(destino|local)/i); if (d) out.destino = d }
  }
  // Fallbacks: procura placa/km/hora em qualquer parte da mensagem
  if (!out.placa) out.placa = extrairPlaca(texto)
  if (out.km == null) out.km = extrairKm(texto)
  return out
}

interface CamposRetorno { km?: number | null; hora?: string | null; obs?: string | null }

function parseCamposRetorno(texto: string): CamposRetorno {
  const out: CamposRetorno = {}
  for (const tok of tokensCampos(texto)) {
    const n = norm(tok)
    if (/\bkm\b|quilomet|hod[oô]met/.test(n))  { const k = extrairKm(tok) ?? (parseInt(soDigitos(tok)) || null); if (k != null) out.km = k }
    else if (/obs|observ/.test(n))             { const o = valorAposRotulo(tok, /.*?(observ\w*|obs)/i); if (o) out.obs = o }
    else if (/hora|retorn|cheg/.test(n))       { const h = extrairHora(tok); if (h) out.hora = h }
  }
  if (out.km == null) out.km = extrairKm(texto)
  return out
}

// Lê o hodômetro (KM total) de uma foto do painel usando o Claude (visão).
// Retorna o inteiro lido ou null quando não há chave, a foto não abre ou a
// leitura é incerta — nesse caso o fluxo aceita o KM digitado sem travar.
async function lerKmDaFoto(url: string): Promise<number | null> {
  if (!ANTHROPIC_API_KEY || !url) return null
  try {
    const img = await fetch(url)
    if (!img.ok) { console.error('lerKmDaFoto: falha ao baixar', img.status); return null }
    const buf = Buffer.from(await img.arrayBuffer())
    const b64 = buf.toString('base64')
    let mime = (img.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!/^image\/(jpeg|png|gif|webp)$/.test(mime)) mime = 'image/jpeg'

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 120,
        system:
          'Você recebe a foto do painel de um veículo. Leia o hodômetro (quilometragem TOTAL do veículo), ' +
          'ignorando o hodômetro parcial (trip), o relógio e o RPM. Retorne apenas os dígitos do KM total. ' +
          'Se não conseguir ler com segurança, retorne km vazio ("").',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            { type: 'text', text: 'Qual é a quilometragem total (hodômetro) mostrada neste painel?' },
          ],
        }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: { type: 'object', properties: { km: { type: 'string' } }, required: ['km'], additionalProperties: false },
          },
        },
      }),
    })
    if (!resp.ok) { console.error('lerKmDaFoto Claude error:', resp.status, await resp.text().catch(() => '')); return null }
    const data: any = await resp.json()
    const bloco = (data.content ?? []).find((b: any) => b.type === 'text')
    if (!bloco?.text) return null
    const km = parseInt(soDigitos(String((JSON.parse(bloco.text)?.km) ?? '')))
    return Number.isFinite(km) && km > 0 ? km : null
  } catch (e) {
    console.error('lerKmDaFoto exception:', e)
    return null
  }
}

// Campos ainda faltantes na saída (todos obrigatórios menos, na prática, o que já veio).
function faltaSaida(s: any): string[] {
  const f: string[] = []
  if (!s.placa)          f.push('🚗 Placa')
  if (s.km_saida == null) f.push('⏱️ KM atual')
  if (!s.hora_saida)     f.push('🕐 Hora de saída (HH:MM)')
  if (!s.destino)        f.push('📍 Destino')
  if (s.previsao_min == null) f.push('⏳ Previsão de retorno (ex: 2 horas)')
  return f
}

function resumoSaidaConfirmada(s: any): string {
  const prev = s.previsao_retorno
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(s.previsao_retorno))
    : '—'
  return [
    `✅ *Saída registrada!*`,
    `👤 Condutor: ${s.condutor_nome ?? '—'}`,
    `🚗 Placa: ${s.placa}`,
    `⏱️ KM: ${s.km_saida?.toLocaleString('pt-BR')}`,
    `🕐 Saída: ${s.hora_saida}`,
    `📍 Destino: ${s.destino}`,
    `⏳ Retorno previsto: *${prev}*`,
    ``,
    `Ao voltar, mande *registro* e toque em *Retorno* para fechar a viagem. 🚙`,
  ].join('\n')
}

// Grava a saída como "em_rota" — chamado tanto quando a foto bate com o KM
// digitado quanto quando a leitura falhou e o motorista confirmou o valor
// (ou corrigiu) na pergunta de confirmação.
async function finalizarSaidaFrotaLeve(
  sess: any, grupoId: string, fotoUrl: string | null, kmFoto: number | null,
): Promise<{ ok: boolean; action: string }> {
  const agora = new Date()
  const previsao = new Date(agora.getTime() + (sess.previsao_min ?? 0) * 60_000)
  const { data: reg } = await supabase.from('frota_leve_saidas').update({
    status: 'em_rota',
    hora_saida: sess.hora_saida || horaAgoraBR(),
    km_saida: sess.km_saida,
    foto_saida_url: fotoUrl,
    km_saida_foto: kmFoto,
    previsao_retorno: previsao.toISOString(),
    saida_registrada_em: agora.toISOString(),
    passo: null,
  }).eq('id', sess.id).select('*').single()
  const nota = kmFoto == null
    ? `\n_(não consegui ler o KM pela foto; o KM ${sess.km_saida?.toLocaleString('pt-BR')} foi confirmado por você)_`
    : `\n✅ KM conferido pela foto.`
  await enviar(grupoId, resumoSaidaConfirmada(reg ?? sess) + nota)
  return { ok: true, action: 'frl-saida-confirmada' }
}

// Grava o retorno como "finalizado" — mesma ideia do helper de saída acima.
async function finalizarRetornoFrotaLeve(
  sess: any, grupoId: string, fotoUrl: string | null, kmFoto: number | null,
): Promise<{ ok: boolean; action: string }> {
  const agora = new Date()
  const { data: reg } = await supabase.from('frota_leve_saidas').update({
    status: 'finalizado',
    hora_retorno: sess.hora_retorno || horaAgoraBR(),
    km_retorno: sess.km_retorno,
    foto_retorno_url: fotoUrl,
    km_retorno_foto: kmFoto,
    finalizado_em: agora.toISOString(),
    passo: null,
  }).eq('id', sess.id).select('*').single()
  const r = reg ?? sess
  const rodados = (r.km_retorno != null && r.km_saida != null) ? r.km_retorno - r.km_saida : null
  let tempo = ''
  if (r.saida_registrada_em) {
    const min = Math.max(0, Math.round((agora.getTime() - new Date(r.saida_registrada_em).getTime()) / 60_000))
    tempo = `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`
  }
  const linhas = [
    `🏁 *Viagem finalizada!*`,
    `🚗 Placa: ${r.placa}`,
    `📍 Destino: ${r.destino ?? '—'}`,
    `⏱️ Saída: ${r.km_saida?.toLocaleString('pt-BR')} (${r.hora_saida ?? '—'})`,
    `⏱️ Retorno: ${r.km_retorno?.toLocaleString('pt-BR')} (${r.hora_retorno ?? '—'})`,
  ]
  if (rodados != null) linhas.push(`🛣️ KM rodados: *${rodados.toLocaleString('pt-BR')} km*`)
  if (tempo) linhas.push(`⌛ Tempo em rota: *${tempo}*`)
  if (r.observacoes) linhas.push(`📝 Obs: ${r.observacoes}`)
  if (kmFoto == null) linhas.push(`_(não consegui ler o KM pela foto; o KM ${sess.km_retorno?.toLocaleString('pt-BR')} foi confirmado por você)_`)
  await enviar(grupoId, linhas.join('\n'))
  return { ok: true, action: 'frl-finalizada' }
}

// Statuses de uma viagem "aberta" (fora / sem retorno finalizado) — usados na trava.
const FRL_ABERTO_TRAVA = ['aguardando_foto_saida', 'em_rota', 'coletando_retorno', 'aguardando_foto_retorno']

async function condutoresFrotaLeve(filial: string): Promise<{ id: string; nome: string }[]> {
  const { data } = await supabase.from('frota_leve_condutores').select('id, nome').eq('filial', filial).eq('ativo', true).order('nome')
  return (data ?? []) as { id: string; nome: string }[]
}

async function veiculosFrotaLeve(filial: string): Promise<{ id: string; placa: string; modelo: string | null }[]> {
  const { data } = await supabase.from('frota_leve_veiculos').select('id, placa, modelo').eq('filial', filial).eq('ativo', true).order('placa')
  return (data ?? []) as { id: string; placa: string; modelo: string | null }[]
}

function normNome(s: string): string { return norm(s).replace(/\s+/g, ' ').trim() }

// Pergunta o campo da SAÍDA correspondente ao passo atual.
async function perguntarPassoSaida(passo: string, grupoId: string, filial: string, nome: string): Promise<void> {
  if (passo === 'condutor') {
    const conds = await condutoresFrotaLeve(filial)
    if (conds.length) {
      await enviarOpcoes(grupoId, `👤 ${nome}, quem é o *condutor*?\n(ou digite o nome — responda *CANCELAR* para desistir)`, 'Condutores', 'Escolher',
        conds.slice(0, 9).map(c => ({ id: `frl_cond:${c.id}`, title: c.nome })))
    } else {
      await enviar(grupoId, `👤 ${nome}, quem é o *condutor*? Responda com o nome.\n_(ou responda *CANCELAR* para desistir)_`)
    }
    return
  }
  if (passo === 'veiculo') {
    const veics = await veiculosFrotaLeve(filial)
    if (veics.length) {
      await enviarOpcoes(grupoId, `🚗 Qual o *veículo*?\n(ou digite a placa)`, 'Veículos', 'Escolher',
        veics.slice(0, 9).map(v => ({ id: `frl_veic:${v.id}`, title: v.placa, description: v.modelo ?? undefined })))
    } else {
      await enviar(grupoId, `🚗 Qual a *placa* do veículo?`)
    }
    return
  }
  if (passo === 'km')       { await enviar(grupoId, `⏱️ Qual o *KM atual* do painel?`); return }
  if (passo === 'hora')     { await enviar(grupoId, `🕐 Qual a *hora de saída*? (HH:MM — ou responda *agora*)`); return }
  if (passo === 'destino')  { await enviar(grupoId, `📍 Qual o *destino*?`); return }
  if (passo === 'previsao') { await enviar(grupoId, `⏳ Qual a *previsão de retorno*? (ex: 2 horas, 30 min)`); return }
}

// Pergunta o campo do RETORNO correspondente ao passo atual.
async function perguntarPassoRetorno(passo: string, grupoId: string, nome: string): Promise<void> {
  if (passo === 'km')   { await enviar(grupoId, `⏱️ ${nome}, qual o *KM de retorno* (do painel)?`); return }
  if (passo === 'hora') { await enviar(grupoId, `🕐 Qual a *hora de retorno*? (HH:MM — ou responda *agora*)`); return }
  if (passo === 'obs')  { await enviar(grupoId, `📝 Alguma *observação*? (ou responda *não*)`); return }
}

// Trava: retorna a viagem aberta (mesma placa OU mesmo condutor) que impede uma
// nova saída, ou null se estiver liberado. É a "trava de saída sem checklist de retorno".
async function travaSaidaAberta(grupoId: string, placa: string, condutorId: string | null, exclId: string): Promise<any | null> {
  const { data: porPlaca } = await supabase.from('frota_leve_saidas')
    .select('id, placa, condutor_nome, hora_saida').eq('grupo_id', grupoId).eq('placa', placa)
    .in('status', FRL_ABERTO_TRAVA).neq('id', exclId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (porPlaca) return porPlaca
  if (condutorId) {
    const { data: porCond } = await supabase.from('frota_leve_saidas')
      .select('id, placa, condutor_nome, hora_saida').eq('grupo_id', grupoId).eq('condutor_id', condutorId)
      .in('status', FRL_ABERTO_TRAVA).neq('id', exclId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (porCond) return porCond
  }
  return null
}

// Cria a sessão de saída e faz a 1ª pergunta (condutor).
async function iniciarSaidaFrotaLeve(grupoId: string, filial: string, participante: string, nome: string): Promise<void> {
  await supabase.from('frota_leve_saidas').insert({
    filial, grupo_id: grupoId, motorista_telefone: participante, motorista_nome: nome,
    sessao_telefone: participante, status: 'coletando_saida', passo: 'condutor',
  })
  await perguntarPassoSaida('condutor', grupoId, filial, nome)
}

// Inicia o retorno de uma viagem específica (passo-a-passo).
async function iniciarRetornoFrotaLeve(sess: any, grupoId: string, participante: string): Promise<void> {
  await supabase.from('frota_leve_saidas').update({ status: 'coletando_retorno', passo: 'km', sessao_telefone: participante }).eq('id', sess.id)
  const nome = sess.condutor_nome || sess.motorista_nome || 'Motorista'
  await enviar(grupoId, `📥 ${nome}, vamos registrar o *retorno* da placa *${sess.placa}*.\n_(responda *CANCELAR* para desistir)_`)
  await perguntarPassoRetorno('km', grupoId, nome)
}

// Lista as viagens em rota do grupo para o motorista escolher qual retornar.
async function menuRetornoFrotaLeve(grupoId: string, participante: string, nome: string): Promise<void> {
  const { data: abertas } = await supabase.from('frota_leve_saidas').select('*')
    .eq('grupo_id', grupoId).eq('status', 'em_rota').order('created_at', { ascending: false })
  if (!abertas || abertas.length === 0) { await enviar(grupoId, `ℹ️ ${nome}, não há nenhuma saída em aberto para retornar.`); return }
  if (abertas.length === 1) { await iniciarRetornoFrotaLeve(abertas[0], grupoId, participante); return }
  await enviarOpcoes(grupoId, `📥 ${nome}, qual viagem você está retornando?`, 'Saídas em aberto', 'Escolher',
    abertas.slice(0, 9).map((a: any) => ({ id: `frl_ret_pick:${a.id}`, title: `${a.placa} — ${a.condutor_nome ?? 'condutor'}`, description: `saída ${a.hora_saida ?? '—'}` })))
}

// Avança a sessão de coleta conforme o status atual e a mensagem recebida.
async function avancarSessaoFrotaLeve(
  sess: any, body: any, grupoId: string, filial: string, texto: string, nome: string,
): Promise<{ ok: boolean; action: string }> {
  nome = sess.condutor_nome || sess.motorista_nome || nome
  const btn = extrairBotaoResposta(body)
  // Cancelamento em qualquer etapa: "CANCELAR" (também aceita "cancela",
  // "desistir", mesmo com texto em volta, ex.: "quero cancelar").
  if (/\b(cancelar|cancela|cancele|desistir|desisto)\b/.test(norm(texto))) {
    if (sess.status === 'coletando_retorno' || sess.status === 'aguardando_foto_retorno') {
      // Desistiu do RETORNO → a viagem volta a ficar em rota (não perde a saída).
      await supabase.from('frota_leve_saidas').update({ status: 'em_rota', passo: null }).eq('id', sess.id)
      await enviar(grupoId,
        `↩️ ${nome}, retorno cancelado. A viagem da placa *${sess.placa}* continua *em aberto*.\n` +
        `Mande *registro* → *Retorno* quando quiser fechá-la.`)
      return { ok: true, action: 'frl-retorno-cancelado' }
    }
    // Desistiu da SAÍDA (ainda não registrada) → cancela o registro.
    await supabase.from('frota_leve_saidas').update({ status: 'cancelado' }).eq('id', sess.id)
    await enviar(grupoId, `❌ ${nome}, registro *cancelado*. Quando quiser, mande *registro* para começar de novo.`)
    return { ok: true, action: 'frl-cancelado' }
  }

  // ── SAÍDA: pergunta-a-pergunta ──
  if (sess.status === 'coletando_saida') {
    const passo = sess.passo || 'condutor'

    if (passo === 'condutor') {
      let condId: string | null = null, condNome = ''
      if (btn.startsWith('frl_cond:')) {
        condId = btn.slice('frl_cond:'.length)
        const { data: c } = await supabase.from('frota_leve_condutores').select('id, nome').eq('id', condId).maybeSingle()
        if (c) condNome = c.nome
      } else if (texto.trim()) {
        const conds = await condutoresFrotaLeve(filial)
        if (conds.length) {
          const q = normNome(texto)
          const m = conds.find(c => normNome(c.nome) === q) || conds.find(c => normNome(c.nome).includes(q) || q.includes(normNome(c.nome)))
          if (m) { condId = m.id; condNome = m.nome }
          else {
            await enviar(grupoId, `🤔 Não achei esse condutor no cadastro. Toque na opção ou digite o nome como cadastrado.`)
            await perguntarPassoSaida('condutor', grupoId, filial, nome)
            return { ok: true, action: 'frl-saida-condutor-invalido' }
          }
        } else {
          condNome = texto.trim()  // sem cadastro → aceita texto livre
        }
      } else {
        await perguntarPassoSaida('condutor', grupoId, filial, nome)
        return { ok: true, action: 'frl-saida-condutor-repergunta' }
      }
      await supabase.from('frota_leve_saidas').update({ condutor_id: condId, condutor_nome: condNome, passo: 'veiculo' }).eq('id', sess.id)
      await perguntarPassoSaida('veiculo', grupoId, filial, condNome || nome)
      return { ok: true, action: 'frl-saida-condutor-ok' }
    }

    if (passo === 'veiculo') {
      let veicId: string | null = null, placa = ''
      if (btn.startsWith('frl_veic:')) {
        veicId = btn.slice('frl_veic:'.length)
        const { data: v } = await supabase.from('frota_leve_veiculos').select('id, placa').eq('id', veicId).maybeSingle()
        if (v) placa = v.placa
      } else if (texto.trim()) {
        const veics = await veiculosFrotaLeve(filial)
        const p = extrairPlaca(texto)
        if (veics.length) {
          const m = p ? veics.find(v => v.placa.replace(/\W/g, '').toUpperCase() === p.replace(/\W/g, '')) : null
          if (m) { veicId = m.id; placa = m.placa }
          else {
            await enviar(grupoId, `🤔 Não achei esse veículo no cadastro. Toque na opção ou digite a placa cadastrada.`)
            await perguntarPassoSaida('veiculo', grupoId, filial, nome)
            return { ok: true, action: 'frl-saida-veiculo-invalido' }
          }
        } else if (p) {
          placa = p  // sem cadastro → aceita placa válida
        } else {
          await enviar(grupoId, `🤔 Não entendi a placa. Envie no formato ABC-1234.`)
          return { ok: true, action: 'frl-saida-placa-invalida' }
        }
      } else {
        await perguntarPassoSaida('veiculo', grupoId, filial, nome)
        return { ok: true, action: 'frl-saida-veiculo-repergunta' }
      }
      // TRAVA: placa ou condutor já com viagem aberta sem checklist de retorno
      const bloq = await travaSaidaAberta(grupoId, placa, sess.condutor_id ?? null, sess.id)
      if (bloq) {
        await supabase.from('frota_leve_saidas').update({ status: 'cancelado' }).eq('id', sess.id)
        await enviar(grupoId,
          `⛔ ${nome}, já existe uma *saída em aberto* (placa *${bloq.placa}*, condutor ${bloq.condutor_nome ?? '—'}, saída ${bloq.hora_saida ?? '—'}) *sem o checklist de retorno*.\n` +
          `Faça o *Retorno* dessa viagem antes de registrar uma nova saída.\nMande *registro* e toque em *Retorno*.`)
        return { ok: true, action: 'frl-trava-saida' }
      }
      await supabase.from('frota_leve_saidas').update({ veiculo_id: veicId, placa, passo: 'km' }).eq('id', sess.id)
      await perguntarPassoSaida('km', grupoId, filial, nome)
      return { ok: true, action: 'frl-saida-veiculo-ok' }
    }

    if (passo === 'km') {
      const k = kmDeNumeroSolto(texto) ?? extrairKm(texto)
      if (k == null) { await enviar(grupoId, `🔢 Envie só o *KM* (número). Ex: 45230`); return { ok: true, action: 'frl-saida-km-repergunta' } }
      await supabase.from('frota_leve_saidas').update({ km_saida: k, passo: 'hora' }).eq('id', sess.id)
      await perguntarPassoSaida('hora', grupoId, filial, nome)
      return { ok: true, action: 'frl-saida-km-ok' }
    }

    if (passo === 'hora') {
      const h = /agora/i.test(texto) ? horaAgoraBR() : extrairHora(texto)
      if (!h) { await enviar(grupoId, `🕐 Envie a *hora* no formato HH:MM (ou responda *agora*).`); return { ok: true, action: 'frl-saida-hora-repergunta' } }
      await supabase.from('frota_leve_saidas').update({ hora_saida: h, passo: 'destino' }).eq('id', sess.id)
      await perguntarPassoSaida('destino', grupoId, filial, nome)
      return { ok: true, action: 'frl-saida-hora-ok' }
    }

    if (passo === 'destino') {
      const d = texto.trim()
      if (!d) { await enviar(grupoId, `📍 Qual o *destino*?`); return { ok: true, action: 'frl-saida-destino-repergunta' } }
      await supabase.from('frota_leve_saidas').update({ destino: d, passo: 'previsao' }).eq('id', sess.id)
      await perguntarPassoSaida('previsao', grupoId, filial, nome)
      return { ok: true, action: 'frl-saida-destino-ok' }
    }

    if (passo === 'previsao') {
      const pv = parsePrevisaoMin(texto)
      if (pv == null) { await enviar(grupoId, `⏳ Não entendi. Envie a *previsão* (ex: 2 horas, 90 min, 1h30).`); return { ok: true, action: 'frl-saida-previsao-repergunta' } }
      await supabase.from('frota_leve_saidas').update({ previsao_min: pv, status: 'aguardando_foto_saida', passo: null }).eq('id', sess.id)
      await enviar(grupoId, `📸 Por fim, envie a *foto do painel* mostrando o KM.`)
      return { ok: true, action: 'frl-saida-pede-foto' }
    }

    // passo desconhecido → recomeça pela pergunta do condutor
    await supabase.from('frota_leve_saidas').update({ passo: 'condutor' }).eq('id', sess.id)
    await perguntarPassoSaida('condutor', grupoId, filial, nome)
    return { ok: true, action: 'frl-saida-reset' }
  }

  // ── Aguardando a FOTO da saída ──
  if (sess.status === 'aguardando_foto_saida') {
    // Já recebemos a foto, mas não deu pra ler o KM com segurança —
    // aguardando o motorista confirmar (ou corrigir) o valor que ele mesmo
    // digitou antes. A palavra final é sempre do motorista, não da leitura.
    if (sess.passo === 'confirmar_km_saida_sem_leitura') {
      const kmCorr = kmDeNumeroSolto(texto)
      if (kmCorr != null) return await finalizarSaidaFrotaLeve({ ...sess, km_saida: kmCorr }, grupoId, sess.foto_saida_url, null)
      if (extrairResposta(body) === 'sim') return await finalizarSaidaFrotaLeve(sess, grupoId, sess.foto_saida_url, null)
      await enviar(grupoId, `Não entendi. O KM *${sess.km_saida?.toLocaleString('pt-BR')}* está correto? Responda *sim* pra confirmar, ou envie o número certo.`)
      return { ok: true, action: 'frl-saida-confirma-km-repete' }
    }

    const kmCorr = kmDeNumeroSolto(texto)
    if (kmCorr != null) {  // motorista digitou um novo KM (correção)
      await supabase.from('frota_leve_saidas').update({ km_saida: kmCorr }).eq('id', sess.id)
      await enviar(grupoId, `👍 KM atualizado para *${kmCorr.toLocaleString('pt-BR')}*. Agora envie a *foto do painel*, por favor.`)
      return { ok: true, action: 'frl-saida-km-corrigido' }
    }
    const url = extrairImagemUrl(body)
    if (!url) {
      await enviar(grupoId, `📸 ${nome}, ainda preciso da *foto do painel* com o KM ${sess.km_saida?.toLocaleString('pt-BR')} visível.`)
      return { ok: true, action: 'frl-saida-sem-foto' }
    }
    const kmFoto = await lerKmDaFoto(url)
    if (kmFoto != null && Math.abs(kmFoto - (sess.km_saida ?? 0)) > 2) {
      await supabase.from('frota_leve_saidas').update({ foto_saida_url: url, km_saida_foto: kmFoto }).eq('id', sess.id)
      await enviar(grupoId,
        `⚠️ ${nome}, o KM que você informou foi *${sess.km_saida?.toLocaleString('pt-BR')}*, mas na foto do painel eu li *${kmFoto.toLocaleString('pt-BR')}*.\n` +
        `Se o certo é o da foto, responda com o número *${kmFoto.toLocaleString('pt-BR')}*. Se preferir, reenvie uma foto mais nítida.`)
      return { ok: true, action: 'frl-saida-km-divergente' }
    }
    if (kmFoto == null) {
      await supabase.from('frota_leve_saidas').update({ foto_saida_url: url, passo: 'confirmar_km_saida_sem_leitura' }).eq('id', sess.id)
      await enviar(grupoId,
        `📸 Recebi a foto, mas não consegui ler o KM do painel com clareza.\n` +
        `Você informou *${sess.km_saida?.toLocaleString('pt-BR')}* — está correto? Responda *sim* pra confirmar, ou envie o número certo.`)
      return { ok: true, action: 'frl-saida-confirma-km-pede' }
    }
    return await finalizarSaidaFrotaLeve(sess, grupoId, url, kmFoto)
  }

  // ── RETORNO: pergunta-a-pergunta ──
  if (sess.status === 'coletando_retorno') {
    const passo = sess.passo || 'km'

    if (passo === 'km') {
      const k = kmDeNumeroSolto(texto) ?? extrairKm(texto)
      if (k == null) { await enviar(grupoId, `🔢 Envie só o *KM de retorno* (número). Ex: 45285`); return { ok: true, action: 'frl-retorno-km-repergunta' } }
      if (sess.km_saida != null && k < sess.km_saida) {
        await enviar(grupoId, `⚠️ O KM de retorno (*${k.toLocaleString('pt-BR')}*) está menor que o de saída (*${sess.km_saida.toLocaleString('pt-BR')}*). Confira e envie de novo.`)
        return { ok: true, action: 'frl-retorno-km-menor' }
      }
      await supabase.from('frota_leve_saidas').update({ km_retorno: k, passo: 'hora' }).eq('id', sess.id)
      await perguntarPassoRetorno('hora', grupoId, nome)
      return { ok: true, action: 'frl-retorno-km-ok' }
    }

    if (passo === 'hora') {
      const h = /agora/i.test(texto) ? horaAgoraBR() : extrairHora(texto)
      if (!h) { await enviar(grupoId, `🕐 Envie a *hora de retorno* (HH:MM ou *agora*).`); return { ok: true, action: 'frl-retorno-hora-repergunta' } }
      await supabase.from('frota_leve_saidas').update({ hora_retorno: h, passo: 'obs' }).eq('id', sess.id)
      await perguntarPassoRetorno('obs', grupoId, nome)
      return { ok: true, action: 'frl-retorno-hora-ok' }
    }

    if (passo === 'obs') {
      const semObs = /^\s*(n[aã]o|-|sem|nenhuma?|n)\s*$/i.test(texto)
      await supabase.from('frota_leve_saidas').update({ observacoes: semObs ? null : (texto.trim() || null), status: 'aguardando_foto_retorno', passo: null }).eq('id', sess.id)
      await enviar(grupoId, `📸 Agora envie a *foto do painel* com o KM de retorno.`)
      return { ok: true, action: 'frl-retorno-pede-foto' }
    }

    await supabase.from('frota_leve_saidas').update({ passo: 'km' }).eq('id', sess.id)
    await perguntarPassoRetorno('km', grupoId, nome)
    return { ok: true, action: 'frl-retorno-reset' }
  }

  // ── Aguardando a FOTO do retorno → finaliza ──
  if (sess.status === 'aguardando_foto_retorno') {
    // Mesma confirmação da saída: foto já recebida, mas leitura sem
    // segurança — a palavra final fica com o motorista.
    if (sess.passo === 'confirmar_km_retorno_sem_leitura') {
      const kmCorr = kmDeNumeroSolto(texto)
      if (kmCorr != null) {
        if (sess.km_saida != null && kmCorr < sess.km_saida) {
          await enviar(grupoId, `⚠️ Esse KM (${kmCorr.toLocaleString('pt-BR')}) está menor que o de saída. Confira e envie de novo.`)
          return { ok: true, action: 'frl-retorno-km-menor' }
        }
        return await finalizarRetornoFrotaLeve({ ...sess, km_retorno: kmCorr }, grupoId, sess.foto_retorno_url, null)
      }
      if (extrairResposta(body) === 'sim') return await finalizarRetornoFrotaLeve(sess, grupoId, sess.foto_retorno_url, null)
      await enviar(grupoId, `Não entendi. O KM *${sess.km_retorno?.toLocaleString('pt-BR')}* está correto? Responda *sim* pra confirmar, ou envie o número certo.`)
      return { ok: true, action: 'frl-retorno-confirma-km-repete' }
    }

    const kmCorr = kmDeNumeroSolto(texto)
    if (kmCorr != null) {
      if (sess.km_saida != null && kmCorr < sess.km_saida) {
        await enviar(grupoId, `⚠️ Esse KM (${kmCorr.toLocaleString('pt-BR')}) está menor que o de saída. Confira e envie de novo.`)
        return { ok: true, action: 'frl-retorno-km-menor' }
      }
      await supabase.from('frota_leve_saidas').update({ km_retorno: kmCorr }).eq('id', sess.id)
      await enviar(grupoId, `👍 KM de retorno atualizado para *${kmCorr.toLocaleString('pt-BR')}*. Agora envie a *foto do painel*.`)
      return { ok: true, action: 'frl-retorno-km-corrigido' }
    }
    const url = extrairImagemUrl(body)
    if (!url) {
      await enviar(grupoId, `📸 ${nome}, ainda preciso da *foto do painel* com o KM de retorno.`)
      return { ok: true, action: 'frl-retorno-sem-foto' }
    }
    const kmFoto = await lerKmDaFoto(url)
    if (kmFoto != null && Math.abs(kmFoto - (sess.km_retorno ?? 0)) > 2) {
      await supabase.from('frota_leve_saidas').update({ foto_retorno_url: url, km_retorno_foto: kmFoto }).eq('id', sess.id)
      await enviar(grupoId,
        `⚠️ ${nome}, você informou *${sess.km_retorno?.toLocaleString('pt-BR')}*, mas na foto eu li *${kmFoto.toLocaleString('pt-BR')}*.\n` +
        `Se o certo é o da foto, responda com o número *${kmFoto.toLocaleString('pt-BR')}*. Ou reenvie uma foto mais nítida.`)
      return { ok: true, action: 'frl-retorno-km-divergente' }
    }
    if (kmFoto == null) {
      await supabase.from('frota_leve_saidas').update({ foto_retorno_url: url, passo: 'confirmar_km_retorno_sem_leitura' }).eq('id', sess.id)
      await enviar(grupoId,
        `📸 Recebi a foto, mas não consegui ler o KM do painel com clareza.\n` +
        `Você informou *${sess.km_retorno?.toLocaleString('pt-BR')}* — está correto? Responda *sim* pra confirmar, ou envie o número certo.`)
      return { ok: true, action: 'frl-retorno-confirma-km-pede' }
    }
    return await finalizarRetornoFrotaLeve(sess, grupoId, url, kmFoto)
  }

  return { ok: true, action: 'frl-estado-desconhecido' }
}

// Lembrete de retorno: viagens em rota cuja previsão expirou e que ainda não
// receberam o aviso. Roda de forma oportunista a cada mensagem no grupo (e pode
// ser chamada por um cron via /api/frota-leve-check). `grupoAlvo` opcional
// restringe a um grupo (uso oportunista); sem ele, varre todos (uso do cron).
export async function verificarLembretesFrotaLeve(grupoAlvo?: string): Promise<number> {
  const agora = new Date().toISOString()
  let q = supabase.from('frota_leve_saidas').select('*')
    .eq('status', 'em_rota').lte('previsao_retorno', agora).is('lembrete_enviado_em', null)
  if (grupoAlvo) q = q.eq('grupo_id', grupoAlvo)
  const { data } = await q.limit(50)
  let enviados = 0
  for (const s of data ?? []) {
    await enviarBotoes(String(s.grupo_id),
      `⏰ ${s.condutor_nome ?? s.motorista_nome ?? 'Motorista'}, o tempo previsto de retorno da placa *${s.placa}* (saída ${s.hora_saida ?? '—'}) já passou.\n` +
      `Já retornou? Toque em *Registrar Retorno* para fazer o checklist.`,
      [{ id: `frl_ret_pick:${s.id}`, label: '📥 Registrar Retorno' }])
    await supabase.from('frota_leve_saidas').update({ lembrete_enviado_em: new Date().toISOString() }).eq('id', s.id)
    enviados++
    await aguardarEntreEnvios()
  }
  return enviados
}

// Finalização automática de mapas parados: se a conferência de um mapa está
// em andamento (pelo menos uma baia iniciada) há mais de 30 minutos e ainda
// não terminou, as baias que sobraram como 'pendente' são marcadas como
// 'pulada' (motivo automático) — não como 'conferida', já que ninguém
// verificou os itens de fato. O horário gravado é o da ÚLTIMA baia
// conferida do mapa (não "agora"), pra não inflar o tempo de conferência
// registrado com o atraso até o cron rodar; sem nenhuma baia conferida
// ainda, cai pro horário atual. Chamado só por cron (mesmo endpoint do
// lembrete de baia parada, /api/conferencia-parada-check).
export async function finalizarMapasParadosAutomaticamente(): Promise<number> {
  const desde = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
  const { data: baias } = await supabase
    .from('conferencia_baias')
    .select('id, filial, mapa, data, status, iniciada_em, finalizada_em')
    .gte('data', desde)
  if (!baias || baias.length === 0) return 0

  const porMapa = new Map<string, typeof baias>()
  for (const b of baias) {
    const chave = `${b.filial}|${b.mapa}|${b.data}`
    const lista = porMapa.get(chave) ?? []
    lista.push(b)
    porMapa.set(chave, lista)
  }

  const limite = Date.now() - 30 * 60_000
  let mapasFinalizados = 0
  for (const lista of porMapa.values()) {
    const pendentes = lista.filter((b) => b.status === 'pendente')
    if (pendentes.length === 0) continue // já concluído (tudo conferida/pulada)

    const inicios = lista.map((b) => b.iniciada_em).filter((t): t is string => !!t).map((t) => new Date(t).getTime())
    if (inicios.length === 0) continue // ninguém abriu nenhuma baia ainda — nada "em conferência"
    const inicioConferencia = Math.min(...inicios)
    if (inicioConferencia > limite) continue // ainda dentro dos 30 minutos

    const finsConferidos = lista
      .filter((b) => b.status === 'conferida' && b.finalizada_em)
      .map((b) => new Date(b.finalizada_em as string).getTime())
    const horarioFinal = finsConferidos.length > 0 ? new Date(Math.max(...finsConferidos)).toISOString() : new Date().toISOString()

    const { error } = await supabase
      .from('conferencia_baias')
      .update({ status: 'pulada', motivo_pulada: 'Finalização automática — mapa parado há mais de 30 minutos', finalizada_em: horarioFinal })
      .in('id', pendentes.map((b) => b.id))
    if (!error) mapasFinalizados++
  }
  return mapasFinalizados
}

// Lembrete de baia parada: quem abriu a baia (iniciarBaia grava
// iniciado_por/iniciado_por_telefone, ver src/lib/conferencia.ts) e não
// terminou em 5 minutos recebe uma pergunta simples se já finalizou. Chamado
// só por cron (/api/conferencia-parada-check) — diferente do lembrete de
// Frota Leve, não tem "grupo" pra rodar de forma oportunista a cada mensagem.
export async function verificarLembretesConferenciaParada(): Promise<number> {
  const limite = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data } = await supabase
    .from('conferencia_baias')
    .select('id, mapa, rotulo, iniciado_por, iniciado_por_telefone')
    .eq('status', 'pendente')
    .not('iniciada_em', 'is', null)
    .not('iniciado_por_telefone', 'is', null)
    .lte('iniciada_em', limite)
    .is('lembrete_parado_enviado_em', null)
    .limit(50)
  let enviados = 0
  for (const b of data ?? []) {
    await enviar(normalizarTelefoneBR(b.iniciado_por_telefone),
      `⏰ ${b.iniciado_por ? `${b.iniciado_por}, a` : 'A'}inda está conferindo a baia *${b.rotulo}* do mapa *${b.mapa}*?\n` +
      `Se já terminou, volta no app e marca como concluída. Se travou em algo, chama o supervisor.`)
    await supabase.from('conferencia_baias').update({ lembrete_parado_enviado_em: new Date().toISOString() }).eq('id', b.id)
    enviados++
    await aguardarEntreEnvios()
  }
  return enviados
}

async function tratarFrotaLeve(
  body: any, grupoId: string, filial: string, texto: string,
  senderName: string, participante: string,
): Promise<{ ok: boolean; action: string }> {
  // Aproveita a passagem pra checar lembretes vencidos deste grupo (não bloqueia o fluxo).
  await verificarLembretesFrotaLeve(grupoId).catch((e) => console.error('lembrete frota leve:', e))

  const nome = senderName || 'Motorista'
  const btn = extrairBotaoResposta(body)

  // Iniciar RETORNO de uma viagem específica (botão do lembrete ou do seletor)
  if (btn.startsWith('frl_ret_pick:')) {
    const id = btn.slice('frl_ret_pick:'.length)
    const { data: pick } = await supabase.from('frota_leve_saidas').select('*').eq('id', id).eq('status', 'em_rota').maybeSingle()
    if (!pick) { await enviar(grupoId, '⚠️ Essa viagem não está mais em aberto.'); return { ok: true, action: 'frl-pick-invalido' } }
    await iniciarRetornoFrotaLeve(pick, grupoId, participante)
    return { ok: true, action: 'frl-retorno-iniciado' }
  }

  // Botão explícito SAÍDA → começa uma coleta nova (passo-a-passo)
  if (btn === 'frl_saida') {
    await iniciarSaidaFrotaLeve(grupoId, filial, participante, nome)
    return { ok: true, action: 'frl-saida-iniciada' }
  }
  // Botão explícito RETORNO → lista viagens em rota do grupo
  if (btn === 'frl_retorno') {
    await menuRetornoFrotaLeve(grupoId, participante, nome)
    return { ok: true, action: 'frl-retorno-menu' }
  }

  // Sessão de coleta em andamento (quem está respondendo o bot)? Isso captura as
  // respostas digitadas e os cliques nas listas de condutor/veículo.
  const limite = new Date(Date.now() - FROTA_LEVE_TTL_MIN * 60_000).toISOString()
  let sess: any = null
  {
    const { data } = await supabase.from('frota_leve_saidas').select('*')
      .eq('grupo_id', grupoId).eq('sessao_telefone', participante).in('status', FROTA_LEVE_COLETANDO)
      .gte('updated_at', limite).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    sess = data
    // Clique numa lista de condutor/veículo pode não casar o telefone → cai na
    // sessão de saída mais recente do grupo.
    if (!sess && (btn.startsWith('frl_cond:') || btn.startsWith('frl_veic:'))) {
      const { data: d2 } = await supabase.from('frota_leve_saidas').select('*')
        .eq('grupo_id', grupoId).eq('status', 'coletando_saida')
        .gte('updated_at', limite).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      sess = d2
    }
  }
  if (sess) return await avancarSessaoFrotaLeve(sess, body, grupoId, filial, texto, nome)

  // Gatilhos por texto (sem sessão ativa)
  if (/^\s*sa[ií]da\s*$/i.test(texto)) {
    await iniciarSaidaFrotaLeve(grupoId, filial, participante, nome)
    return { ok: true, action: 'frl-saida-iniciada' }
  }
  if (/^\s*retorno\s*$/i.test(texto)) {
    await menuRetornoFrotaLeve(grupoId, participante, nome)
    return { ok: true, action: 'frl-retorno-menu' }
  }
  // Palavra-gatilho: "registro", "registrar", ... → oferece os botões
  if (/registr/.test(norm(texto))) {
    await enviarBotoes(grupoId,
      `🚗 ${nome}, o que deseja registrar?\nToque numa opção ou responda *Saída* ou *Retorno*.`,
      [{ id: 'frl_saida', label: '📤 Saída do veículo' }, { id: 'frl_retorno', label: '📥 Retorno do veículo' }])
    return { ok: true, action: 'frl-menu' }
  }

  // Qualquer outra coisa no grupo → silêncio (não polui o grupo)
  return { ok: true, action: 'frl-nao-aplicavel' }
}

// ── Dúvidas da Matinal (conversa individual disparada após o treinamento) ────
// Fluxo: ao finalizar a matinal com um treinamento marcado, o bot avisa cada
// colaborador da sala (ver MatinalTML.tsx, que grava em
// matinal_treinamento_avisos). A próxima mensagem daquele telefone, no MESMO
// DIA, é tratada como dúvida sobre o treinamento avisado: bate com a FAQ →
// responde na hora; não bate → encaminha ao telefone do palestrante, e a
// resposta dele volta ao colaborador (e vira FAQ pública do treinamento).

const MATINAL_LEMBRETE_PALESTRANTE_MIN = 180  // ~3h sem resposta → lembrete ao palestrante
const MATINAL_AVISO_ATRASO_MIN = 360          // + ~6h ainda sem resposta → avisa o colaborador

interface AvisoMatinalAtivo { treinamento_id: string; filial: string; sala: string; colaborador_nome: string | null }

// Encontra o aviso de treinamento mais recente enviado a este telefone HOJE.
async function buscarAvisoAtivoMatinal(remetente: string): Promise<AvisoMatinalAtivo | null> {
  const digitos = ultimosDigitos(remetente)
  if (!digitos) return null
  const desde = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const { data } = await supabase
    .from('matinal_treinamento_avisos')
    .select('treinamento_id, filial, sala, colaborador_telefone, colaborador_nome, enviado_em')
    .gte('enviado_em', desde)
    .order('enviado_em', { ascending: false })
    .limit(300)
  const hoje = new Date().toISOString().slice(0, 10)
  const aviso = (data ?? []).find((a: any) =>
    ultimosDigitos(a.colaborador_telefone) === digitos && String(a.enviado_em).slice(0, 10) === hoje)
  return aviso ? { treinamento_id: aviso.treinamento_id, filial: aviso.filial, sala: aviso.sala, colaborador_nome: aviso.colaborador_nome } : null
}

// Pergunta pra IA qual item da FAQ (se algum) responde a dúvida do colaborador.
async function casarComFaqIA(pergunta: string, faqList: { pergunta: string; resposta: string }[]): Promise<number> {
  if (!ANTHROPIC_API_KEY || faqList.length === 0) return -1
  try {
    const lista = faqList.map((f, i) => `${i}. ${f.pergunta}`).join('\n')
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 60,
        system:
          'Você recebe uma pergunta de um colaborador e uma lista numerada de perguntas de uma FAQ de treinamento. ' +
          'Se alguma pergunta da FAQ responde à mesma dúvida (mesmo com palavras diferentes), retorne o número dela. ' +
          'Se nenhuma responder com segurança, retorne -1. Responda só quando tiver certeza — na dúvida, retorne -1.',
        messages: [{ role: 'user', content: `Pergunta do colaborador: "${pergunta}"\n\nFAQ:\n${lista}` }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: { type: 'object', properties: { indice: { type: 'integer' } }, required: ['indice'], additionalProperties: false },
          },
        },
      }),
    })
    if (!resp.ok) return -1
    const data: any = await resp.json()
    const bloco = (data.content ?? []).find((b: any) => b.type === 'text')
    if (!bloco?.text) return -1
    const indice = JSON.parse(bloco.text)?.indice
    return (typeof indice === 'number' && indice >= 0 && indice < faqList.length) ? indice : -1
  } catch (e) {
    console.error('casarComFaqIA exception:', e)
    return -1
  }
}

// Respostas tipo "não tenho dúvida" não devem virar pergunta encaminhada ao
// palestrante — só confirma o entendimento. Compara a mensagem INTEIRA (não
// um trecho) depois de normalizada, pra não disparar em cima de perguntas
// reais que começam com "não" (ex.: "não entendi a parte de amarração").
const FRASES_SEM_DUVIDA = new Set([
  'never', 'no', 'nao', 'n', 'nenhuma', 'nenhum', 'nada',
  'nao tenho duvida', 'nao tenho duvidas', 'nao tenho pergunta', 'nao tenho perguntas',
  'sem duvida', 'sem duvidas', 'sem pergunta', 'sem perguntas',
  'nenhuma duvida', 'nenhuma duvidas', 'nenhuma pergunta', 'nenhuma perguntas',
  'tudo certo', 'tudo bem', 'tudo ok', 'ok', 'entendi', 'entendi tudo', 'ja entendi',
])

function mensagemIndicaSemDuvida(conteudo: string): boolean {
  return FRASES_SEM_DUVIDA.has(norm(conteudo).replace(/[.!?,;]+$/g, ''))
}

// Núcleo comum: dado um treinamento já identificado (por aviso do dia OU por
// pré-seleção de tema), tenta responder pela FAQ; senão encaminha ao
// palestrante. Usado tanto por tratarDuvidaMatinal quanto por
// tratarPreSelecaoTemaMatinal.
async function processarDuvidaSobreTreinamento(
  treinamentoId: string, filial: string, sala: string,
  remetente: string, nomeColab: string, conteudo: string, porAudio: boolean,
): Promise<{ ok: boolean; action: string }> {
  if (mensagemIndicaSemDuvida(conteudo)) {
    await enviar(remetente, 'Que bom que entendeu o treinamento! Caso tenha dúvidas, é só me chamar por aqui. 👍')
    return { ok: true, action: 'matinal-sem-duvida' }
  }

  const { data: treino } = await supabase
    .from('treinamentos_matinal')
    .select('id, titulo, palestrante_nome, palestrante_telefone')
    .eq('id', treinamentoId)
    .maybeSingle()
  if (!treino) return { ok: true, action: 'matinal-treinamento-nao-encontrado' }

  const { data: faqRows } = await supabase
    .from('treinamento_faq_matinal')
    .select('pergunta, resposta')
    .eq('treinamento_id', treino.id)
  const faqList = (faqRows ?? []) as { pergunta: string; resposta: string }[]

  const indice = await casarComFaqIA(conteudo, faqList)

  if (indice >= 0) {
    const resposta = faqList[indice].resposta
    await supabase.from('duvidas_matinal').insert({
      treinamento_id: treino.id, filial, sala,
      colaborador_telefone: remetente, colaborador_nome: nomeColab,
      pergunta: conteudo, pergunta_por_audio: porAudio,
      palestrante_telefone: treino.palestrante_telefone,
      resposta, status: 'respondida_auto', respondida_em: new Date().toISOString(),
    })
    await enviar(remetente, `✅ ${resposta}`)
    return { ok: true, action: 'matinal-respondida-auto' }
  }

  await supabase.from('duvidas_matinal').insert({
    treinamento_id: treino.id, filial, sala,
    colaborador_telefone: remetente, colaborador_nome: nomeColab,
    pergunta: conteudo, pergunta_por_audio: porAudio,
    palestrante_telefone: treino.palestrante_telefone,
    status: 'aguardando_palestrante',
  })

  await enviar(remetente,
    `Boa pergunta! Não tenho certeza — vou perguntar pra *${treino.palestrante_nome}* e te aviso assim que ela responder.`)
  if (treino.palestrante_telefone) {
    await enviar(normalizarTelefoneBR(treino.palestrante_telefone),
      `❓ Pergunta sobre *${treino.titulo}*, de ${nomeColab}:\n"${conteudo}"\n\nResponda esta mensagem.`)
  }
  return { ok: true, action: 'matinal-encaminhada' }
}

// Mensagem individual do colaborador — só processa se houver aviso de
// treinamento ativo hoje pra esse telefone; senão retorna null (não se aplica,
// e cai na pré-seleção de tema mais adiante no roteamento do handler).
async function tratarDuvidaMatinal(
  body: any, remetente: string, senderName: string,
): Promise<{ ok: boolean; action: string } | null> {
  // Uma saudação/comando da Aurora tem prioridade sobre "a próxima mensagem
  // é resposta ao treinamento" — sem isso, quem recebeu aviso de treinamento
  // hoje ficava travado nesse fluxo até mandar alguma coisa, sem conseguir
  // abrir o menu da Aurora no mesmo dia.
  const textoBruto = extrairTexto(body).trim()
  if (ehSaudacaoAurora(textoBruto) || ehTrocarAssuntoAurora(textoBruto) || ehEncerrarAurora(textoBruto)) return null

  const aviso = await buscarAvisoAtivoMatinal(remetente)
  if (!aviso) return null

  let conteudo = textoBruto
  let porAudio = false
  if (!conteudo && temAudioSemTexto(body)) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (!transcrito) {
      await enviar(remetente, 'Recebi seu áudio, mas não consegui entender direito. Pode mandar de novo ou escrever em texto?')
      return { ok: true, action: 'matinal-audio-falhou' }
    }
    conteudo = transcrito
    porAudio = true
  }
  if (!conteudo) {
    // Clique de botão/lista (ex.: menu da Aurora) não é resposta a "tirou
    // dúvida do treinamento?" — devolve null pra outro fluxo tratar, em vez
    // de reivindicar a mensagem e deixá-la sem resposta nenhuma.
    if (extrairBotaoResposta(body)) return null
    return { ok: true, action: 'matinal-sem-conteudo' }
  }

  const nomeColab = aviso.colaborador_nome || senderName || 'Motorista'
  return await processarDuvidaSobreTreinamento(aviso.treinamento_id, aviso.filial, aviso.sala, remetente, nomeColab, conteudo, porAudio)
}

// TTL da pergunta de sugestão da Conferência Digital (24h) — depois desse
// prazo uma mensagem qualquer do telefone não é mais tratada como resposta
// à pergunta (ver enviarPerguntaSugestao em src/lib/conferencia.ts, chamado
// ao finalizar um mapa).
const SUGESTAO_CONFERENCIA_TTL_MIN = 60 * 24

// Resposta livre a "tem alguma sugestão pra melhorar a conferência?" — só
// processa se houver uma pergunta pendente (status='aguardando') pra esse
// telefone; senão retorna null e cai no próximo fluxo do roteamento.
async function tratarSugestaoConferenciaPendente(
  body: any, remetente: string,
): Promise<{ ok: boolean; action: string } | null> {
  // Saudação/comando da Aurora tem prioridade — quem foi avisado da
  // sugestão mas quer usar o menu não fica travado nesse fluxo.
  const textoBruto = extrairTexto(body).trim()
  if (ehSaudacaoAurora(textoBruto) || ehTrocarAssuntoAurora(textoBruto) || ehEncerrarAurora(textoBruto)) return null

  const limite = new Date(Date.now() - SUGESTAO_CONFERENCIA_TTL_MIN * 60_000).toISOString()
  const { data: pendente } = await supabase
    .from('conferencia_sugestoes')
    .select('id')
    .eq('telefone', remetente)
    .eq('status', 'aguardando')
    .gte('created_at', limite)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!pendente) return null

  if (!textoBruto) {
    // Clique de botão/lista (ex.: menu da Aurora) não é resposta à
    // sugestão — devolve null pra outro fluxo tratar.
    if (extrairBotaoResposta(body)) return null
    return { ok: true, action: 'sugestao-conferencia-sem-conteudo' }
  }

  await supabase.from('conferencia_sugestoes')
    .update({ resposta: textoBruto, respondida_em: new Date().toISOString(), status: 'respondida' })
    .eq('id', pendente.id)

  await enviar(remetente, 'Valeu pela resposta! Vamos tratar o problema relatado e te damos um retorno. 🙌')
  return { ok: true, action: 'sugestao-conferencia-respondida' }
}

// ── Bate-papo do Farol Motoristas (Fechamento do Dia) ─────────────────────────
// Convite chega como lista com TODOS os indicadores estourados da pessoa
// (motorista ou ajudante) de uma vez. Ao clicar num item a pendência vira
// 'coletando' e o bot pede a resposta (texto ou áudio); a próxima mensagem
// desse telefone é gravada e o supervisor é avisado no grupo do Fechamento,
// pra não precisar cobrar de novo no bate-papo do dia seguinte. Motorista e
// ajudante têm pendência própria — cada um responde independente da mesma
// mapa/kpi, sem sobrescrever a resposta do outro.
const KPI_LABEL_GATILHO: Record<string, string> = {
  aderencia_raio: 'Aderência ao Raio', tml: 'TML', devolucao_pdv: 'Devolução PDV', iv_deslocamento: 'IV-Deslocamento',
}

// Avisa só o(s) supervisor(es) daquela sala, direto no celular — não vai
// mais pro grupo do Fechamento (decisão explícita: individual em vez de
// compartilhado, igual o texto de orientação do painel).
async function avisarSupervisorRespostaGatilho(filial: string, sala: string | null, mapa: number, pessoaNome: string, kpi: string): Promise<void> {
  if (!sala) return
  const { data: sups } = await supabase.from('supervisores_tml').select('telefone').eq('filial', filial).eq('sala', sala)
  if (!sups || sups.length === 0) return
  const primeiro = pessoaNome.trim().split(/\s+/)[0] || pessoaNome
  const mensagem = `✅ *${primeiro}* (mapa ${mapa}) já respondeu sobre *${KPI_LABEL_GATILHO[kpi] ?? kpi}* — não precisa cobrar de novo no bate-papo.`
  for (const s of sups) {
    if (!s.telefone) continue
    await enviar(s.telefone, mensagem)
  }
}

// Prazo de resposta: até 15h de Brasília do dia SEGUINTE ao fechamento
// (expira_em, gravado no convite — ver prazoRespostaGatilho em
// src/lib/fechamentoDia.ts). Passado isso, nem clique no botão nem resposta
// em texto/áudio são mais aceitos — a pendência vira 'expirado' pra não
// pesar no fechamento do dia seguinte.
function pendenciaExpirada(expiraEm: string | null): boolean {
  return !!expiraEm && new Date(expiraEm).getTime() < Date.now()
}

async function tratarGatilhoBatePapo(body: any, remetente: string): Promise<{ ok: boolean; action: string } | null> {
  const rawBtn = extrairBotaoResposta(body)
  if (rawBtn.startsWith('gatilho:')) {
    const pendenciaId = rawBtn.slice('gatilho:'.length).trim()
    if (!pendenciaId) return { ok: true, action: 'invalid-button' }
    const { data: pend } = await supabase
      .from('fechamento_dia_gatilho_pendencias')
      .select('id, mapa, kpi, pessoa_nome, status, expira_em')
      .eq('id', pendenciaId)
      .maybeSingle()
    if (!pend) return { ok: true, action: 'gatilho-pendencia-nao-encontrada' }
    if (pendenciaExpirada(pend.expira_em)) {
      if (pend.status !== 'respondido') await supabase.from('fechamento_dia_gatilho_pendencias').update({ status: 'expirado' }).eq('id', pend.id)
      await enviar(remetente, 'Esse prazo já encerrou (respostas até 15h do dia seguinte ao fechamento). Sem problema — pode falar direto com seu supervisor. 🙏')
      return { ok: true, action: 'gatilho-expirado' }
    }
    await supabase.from('fechamento_dia_gatilho_pendencias').update({ status: 'coletando' }).eq('id', pend.id)
    await enviar(remetente,
      `Beleza! Sobre *${KPI_LABEL_GATILHO[pend.kpi] ?? pend.kpi}* (mapa ${pend.mapa}) — me conta o que rolou e, se quiser, uma ideia pra melhorar. Pode mandar em texto ou áudio. 🎙️`)
    return { ok: true, action: 'gatilho-coletando' }
  }

  // Saudação/comando da Aurora tem prioridade — quem está com uma pendência
  // 'coletando' mas quer usar o menu não fica travado nesse fluxo.
  const textoBruto = extrairTexto(body).trim()
  if (ehSaudacaoAurora(textoBruto) || ehTrocarAssuntoAurora(textoBruto) || ehEncerrarAurora(textoBruto)) return null

  const digitos = ultimosDigitos(remetente)
  if (!digitos) return null

  const { data: coletando } = await supabase
    .from('fechamento_dia_gatilho_pendencias')
    .select('id, filial, sala, mapa, kpi, pessoa_nome, pessoa_telefone, status, expira_em')
    .eq('status', 'coletando')
    .order('criado_em', { ascending: false })
    .limit(50)
  const pend = (coletando ?? []).find((p: any) => p.pessoa_telefone && ultimosDigitos(p.pessoa_telefone) === digitos)
  if (!pend) return null

  if (pendenciaExpirada(pend.expira_em)) {
    await supabase.from('fechamento_dia_gatilho_pendencias').update({ status: 'expirado' }).eq('id', pend.id)
    await enviar(remetente, 'Esse prazo já encerrou (respostas até 15h do dia seguinte ao fechamento). Sem problema — pode falar direto com seu supervisor. 🙏')
    return { ok: true, action: 'gatilho-expirado' }
  }

  let conteudo = textoBruto
  if (!conteudo && temAudioSemTexto(body)) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (!transcrito) {
      await enviar(remetente, 'Recebi seu áudio, mas não consegui entender direito. Pode mandar de novo ou escrever em texto?')
      return { ok: true, action: 'gatilho-audio-falhou' }
    }
    conteudo = transcrito
  }
  if (!conteudo) {
    // Clique de botão/lista de outro fluxo (ex.: menu da Aurora) não é
    // resposta a essa pendência — devolve null em vez de reivindicar a
    // mensagem e deixá-la sem resposta nenhuma.
    if (extrairBotaoResposta(body)) return null
    return { ok: true, action: 'gatilho-sem-conteudo' }
  }

  await supabase.from('fechamento_dia_gatilho_pendencias')
    .update({ resposta: conteudo, status: 'respondido', respondido_em: new Date().toISOString() })
    .eq('id', pend.id)

  await enviar(remetente, 'Valeu pela resposta! Vamos tratar o problema relatado e te damos um retorno. 🙌')
  await avisarSupervisorRespostaGatilho(pend.filial, pend.sala, pend.mapa, pend.pessoa_nome, pend.kpi)
  return { ok: true, action: 'gatilho-respondido' }
}

// Pré-seleção de tema: quando não há aviso do dia (o colaborador quer
// perguntar sobre um treinamento de outro dia), o bot descobre a sala dele e
// oferece os treinamentos publicados pra escolher antes de responder. Estado
// mantido em matinal_duvida_sessoes (escolhendo_tema → aguardando_pergunta).
// Frase de início: qualquer pessoa que mandar isso — cadastrada ou não —
// entra no fluxo de tirar dúvida de um treinamento.
const GATILHO_DUVIDA_TREINAMENTO = /d[uú]vida|treinamento/

async function iniciarEscolhaSala(remetente: string, nome: string | null, filial: string): Promise<{ ok: boolean; action: string }> {
  const { error } = await supabase.from('matinal_duvida_sessoes').insert({
    colaborador_telefone: remetente, colaborador_nome: nome, filial, estado: 'escolhendo_sala',
  })
  if (error) {
    // Sem a sessão salva, a resposta do próximo passo (Colorado/Sub-Fúria)
    // não seria reconhecida — melhor avisar e logar do que ficar em silêncio.
    console.error('iniciarEscolhaSala insert error:', error.message)
    await enviar(remetente, '⚠️ Deu um erro técnico aqui. Tenta de novo em instantes ou avisa o suporte.')
    return { ok: false, action: 'matinal-tema-erro-sessao' }
  }
  await enviarBotoes(remetente, 'Você é da sala *Colorado* ou *Sub-Fúria*?',
    [{ id: 'salamatinal:COLORADO', label: 'Colorado' }, { id: 'salamatinal:SUB-FURIA', label: 'Sub-Fúria' }])
  return { ok: true, action: 'matinal-tema-pede-sala' }
}

// Quantos dias pra trás entram na lista de treinamentos pra escolher — mais
// que isso vira uma lista extensa demais pra selecionar no WhatsApp.
const JANELA_DIAS_TEMA_MATINAL = 5

function dataMinimaTemaMatinal(): string {
  return new Date(Date.now() - (JANELA_DIAS_TEMA_MATINAL - 1) * 24 * 60 * 60_000).toISOString().slice(0, 10)
}

async function enviarListaTemas(
  remetente: string, nome: string | null, filial: string, sala: string,
  treinos: { id: string; titulo: string; data_treinamento: string; salas?: string[] }[],
  tituloLista: string,
): Promise<{ ok: boolean; action: string }> {
  const { error } = await supabase.from('matinal_duvida_sessoes').insert({
    colaborador_telefone: remetente, colaborador_nome: nome, filial, sala, estado: 'escolhendo_tema',
  })
  if (error) {
    console.error('enviarListaTemas insert error:', error.message)
    await enviar(remetente, '⚠️ Deu um erro técnico aqui. Tenta de novo em instantes ou avisa o suporte.')
    return { ok: false, action: 'matinal-tema-erro-sessao' }
  }
  await enviarOpcoes(remetente, tituloLista, 'Treinamentos', 'Escolher',
    treinos.map((t) => ({
      id: `temamatinal:${t.id}`,
      title: t.titulo.length > 24 ? `${t.titulo.slice(0, 23)}…` : t.titulo,
      description: `${formatarDataBRSimples(t.data_treinamento)}${t.salas ? ` · ${t.salas.join('/')}` : ''}`,
    })))
  return { ok: true, action: 'matinal-tema-menu' }
}

async function iniciarEscolhaTema(
  remetente: string, nome: string | null, filial: string, sala: string,
): Promise<{ ok: boolean; action: string }> {
  const desde = dataMinimaTemaMatinal()
  const { data: treinos } = await supabase
    .from('treinamentos_matinal')
    .select('id, titulo, data_treinamento')
    .eq('filial', filial)
    .contains('salas', [sala])
    .eq('status', 'publicado')
    .gte('data_treinamento', desde)
    .order('data_treinamento', { ascending: false })

  if (treinos && treinos.length > 0) {
    return await enviarListaTemas(remetente, nome, filial, sala, treinos, 'Sobre qual treinamento é sua dúvida?')
  }

  // Nada pra essa sala específica nos últimos dias — amplia pra qualquer
  // sala da filial, avisando que não achou algo certinho antes de mostrar.
  const { data: qualquerSala } = await supabase
    .from('treinamentos_matinal')
    .select('id, titulo, data_treinamento, salas')
    .eq('filial', filial)
    .eq('status', 'publicado')
    .gte('data_treinamento', desde)
    .order('data_treinamento', { ascending: false })

  if (!qualquerSala || qualquerSala.length === 0) {
    await enviar(remetente,
      `Não encontrei nenhum treinamento cadastrado nos últimos ${JANELA_DIAS_TEMA_MATINAL} dias. ` +
      `Fala direto com quem apresentou o treinamento, por favor.`)
    return { ok: true, action: 'matinal-tema-sem-treinamento' }
  }

  await enviar(remetente,
    `Não encontrei um treinamento certinho pra sua sala nos últimos ${JANELA_DIAS_TEMA_MATINAL} dias. ` +
    `Escolhe na lista de qual dia e treinamento é sua dúvida:`)
  return await enviarListaTemas(remetente, nome, filial, sala, qualquerSala, 'Qual desses é o treinamento?')
}

// Sessão de pré-seleção abandonada (a pessoa nunca respondeu, ou ficou de
// uma versão antiga do fluxo com um estado que não existe mais) — depois
// desse tempo, ou se o estado for desconhecido, trata como se não existisse
// em vez de travar o telefone em silêncio pra sempre.
const MATINAL_SESSAO_TEMA_TTL_MIN = 30
const ESTADOS_VALIDOS_SESSAO_TEMA = ['escolhendo_sala', 'escolhendo_tema', 'aguardando_pergunta']

async function tratarPreSelecaoTemaMatinal(
  body: any, remetente: string, senderName: string, texto: string,
): Promise<{ ok: boolean; action: string } | null> {
  // Saudação/comando da Aurora tem prioridade sobre qualquer sessão de
  // pré-seleção de tema em aberto — sem isso, uma sessão travada (ex.:
  // "escolhendo_tema" nunca finalizada) prendia a pessoa nesse fluxo,
  // impedindo o menu da Aurora de responder no mesmo dia.
  if (ehSaudacaoAurora(texto) || ehTrocarAssuntoAurora(texto) || ehEncerrarAurora(texto)) return null

  const { data: sessaoRaw } = await supabase
    .from('matinal_duvida_sessoes')
    .select('*')
    .eq('colaborador_telefone', remetente)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sessao = sessaoRaw
  if (sessao) {
    const expirada = Date.now() - new Date(sessao.created_at).getTime() > MATINAL_SESSAO_TEMA_TTL_MIN * 60_000
    const estadoDesconhecido = !ESTADOS_VALIDOS_SESSAO_TEMA.includes(sessao.estado)
    if (expirada || estadoDesconhecido) {
      await supabase.from('matinal_duvida_sessoes').delete().eq('id', sessao.id)
      sessao = null
    }
  }

  const btn = extrairBotaoResposta(body)

  if (sessao && /^\s*(cancelar|cancela)\s*$/i.test(texto)) {
    await supabase.from('matinal_duvida_sessoes').delete().eq('id', sessao.id)
    await enviar(remetente, '❌ Tudo bem, cancelado. Se quiser tirar outra dúvida, é só mandar "dúvida" de novo.')
    return { ok: true, action: 'matinal-tema-cancelado' }
  }

  if (sessao?.estado === 'aguardando_pergunta' && sessao.treinamento_id) {
    let conteudo = texto
    let porAudio = false
    if (!conteudo && temAudioSemTexto(body)) {
      const transcrito = await transcreverAudio(extrairAudioUrl(body))
      if (!transcrito) {
        await enviar(remetente, 'Recebi seu áudio, mas não consegui entender direito. Pode mandar de novo ou escrever em texto?')
        return { ok: true, action: 'matinal-tema-audio-falhou' }
      }
      conteudo = transcrito
      porAudio = true
    }
    if (!conteudo) {
      // Clique de botão/lista de outro fluxo (ex.: menu da Aurora) não é
      // resposta a essa pergunta — devolve null em vez de reivindicar.
      if (btn) return null
      return { ok: true, action: 'matinal-tema-sem-conteudo' }
    }
    await supabase.from('matinal_duvida_sessoes').delete().eq('id', sessao.id)
    return await processarDuvidaSobreTreinamento(
      sessao.treinamento_id, sessao.filial ?? '', sessao.sala ?? '', remetente,
      sessao.colaborador_nome || senderName || 'Motorista', conteudo, porAudio,
    )
  }

  if (sessao?.estado === 'escolhendo_tema') {
    if (btn.startsWith('temamatinal:')) {
      const treinamentoId = btn.slice('temamatinal:'.length)
      const { data: treino } = await supabase.from('treinamentos_matinal').select('titulo').eq('id', treinamentoId).maybeSingle()
      if (!treino) {
        await enviar(remetente, '⚠️ Não encontrei esse treinamento.')
        await supabase.from('matinal_duvida_sessoes').delete().eq('id', sessao.id)
        return { ok: true, action: 'matinal-tema-invalido' }
      }
      const { error: errUpd } = await supabase.from('matinal_duvida_sessoes')
        .update({ treinamento_id: treinamentoId, estado: 'aguardando_pergunta' }).eq('id', sessao.id)
      if (errUpd) {
        console.error('matinal-tema update error:', errUpd.message)
        await enviar(remetente, '⚠️ Deu um erro técnico aqui. Tenta de novo em instantes ou avisa o suporte.')
        return { ok: false, action: 'matinal-tema-erro-sessao' }
      }
      await enviar(remetente, `Qual sua dúvida sobre *${treino.titulo}*? Pode escrever ou mandar um áudio.`)
      return { ok: true, action: 'matinal-tema-escolhido' }
    }
    // Clique de outro fluxo (ex.: menu da Aurora) — não reivindica.
    if (btn) return null
    return { ok: true, action: 'matinal-tema-aguardando-escolha' }
  }

  if (sessao?.estado === 'escolhendo_sala') {
    if (btn.startsWith('salamatinal:')) {
      const sala = btn.slice('salamatinal:'.length)
      const filial = sessao.filial ?? ''
      await supabase.from('matinal_duvida_sessoes').delete().eq('id', sessao.id)
      return await iniciarEscolhaTema(remetente, sessao.colaborador_nome ?? senderName ?? null, filial, sala)
    }
    // Clique de outro fluxo (ex.: menu da Aurora) — não reivindica.
    if (btn) return null
    return { ok: true, action: 'matinal-tema-aguardando-sala' }
  }

  // Nenhuma sessão em andamento: só entra com a frase de início ("dúvida" /
  // "treinamento") — qualquer pessoa pode mandar, cadastrada ou não.
  if (!GATILHO_DUVIDA_TREINAMENTO.test(norm(texto))) return null

  // Cadastrado em alguma sala? Pula direto pros temas. Senão, só falta saber
  // a sala — a filial não é perguntada, usa a única cadastrada no sistema.
  const colab = await descobrirSalaColaborador(remetente)
  if (colab) return await iniciarEscolhaTema(remetente, colab.nome ?? senderName ?? null, colab.filial, colab.sala)

  const { data: filiaisRows } = await supabase.from('filiais').select('nome').order('nome').limit(1)
  const filialPadrao = filiaisRows?.[0]?.nome ?? ''
  return await iniciarEscolhaSala(remetente, senderName || null, filialPadrao)
}

// Localiza o colaborador (nome, filial, sala) pelo telefone que mandou a
// mensagem — usado pra saber quais treinamentos oferecer na pré-seleção.
async function descobrirSalaColaborador(remetente: string): Promise<{ filial: string; sala: string; nome: string | null } | null> {
  const digitos = ultimosDigitos(remetente)
  if (!digitos) return null
  const { data: colaboradores } = await supabase
    .from('motoristas_sala_tml')
    .select('filial, sala, nome, telefone')
    .not('telefone', 'is', null)
  const colab = (colaboradores ?? []).find((c: any) => ultimosDigitos(c.telefone) === digitos)
  return colab ? { filial: colab.filial, sala: colab.sala, nome: colab.nome ?? null } : null
}

// Resposta do palestrante (mensagem individual dele) a uma dúvida pendente —
// localizada pelo telefone de quem respondeu, entre as dúvidas aguardando.
async function tratarRespostaPalestranteMatinal(
  body: any, remetente: string,
): Promise<{ ok: boolean; action: string } | null> {
  const digitos = ultimosDigitos(remetente)
  if (!digitos) return null

  const { data: pendentes } = await supabase
    .from('duvidas_matinal')
    .select('id, treinamento_id, colaborador_telefone, colaborador_nome, pergunta, palestrante_telefone')
    .eq('status', 'aguardando_palestrante')
    .order('created_at', { ascending: false })
    .limit(50)
  const pend = (pendentes ?? []).find((p: any) => ultimosDigitos(p.palestrante_telefone) === digitos)
  if (!pend) return null

  let conteudo = extrairTexto(body).trim()
  if (!conteudo && temAudioSemTexto(body)) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (!transcrito) {
      await enviar(remetente, 'Recebi seu áudio, mas não consegui entender direito. Pode mandar de novo ou escrever em texto?')
      return { ok: true, action: 'matinal-palestrante-audio-falhou' }
    }
    conteudo = transcrito
  }
  if (!conteudo) {
    // Clique de botão/lista de outro fluxo (ex.: menu da Aurora) não é
    // resposta a essa pergunta pendente — devolve null em vez de
    // reivindicar a mensagem e deixá-la sem resposta nenhuma.
    if (extrairBotaoResposta(body)) return null
    return { ok: true, action: 'matinal-palestrante-sem-conteudo' }
  }

  await supabase.from('duvidas_matinal').update({
    resposta: conteudo, status: 'respondida_palestrante', respondida_em: new Date().toISOString(),
  }).eq('id', pend.id)

  const { data: treino } = await supabase
    .from('treinamentos_matinal').select('titulo, palestrante_nome').eq('id', pend.treinamento_id).maybeSingle()

  // Vira FAQ pública: a próxima pessoa com dúvida parecida já recebe resposta automática.
  await supabase.from('treinamento_faq_matinal').insert({
    treinamento_id: pend.treinamento_id, pergunta: pend.pergunta, resposta: conteudo, origem: 'palestrante',
  })

  await enviar(pend.colaborador_telefone,
    `${treino?.palestrante_nome ?? 'O palestrante'} respondeu sua dúvida:\n"${conteudo}"`)
  await enviar(remetente, `✅ Resposta enviada a ${pend.colaborador_nome ?? 'quem perguntou'}.`)
  return { ok: true, action: 'matinal-respondida-palestrante' }
}

// Lembretes: cutuca o palestrante depois de ~3h sem resposta; se seguir sem
// responder, avisa o colaborador que vai verificar pessoalmente (não fica
// cutucando pra sempre). Roda oportunisticamente a cada mensagem individual
// recebida, e também pode ser chamada por um cron externo (ver
// api/matinal-duvidas-check.ts).
export async function verificarLembretesMatinal(): Promise<number> {
  let acoes = 0
  const agora = Date.now()

  const { data: semLembrete } = await supabase
    .from('duvidas_matinal')
    .select('id, colaborador_nome, pergunta, palestrante_telefone, created_at')
    .eq('status', 'aguardando_palestrante')
    .is('lembrete_enviado_em', null)
    .lte('created_at', new Date(agora - MATINAL_LEMBRETE_PALESTRANTE_MIN * 60_000).toISOString())
    .limit(50)
  for (const d of semLembrete ?? []) {
    if (d.palestrante_telefone) {
      await enviar(normalizarTelefoneBR(d.palestrante_telefone),
        `⏰ Lembrete: ainda aguardando sua resposta sobre a pergunta de ${d.colaborador_nome ?? 'um colaborador'}:\n"${d.pergunta}"`)
    }
    await supabase.from('duvidas_matinal').update({ lembrete_enviado_em: new Date().toISOString() }).eq('id', d.id)
    acoes++
    await aguardarEntreEnvios()
  }

  const { data: semResposta } = await supabase
    .from('duvidas_matinal')
    .select('id, colaborador_telefone')
    .eq('status', 'aguardando_palestrante')
    .not('lembrete_enviado_em', 'is', null)
    .is('aviso_atraso_enviado_em', null)
    .lte('lembrete_enviado_em', new Date(agora - MATINAL_AVISO_ATRASO_MIN * 60_000).toISOString())
    .limit(50)
  for (const d of semResposta ?? []) {
    await enviar(d.colaborador_telefone,
      'Ainda não recebi resposta do palestrante sobre sua dúvida. Vou verificar pessoalmente e te retorno assim que souber.')
    await supabase.from('duvidas_matinal').update({ aviso_atraso_enviado_em: new Date().toISOString() }).eq('id', d.id)
    acoes++
    await aguardarEntreEnvios()
  }

  return acoes
}

// ── Aurora — autoatendimento geral ────────────────────────────────────────────
// Saudação livre ("oi", "oi aurora", "menu") fora de qualquer fluxo dedicado
// mostra um menu de categorias (Entrega, Segurança, Gente, Frota,
// Treinamentos, Financeiro, Armazém); cada categoria abre um submenu.
// Sessão em aurora_sessoes (1 linha por telefone, sempre a mais recente).
// Um ÁUDIO que já diga o que a pessoa quer (ex.: "resultado do mapa 279088")
// pula direto pro passo certo, sem precisar navegar o menu — só cobre hoje as
// opções já implementadas (Resultados do Mapa e Dúvida de treinamento); as
// demais categorias respondem "em construção" até ganharem fluxo próprio.

const AURORA_TTL_MIN = 30

interface AuroraSessao { id: string; telefone: string; estado: string; contexto: any; criado_em: string }

async function buscarSessaoAurora(remetente: string): Promise<AuroraSessao | null> {
  const { data, error } = await supabase.from('aurora_sessoes').select('*').eq('telefone', remetente).maybeSingle()
  if (error) console.error('buscarSessaoAurora error:', error.message)
  if (!data) return null
  const expirada = Date.now() - new Date(data.criado_em).getTime() > AURORA_TTL_MIN * 60_000
  if (expirada) {
    await supabase.from('aurora_sessoes').delete().eq('id', data.id)
    return null
  }
  return data as AuroraSessao
}

// Retorna o erro (se houver) pra quem chama poder avisar o usuário — sem
// isso, uma falha aqui (ex.: migração da tabela aurora_sessoes não rodada)
// passava batido: o menu era enviado normalmente, mas a sessão nunca era
// salva, e a próxima mensagem (o clique na categoria) não encontrava sessão
// nenhuma pra retomar — silêncio total, sem log nenhum apontando o motivo.
async function definirEstadoAurora(remetente: string, estado: string, contexto: any = null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('aurora_sessoes').upsert(
    { telefone: remetente, estado, contexto, criado_em: new Date().toISOString() },
    { onConflict: 'telefone' },
  )
  if (error) console.error('definirEstadoAurora error:', error.message)
  return { error: error?.message ?? null }
}

async function encerrarSessaoAurora(remetente: string): Promise<void> {
  const { error } = await supabase.from('aurora_sessoes').delete().eq('telefone', remetente)
  if (error) console.error('encerrarSessaoAurora error:', error.message)
}

function ehSaudacaoAurora(texto: string): boolean {
  const n = norm(texto)
  return n === 'aurora' || n === 'menu' || /^(oi+|ola+|eae|e ai)(\s*,?\s*aurora)?[!.]*$/.test(n)
}

// Comandos globais — funcionam em qualquer passo da conversa com a Aurora,
// não só no menu inicial.
function ehTrocarAssuntoAurora(texto: string): boolean {
  return /outro assunto|trocar( de)? assunto|voltar ao menu|mudar de assunto/.test(norm(texto))
}
function ehEncerrarAurora(texto: string): boolean {
  return /^(encerrar|sair|finalizar|tchau)\b/.test(norm(texto))
}

// Só entram aqui categorias/itens que já funcionam de ponta a ponta — nada
// de "em construção" na lista. Conforme cada assunto novo for implementado,
// é só adicionar a categoria (ou o item, dentro do submenu já existente).
const AURORA_CATEGORIAS: OpcaoZ[] = [
  { id: 'aurora_cat:entrega', title: '📦 Entrega' },
  { id: 'aurora_cat:treinamentos', title: '🎓 Treinamentos' },
  { id: 'aurora_cat:financeiro', title: '💰 Financeiro' },
  { id: 'aurora_cat:armazem', title: '📦 Armazém' },
  { id: 'aurora_cat:sugestoes', title: '💬 Sugestões' },
]

const AURORA_SUBMENUS: Record<string, OpcaoZ[]> = {
  entrega: [
    { id: 'aurora_item:resultados_mapa', title: 'Resultados de um mapa' },
    { id: 'aurora_item:historico_matricula', title: 'Meu histórico (por matrícula)' },
  ],
  treinamentos: [{ id: 'aurora_item:duvida_treinamento', title: 'Tirar dúvida sobre um treinamento' }],
  financeiro: [{ id: 'aurora_item:pendencias', title: 'Consultar minhas pendências' }],
  armazem: [{ id: 'aurora_item:variavel', title: 'Consultar meu variável/pontuação' }],
  sugestoes: [{ id: 'aurora_item:enviar_sugestao', title: 'Enviar uma sugestão' }],
}

async function mostrarMenuCategorias(remetente: string, nome: string | null): Promise<void> {
  const { error } = await definirEstadoAurora(remetente, 'menu')
  if (error) {
    await enviar(remetente, '⚠️ Tive um problema técnico aqui e posso esquecer sua escolha no próximo passo. Se isso acontecer, é só mandar "oi" de novo — e avisa o suporte.')
  }
  await enviarOpcoes(
    remetente,
    `Oi${nome ? `, ${nome}` : ''}! Eu sou a *Aurora* 👋. Sobre qual assunto você quer falar?`,
    'Assuntos', 'Escolher assunto', AURORA_CATEGORIAS,
  )
}

async function mostrarSubmenuAurora(remetente: string, categoria: string): Promise<void> {
  const itens = AURORA_SUBMENUS[categoria]
  if (!itens) { await mostrarMenuCategorias(remetente, null); return }
  const { error } = await definirEstadoAurora(remetente, `submenu:${categoria}`)
  if (error) {
    await enviar(remetente, '⚠️ Tive um problema técnico aqui e posso esquecer sua escolha no próximo passo. Se isso acontecer, é só mandar "oi" de novo — e avisa o suporte.')
  }
  await enviarOpcoes(remetente, 'O que você precisa?', 'Opções', 'Escolher', itens)
}

function extrairMapa(texto: string): number | null {
  const m = String(texto ?? '').match(/\d{4,7}/)
  return m ? Number(m[0]) : null
}

// "Hoje"/"ontem" no fuso de São Paulo, não do servidor (que roda em UTC).
function hojeSPISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function ontemISO(): string {
  const [y, m, d] = hojeSPISO().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

// Extrai uma data dd/mm[/aa[aa]] da mensagem, ou "hoje"/"ontem" por extenso.
// Sem nenhuma data mencionada, quem chama decide o padrão (ontem, na consulta
// de mapa). Ano de 2 dígitos assume 20xx.
function extrairDataMencionada(texto: string): string | null {
  const n = norm(texto)
  if (/\bontem\b/.test(n)) return ontemISO()
  if (/\bhoje\b/.test(n)) return hojeSPISO()
  const m = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
  let ano = m[3] ? Number(m[3]) : Number(hojeSPISO().slice(0, 4))
  if (ano < 100) ano += 2000
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Mesmos KPIs já calculados no Fechamento do Dia (TML, IV-Deslocamento,
// Aderência ao Raio, Devolução PDV, Jornada Líquida), aqui recortados por
// mapa em vez de por sala — fontes: historico_tml, checklist_tml,
// jornada_bees + escalas_tml, fechamento_dia_devolucoes_pdv,
// fechamento_dia_mapas_dia (as duas últimas dependem de upload prévio no
// Fechamento do Dia; sem upload, aparece "sem dado").
async function resultadosDoMapa(filial: string, mapa: number, data: string): Promise<string> {
  const [
    { data: historico }, { data: checklist }, { data: bees }, { data: escala },
    { data: devolucoes }, { data: mapaDia },
  ] = await Promise.all([
    supabase.from('historico_tml').select('resultado, horario_saida').eq('filial', filial).eq('mapa', mapa).eq('data_saida', data).maybeSingle(),
    supabase.from('checklist_tml').select('tempo_deslocamento_minutos').eq('filial', filial).eq('mapa', mapa).eq('data', data).maybeSingle(),
    supabase.from('jornada_bees').select('entrega_fora_raio, dev_fora_raio').eq('filial', filial).eq('mapa', mapa).eq('data', data).maybeSingle(),
    supabase.from('escalas_tml').select('entregas_previstas').eq('filial', filial).eq('mapa', mapa).eq('data_entrega', data).maybeSingle(),
    supabase.from('fechamento_dia_devolucoes_pdv').select('devolucoes').eq('filial', filial).eq('mapa', mapa).eq('data', data).maybeSingle(),
    supabase.from('fechamento_dia_mapas_dia').select('bateu_jornada, entregas').eq('filial', filial).eq('mapa', mapa).eq('data', data).maybeSingle(),
  ])

  if (!historico && !checklist && !bees && !escala && !devolucoes && !mapaDia) {
    return `🔍 Não encontrei nenhum resultado pro mapa *${mapa}* em ${diaBR(data)}. Confira o número do mapa e a data.`
  }

  const TML_LABEL: Record<string, string> = { no_prazo: '✅ No prazo', atrasado: '⚠️ Perdeu o TML', indefinido: '— Indefinido', invalido: '— Inválido' }
  const tml = historico
    ? `${TML_LABEL[historico.resultado] ?? '—'}${historico.horario_saida ? ` (saída ${historico.horario_saida})` : ''}`
    : '— Sem registro'

  const iv = checklist?.tempo_deslocamento_minutos != null ? `${checklist.tempo_deslocamento_minutos} min` : '— Sem leitura ainda'

  const entregasPrevistas = escala?.entregas_previstas ?? mapaDia?.entregas ?? null
  const foraRaio = (bees?.entrega_fora_raio ?? 0) + (bees?.dev_fora_raio ?? 0)
  const aderencia = entregasPrevistas ? `${(100 * (1 - foraRaio / entregasPrevistas)).toFixed(1)}%` : '— Sem dado'

  const devolucoesMapa = devolucoes?.devolucoes ?? 0
  const devolucaoPct = entregasPrevistas
    ? `${((devolucoesMapa / entregasPrevistas) * 100).toFixed(2)}% (${devolucoesMapa} devolução(ões))`
    : `${devolucoesMapa} devolução(ões)`

  const jornada = mapaDia?.bateu_jornada == null ? '— Sem dado' : mapaDia.bateu_jornada ? '✅ Bateu jornada' : '⚠️ Não bateu jornada'

  return [
    `📋 *Resultados do mapa ${mapa} — ${diaBR(data)}*`,
    `⏱️ TML: ${tml}`,
    `🚶 IV-Deslocamento: ${iv}`,
    `🎯 Aderência ao Raio: ${aderencia}`,
    `📦 Devolução PDV: ${devolucaoPct}`,
    `🕐 Jornada Líquida: ${jornada}`,
  ].join('\n')
}

async function filialDoTelefoneOuPadrao(remetente: string): Promise<string> {
  const colab = await descobrirSalaColaborador(remetente)
  if (colab?.filial) return colab.filial
  const { data } = await supabase.from('filiais').select('nome').order('nome').limit(1)
  return data?.[0]?.nome ?? ''
}

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Mês calendário atual (dia 1 até hoje) — reinicia todo dia 1º.
function mesAtualRange(): { inicio: string; fim: string; rotulo: string } {
  const fim = hojeSPISO()
  const [ano, mes] = fim.split('-').map(Number)
  return { inicio: `${ano}-${String(mes).padStart(2, '0')}-01`, fim, rotulo: `${MESES_PT[mes - 1]}/${String(ano).slice(2)}` }
}

// Histórico por matrícula: soma os mapas em que a pessoa aparece como
// MOTORISTA (escalas_tml — mesma base 03.11.49.02) OU como AJUDANTE
// (mapa_equipe — import "Base" de Financeiro › Catálogo/Vendas, o mesmo
// cadastro já usado em Reposições), no mês calendário atual, e agrega os
// mesmos KPIs de resultadosDoMapa (TML, IV-Deslocamento, Aderência,
// Devolução PDV, Jornada Líquida) sobre esse conjunto de mapas.
async function historicoPorMatricula(filial: string, matricula: string): Promise<string> {
  const { inicio, fim, rotulo } = mesAtualRange()
  const matriculaNum = Number(matricula)

  const [{ data: comoMotorista }, { data: comoAjudante }, { data: cadastro }] = await Promise.all([
    supabase.from('escalas_tml').select('mapa').eq('filial', filial).eq('matricula', matriculaNum).gte('data_entrega', inicio).lte('data_entrega', fim),
    supabase.from('mapa_equipe').select('mapa').eq('filial', filial).gte('data', inicio).lte('data', fim)
      .or(`ajudante1_matricula.eq.${matricula},ajudante2_matricula.eq.${matricula}`),
    supabase.from('motoristas_sala_tml').select('nome').eq('filial', filial).eq('matricula', matriculaNum).maybeSingle(),
  ])

  const mapasSet = new Set<number>()
  for (const e of comoMotorista ?? []) mapasSet.add(e.mapa)
  for (const e of comoAjudante ?? []) { const n = Number(e.mapa); if (Number.isFinite(n)) mapasSet.add(n) }
  const mapas = [...mapasSet]
  const nome = cadastro?.nome ?? `Matrícula ${matricula}`

  if (mapas.length === 0) {
    return `🔍 Não encontrei nenhum mapa (como motorista ou ajudante) pra matrícula *${matricula}* em ${rotulo}.`
  }

  const [{ data: historico }, { data: checklist }, { data: bees }, { data: escalasEntregas }, { data: devolucoes }, { data: mapasDia }] = await Promise.all([
    supabase.from('historico_tml').select('mapa, resultado').eq('filial', filial).in('mapa', mapas),
    supabase.from('checklist_tml').select('mapa, tempo_deslocamento_minutos').eq('filial', filial).in('mapa', mapas),
    supabase.from('jornada_bees').select('mapa, entrega_fora_raio, dev_fora_raio').eq('filial', filial).in('mapa', mapas),
    supabase.from('escalas_tml').select('mapa, entregas_previstas').eq('filial', filial).in('mapa', mapas),
    supabase.from('fechamento_dia_devolucoes_pdv').select('mapa, devolucoes').eq('filial', filial).in('mapa', mapas),
    supabase.from('fechamento_dia_mapas_dia').select('mapa, bateu_jornada, entregas').eq('filial', filial).in('mapa', mapas),
  ])

  let noPrazo = 0
  let atrasado = 0
  for (const h of historico ?? []) {
    if (h.resultado === 'no_prazo') noPrazo++
    else if (h.resultado === 'atrasado') atrasado++
  }
  const totalTml = noPrazo + atrasado
  const tmlTxt = totalTml > 0 ? `${noPrazo} no prazo / ${atrasado} atrasados (${((noPrazo / totalTml) * 100).toFixed(1)}%)` : '— Sem dado'

  const ivValores = (checklist ?? []).map((c) => c.tempo_deslocamento_minutos).filter((v): v is number => v != null)
  const ivTxt = ivValores.length > 0 ? `${Math.round(ivValores.reduce((a, b) => a + b, 0) / ivValores.length)} min (média)` : '— Sem dado'

  const entregasPorMapa = new Map<number, number>()
  for (const e of escalasEntregas ?? []) entregasPorMapa.set(e.mapa, e.entregas_previstas ?? 0)
  for (const m of mapasDia ?? []) if (!entregasPorMapa.has(m.mapa)) entregasPorMapa.set(m.mapa, m.entregas ?? 0)

  const foraRaioPorMapa = new Map<number, number>()
  for (const b of bees ?? []) foraRaioPorMapa.set(b.mapa, (b.entrega_fora_raio ?? 0) + (b.dev_fora_raio ?? 0))

  let somaAderencia = 0
  let countAderencia = 0
  for (const mapa of mapas) {
    const entregas = entregasPorMapa.get(mapa)
    if (entregas) { somaAderencia += 1 - (foraRaioPorMapa.get(mapa) ?? 0) / entregas; countAderencia++ }
  }
  const aderenciaTxt = countAderencia > 0 ? `${((somaAderencia / countAderencia) * 100).toFixed(1)}% (média)` : '— Sem dado'

  const devolucoesPorMapa = new Map<number, number>()
  for (const d of devolucoes ?? []) devolucoesPorMapa.set(d.mapa, d.devolucoes ?? 0)
  const totalDevolucoes = [...devolucoesPorMapa.values()].reduce((a, b) => a + b, 0)
  const somaEntregas = mapas.reduce((s, mapa) => s + (entregasPorMapa.get(mapa) ?? 0), 0)
  const devolucaoTxt = somaEntregas > 0
    ? `${totalDevolucoes} devolução(ões) (${((totalDevolucoes / somaEntregas) * 100).toFixed(2)}% média)`
    : `${totalDevolucoes} devolução(ões)`

  let bateram = 0
  let naoBateram = 0
  for (const m of mapasDia ?? []) {
    if (m.bateu_jornada === true) bateram++
    else if (m.bateu_jornada === false) naoBateram++
  }
  const totalJornada = bateram + naoBateram
  const jornadaTxt = totalJornada > 0 ? `${bateram} bateram / ${naoBateram} não bateram (${((bateram / totalJornada) * 100).toFixed(1)}%)` : '— Sem dado'

  return [
    `👤 *Histórico de ${nome} — ${rotulo}*`,
    `🗺️ Mapas no mês: ${mapas.length}`,
    ``,
    `⏱️ TML: ${tmlTxt}`,
    `🚶 IV-Deslocamento: ${ivTxt}`,
    `🎯 Aderência ao Raio: ${aderenciaTxt}`,
    `📦 Devolução PDV: ${devolucaoTxt}`,
    `🕐 Jornada Líquida: ${jornadaTxt}`,
  ].join('\n')
}

// Os números de mapa não se repetem entre dias (cada import diário já vem
// com números maiores que o anterior), então dá pra achar sozinho em qual
// dia um mapa rodou, sem precisar perguntar a data. Olha nas mesmas fontes
// de resultadosDoMapa e fica com a mais recente encontrada (cobre o caso
// raro de aparecer em mais de uma data).
async function encontrarDataDoMapa(filial: string, mapa: number): Promise<string | null> {
  const [h, c, e, m] = await Promise.all([
    supabase.from('historico_tml').select('data_saida').eq('filial', filial).eq('mapa', mapa).order('data_saida', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('checklist_tml').select('data').eq('filial', filial).eq('mapa', mapa).order('data', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('escalas_tml').select('data_entrega').eq('filial', filial).eq('mapa', mapa).order('data_entrega', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('fechamento_dia_mapas_dia').select('data').eq('filial', filial).eq('mapa', mapa).order('data', { ascending: false }).limit(1).maybeSingle(),
  ])
  const datas = [h.data?.data_saida, c.data?.data, e.data?.data_entrega, m.data?.data].filter((d): d is string => !!d)
  if (datas.length === 0) return null
  return datas.sort().at(-1)!
}

async function iniciarFluxoResultadosMapa(remetente: string): Promise<void> {
  await definirEstadoAurora(remetente, 'aguardando_mapa')
  await enviar(remetente, '🔢 Qual o *número do mapa*? (acho sozinho em qual dia ele rodou — se quiser um dia específico, inclua a data: ex. *279088 20/07*)')
}

// Data "yyyy-mm-dd" → "dd/mm/aa" (sem passar por Date, que erra o dia perto
// da meia-noite em fusos negativos como o Brasil).
function diaBR(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}

// Financeiro (Pendências) e Armazém (Variável) não respondem valor nenhum
// pelo bot — só mandam o link da tela já existente, que faz a identificação
// por CPF e mostra os dados por lá.
function linkAutoatendimento(caminho: string): string {
  return APP_BASE_URL ? `${APP_BASE_URL}${caminho}` : caminho
}

// Depois de entregar uma resposta (não de encaminhar pra outro fluxo, como a
// Dúvida de Treinamento), pergunta se a pessoa quer fazer outra pergunta
// (volta pro menu de categorias) ou encerrar — em vez de simplesmente
// fechar a sessão sem avisar.
async function perguntarProximoPasso(remetente: string): Promise<void> {
  await definirEstadoAurora(remetente, 'pos_resposta')
  await enviarBotoes(remetente, 'Posso ajudar com mais alguma coisa?', [
    { id: 'aurora_pos:nova', label: 'Nova pergunta' },
    { id: 'aurora_pos:encerrar', label: 'Encerrar' },
  ])
}

async function tratarItemAurora(remetente: string, senderName: string, itemId: string): Promise<{ ok: boolean; action: string }> {
  if (itemId === 'aurora_item:resultados_mapa') {
    await iniciarFluxoResultadosMapa(remetente)
    return { ok: true, action: 'aurora-pede-mapa' }
  }
  if (itemId === 'aurora_item:historico_matricula') {
    await definirEstadoAurora(remetente, 'aguardando_matricula_historico')
    await enviar(remetente, '🔢 Qual a sua *matrícula*? Conto os mapas do mês atual em que você aparece como motorista ou ajudante.')
    return { ok: true, action: 'aurora-pede-matricula' }
  }
  if (itemId === 'aurora_item:duvida_treinamento') {
    await encerrarSessaoAurora(remetente)
    const r = await tratarPreSelecaoTemaMatinal({}, remetente, senderName, 'dúvida')
    return r ?? { ok: true, action: 'aurora-duvida-erro' }
  }
  if (itemId === 'aurora_item:pendencias') {
    await enviar(remetente, `📋 Pra consultar suas pendências (identificação pelo CPF), acesse:\n${linkAutoatendimento('/consulta-pendencias')}`)
    await perguntarProximoPasso(remetente)
    return { ok: true, action: 'aurora-link-pendencias' }
  }
  if (itemId === 'aurora_item:variavel') {
    await enviar(remetente, `💰 Pra consultar seu variável/pontuação (identificação pelo CPF), acesse:\n${linkAutoatendimento('/variavel-armazem')}`)
    await perguntarProximoPasso(remetente)
    return { ok: true, action: 'aurora-link-variavel' }
  }
  if (itemId === 'aurora_item:enviar_sugestao') {
    await definirEstadoAurora(remetente, 'aguardando_sugestao_texto')
    await enviar(remetente, '💬 Manda sua sugestão! Pode ser sobre qualquer processo — o que trava, o que podia ser mais rápido, ou o que faria diferença no seu dia a dia.')
    return { ok: true, action: 'aurora-pede-sugestao' }
  }
  await enviar(remetente, '🔧 Essa opção ainda está em construção — em breve você poderá usar por aqui. Por enquanto, fale com o seu supervisor.')
  await perguntarProximoPasso(remetente)
  return { ok: true, action: 'aurora-em-breve' }
}

async function tratarAurora(
  body: any, remetente: string, senderName: string, texto: string,
): Promise<{ ok: boolean; action: string } | null> {
  const sessao = await buscarSessaoAurora(remetente)
  const btn = extrairBotaoResposta(body)

  if (sessao) {
    if (ehEncerrarAurora(texto)) {
      await encerrarSessaoAurora(remetente)
      await enviar(remetente, '👋 Conversa encerrada. Quando precisar, é só mandar um oi.')
      return { ok: true, action: 'aurora-encerrada' }
    }
    if (ehTrocarAssuntoAurora(texto)) {
      await mostrarMenuCategorias(remetente, senderName || null)
      return { ok: true, action: 'aurora-troca-assunto' }
    }
    if (btn.startsWith('aurora_cat:')) {
      await mostrarSubmenuAurora(remetente, btn.slice('aurora_cat:'.length))
      return { ok: true, action: 'aurora-submenu' }
    }
    if (btn.startsWith('aurora_item:')) {
      return await tratarItemAurora(remetente, senderName, btn)
    }
    if (sessao.estado === 'aguardando_mapa') {
      let conteudo = texto.trim()
      if (!conteudo && temAudioSemTexto(body)) {
        const transcrito = await transcreverAudio(extrairAudioUrl(body))
        if (!transcrito) {
          await enviar(remetente, 'Não consegui entender o áudio. Pode escrever o número do mapa?')
          return { ok: true, action: 'aurora-mapa-audio-falhou' }
        }
        conteudo = transcrito
      }
      const textoSemData = conteudo.replace(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/, '')
      const mapa = extrairMapa(textoSemData) ?? extrairMapa(conteudo)
      if (mapa == null) {
        await enviar(remetente, '🔢 Não entendi. Envie só o *número do mapa* (ex: 279088), com a data se quiser (ex: 279088 20/07).')
        return { ok: true, action: 'aurora-mapa-repete' }
      }
      const filial = await filialDoTelefoneOuPadrao(remetente)
      const dataEscolhida = extrairDataMencionada(conteudo) ?? await encontrarDataDoMapa(filial, mapa)
      if (!dataEscolhida) {
        await enviar(remetente, `🔍 Não encontrei nenhum resultado pro mapa *${mapa}* em nenhuma data. Confira o número.`)
        await perguntarProximoPasso(remetente)
        return { ok: true, action: 'aurora-mapa-nao-encontrado' }
      }
      const resposta = await resultadosDoMapa(filial, mapa, dataEscolhida)
      await enviar(remetente, resposta)
      await perguntarProximoPasso(remetente)
      return { ok: true, action: 'aurora-mapa-respondido' }
    }
    if (sessao.estado === 'aguardando_matricula_historico') {
      let conteudo = texto.trim()
      if (!conteudo && temAudioSemTexto(body)) {
        const transcrito = await transcreverAudio(extrairAudioUrl(body))
        if (!transcrito) {
          await enviar(remetente, 'Não consegui entender o áudio. Pode escrever sua matrícula?')
          return { ok: true, action: 'aurora-matricula-audio-falhou' }
        }
        conteudo = transcrito
      }
      const matriculaMatch = conteudo.match(/\d{1,7}/)
      if (!matriculaMatch) {
        await enviar(remetente, '🔢 Não entendi. Envie só o número da sua matrícula.')
        return { ok: true, action: 'aurora-matricula-repete' }
      }
      const filial = await filialDoTelefoneOuPadrao(remetente)
      const resposta = await historicoPorMatricula(filial, matriculaMatch[0])
      await enviar(remetente, resposta)
      await perguntarProximoPasso(remetente)
      return { ok: true, action: 'aurora-matricula-respondido' }
    }
    if (sessao.estado === 'aguardando_sugestao_texto') {
      let conteudo = texto.trim()
      if (!conteudo && temAudioSemTexto(body)) {
        const transcrito = await transcreverAudio(extrairAudioUrl(body))
        if (!transcrito) {
          await enviar(remetente, 'Não consegui entender o áudio. Pode escrever sua sugestão?')
          return { ok: true, action: 'aurora-sugestao-audio-falhou' }
        }
        conteudo = transcrito
      }
      if (!conteudo) {
        await enviar(remetente, 'Pode escrever sua sugestão em texto (ou áudio)?')
        return { ok: true, action: 'aurora-sugestao-repete' }
      }
      const filial = await filialDoTelefoneOuPadrao(remetente)
      await supabase.from('conferencia_sugestoes').insert({
        filial, nome: senderName || null, telefone: remetente,
        resposta: conteudo, status: 'respondida', respondida_em: new Date().toISOString(),
      })
      await enviar(remetente, 'Valeu pela resposta! Vamos tratar o problema relatado e te damos um retorno. 🙌')
      await perguntarProximoPasso(remetente)
      return { ok: true, action: 'aurora-sugestao-registrada' }
    }
    if (sessao.estado === 'pos_resposta') {
      if (btn === 'aurora_pos:nova' || ehTrocarAssuntoAurora(texto) || /^\s*nova\b/i.test(texto)) {
        await mostrarMenuCategorias(remetente, senderName || null)
        return { ok: true, action: 'aurora-pos-nova' }
      }
      if (btn === 'aurora_pos:encerrar' || /^\s*encerrar\b/i.test(texto)) {
        await encerrarSessaoAurora(remetente)
        await enviar(remetente, '👋 Foi um prazer ajudar! Quando precisar, é só mandar um oi.')
        return { ok: true, action: 'aurora-pos-encerrar' }
      }
      await enviar(remetente, 'Não entendi. Quer fazer uma *nova pergunta* ou *encerrar*?')
      return { ok: true, action: 'aurora-pos-repete' }
    }
    // Sessão existe mas a resposta não bateu com nada esperado (ex.: digitou
    // texto livre em vez de tocar numa opção) — repete o passo atual em vez
    // de deixar a mensagem cair sem resposta nenhuma.
    if (sessao.estado === 'menu') {
      await mostrarMenuCategorias(remetente, senderName || null)
      return { ok: true, action: 'aurora-menu-repete' }
    }
    if (sessao.estado.startsWith('submenu:')) {
      await mostrarSubmenuAurora(remetente, sessao.estado.slice('submenu:'.length))
      return { ok: true, action: 'aurora-submenu-repete' }
    }
  }

  // Sem sessão ativa: só entra com saudação/gatilho, ou um ÁUDIO que já diga
  // o que a pessoa quer — nesse caso pula direto pro passo certo, sem
  // mostrar o menu.
  if (temAudioSemTexto(body) && !texto.trim()) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (transcrito) {
      const n = norm(transcrito)
      const mapaFalado = extrairMapa(transcrito)
      if (mapaFalado != null && /mapa/.test(n)) {
        const filial = await filialDoTelefoneOuPadrao(remetente)
        const dataFalada = extrairDataMencionada(transcrito) ?? await encontrarDataDoMapa(filial, mapaFalado)
        if (!dataFalada) {
          await enviar(remetente, `🔍 Não encontrei nenhum resultado pro mapa *${mapaFalado}* em nenhuma data. Confira o número.`)
          await perguntarProximoPasso(remetente)
          return { ok: true, action: 'aurora-audio-mapa-nao-encontrado' }
        }
        const resposta = await resultadosDoMapa(filial, mapaFalado, dataFalada)
        await enviar(remetente, resposta)
        await perguntarProximoPasso(remetente)
        return { ok: true, action: 'aurora-audio-mapa-direto' }
      }
      if (/duvida|treinamento/.test(n)) {
        const r = await tratarPreSelecaoTemaMatinal({}, remetente, senderName, 'dúvida')
        if (r) return r
      }
      // Áudio sem correspondência clara com nenhum fluxo pronto: mostra o
      // menu mesmo assim, em vez de ignorar a mensagem.
      await mostrarMenuCategorias(remetente, senderName || null)
      return { ok: true, action: 'aurora-audio-menu' }
    }
  }

  if (!ehSaudacaoAurora(texto)) {
    // Sem sessão ativa, nenhum fluxo anterior no roteamento reivindicou a
    // mensagem, e o texto não bateu com a saudação exata (só "oi"/"olá"/
    // "aurora"/"menu"). Sem esse fallback, qualquer abertura diferente
    // ("bom dia", "cheguei", "preciso de ajuda" etc.) ficava sem resposta
    // nenhuma — bug real relatado por motoristas. Mesmo padrão já existia
    // pra áudio sem correspondência (aurora-audio-menu, acima); texto
    // continua ignorando clique de botão de outro fluxo (rawBtn) e mensagem
    // vazia, pra não reivindicar algo que não é abertura de conversa.
    if (!texto.trim() || extrairBotaoResposta(body)) return null
    await mostrarMenuCategorias(remetente, senderName || null)
    return { ok: true, action: 'aurora-menu-fallback' }
  }
  await mostrarMenuCategorias(remetente, senderName || null)
  return { ok: true, action: 'aurora-menu-inicial' }
}

// ── Handler ──────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, ignored: 'method' })
    return
  }
  // O segredo é obrigatório: sem ZAPI_WEBHOOK_SECRET configurado, o endpoint
  // ficaria aberto para qualquer POST forjado (dispararia mensagens e
  // escreveria no banco). Recusamos quando não está configurado OU quando o
  // token na query não bate. Configure ZAPI_WEBHOOK_SECRET no Vercel e aponte
  // a URL do webhook no Z-API para ...?token=SEU_SEGREDO.
  // .trim() dos dois lados: evita 401 quando o valor colado no Vercel vem com
  // espaço/quebra de linha no fim (erro de copy-paste que não dá pra ver).
  const segredoConfig = WEBHOOK_SECRET.trim()
  const tokenRecebido = String(req.query?.token ?? '').trim()
  if (!segredoConfig) {
    console.error('ZAPI_WEBHOOK_SECRET não configurado — webhook recusado por segurança.')
    res.status(503).json({ ok: false, error: 'webhook secret not configured' })
    return
  }
  if (tokenRecebido !== segredoConfig) {
    res.status(401).json({ ok: false, error: 'invalid token' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  console.log('WEBHOOK type:', body.type, '| fromMe:', body.fromMe, '| isGroup:', body.isGroup, '| phone:', body.phone)
  // Log temporário pra depurar o menu da Aurora: mensagens individuais (não
  // de grupo) imprimem o corpo inteiro, pra ver exatamente que campo o
  // Z-API usa numa resposta de lista/botão nesta instância. Remover depois
  // de confirmado o formato real (ver AURORA-DEBUG nos logs do Vercel).
  if (!body.isGroup) console.log('AURORA-DEBUG body completo:', JSON.stringify(body))

  try {
    const fromMe: boolean = body.fromMe === true
    const grupoId: string = String(body.phone ?? '')
    // grupoId vem do payload (não confiável) e é interpolado no filtro .or()
    // do PostgREST mais abaixo. Só aceitamos o formato de ID do WhatsApp
    // (dígitos + sufixos), bloqueando vírgula/parêntese/espaço que poderiam
    // injetar na expressão do filtro.
    if (grupoId && !/^[A-Za-z0-9@._-]+$/.test(grupoId)) {
      res.status(200).json({ ok: true, ignored: 'invalid-id' })
      return
    }
    const isGroup: boolean =
      body.isGroup === true || body.isGroup === 'true' ||
      grupoId.endsWith('-group') || grupoId.endsWith('@g.us')
    const texto = extrairTexto(body)
    const temConteudo = texto || body?.buttonsResponseMessage || body?.listResponseMessage || body?.listResponse?.singleSelectReply || temAudioSemTexto(body) || temImagem(body)
    const senderName: string = String(body.senderName ?? body.chatName ?? body.pushName ?? '')
    const participante: string = String(body.participantPhone ?? body.participant ?? '')

    if (fromMe || !grupoId || !temConteudo) {
      res.status(200).json({ ok: true, ignored: 'not-applicable' })
      return
    }

    // Conversa individual (não-grupo). Primeiro checa se o número tem uma
    // conversa aberta de motorista (TML perdido); se não tiver, cai no fluxo
    // do supervisor (botão/texto do alerta) em tratarTml.
    if (!isGroup) {
      await verificarLembretesMatinal().catch((e) => console.error('lembretes matinal:', e))

      const rPalestranteMatinal = await tratarRespostaPalestranteMatinal(body, grupoId)
      if (rPalestranteMatinal) {
        res.status(200).json(rPalestranteMatinal)
        return
      }
      const rDuvidaMatinal = await tratarDuvidaMatinal(body, grupoId, senderName)
      if (rDuvidaMatinal) {
        res.status(200).json(rDuvidaMatinal)
        return
      }
      const rSugestaoConferencia = await tratarSugestaoConferenciaPendente(body, grupoId)
      if (rSugestaoConferencia) {
        res.status(200).json(rSugestaoConferencia)
        return
      }

      const rGatilho = await tratarGatilhoBatePapo(body, grupoId)
      if (rGatilho) {
        res.status(200).json(rGatilho)
        return
      }

      const rConv = await tratarConversaMotorista(body, grupoId)
      if (rConv) {
        res.status(200).json(rConv)
        return
      }
      const r = await tratarTml(body, grupoId)
      const TML_NAO_TRATADO = ['no-command', 'no-pending-alert']
      if (!TML_NAO_TRATADO.includes(r.action)) {
        res.status(200).json(r)
        return
      }
      // Nada mais reivindicou a mensagem — tenta a pré-seleção de tema da
      // Matinal (dúvida sobre um treinamento de outro dia, fora da janela do
      // aviso). Se também não se aplicar, mantém a resposta original do TML.
      const rTema = await tratarPreSelecaoTemaMatinal(body, grupoId, senderName, texto)
      if (rTema) { res.status(200).json(rTema); return }
      let rAurora: { ok: boolean; action: string } | null = null
      try {
        rAurora = await tratarAurora(body, grupoId, senderName, texto)
      } catch (e) {
        console.error('tratarAurora exception:', e)
        await enviar(grupoId, 'Ops, tive um problema aqui. Pode mandar de novo?')
        rAurora = { ok: false, action: 'aurora-erro' }
      }
      res.status(200).json(rAurora ?? r)
      return
    }

    // Descobre a qual fluxo este grupo pertence
    const { data: filialRow } = await supabase
      .from('filiais')
      .select('nome, grupo_fluxo_whatsapp, grupo_reposicoes_whatsapp, grupo_solicitacao_2_whatsapp, grupo_validacao_whatsapp, grupo_frota_leve_whatsapp')
      .or(`grupo_fluxo_whatsapp.eq.${grupoId},grupo_reposicoes_whatsapp.eq.${grupoId},grupo_solicitacao_2_whatsapp.eq.${grupoId},grupo_validacao_whatsapp.eq.${grupoId},grupo_frota_leve_whatsapp.eq.${grupoId}`)
      .maybeSingle()

    if (!filialRow) {
      console.log('Grupo não configurado em filiais:', grupoId)
      res.status(200).json({ ok: true, ignored: 'group-not-configured' })
      return
    }

    const filial: string = filialRow.nome
    const grupoValidacao: string = filialRow.grupo_validacao_whatsapp ?? ''

    // Grupo de validação (controle): responde OK/NOK e atualiza o painel
    if (grupoValidacao && grupoValidacao === grupoId) {
      const r = await tratarValidacao(body, grupoId)
      res.status(200).json(r)
      return
    }

    // Grupos de solicitação (1 e 2): motorista envia e confirma
    if (filialRow.grupo_reposicoes_whatsapp === grupoId || filialRow.grupo_solicitacao_2_whatsapp === grupoId) {
      const r = await tratarReposicao(body, grupoId, filial, texto, senderName, participante)
      res.status(200).json(r)
      return
    }

    // Grupo de controle da frota leve: registro de saída/retorno de veículo
    if (filialRow.grupo_frota_leve_whatsapp === grupoId) {
      const r = await tratarFrotaLeve(body, grupoId, filial, texto, senderName, participante)
      res.status(200).json(r)
      return
    }

    if (filialRow.grupo_fluxo_whatsapp === grupoId) {
      const r = await tratarFluxo(body, grupoId, filial, texto, senderName, participante)
      res.status(200).json(r)
      return
    }

    res.status(200).json({ ok: true, ignored: 'no-route' })
  } catch (e) {
    console.error('Erro no webhook:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
