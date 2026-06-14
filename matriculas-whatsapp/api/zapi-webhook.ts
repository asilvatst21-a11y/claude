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

// Extrai o conteúdo textual da mensagem — texto digitado OU transcrição de áudio (Z-API)
function extrairTexto(body: any): string {
  return String(
    body?.text?.message ??
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
  codigo_pdv: string
  mapa: string
  produto: string
  quantidade: string
  tipo_reposicao: 'falta' | 'inversao' | 'avaria' | 'troca' | 'indefinido'
}

const TIPO_LABEL: Record<string, string> = {
  falta: 'Falta', inversao: 'Inversão', avaria: 'Avaria', troca: 'Troca', indefinido: 'Não informado',
}

async function extrairReposicaoIA(texto: string): Promise<ReposicaoIA | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada')
    return null
  }
  try {
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
          'Campos não informados devem ficar como string vazia. ' +
          'tipo_reposicao: "falta" (produto não entregue/faltou), "inversao" (veio o item errado na carga/separação), ' +
          '"avaria" (produto quebrado/amassado/vazado/estragado), "troca" (cliente pediu troca/devolução do produto), ' +
          'ou "indefinido" se não der pra saber.',
        messages: [{ role: 'user', content: texto }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                eh_reposicao:   { type: 'boolean' },
                codigo_pdv:     { type: 'string' },
                mapa:           { type: 'string' },
                produto:        { type: 'string' },
                quantidade:     { type: 'string' },
                tipo_reposicao: { type: 'string', enum: ['falta', 'inversao', 'avaria', 'troca', 'indefinido'] },
              },
              required: ['eh_reposicao', 'codigo_pdv', 'mapa', 'produto', 'quantidade', 'tipo_reposicao'],
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

function resumoReposicao(p: ReposicaoIA, nome: string): string {
  const linhas = [`📦 *Confirmação de Reposição*`, `👤 ${nome}`]
  linhas.push(`🔁 Tipo: ${TIPO_LABEL[p.tipo_reposicao] ?? 'Não informado'}`)
  if (p.codigo_pdv)  linhas.push(`🏪 PDV: ${p.codigo_pdv}`)
  if (p.mapa)        linhas.push(`🗺️ Mapa: ${p.mapa}`)
  if (p.produto)     linhas.push(`📋 Produto: ${p.produto}`)
  if (p.quantidade)  linhas.push(`📊 Qtde: ${p.quantidade}`)
  linhas.push('\nEstá correto? Toque em *Sim* / *Não* ou responda *SIM* para confirmar ou *NÃO* para cancelar.')
  return linhas.join('\n')
}

// Mensagem enviada ao grupo de validação (controle) para Falta/Inversão.
function resumoValidacao(numero: string, pend: any): string {
  const linhas = [`🔎 *Validação de Reposição* — ${numero}`]
  linhas.push(`🔁 Tipo: ${TIPO_LABEL[pend.tipo_reposicao ?? 'indefinido'] ?? 'Não informado'}`)
  if (pend.motorista_nome) linhas.push(`👤 Motorista: ${pend.motorista_nome}`)
  if (pend.codigo_pdv)     linhas.push(`🏪 PDV: ${pend.codigo_pdv}`)
  if (pend.mapa)           linhas.push(`🗺️ Mapa: ${pend.mapa}`)
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

async function gerarNumeroReposicao(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await supabase
    .from('reposicoes')
    .select('*', { count: 'exact', head: true })
    .like('numero', `REP-${hoje}-%`)
  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return `REP-${hoje}-${seq}`
}

// ── Fluxo de reposição (grupo de motoristas) ──────────────────────────────────────

async function tratarReposicao(
  body: any, grupoId: string, filial: string, texto: string,
  senderName: string, participante: string, grupoValidacao: string,
): Promise<{ ok: boolean; action: string }> {
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
      motorista_nome: pend.motorista_nome,
      motorista_telefone: participante,
      codigo_pdv: pend.codigo_pdv || null,
      cliente: pend.codigo_pdv || null,
      mapa: pend.mapa || null,
      produto: pend.produto || null,
      quantidade: pend.quantidade || null,
      tipo_reposicao: tipo,
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

    // Falta/Inversão (e indefinido) vão para validação do controle.
    // Avaria/Troca só registram no banco.
    const precisaValidacao = tipo === 'falta' || tipo === 'inversao' || tipo === 'indefinido'
    if (precisaValidacao && grupoValidacao) {
      await enviar(grupoId,
        `✅ *${numero}* registrada para ${pend.motorista_nome ?? ''}!\nEnviada para validação do controle.`)
      await enviarBotoes(grupoValidacao, resumoValidacao(numero, pend), [
        { id: `vok:${novaRep.id}`,  label: '✅ OK' },
        { id: `vnok:${novaRep.id}`, label: '❌ NOK' },
      ])
    } else {
      await enviar(grupoId, `✅ *${numero}* registrada para ${pend.motorista_nome ?? ''}!`)
    }
    return { ok: true, action: 'repos-confirmado' }
  }

  // 2) Mensagem nova — se for áudio sem texto, tenta transcrever (Groq Whisper)
  let conteudo = texto
  if (!conteudo && temAudioSemTexto(body)) {
    const transcrito = await transcreverAudio(extrairAudioUrl(body))
    if (!transcrito) {
      await enviar(grupoId, '🎤 Recebi um áudio mas não consegui transcrever. Pode mandar por texto ou reenviar o áudio?')
      return { ok: true, action: 'repos-audio-sem-texto' }
    }
    conteudo = transcrito
  }
  if (!conteudo) return { ok: true, action: 'repos-vazio' }

  // 3) IA interpreta a mensagem livre
  const ia = await extrairReposicaoIA(conteudo)
  if (!ia || !ia.eh_reposicao) {
    // Não é solicitação de reposição → bot fica em silêncio (evita poluir o grupo)
    return { ok: true, action: 'repos-nao-aplicavel' }
  }

  const nome = senderName || 'Motorista'
  await supabase.from('reposicao_confirmacoes').insert({
    filial,
    grupo_id: grupoId,
    motorista_telefone: participante,
    motorista_nome: nome,
    mensagem_original: conteudo,
    codigo_pdv: ia.codigo_pdv || null,
    mapa: ia.mapa || null,
    produto: ia.produto || null,
    quantidade: ia.quantidade || null,
    tipo_reposicao: ia.tipo_reposicao,
    status: 'aguardando',
  })
  await enviarBotoes(grupoId, resumoReposicao(ia, nome), [
    { id: 'sim', label: '✅ Sim' },
    { id: 'nao', label: '❌ Não' },
  ])
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
    await enviarGrupo(grupoId,
      `📋 *Confirmação de Fluxo*\n👤 Colaborador: ${parsed.nome}\n⚠️ Motivo: ${parsed.motivo}${dataInfo}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.`)
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
