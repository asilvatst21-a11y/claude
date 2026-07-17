/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

// Transcreve o áudio gravado no navegador (Consulta de Pendências) usando o
// mesmo Whisper da Groq já usado no robô de WhatsApp (api/zapi-webhook.ts) —
// a chave da Groq nunca pode ir pro bundle do cliente, por isso passa por
// aqui. Só funciona com a funcionalidade ativa (chave "consulta_pendencias_
// ativa" em `configuracoes"), mesma trava usada no restante da feature.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_TRANSCRIBE_MODEL = process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3-turbo'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'method' })
    return
  }
  if (!GROQ_API_KEY) {
    res.status(503).json({ erro: 'Transcrição de áudio não configurada.' })
    return
  }

  const { data: config } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'consulta_pendencias_ativa')
    .maybeSingle()
  if (config?.valor !== 'true') {
    res.status(403).json({ erro: 'Funcionalidade ainda não está ativa.' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const audioBase64 = String(body.audioBase64 ?? '')
  const mimeType = String(body.mimeType ?? 'audio/webm')
  if (!audioBase64) {
    res.status(400).json({ erro: 'Áudio ausente.' })
    return
  }

  try {
    const buf = Buffer.from(audioBase64, 'base64')
    if (buf.byteLength > 8 * 1024 * 1024) {
      res.status(413).json({ erro: 'Áudio muito grande.' })
      return
    }
    const blob = new Blob([buf], { type: mimeType })
    const form = new FormData()
    const extensao = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'webm'
    form.append('file', blob, `audio.${extensao}`)
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
      res.status(502).json({ erro: 'Falha ao transcrever o áudio.' })
      return
    }
    const data: any = await resp.json()
    const texto = String(data?.text ?? '').trim()
    res.status(200).json({ texto: texto || null })
  } catch (e) {
    console.error('consulta-pendencias-audio exception:', e)
    res.status(500).json({ erro: 'Erro ao processar o áudio.' })
  }
}
