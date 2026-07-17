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
  ajudanteId: string
  data: string | null
  mapa: number | null
  produto: string | null
  unidade: string | null
  qtdeSaida: number | null
  qtdeRetorno: number | null
  qtdeDiferenca: number | null
  statusVale: string | null
  justificativaPrevia: string | null
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
      id, codigo,
      vale_ajudantes (
        vales (
          id, numero_vale, data_rota, mapa, status_vale,
          vale_itens ( id, item, unidade, qtde_saida, qtde_retorno, qtde_diferenca )
        )
      )
    `)
    .in('codigo', codigos)

  const ajudantes = (data ?? []) as any[]

  // Vale com 2 ajudantes: os itens são do vale (a diferença não é de uma
  // pessoa só), então os dois recebem o aviso de WhatsApp e os dois podem
  // ver e justificar — cada um só vê a PRÓPRIA justificativa, gravada por
  // ajudante_id, nunca a do colega.
  const itensPorAjudanteId = new Map<string, PendenciaItem[]>()
  const todosItemIds: string[] = []
  for (const aj of ajudantes) {
    const itens: Omit<PendenciaItem, 'justificativaPrevia'>[] = []
    for (const va of aj.vale_ajudantes ?? []) {
      const v = va.vales
      if (!v) continue
      for (const it of v.vale_itens ?? []) {
        if (!it.qtde_diferenca) continue
        itens.push({
          itemId: it.id,
          valeId: v.id,
          numeroVale: v.numero_vale,
          ajudanteId: aj.id,
          data: v.data_rota,
          mapa: v.mapa,
          produto: it.item,
          unidade: it.unidade,
          qtdeSaida: it.qtde_saida,
          qtdeRetorno: it.qtde_retorno,
          qtdeDiferenca: it.qtde_diferenca,
          statusVale: v.status_vale,
        })
        todosItemIds.push(it.id)
      }
    }
    itensPorAjudanteId.set(aj.id, itens as PendenciaItem[])
  }

  const justificativaPorChave = new Map<string, string>()
  if (todosItemIds.length > 0) {
    const { data: justificativas } = await supabase
      .from('pendencia_justificativas')
      .select('vale_item_id, ajudante_id, texto')
      .in('vale_item_id', [...new Set(todosItemIds)])
      .in('ajudante_id', ajudantes.map((aj) => aj.id))
    for (const j of justificativas ?? []) {
      justificativaPorChave.set(`${j.ajudante_id}|${j.vale_item_id}`, j.texto)
    }
  }

  const itensPorCodigo = new Map<number, PendenciaItem[]>()
  for (const aj of ajudantes) {
    const itens = (itensPorAjudanteId.get(aj.id) ?? []).map((item) => ({
      ...item,
      justificativaPrevia: justificativaPorChave.get(`${aj.id}|${item.itemId}`) ?? null,
    }))
    itensPorCodigo.set(aj.codigo, itens)
  }

  return candidatos
    .map((c) => ({ colaboradorId: c.colaboradorId, nome: c.nome, itens: itensPorCodigo.get(Number(c.matriculaPromax)) ?? [] }))
    .filter((c) => c.itens.length > 0)
}

export async function enviarJustificativaPendencia(itemId: string, ajudanteId: string, texto: string): Promise<boolean> {
  const { error } = await supabase
    .from('pendencia_justificativas')
    .upsert({ vale_item_id: itemId, ajudante_id: ajudanteId, texto, criado_em: new Date().toISOString() }, { onConflict: 'vale_item_id,ajudante_id' })
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
