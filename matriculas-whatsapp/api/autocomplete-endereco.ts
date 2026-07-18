/// <reference types="node" />

// Sugestões de endereço enquanto o usuário digita (Solicitação Extra —
// Entrega/Recolha de Materiais), via Google Places Autocomplete (New). A
// chave fica só no servidor — mesmo padrão do api/calcular-km.ts.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? ''

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ sugestoes: [] })
    return
  }
  if (!GOOGLE_MAPS_API_KEY) {
    res.status(200).json({ sugestoes: [] })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const input = String(body.input ?? '').trim()
  if (input.length < 3) {
    res.status(200).json({ sugestoes: [] })
    return
  }

  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['br'],
        languageCode: 'pt-BR',
      }),
    })
    if (!resp.ok) {
      res.status(200).json({ sugestoes: [] })
      return
    }
    const data: any = await resp.json()
    const sugestoes = (data.suggestions ?? [])
      .map((s: any) => s?.placePrediction?.text?.text)
      .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
      .slice(0, 6)
    res.status(200).json({ sugestoes })
  } catch (e) {
    console.error('autocomplete-endereco exception:', e)
    res.status(200).json({ sugestoes: [] })
  }
}
