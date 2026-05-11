export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL não informada.' })

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    })

    if (!response.ok) throw new Error(`Erro ao acessar a Sefaz: ${response.status}`)
    const html = await response.text()
    const data = parseSefazHTML(html, url)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao consultar a Sefaz.' })
  }
}

function clean(s) {
  return s ? s.replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').trim() : ''
}

function parseBRL(s) {
  if (!s) return 0
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

function extractTag(html, tag, cls) {
  const pattern = cls
    ? new RegExp(`<${tag}[^>]*class=["'][^"']*${cls}[^"']*["'][^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi')
    : new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi')
  const results = []
  let m
  while ((m = pattern.exec(html)) !== null) {
    results.push(clean(m[1].replace(/<[^>]+>/g, ' ')))
  }
  return results
}

function parseSefazHTML(html, url) {
  const today = new Date().toISOString().slice(0, 10)

  // Nome da loja — várias tentativas
  let storeName = ''
  const storePatterns = [
    /class=["']txEmp["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /class=["']NomeEmit["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /class=["']txtTit2["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
    /Razão Social[^:]*:[^>]*>([\s\S]*?)<\/[^>]+>/i,
  ]
  for (const p of storePatterns) {
    const m = html.match(p)
    if (m) { storeName = clean(m[1].replace(/<[^>]+>/g, '')); break }
  }
  if (!storeName) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch) storeName = clean(titleMatch[1].replace(/<[^>]+>/g, ''))
  }
  if (!storeName) storeName = 'Fornecedor'

  // Data de emissão
  let date = today
  const datePatterns = [
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /Data de Emissão[^:]*:[^\d]*(\d{2})\/(\d{2})\/(\d{4})/i,
  ]
  for (const p of datePatterns) {
    const m = html.match(p)
    if (m) {
      if (m.length === 4) date = `${m[3]}-${m[2]}-${m[1]}`
      else if (m.length === 2) {
        const inner = m[1].match(/(\d{2})\/(\d{2})\/(\d{4})/)
        if (inner) date = `${inner[3]}-${inner[2]}-${inner[1]}`
      }
      break
    }
  }

  // Total
  let total = 0
  const totalPatterns = [
    /(?:Valor Total|Total a Pagar|TOTAL)[^\d]*R?\$?\s*([\d.,]+)/i,
    /class=["']totalNF["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  ]
  for (const p of totalPatterns) {
    const m = html.match(p)
    if (m) { total = parseBRL(m[1].replace(/<[^>]+>/g, '')); break }
  }

  // Produtos — estratégias múltiplas
  const items = []

  // Estratégia 1: tabela de produtos padrão NFC-e (maioria dos estados)
  const prodSection = html.match(/(?:Produtos e Serviços|Descrição dos Produtos)([\s\S]*?)(?:Totais|Informações Adicionais|<\/table>)/i)
  if (prodSection) {
    const rows = prodSection[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => clean(c.replace(/<[^>]+>/g, '')))
        .filter(Boolean)

      if (cells.length >= 4) {
        const name = cells[0]
        const qty = parseBRL(cells[1])
        const unit = cells[2] || 'un'
        const unitPrice = parseBRL(cells[3])
        const totalPrice = cells[4] ? parseBRL(cells[4]) : qty * unitPrice

        if (name && qty > 0 && totalPrice > 0 && !/descrição|produto|código/i.test(name)) {
          items.push({ name, quantity: qty, unit: unit.toLowerCase().slice(0, 3), unitPrice, totalPrice })
        }
      }
    }
  }

  // Estratégia 2: divs com classes comuns de NFC-e (SP, RJ, MG, etc.)
  if (items.length === 0) {
    const names = extractTag(html, 'span', 'txtTit')
    const qtds = extractTag(html, 'span', 'Norm').filter(s => /[\d,.]/.test(s))

    if (names.length > 0) {
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        const priceMatch = html.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{1,300}?(\\d+[\\d.,]*\\s*,\\s*\\d{2})'))
        const price = priceMatch ? parseBRL(priceMatch[1]) : 0
        if (name && price > 0) {
          items.push({ name, quantity: 1, unit: 'un', unitPrice: price, totalPrice: price })
        }
      }
    }
  }

  // Estratégia 3: padrão genérico — linhas com preço
  if (items.length === 0) {
    const lines = html.replace(/<[^>]+>/g, '\n').split('\n').map(l => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const priceMatch = line.match(/R?\$?\s*(\d[\d.]*,\d{2})$/)
      if (priceMatch && line.length > 5 && !/total|desconto|frete|taxa/i.test(line)) {
        const price = parseBRL(priceMatch[1])
        const name = line.replace(priceMatch[0], '').trim()
        if (name.length > 2 && price > 0) {
          items.push({ name, quantity: 1, unit: 'un', unitPrice: price, totalPrice: price })
        }
      }
    }
  }

  return { storeName, date, items: items.slice(0, 50), total }
}
