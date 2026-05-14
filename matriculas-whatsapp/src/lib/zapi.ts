const ZAPI_INSTANCE = import.meta.env.VITE_ZAPI_INSTANCE as string
const ZAPI_TOKEN = import.meta.env.VITE_ZAPI_TOKEN as string
const ZAPI_CLIENT_TOKEN = import.meta.env.VITE_ZAPI_CLIENT_TOKEN as string

export async function enviarMensagemWhatsApp(
  numero: string,
  mensagem: string
): Promise<{ sucesso: boolean; erro?: string }> {
  // Remove formatação e garante só dígitos + código do país
  const numeroLimpo = numero.replace(/\D/g, '')
  const numeroCom55 = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`

  try {
    const response = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN,
        },
        body: JSON.stringify({
          phone: numeroCom55,
          message: mensagem,
        }),
      }
    )

    if (!response.ok) {
      const erro = await response.text()
      return { sucesso: false, erro }
    }

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
