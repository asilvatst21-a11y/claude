export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { url, chave } = req.body

  try {
    let targetUrl = url

    // Se veio chave de acesso, monta a URL de consulta do RJ
    if (chave) {
      const chaveLimpa = chave.replace(/\D/g, '')
      if (chaveLimpa.length !== 44) {
        return res.status(400).json({ error: 'Chave de acesso inválida. Deve ter 44 dígitos.' })
      }
      targetUrl = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/consultaQRCode.faces`

      // Faz POST com a chave para o portal do RJ
      const formData = new URLSearchParams()
      formData.append('formulario', 'formulario')
      formData.append('formulario:chaveAcesso', chaveLimpa)
      formData.append('formulario:j_idt13', '')
      formData.append('javax.faces.ViewState', '')

      const postRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Referer': targetUrl,
        },
        body: formData.toString(),
        redirect: 'follow'
      })

      const html = await postRes.text()
      const data = parseSefazHTML(html, targetUrl)

      if (!data.items || data.items.length === 0) {
        // Tenta GET direto com a chave
        const getUrl = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/paginas/resultadoNfce.faces?chNFe=${chaveLimpa}`
        const getRes = await fetch(getUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          redirect: 'follow'
        })
        const html2 = await getRes.text()
        const data2 = parseSefazHTML(html2, getUrl)
        if (!data2.items || data2.items.length === 0) {
          return res.status(500).json({ error: 'Não foi possível extrair os produtos. Verifique se a chave está correta.' })
        }
        return res.json(data2)
      }

      return res.json(data)
    }

    // Consulta por URL direta
    if (!targetUrl) return res.status(400).json({ error: 'URL ou chave não informada.' })

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow'
    })

    if (!response.ok) throw new Error(`Erro ao acessar a Sefaz: ${response.status}`)
    const html = await response.text()
    const data = parseSefazHTML(html, response.url || targetUrl)

    if (!data.items || data.items.length === 0) {
      throw new Error('Não foi possível extrair os produtos da nota.')
    }

    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao consultar a Sefaz.' })
  }
}

function clean(s) {
  return s ? s.replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&Ocirc;/g, 'Ô').replace(/&#\d+;/g, '').trim() : ''
}

function parseBRL(s) {
  if (!s) return 0
  return parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0
}

function stripTags(s) {
  return s ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

function parseSefazHTML(html, url) {
  const today = new Date().toISOString().slice(0, 10)

  // Nome da loja
  let storeName = ''
  const storePatterns = [
    /class=["']txtTopo["'][^>]*>([\s\S]*?)<\/div>/i,
    /class=["']txEmp["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /class=["']NomeEmit["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
  ]
  for (const p of storePatterns) {
    const m = html.match(p)
    if (m) { storeName = clean(stripTags(m[1])); if (storeName.length > 2) break }
  }
  if (!storeName) storeName = 'Fornecedor'

  // Data
  let date = today
  const dateMatch = html.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (dateMatch) date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

  // Total
  let total = 0
  const totalPatterns = [
    /class=["'][^"']*totalNumb txtMax[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /Valor a pagar R\$[^<]*<[^>]+>([\s\S]*?)<\/span>/i,
  ]
  for (const p of totalPatterns) {
    const m = html.match(p)
    if (m) { total = parseBRL(stripTags(m[1])); if (total > 0) break }
  }

  const items = []

  // Formato RJ/SP — <tr id="Item + N">
  const rowPattern = /<tr[^>]*id=["']Item[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1]

    const nameMatch = row.match(/class=["']txtTit["'][^>]*>([\s\S]*?)(?:<span class=["']RCod|<\/span>)/)
    const name = nameMatch ? clean(stripTags(nameMatch[1])) : ''

    const qtdMatch = row.match(/Qtde\.:?\s*([\d.,]+)/i)
    const quantity = qtdMatch ? parseBRL(qtdMatch[1]) : 1

    const unMatch = row.match(/UN:\s*([A-Za-z]+)/i)
    const unit = unMatch ? unMatch[1].toLowerCase().slice(0, 3) : 'un'

    const unitPriceMatch = row.match(/Vl\. Unit\.:?\s*(?:&nbsp;)?\s*([\d.,]+)/i)
    const unitPrice = unitPriceMatch ? parseBRL(unitPriceMatch[1]) : 0

    const totalMatch = row.match(/class=["']valor["'][^>]*>([\s\S]*?)<\/span>/i)
    const totalPrice = totalMatch ? parseBRL(stripTags(totalMatch[1])) : quantity * unitPrice

    if (name && name.length > 1 && totalPrice > 0) {
      items.push({ name, quantity, unit, unitPrice, totalPrice })
    }
  }

  // Fallback — tabela genérica
  if (items.length === 0) {
    const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => clean(stripTags(c))).filter(Boolean)
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

  return { storeName, date, items: items.slice(0, 60), total }
}
