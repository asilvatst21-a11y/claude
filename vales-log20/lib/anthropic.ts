const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

interface ReposicaoNormalizada {
  produto: string;
  quantidade: string;
  mapa: string;
  cliente: string;
  motivo: string;
  confianca: "alta" | "media" | "baixa";
}

export async function normalizarPedidoReposicao(
  texto: string
): Promise<ReposicaoNormalizada> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurado");

  const prompt = `Você é um assistente de logística para uma distribuidora de bebidas Ambev. Analise a mensagem abaixo de um motorista solicitando reposição de produto e extraia as informações estruturadas.

Mensagem: "${texto}"

Retorne APENAS um JSON válido com os campos:
- produto: nome do produto normalizado (ex: "Skol 600ml", "Brahma Lata 350ml")
- quantidade: quantidade com unidade (ex: "2 caixas", "1 fardo", "6 unidades")
- mapa: número do mapa/rota (apenas dígitos, ex: "12345")
- cliente: nome do cliente ou estabelecimento
- motivo: motivo da reposição (ex: "Produto avariado", "Produto faltante", "Produto errado", "Quebra no transporte")
- confianca: "alta" se extraiu bem todos os campos, "media" se há incerteza em algum, "baixa" se a mensagem está muito incompleta

Se um campo não for mencionado, use string vazia "".`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);

  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? "").trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // fall through to default
  }

  return { produto: "", quantidade: "", mapa: "", cliente: "", motivo: "", confianca: "baixa" };
}

export async function normalizarAudioReposicao(
  audioBase64: string,
  mimeType: string
): Promise<ReposicaoNormalizada> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurado");

  const prompt = `Você é um assistente de logística para uma distribuidora de bebidas Ambev. Transcreva o áudio abaixo de um motorista solicitando reposição de produto e extraia as informações estruturadas.

Retorne APENAS um JSON válido com os campos:
- produto: nome do produto normalizado (ex: "Skol 600ml", "Brahma Lata 350ml")
- quantidade: quantidade com unidade (ex: "2 caixas", "1 fardo")
- mapa: número do mapa/rota (apenas dígitos)
- cliente: nome do cliente ou estabelecimento
- motivo: motivo da reposição (ex: "Produto avariado", "Produto faltante", "Quebra no transporte")
- confianca: "alta" se extraiu bem, "media" se há incerteza, "baixa" se não conseguiu entender

Se um campo não for mencionado, use string vazia "".`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "audio-2025-12-17",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "audio",
              source: { type: "base64", media_type: mimeType, data: audioBase64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic audio API error: ${res.status}`);

  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? "").trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // fall through
  }

  return { produto: "", quantidade: "", mapa: "", cliente: "", motivo: "", confianca: "baixa" };
}

export async function verificarValidacao(
  texto: string
): Promise<"validado" | "negado" | "inconclusivo"> {
  if (!ANTHROPIC_API_KEY) return "inconclusivo";

  const prompt = `Analise a resposta abaixo de um supervisor sobre uma solicitação de reposição de produto e determine se ele VALIDOU (aprovou) ou NEGOU (rejeitou).

Resposta: "${texto}"

Retorne APENAS uma das palavras: validado, negado ou inconclusivo

Exemplos de validado: "ok", "pode", "autorizado", "sim", "confirma", "libera", "pode repor", "👍"
Exemplos de negado: "não", "neg", "negado", "não autorizo", "reprovar", "não pode", "nao"
Exemplos de inconclusivo: "quando?", "qual produto?", "me manda foto", "qual mapa?"`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return "inconclusivo";

  const data = await res.json();
  const result = (data.content?.[0]?.text ?? "").toLowerCase().trim();

  if (result.includes("validado")) return "validado";
  if (result.includes("negado")) return "negado";
  return "inconclusivo";
}
