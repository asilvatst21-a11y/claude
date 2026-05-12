const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
}

// Portais de consulta NFC-e por código de estado (2 primeiros dígitos da chave)
const STATE_GET_URLS = {
  '33': 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/paginas/resultadoNfce.faces?chNFe=',
  '35': 'https://www.nfce.fazenda.sp.gov.br/consulta?chNFe=',
  '31': 'https://nfce.fazenda.mg.gov.br/portalnfce/sistema/consultaarg.xhtml?p1=',
  '41': 'https://www.fazenda.pr.gov.br/nfce/consulta?chNFe=',
  '43': 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?chNFe=',
  '42': 'https://sat.sef.sc.gov.br/nfce/consulta?chNFe=',
  '29': 'http://nfe.sefaz.ba.gov.br/servicos/nfce/default.aspx?chNFe=',
  '23': 'http://nfce.sefaz.ce.gov.br/pages/showNFCe.html.faces?chNFe=',
  '53': 'https://dec.fazenda.df.gov.br/ConsultarNFCe.aspx?chNFe=',
  '52': 'https://www.economia.go.gov.br/portalnfce/sistema/consultaarg.xhtml?p1=',
  '51': 'https://www.sefaz.mt.gov.br/nfce/consultanfce?chNFe=',
  '50': 'https://www.dfe.ms.gov.br/nfce/consulta?chNFe=',
  '26': 'https://nfce.sefaz.pe.gov.br/nfce-web/consultarNFCe?chNFe=',
  '27': 'https://nfce.sefaz.al.gov.br/QRCode/consultarNFCe.jsp?chNFe=',
}

// Portal JSF do RJ — precisa buscar o ViewState antes de fazer POST
const RJ_FORM_URL = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/consultaQRCode.faces'

async function consultarPorChave(chaveLimpa) {
  const stateCode = chaveLimpa.slice(0, 2)

  // 1. Tenta GET direto no portal do estado detectado
  const stateUrl = STATE_GET_URLS[stateCode]
  if (stateUrl) {
    try {
      const res = await fetch(stateUrl + chaveLimpa, { headers: HEADERS, redirect: 'follow' })
      if (res.ok) {
        const html = await res.text()
        const data = parseSefazHTML(html, stateUrl + chaveLimpa)
        if (data.items && data.items.length > 0) return data
      }
    } catch { /* continua para o próximo método */ }
  }

  // 2. Para RJ: faz GET para pegar o ViewState e então POST no portal JSF
  if (stateCode === '33') {
    try {
      const getRes = await fetch(RJ_FORM_URL, { headers: HEADERS, redirect: 'follow' })
      const formHtml = await getRes.text()
      const cookies = getRes.headers.get('set-cookie') || ''

      const vsMatch = formHtml.match(/id=["']javax\.faces\.ViewState["'][^>]*value=["']([^"']+)["']/)
        || formHtml.match(/name=["']javax\.faces\.ViewState["'][^>]*value=["']([^"']+)["']/)
      const viewState = vsMatch ? vsMatch[1] : 'j_id1:j_id4'

      const formData = new URLSearchParams()
      formData.append('formulario', 'formulario')
      formData.append('formulario:chaveAcesso', chaveLimpa)
      formData.append('formulario:j_idt13', '')
      formData.append('javax.faces.ViewState', viewState)

      const postRes = await fetch(RJ_FORM_URL, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': RJ_FORM_URL,
          ...(cookies ? { Cookie: cookies } : {}),
        },
        body: formData.toString(),
        redirect: 'follow',
      })
      const html = await postRes.text()
      const data = parseSefazHTML(html, RJ_FORM_URL)
      if (data.items && data.items.length > 0) return data
    } catch { /* continua */ }
  }

  // 3. Fallback genérico: tenta GET com ?chNFe= no portal RJ (útil para chaves de acesso impresso)
  try {
    const fallbackUrl = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/paginas/resultadoNfce.faces?chNFe=${chaveLimpa}`
    const res = await fetch(fallbackUrl, { headers: HEADERS, redirect: 'follow' })
    if (res.ok) {
      const html = await res.text()
      const data = parseSefazHTML(html, fallbackUrl)
      if (data.items && data.items.length > 0) return data
    }
  } catch { /* sem resultado */ }

  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { url, chave } = req.body

  try {
    // Consulta por chave de acesso
    if (chave) {
      const chaveLimpa = chave.replace(/\D/g, '')
      if (chaveLimpa.length !== 44) {
        return res.status(400).json({ error: 'Chave de acesso inválida. Deve ter 44 dígitos.' })
      }

      const stateCode = chaveLimpa.slice(0, 2)
      const modelCode = chaveLimpa.slice(20, 22)

      // NF-e (modelo 55) é nota B2B — portal nacional exige reCAPTCHA, não consultável automaticamente
      if (modelCode === '55') {
        return res.status(422).json({
          error: 'Esta é uma NF-e (nota fiscal B2B, modelo 55). A consulta automática não é possível — use a opção "Foto da Nota" para extrair os produtos.',
          tipo: 'nfe'
        })
      }

      const data = await consultarPorChave(chaveLimpa)

      if (!data || !data.items || data.items.length === 0) {
        const stateSupported = !!STATE_GET_URLS[stateCode]
        const msg = stateSupported
          ? 'O portal da SEFAZ não retornou os produtos. Isso pode ocorrer quando o servidor está fora do Brasil. Use a opção "Foto da Nota" como alternativa.'
          : `Estado ${stateCode} não suportado na consulta por chave. Use a opção "Foto da Nota" ou o QR Code.`
        return res.status(500).json({ error: msg, tipo: 'portal_indisponivel' })
      }

      return res.json(data)
    }

    // Consulta por URL direta (QR Code)
    if (!url) return res.status(400).json({ error: 'URL ou chave não informada.' })

    const response = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    if (!response.ok) throw new Error(`Erro ao acessar a Sefaz: ${response.status}`)

    const html = await response.text()
    const data = parseSefazHTML(html, response.url || url)

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
    /class=["']nome-emitente["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
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
    /class=["'][^"']*total[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /Valor a pagar R\$[^<]*<[^>]+>([\s\S]*?)<\/span>/i,
    /Total\s*R\$\s*([\d.,]+)/i,
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
      || row.match(/class=["']nome-produto["'][^>]*>([\s\S]*?)<\/[^>]+>/)
    const name = nameMatch ? clean(stripTags(nameMatch[1])) : ''

    const qtdMatch = row.match(/Qtde\.:?\s*([\d.,]+)/i) || row.match(/Quantidade:?\s*([\d.,]+)/i)
    const quantity = qtdMatch ? parseBRL(qtdMatch[1]) : 1

    const unMatch = row.match(/UN:\s*([A-Za-z]+)/i) || row.match(/Unidade:\s*([A-Za-z]+)/i)
    const unit = unMatch ? unMatch[1].toLowerCase().slice(0, 3) : 'un'

    const unitPriceMatch = row.match(/Vl\. Unit\.:?\s*(?:&nbsp;)?\s*([\d.,]+)/i)
      || row.match(/Valor Unit\w*:?\s*([\d.,]+)/i)
    const unitPrice = unitPriceMatch ? parseBRL(unitPriceMatch[1]) : 0

    const totalMatch = row.match(/class=["']valor["'][^>]*>([\s\S]*?)<\/span>/i)
      || row.match(/class=["']valor-produto["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
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
