import { supabase } from './supabase'
import type { OsAtendimento as OsAtendimentoParseada } from './tmlParser'

export interface OsAtendimento {
  os: number
  dataAbertura: string | null // yyyy-mm-dd
  horaAbertura: string | null // HH:MM
  placa: string | null
  statusOs: string | null
  tipoOs: string | null
  criticidade: string | null
  fornecedor: string | null
  problema: string | null
  servico: string | null
  usuarioCriacao: string | null
  observacao: string | null
  valorTotal: number | null
}

// Período de carregamento: 22h às 06h (mesmo corte usado na análise que
// mostrou 0% de correspondência entre trocas de placa e OS abertas nesse
// intervalo).
export function abertaDuranteCarregamento(horaAbertura: string | null): boolean {
  if (!horaAbertura) return false
  const hora = Number(horaAbertura.slice(0, 2))
  return hora >= 22 || hora <= 6
}

export async function importarOsAtendimento(filial: string, registros: OsAtendimentoParseada[]): Promise<number> {
  if (registros.length === 0) return 0
  const porOs = new Map(registros.map((r) => [r.os, r]))
  const linhas = [...porOs.values()].map((r) => ({
    filial,
    os: r.os,
    data_abertura: r.dataAbertura,
    hora_abertura: r.horaAbertura,
    placa: r.placa,
    status_os: r.statusOs,
    tipo_os: r.tipoOs,
    criticidade: r.criticidade,
    fornecedor: r.fornecedor,
    problema: r.problema,
    servico: r.servico,
    usuario_criacao: r.usuarioCriacao,
    observacao: r.observacao,
    valor_total: r.valorTotal,
    importado_em: new Date().toISOString(),
  }))

  const LOTE = 500
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await supabase
      .from('frota_os_atendimento')
      .upsert(linhas.slice(i, i + LOTE), { onConflict: 'filial,os' })
    if (error) throw new Error(error.message)
  }
  return linhas.length
}

export async function buscarOsAtendimento(filial: string): Promise<OsAtendimento[]> {
  const PAGINA = 1000
  const out: OsAtendimento[] = []

  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from('frota_os_atendimento')
      .select('os, data_abertura, hora_abertura, placa, status_os, tipo_os, criticidade, fornecedor, problema, servico, usuario_criacao, observacao, valor_total')
      .eq('filial', filial)
      .order('data_abertura')
      .range(offset, offset + PAGINA - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break

    for (const row of data) {
      out.push({
        os: row.os,
        dataAbertura: row.data_abertura,
        horaAbertura: row.hora_abertura,
        placa: row.placa,
        statusOs: row.status_os,
        tipoOs: row.tipo_os,
        criticidade: row.criticidade,
        fornecedor: row.fornecedor,
        problema: row.problema,
        servico: row.servico,
        usuarioCriacao: row.usuario_criacao,
        observacao: row.observacao,
        valorTotal: row.valor_total,
      })
    }

    if (data.length < PAGINA) break
  }

  return out
}

export interface MesOsAtendimento {
  mes: string // "2026-01"
  total: number
}

export function osAtendimentoPorMes(os: OsAtendimento[]): MesOsAtendimento[] {
  const porMes = new Map<string, number>()
  for (const o of os) {
    if (!o.dataAbertura) continue
    const mes = o.dataAbertura.slice(0, 7)
    porMes.set(mes, (porMes.get(mes) ?? 0) + 1)
  }
  return [...porMes.entries()]
    .map(([mes, total]) => ({ mes, total }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}
