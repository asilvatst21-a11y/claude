/// <reference types="node" />

// Transcreve o áudio gravado no navegador (Consulta de Pendências) usando o
// mesmo Whisper da Groq já usado no robô de WhatsApp (api/zapi-webhook.ts) —
// a chave da Groq nunca pode ir pro bundle do cliente, por isso passa por
// aqui. Não trava pela chave "consulta_pendencias_ativa" — a página em si já
// fica de portas fechadas pro público enquanto isso, mas libera o link de
// teste (`?preview=1`) pra validar o fluxo completo (texto e áudio) antes de
// ligar de vez.
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_TRANSCRIBE_MODEL = process.env.GROQ_TRANSCRIBE_MODEL ?? 'whisper-large-v3-turbo'

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
