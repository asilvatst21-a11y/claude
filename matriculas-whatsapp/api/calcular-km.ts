/// <reference types="node" />

// Calcula o KM previsto de ida + volta entre a sede (Rua Mário Gelli, 119) e
// o endereço de entrega/recolha digitado na Solicitação Extra, via Google
// Maps Distance Matrix. A chave fica só no servidor (nunca no bundle do
// cliente) — por isso passa por um endpoint em vez de chamar a API direto
// do navegador.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? ''
const ORIGEM = 'Rua Mário Gelli, 119'

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
  if (!GOOGLE_MAPS_API_KEY) {
    res.status(503).json({ erro: 'Cálculo de KM não configurado (falta GOOGLE_MAPS_API_KEY).' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const endereco = String(body.endereco ?? '').trim()
  if (!endereco) {
    res.status(400).json({ erro: 'Informe o endereço de entrega/recolha.' })
    return
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', ORIGEM)
    url.searchParams.set('destinations', endereco)
    url.searchParams.set('mode', 'driving')
    url.searchParams.set('units', 'metric')
    url.searchParams.set('region', 'br')
    url.searchParams.set('language', 'pt-BR')
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY)

    const resp = await fetch(url.toString())
    if (!resp.ok) {
      res.status(502).json({ erro: 'Falha ao consultar o Google Maps.' })
      return
    }
    const data: any = await resp.json()
    const elemento = data?.rows?.[0]?.elements?.[0]
    if (data.status !== 'OK' || !elemento || elemento.status !== 'OK') {
      const motivo = elemento?.status ?? data?.status ?? 'erro desconhecido'
      res.status(200).json({ erro: `Não conseguimos calcular a rota pra esse endereço (${motivo}). Confira se está completo (rua, número, cidade).` })
      return
    }

    const metrosIda = elemento.distance.value as number
    const enderecoFormatado = data.destination_addresses?.[0] ?? endereco

    res.status(200).json({
      kmIda: Math.round((metrosIda / 1000) * 10) / 10,
      kmIdaVolta: Math.round((metrosIda * 2 / 1000) * 10) / 10,
      enderecoFormatado,
    })
  } catch (e) {
    console.error('calcular-km exception:', e)
    res.status(500).json({ erro: 'Erro ao calcular o KM. Tente de novo.' })
  }
}
