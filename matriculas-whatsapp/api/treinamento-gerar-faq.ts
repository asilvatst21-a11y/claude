/// <reference types="node" />

// Recebe o material de um treinamento (PDF ou PPTX), extrai o texto e gera,
// via IA, uma lista de perguntas e respostas prováveis — que o palestrante
// revisa e edita antes de publicar (ver src/pages/Treinamentos.tsx).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL = 'claude-haiku-4-5'

// Limite de caracteres do texto extraído mandado pra IA — material grande
// (apresentação longa) não precisa ir inteiro pra gerar boas perguntas, e
// evita gastar tokens à toa.
const LIMITE_TEXTO = 16000

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}

async function extrairTextoPdf(buf: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>
  const resultado = await pdfParse(buf)
  return (resultado.text ?? '').trim()
}

// PPTX é um .zip com um arquivo ppt/slides/slideN.xml por slide; o texto de
// cada caixa fica em tags <a:t>. Concatena todos os slides, em ordem.
async function extrairTextoPptx(buf: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const nomes = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10)
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10)
      return na - nb
    })
  const textosPorSlide: string[] = []
  for (const nome of nomes) {
    const xml = await zip.files[nome].async('string')
    const textos = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])
    if (textos.length) textosPorSlide.push(textos.join(' '))
  }
  return textosPorSlide.join('\n\n').trim()
}

interface FaqGerada { pergunta: string; resposta: string }

async function gerarFaqComIA(texto: string): Promise<FaqGerada[]> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada')
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system:
        'Você recebe o conteúdo de um material de treinamento (segurança do trabalho, procedimento operacional, ' +
        'logística, etc.) aplicado numa matinal de colaboradores de distribuição. Gere de 5 a 8 perguntas que um ' +
        'colaborador provavelmente teria depois do treinamento, cada uma com a resposta correta com base SOMENTE ' +
        'no conteúdo fornecido. Perguntas objetivas e práticas, do jeito que um motorista ou ajudante perguntaria ' +
        '(linguagem simples, direta). Respostas curtas (1-3 frases). Não invente informação que não está no material.',
      messages: [{ role: 'user', content: texto }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              faq: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { pergunta: { type: 'string' }, resposta: { type: 'string' } },
                  required: ['pergunta', 'resposta'],
                  additionalProperties: false,
                },
              },
            },
            required: ['faq'],
            additionalProperties: false,
          },
        },
      },
    }),
  })
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '')
    throw new Error(`Claude HTTP ${resp.status}: ${corpo}`)
  }
  const data: any = await resp.json()
  const bloco = (data.content ?? []).find((b: any) => b.type === 'text')
  if (!bloco?.text) throw new Error('Claude sem bloco de texto')
  const parsed = JSON.parse(bloco.text)
  return Array.isArray(parsed.faq) ? parsed.faq : []
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Método não permitido' })
    return
  }
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const nomeArquivo = String(body.nomeArquivo ?? '').trim()
  const mimeType = String(body.mimeType ?? '').trim()
  const base64 = String(body.base64 ?? '')
  if (!nomeArquivo || !base64) {
    res.status(400).json({ erro: 'Envie o arquivo (nomeArquivo + base64).' })
    return
  }

  const ehPdf = mimeType.includes('pdf') || /\.pdf$/i.test(nomeArquivo)
  const ehPptx = mimeType.includes('presentation') || /\.pptx$/i.test(nomeArquivo)
  if (!ehPdf && !ehPptx) {
    res.status(400).json({ erro: 'Só é possível enviar arquivos PDF ou PPTX (apresentação).' })
    return
  }

  try {
    const buf = Buffer.from(base64, 'base64')
    const textoCompleto = ehPdf ? await extrairTextoPdf(buf) : await extrairTextoPptx(buf)
    if (!textoCompleto || textoCompleto.length < 30) {
      res.status(422).json({
        erro: 'Não conseguimos extrair texto legível deste arquivo (pode ser um PDF escaneado/imagem). ' +
          'Tente um arquivo com texto selecionável ou uma apresentação com o conteúdo escrito nos slides.',
      })
      return
    }
    const textoParaIA = textoCompleto.slice(0, LIMITE_TEXTO)
    const faq = await gerarFaqComIA(textoParaIA)
    if (faq.length === 0) {
      res.status(422).json({ erro: 'A IA não conseguiu gerar perguntas a partir deste material. Tente adicionar as perguntas manualmente.' })
      return
    }
    // Guarda só um recorte do texto extraído (referência/auditoria) — não precisa do documento inteiro no banco.
    res.status(200).json({ conteudoExtraido: textoCompleto.slice(0, 4000), faq })
  } catch (e) {
    console.error('treinamento-gerar-faq exception:', e)
    res.status(500).json({ erro: e instanceof Error ? e.message : 'Erro ao processar o arquivo.' })
  }
}
