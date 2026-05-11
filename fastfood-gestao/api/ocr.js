export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { image, mediaType } = req.body
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no Vercel.' })
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image }
          },
          {
            type: 'text',
            text: `Analise esta nota fiscal ou cupom fiscal brasileiro e extraia todas as informações de compra.
Retorne APENAS um JSON válido, sem texto antes ou depois, com esta estrutura exata:
{
  "storeName": "nome do estabelecimento ou mercado",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "name": "nome do produto",
      "quantity": 1.0,
      "unit": "un",
      "unitPrice": 0.0,
      "totalPrice": 0.0
    }
  ],
  "total": 0.0
}
Regras:
- unit deve ser: kg, g, L, ml, un, pct ou cx
- date no formato YYYY-MM-DD (se não encontrar use a data de hoje)
- todos os valores numéricos sem símbolo de moeda
- inclua apenas itens de produto, não taxas ou descontos
- se não encontrar o nome da loja use "Fornecedor"`
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const err = await response.json()
    return res.status(500).json({ error: err.error?.message || 'Erro na API do Claude' })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    res.json(parsed)
  } catch {
    res.status(500).json({ error: 'Não foi possível interpretar a resposta.', raw: text })
  }
}
