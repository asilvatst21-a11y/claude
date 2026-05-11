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
      },
      redirect: 'follow'
    })

    if (!response.ok) throw new Error(`Erro ao acessar a Sefaz: ${response.status}`)
    const html = await response.text()
    const finalUrl = response.url || url
    const data = parseSefazHTML(html, finalUrl)

    if (!data.items || data.items.length === 0) {
      throw new Error('Não foi possível extrair os produtos. O site da Sefaz pode ter expirado a sessão — use o botão "Fotografar QR Code" diretamente no app.')
    }

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
  const cleaned = String(s).replace(/[^\d,]/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function stripTags(s) {
  return s ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

function parseSefazHTML(html, url) {
  const today = new Date().toISOString().slice(0, 10)

  // Detecta estado pela URL
  const isRJ = /fazenda\.rj\.gov\.br/i.test(url)
  const isSP = /fazenda\.sp\.gov\.br/i.test(url)
  const isMG = /fazenda\.mg\.gov\.br/i.test(url)

  // Nome da loja
  let storeName = ''
  const storePatterns = [
    // RJ específico
    /<span[^>]*id=["'][^"']*nomeEmit[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<td[^>]*class=["'][^"']*dadoEmit[^"']*["'][^>]*>([\s\S]*?)<\/td>/i,
    // Genérico
    /class=["']txEmp["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /class=["']NomeEmit["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /class=["']txtTit2["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
    /Raz[aã]o Social[^:]*:?\s*<[^>]+>\s*([\s\S]*?)<\//i,
  ]
  for (const p of storePatterns) {
    const m = html.match(p)
    if (m) { storeName = clean(stripTags(m[1])); if (storeName.length > 2) break }
  }
  if (!storeName) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch) storeName = clean(stripTags(titleMatch[1]))
  }
  if (!storeName) storeName = 'Fornecedor'

  // Data
  let date = today
  const dateMatch = html.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (dateMatch) date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

  // Total
  let total = 0
  const totalPatterns = [
    /(?:Valor Total|Total a Pagar|TOTAL\s*R\$)[^\d]*([\d.,]+)/i,
    /id=["'][^"']*totalNF[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /class=["'][^"']*total[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  ]
  for (const p of totalPatterns) {
    const m = html.match(p)
    if (m) { total = parseBRL(stripTags(m[1])); if (total > 0) break }
  }

  let items = []

  // === ESTRATÉGIA RJ ===
  if (isRJ || items.length === 0) {
    // RJ usa tabela com id/class específicos
    const rjPatterns = [
      /<tr[^>]*class=["'][^"']*(?:rich-table-row|itemProd|linhaDetalhe)[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi,
      /<tr[^>]*id=["'][^"']*item[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi,
    ]
    for (const pattern of rjPatterns) {
      let m
      while ((m = pattern.exec(html)) !== null) {
        const cells = (m[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => clean(stripTags(c)))
        if (cells.length >= 3) {
          const name = cells[0]
          const qty = parseBRL(cells[1])
          const unit = (cells[2] || 'un').toLowerCase().slice(0, 3)
          const unitPrice = cells[3] ? parseBRL(cells[3]) : 0
          const totalPrice = cells[4] ? parseBRL(cells[4]) : (cells[3] ? parseBRL(cells[3]) : qty * unitPrice)
          if (name && name.length > 1 && totalPrice > 0 && !/descri|produto|c[oó]d/i.test(name)) {
            items.push({ name, quantity: qty || 1, unit, unitPrice, totalPrice })
          }
        }
      }
      if (items.length > 0) break
    }
  }

  // === ESTRATÉGIA GENÉRICA — tabela de produtos ===
  if (items.length === 0) {
    // Tenta encontrar seção de produtos
    const prodSection = html.match(/(?:Produtos|Itens|Mercadorias)([\s\S]*?)(?:Totais|Informações|Pagamento|<\/table>)/i)
    const searchArea = prodSection ? prodSection[1] : html
    const rows = searchArea.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => clean(stripTags(c))).filter(Boolean)
      if (cells.length >= 4) {
        const name = cells[0]
        const qty = parseBRL(cells[1])
        const unit = (cells[2] || 'un').toLowerCase().slice(0, 3)
        const unitPrice = parseBRL(cells[3])
        const totalPrice = cells[4] ? parseBRL(cells[4]) : qty * unitPrice
        if (name && qty > 0 && totalPrice > 0 && !/descri|produto|c[oó]d|qtd|uni/i.test(name)) {
          items.push({ name, quantity: qty, unit, unitPrice, totalPrice })
        }
      }
    }
  }

  // === ESTRATÉGIA SP — classes txtTit ===
  if (items.length === 0) {
    const names = []
    const namePattern = /<span[^>]*class=["'][^"']*txtTit[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi
    let nm
    while ((nm = namePattern.exec(html)) !== null) names.push(clean(stripTags(nm[1])))

    for (const name of names) {
      if (!name || name.length < 2) continue
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const priceMatch = html.match(new RegExp(escaped + '[\\s\\S]{1,500}?(\\d+[\\d.]*,\\d{2})'))
      const price = priceMatch ? parseBRL(priceMatch[1]) : 0
      if (price > 0) items.push({ name, quantity: 1, unit: 'un', unitPrice: price, totalPrice: price })
    }
  }

  // === ESTRATÉGIA TEXTO PURO ===
  if (items.length === 0) {
    const text = html.replace(/<[^>]+>/g, '\n')
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (/total|desconto|frete|taxa|cnpj|cpf|obrigado|emiss/i.test(line)) continue
      const priceMatch = line.match(/(\d[\d.]*,\d{2})\s*$/)
      if (priceMatch && line.length > 4) {
        const price = parseBRL(priceMatch[1])
        const name = line.replace(priceMatch[0], '').trim()
        if (name.length > 2 && price > 0) {
          items.push({ name, quantity: 1, unit: 'un', unitPrice: price, totalPrice: price })
        }
      }
    }
  }

  return { storeName, date, items: items.slice(0, 60), total }
}
