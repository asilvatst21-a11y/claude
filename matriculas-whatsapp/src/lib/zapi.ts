const ZAPI_INSTANCE = import.meta.env.VITE_ZAPI_INSTANCE as string
const ZAPI_TOKEN = import.meta.env.VITE_ZAPI_TOKEN as string
const ZAPI_CLIENT_TOKEN = import.meta.env.VITE_ZAPI_CLIENT_TOKEN as string

const BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`
const HEADERS = {
  'Content-Type': 'application/json',
  'Client-Token': ZAPI_CLIENT_TOKEN,
}

function limparNumero(numero: string): string {
  const limpo = numero.replace(/\D/g, '')
  return limpo.startsWith('55') ? limpo : `55${limpo}`
}

export async function enviarMensagemWhatsApp(
  numero: string,
  mensagem: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const response = await fetch(`${BASE}/send-text`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ phone: limparNumero(numero), message: mensagem }),
    })
    if (!response.ok) return { sucesso: false, erro: await response.text() }
    return { sucesso: true }
  } catch (e) {
    return { sucesso: false, erro: String(e) }
  }
}

export async function enviarImagemWhatsApp(
  numero: string,
  imagemUrl: string,
  legenda: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const response = await fetch(`${BASE}/send-image`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        phone: limparNumero(numero),
        image: imagemUrl,
        caption: legenda,
      }),
    })
    if (!response.ok) return { sucesso: false, erro: await response.text() }
    return { sucesso: true }
  } catch (e) {
    return { sucesso: false, erro: String(e) }
  }
}

export function formatarMensagem(
  template: string,
  dados: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, chave) => dados[chave] ?? '')
}
