import { supabase } from './supabase'

// ─── Consulta de Pendências — autoatendimento público (link enviado no aviso
// de WhatsApp). Colaborador se identifica pelos 3 primeiros dígitos do CPF
// (mesmo padrão da consulta de variável do armazém), vê as pendências sem
// valores e pode registrar uma justificativa prévia (texto ou áudio) antes
// da tratativa final do financeiro. ──────────────────────────────────────

export interface PendenciaItem {
  itemId: string
  valeId: string
  numeroVale: number
  data: string | null
  mapa: number | null
  produto: string | null
  unidade: string | null
  qtdeSaida: number | null
  qtdeRetorno: number | null
  qtdeDiferenca: number | null
  statusVale: string | null
  justificativaAjudante: string | null
}

export interface CandidatoPendencia {
  colaboradorId: string
  nome: string
  itens: PendenciaItem[]
}

// Liga por matrícula Promax (mesma convenção já usada em Colaboradores.tsx
// pra sincronizar telefone): colaboradores.matricula_promax === ajudantes.codigo.
async function buscarCandidatosPorCpf(digitos: string): Promise<{ colaboradorId: string; nome: string; matriculaPromax: string }[]> {
  const { data } = await supabase
    .from('colaboradores')
    .select('id, nome, cpf, matricula_promax, funcao, status')
    .like('cpf', `${digitos}%`)

  return (data ?? [])
    .filter((c) =>
      c.matricula_promax &&
      /AJUDANTE|MOTORISTA/i.test(c.funcao ?? '') &&
      (c.status ?? '').toUpperCase() !== 'DESLIGADO',
    )
    .map((c) => ({ colaboradorId: c.id as string, nome: c.nome as string, matriculaPromax: c.matricula_promax as string }))
}

export async function buscarPendenciasPorCpf(digitos: string): Promise<CandidatoPendencia[]> {
  const candidatos = await buscarCandidatosPorCpf(digitos)
  if (candidatos.length === 0) return []

  const codigos = [...new Set(candidatos.map((c) => Number(c.matriculaPromax)).filter((n) => !Number.isNaN(n)))]
  if (codigos.length === 0) return []

  const { data } = await supabase
    .from('ajudantes')
    .select(`
      codigo,
      vale_ajudantes (
        vales (
          id, numero_vale, data_rota, mapa, status_vale,
          vale_itens ( id, item, unidade, qtde_saida, qtde_retorno, qtde_diferenca, justificativa_ajudante )
        )
      )
    `)
    .in('codigo', codigos)

  const itensPorCodigo = new Map<number, PendenciaItem[]>()
  for (const aj of (data ?? []) as any[]) {
    const itens: PendenciaItem[] = []
    for (const va of aj.vale_ajudantes ?? []) {
      const v = va.vales
      if (!v) continue
      for (const it of v.vale_itens ?? []) {
        if (!it.qtde_diferenca) continue
        itens.push({
          itemId: it.id,
          valeId: v.id,
          numeroVale: v.numero_vale,
          data: v.data_rota,
          mapa: v.mapa,
          produto: it.item,
          unidade: it.unidade,
          qtdeSaida: it.qtde_saida,
          qtdeRetorno: it.qtde_retorno,
          qtdeDiferenca: it.qtde_diferenca,
          statusVale: v.status_vale,
          justificativaAjudante: it.justificativa_ajudante,
        })
      }
    }
    itensPorCodigo.set(aj.codigo, itens)
  }

  return candidatos
    .map((c) => ({ colaboradorId: c.colaboradorId, nome: c.nome, itens: itensPorCodigo.get(Number(c.matriculaPromax)) ?? [] }))
    .filter((c) => c.itens.length > 0)
}

export async function enviarJustificativaPendencia(itemId: string, texto: string): Promise<boolean> {
  const { error } = await supabase.from('vale_itens').update({ justificativa_ajudante: texto }).eq('id', itemId)
  return !error
}

export async function consultaPendenciasEstaAtiva(): Promise<boolean> {
  const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'consulta_pendencias_ativa').maybeSingle()
  return data?.valor === 'true'
}

// Base64 em blocos, pra não estourar o limite de argumentos do spread em
// áudios maiores.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export async function transcreverAudioPendencia(blob: Blob): Promise<string | null> {
  const buf = await blob.arrayBuffer()
  const audioBase64 = arrayBufferToBase64(buf)
  try {
    const resp = await fetch('/api/consulta-pendencias-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm' }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.texto || null
  } catch {
    return null
  }
}
