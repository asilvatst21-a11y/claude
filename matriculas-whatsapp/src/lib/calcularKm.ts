export interface ResultadoKm {
  kmIda: number
  kmIdaVolta: number
  enderecoFormatado: string
}

export interface ResultadoSugestoes {
  sugestoes: string[]
  detalhe?: string
}

export async function buscarSugestoesEndereco(input: string): Promise<ResultadoSugestoes> {
  try {
    const resp = await fetch('/api/autocomplete-endereco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    })
    const data = await resp.json()
    return {
      sugestoes: Array.isArray(data?.sugestoes) ? data.sugestoes : [],
      detalhe: data?.detalhe,
    }
  } catch (e) {
    return { sugestoes: [], detalhe: e instanceof Error ? e.message : 'Erro de conexão' }
  }
}

export async function calcularKmIdaVolta(endereco: string): Promise<ResultadoKm | { erro: string }> {
  try {
    const resp = await fetch('/api/calcular-km', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endereco }),
    })
    const data = await resp.json()
    if (!resp.ok || data?.erro) return { erro: data?.erro ?? 'Erro ao calcular o KM.' }
    return data as ResultadoKm
  } catch {
    return { erro: 'Erro de conexão ao calcular o KM.' }
  }
}
