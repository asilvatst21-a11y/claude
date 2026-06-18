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
const GROQ_TRANSCRIBE_MODEL = process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3-turbo'

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

const CONFIRM_TTL_MIN = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Envio de mensagens ──────────────────────────────────────────────────────────

async function enviar(destino: string, message: string): Promise<void> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: destino, message }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      console.error('enviar HTTP error:', resp.status, txt)
    }
  } catch (e) {
    console.error('enviar exception:', e)
  }
}

const enviarGrupo = enviar

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
    if (!resp.ok) {
      console.error('send-button-list error:', resp.status, await resp.text().catch(() => ''))
      await enviar(destino, message) // fallback: texto (instruções já estão na mensagem)
    }
  } catch (e) {
    console.error('enviarBotoes exception:', e)
    await enviar(destino, message)
  }
}


// ── Helpers ─────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
}

// Extrai a resposta do usuário: texto livre OU clique em botão
function extrairResposta(body: any): 'sim' | 'nao' | null {
  const buttonId: string = norm(
    body?.buttonsResponseMessage?.buttonId ??
    body?.listResponse?.singleSelectReply?.selectedRowId ??
    ''
  )
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
  tipo_reposicao: 'falta' | 'inversao' | 'avaria' | 'troca' | 'indefinido'
  embalagem: 'unidade' | 'fardo' | 'indefinido'
}

const TIPO_LABEL: Record<string, string> = {
  falta: 'Falta', inversao: 'Inversão', avaria: 'Avaria', troca: 'Troca', indefinido: 'Não informado',
}

const EMBALAGEM_LABEL: Record<string, string> = {
  unidade: 'Unidade', fardo: 'Fardo', indefinido: 'Não informado',
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
  return rows?.[0]?.mapa?.trim() || null
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

async function extrairReposicaoIA(texto: string): Promise<ReposicaoIA | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada')
    return null
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
          'A mensagem pode ser uma solicitação de reposição de produto (falta, inversão, avaria ou troca) ' +
          'ou apenas uma conversa qualquer. Extraia os campos solicitados. ' +
          'Se a mensagem NÃO for uma solicitação de reposição, defina eh_reposicao=false. ' +
          'multiplos_itens: defina true SOMENTE quando a mensagem pedir reposição de mais de um produto DISTINTO ' +
          '(ex: "falta 2 cx de H2OH e 3 fardos de Skol"). Quantidade alta de um mesmo produto NÃO conta como múltiplos itens. ' +
          'Quando multiplos_itens=true, preencha os demais campos apenas com o primeiro item (ou deixe vazios se ambíguo). ' +
          'Campos não informados devem ficar como string vazia. ' +
          'tipo_reposicao: "falta" (produto não entregue/faltou), "inversao" (veio o item errado na carga/separação), ' +
          '"avaria" (produto quebrado/amassado/vazado/estragado), "troca" (cliente pediu troca/devolução do produto), ' +
          'ou "indefinido" se não der pra saber. ' +
          'embalagem: "unidade" (produto avulso, unidade, garrafa/lata solta) ou "fardo" (fardo, pacote, caixa fechada, engradado); ' +
          'use "indefinido" se a mensagem não deixar claro se é unidade ou fardo. ' +
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
                tipo_reposicao:  { type: 'string', enum: ['falta', 'inversao', 'avaria', 'troca', 'indefinido'] },
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
      console.error('Claude HTTP error:', resp.status, await resp.text().catch(() => ''))
      return null
    }
    const data: any = await resp.json()
    if (data.stop_reason === 'refusal') { console.error('Claude refusal'); return null }
    const bloco = (data.content ?? []).find((b: any) => b.type === 'text')
    if (!bloco?.text) return null
    return JSON.parse(bloco.text) as ReposicaoIA
  } catch (e) {
    console.error('extrairReposicaoIA exception:', e)
    return null
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

// Mensagem enviada ao grupo de validação (controle) para Falta/Inversão.
function resumoValidacao(numero: string, pend: any, equipe?: string | null): string {
  const linhas = [`🔎 *Validação de Reposição* — ${numero}`]
  linhas.push(`🔁 Tipo: ${TIPO_LABEL[pend.tipo_reposicao ?? 'indefinido'] ?? 'Não informado'}`)
  linhas.push(`📦 Embalagem: ${EMBALAGEM_LABEL[pend.embalagem ?? 'indefinido'] ?? 'Não informado'}`)
  if (pend.motorista_nome) linhas.push(`👤 Motorista: ${pend.motorista_nome}`)
  if (pend.codigo_pdv)     linhas.push(`🏪 PDV: ${pend.codigo_pdv}`)
  if (pend.mapa)           linhas.push(`🗺️ Mapa: ${pend.mapa}`)
  if (equipe)              linhas.push(equipe)
  if (pend.produto)        linhas.push(`📋 Produto: ${pend.produto}`)
  if (pend.quantidade)     linhas.push(`📊 Qtde: ${pend.quantidade}`)
  linhas.push('\nValidar? Toque em *OK* / *NOK* ou responda *OK* para aprovar ou *NOK* para negar.')
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

async function gerarNumeroReposicao(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await supabase
    .from('reposicoes')
    .select('*', { count: 'exact', head: true })
    .like('numero', `REP-${hoje}-%`)
  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return `REP-${hoje}-${seq}`
}

// ── Campos obrigatórios da reposição ──────────────────────────────────────────────
// Antes de montar a confirmação, o bot exige os 6 campos. Os que faltarem são
// pedidos ao motorista numa única mensagem.
const CAMPO_LABEL: Record<string, string> = {
  tipo_reposicao: 'Tipo (Falta, Inversão, Avaria ou Troca)',
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
  senderName: string, participante: string, grupoValidacao: string,
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
  const { data: pendMapa } = await supabase
    .from('reposicao_confirmacoes')
    .select('*')
    .eq('grupo_id', grupoId)
    .eq('motorista_telefone', participante)
    .eq('status', 'confirmando_mapa')
    .gte('created_at', limitePend())
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
  const { data: pendColeta } = await supabase
    .from('reposicao_confirmacoes')
    .select('*')
    .eq('grupo_id', grupoId)
    .eq('motorista_telefone', participante)
    .eq('status', 'coletando')
    .gte('created_at', limitePend())
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
  const resposta = extrairResposta(body)
  if (resposta) {
    const limite = new Date(Date.now() - CONFIRM_TTL_MIN * 60_000).toISOString()
    const { data: pend } = await supabase
      .from('reposicao_confirmacoes')
      .select('*')
      .eq('grupo_id', grupoId)
      .eq('motorista_telefone', participante)
      .eq('status', 'aguardando')
      .gte('created_at', limite)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!pend) return { ok: true, action: 'repos-sem-pendencia' }

    if (resposta === 'nao') {
      await supabase.from('reposicao_confirmacoes').update({ status: 'cancelado' }).eq('id', pend.id)
      await enviar(grupoId, `❌ ${pend.motorista_nome ?? ''}, solicitação cancelada. Pode enviar novamente.`)
      return { ok: true, action: 'repos-cancelado' }
    }

    const numero = await gerarNumeroReposicao()
    const tipo = pend.tipo_reposicao ?? 'indefinido'
    const { data: novaRep, error: insErr } = await supabase.from('reposicoes').insert({
      numero,
      filial,
      motorista_nome: pend.motorista_nome,
      motorista_telefone: participante,
      codigo_pdv: pend.codigo_pdv || null,
      cliente: pend.codigo_pdv || null,
      mapa: pend.mapa || null,
      produto: pend.produto || null,
      quantidade: pend.quantidade || null,
      tipo_reposicao: tipo,
      embalagem: pend.embalagem || null,
      motivo: TIPO_LABEL[tipo] ?? null,
      mensagem_original: pend.mensagem_original,
      status: 'pendente',
    }).select('id, numero').single()
    if (insErr || !novaRep) {
      console.error('Erro ao inserir reposição:', insErr)
      await enviar(grupoId, '❌ Erro ao registrar. Tente novamente.')
      return { ok: false, action: 'repos-erro' }
    }
    await supabase.from('reposicao_confirmacoes').update({ status: 'confirmado' }).eq('id', pend.id)

    // Falta/Inversão (e indefinido) vão para validação do controle — mas só
    // quando a embalagem for Fardo. Unidade fica só registrada, sem validação.
    const precisaValidacao = (tipo === 'falta' || tipo === 'inversao' || tipo === 'indefinido') && pend.embalagem === 'fardo'
    if (precisaValidacao && grupoValidacao) {
      await enviar(grupoId,
        `✅ *${numero}* registrada para ${pend.motorista_nome ?? ''}!\nEnviada para validação do controle.`)
      const equipeValidacao = await buscarEquipeMapa(pend.mapa, pend.filial)
      await enviarBotoes(grupoValidacao, resumoValidacao(numero, pend, equipeValidacao), [
        { id: `vok:${novaRep.id}`,  label: '✅ OK' },
        { id: `vnok:${novaRep.id}`, label: '❌ NOK' },
      ])
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
  const ia = await extrairReposicaoIA(conteudo)
  if (!ia || !ia.eh_reposicao) {
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

  // Controle negou (NOK) → já registra como quebra direto, sem passo manual.
  const novoStatus = v.decisao === 'ok' ? 'validado' : 'quebra'
  await supabase.from('reposicoes').update({
    status: novoStatus,
    validador_resposta: v.decisao === 'ok' ? 'Controle: OK (WhatsApp)' : 'Controle: NOK (WhatsApp)',
    validado_em: new Date().toISOString(),
  }).eq('id', rep.id)

  await enviar(grupoId, v.decisao === 'ok'
    ? `✅ *${rep.numero}* validada pelo controle.`
    : `❌ *${rep.numero}* negada pelo controle e registrada como *quebra*.`)
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

// ── Handler ──────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, ignored: 'method' })
    return
  }
  if (WEBHOOK_SECRET && req.query?.token !== WEBHOOK_SECRET) {
    res.status(401).json({ ok: false, error: 'invalid token' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  console.log('WEBHOOK type:', body.type, '| fromMe:', body.fromMe, '| isGroup:', body.isGroup, '| phone:', body.phone)

  try {
    const fromMe: boolean = body.fromMe === true
    const grupoId: string = String(body.phone ?? '')
    const isGroup: boolean =
      body.isGroup === true || body.isGroup === 'true' ||
      grupoId.endsWith('-group') || grupoId.endsWith('@g.us')
    const texto = extrairTexto(body)
    const temConteudo = texto || body?.buttonsResponseMessage || body?.listResponse || temAudioSemTexto(body)
    const senderName: string = String(body.senderName ?? body.chatName ?? body.pushName ?? '')
    const participante: string = String(body.participantPhone ?? body.participant ?? '')

    if (fromMe || !isGroup || !grupoId || !temConteudo) {
      res.status(200).json({ ok: true, ignored: 'not-applicable' })
      return
    }

    // Descobre a qual fluxo este grupo pertence
    const { data: filialRow } = await supabase
      .from('filiais')
      .select('nome, grupo_fluxo_whatsapp, grupo_reposicoes_whatsapp, grupo_solicitacao_2_whatsapp, grupo_validacao_whatsapp')
      .or(`grupo_fluxo_whatsapp.eq.${grupoId},grupo_reposicoes_whatsapp.eq.${grupoId},grupo_solicitacao_2_whatsapp.eq.${grupoId},grupo_validacao_whatsapp.eq.${grupoId}`)
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
      const r = await tratarReposicao(body, grupoId, filial, texto, senderName, participante, grupoValidacao)
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
