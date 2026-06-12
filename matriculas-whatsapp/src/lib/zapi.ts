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

// Envio para grupo: o "phone" é o ID do grupo (ex: 120363019502650977-group),
// que NÃO deve passar por limparNumero (senão o ID é destruído).
export async function enviarMensagemGrupo(
  grupoId: string,
  mensagem: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const response = await fetch(`${BASE}/send-text`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ phone: grupoId.trim(), message: mensagem }),
    })
    if (!response.ok) return { sucesso: false, erro: await response.text() }
    return { sucesso: true }
  } catch (e) {
    return { sucesso: false, erro: String(e) }
  }
}

export interface GrupoZApi {
  phone: string   // ID do grupo, usado como destino do envio
  name: string
}

// Lista os grupos da instância Z-API para o usuário selecionar.
export async function listarGrupos(): Promise<{ grupos: GrupoZApi[]; erro?: string }> {
  try {
    const grupos: GrupoZApi[] = []
    // Pagina até esgotar (pageSize grande para reduzir chamadas)
    for (let page = 1; page <= 20; page++) {
      const response = await fetch(`${BASE}/groups?page=${page}&pageSize=50`, { headers: HEADERS })
      if (!response.ok) return { grupos, erro: await response.text() }
      const data = await response.json()
      const lista: any[] = Array.isArray(data) ? data : (data?.groups ?? [])
      if (lista.length === 0) break
      lista.forEach(g => {
        if (g?.phone) grupos.push({ phone: String(g.phone), name: String(g.name ?? g.phone) })
      })
      if (lista.length < 50) break
    }
    return { grupos }
  } catch (e) {
    return { grupos: [], erro: String(e) }
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
