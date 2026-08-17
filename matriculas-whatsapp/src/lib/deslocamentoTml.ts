import { supabase } from './supabase'
import { gatilhoEstouroMinutos, diaDaSemana, type GatilhoEstouroParam } from './tml'

// ── Histórico Mensal / Tabelão do IV de Deslocamento, por motorista ──────
// Mesmo padrão do RV Armazém (src/lib/variavelArmazem.ts): agrega
// checklist_tml (que já carrega tempo_deslocamento_minutos calculado, seja
// pelo timer real da matinal ou pelo padrão da sala) por motorista × mês.
// Pagina com .range() — sem isso, uma tabela grande corta o resultado no
// limite padrão de 1000 linhas do PostgREST (mesmo bug já corrigido em
// Gsdpq.tsx e no import de RV Armazém).
const PAGINA = 1000

// Checklist de domingo não é dia de operação normal (mesmo filtro já usado
// em DistribuicaoTMLDeslocamento.tsx) — fica de fora de toda conta aqui.
function diaValido(data: string): boolean {
  return diaDaSemana(data) !== 0
}

async function buscarGatilhos(filial: string): Promise<GatilhoEstouroParam[]> {
  const { data } = await supabase.from('tml_gatilho_estouro')
    .select('deslocamento_ideal_minutos, deslocamento_estouro_minutos, vigente_a_partir')
    .eq('filial', filial)
  return data ?? []
}

export interface MesDeslocamento {
  mes: string // "2026-01"
  tempoMedioMinutos: number
  diasComChecklist: number
  diasComEstouro: number
}

export interface EstouroDeslocamento {
  data: string
  tempoMinutos: number
  motivo: string | null
}

export interface HistoricoMensalMotorista {
  nome: string
  meses: MesDeslocamento[]
  estourosPorMes: Record<string, EstouroDeslocamento[]>
}

export interface MotoristaComDeslocamento { nome: string }

export async function listarMotoristasComDeslocamento(filial: string): Promise<MotoristaComDeslocamento[]> {
  const nomes = new Set<string>()
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase.from('checklist_tml')
      .select('nome')
      .eq('filial', filial)
      .not('nome', 'is', null)
      .not('tempo_deslocamento_minutos', 'is', null)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('listarMotoristasComDeslocamento error:', error.message); break }
    for (const r of data ?? []) { if (r.nome) nomes.add(r.nome) }
    if (!data || data.length < PAGINA) break
  }
  return [...nomes].map((nome) => ({ nome })).sort((a, b) => a.nome.localeCompare(b.nome))
}

export async function buscarHistoricoMensalDeslocamento(filial: string, nome: string): Promise<HistoricoMensalMotorista> {
  const gatilhos = await buscarGatilhos(filial)
  const linhas: { data: string; tempo: number; motivo: string | null }[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase.from('checklist_tml')
      .select('data, tempo_deslocamento_minutos, motivo')
      .eq('filial', filial)
      .eq('nome', nome)
      .not('tempo_deslocamento_minutos', 'is', null)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('buscarHistoricoMensalDeslocamento error:', error.message); break }
    for (const r of data ?? []) {
      const d = String(r.data)
      if (!diaValido(d)) continue
      linhas.push({ data: d, tempo: Number(r.tempo_deslocamento_minutos), motivo: r.motivo })
    }
    if (!data || data.length < PAGINA) break
  }

  const porMes = new Map<string, { soma: number; dias: number; estouro: number }>()
  const estourosPorMes: Record<string, EstouroDeslocamento[]> = {}
  for (const l of linhas) {
    const mes = l.data.slice(0, 7)
    const acc = porMes.get(mes) ?? { soma: 0, dias: 0, estouro: 0 }
    acc.soma += l.tempo
    acc.dias += 1
    const { estouro } = gatilhoEstouroMinutos(l.data, gatilhos)
    if (l.tempo > estouro) {
      acc.estouro += 1
      if (!estourosPorMes[mes]) estourosPorMes[mes] = []
      estourosPorMes[mes].push({ data: l.data, tempoMinutos: l.tempo, motivo: l.motivo })
    }
    porMes.set(mes, acc)
  }
  for (const arr of Object.values(estourosPorMes)) arr.sort((a, b) => b.data.localeCompare(a.data))

  const meses: MesDeslocamento[] = [...porMes.entries()]
    .map(([mes, v]) => ({ mes, tempoMedioMinutos: v.dias > 0 ? v.soma / v.dias : 0, diasComChecklist: v.dias, diasComEstouro: v.estouro }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  return { nome, meses, estourosPorMes }
}

// ── Tabelão (todo mundo × todos os meses) ────────────────────────────────
export interface TabelaoDeslocamentoLinha {
  nome: string
  porMes: Record<string, { tempoMedioMinutos: number; diasComChecklist: number; diasComEstouro: number }>
}

export interface TabelaoDeslocamento {
  meses: string[]
  linhas: TabelaoDeslocamentoLinha[]
}

export async function buscarTabelaoDeslocamento(filial: string): Promise<TabelaoDeslocamento> {
  const gatilhos = await buscarGatilhos(filial)
  const linhas: { nome: string; data: string; tempo: number }[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase.from('checklist_tml')
      .select('nome, data, tempo_deslocamento_minutos')
      .eq('filial', filial)
      .not('nome', 'is', null)
      .not('tempo_deslocamento_minutos', 'is', null)
      .range(inicio, inicio + PAGINA - 1)
    if (error) { console.error('buscarTabelaoDeslocamento error:', error.message); break }
    for (const r of data ?? []) {
      const d = String(r.data)
      if (!diaValido(d)) continue
      linhas.push({ nome: r.nome as string, data: d, tempo: Number(r.tempo_deslocamento_minutos) })
    }
    if (!data || data.length < PAGINA) break
  }

  const mesesSet = new Set<string>()
  const porNome = new Map<string, Map<string, { soma: number; dias: number; estouro: number }>>()
  for (const l of linhas) {
    const mes = l.data.slice(0, 7)
    mesesSet.add(mes)
    if (!porNome.has(l.nome)) porNome.set(l.nome, new Map())
    const porMes = porNome.get(l.nome)!
    const acc = porMes.get(mes) ?? { soma: 0, dias: 0, estouro: 0 }
    acc.soma += l.tempo
    acc.dias += 1
    const { estouro } = gatilhoEstouroMinutos(l.data, gatilhos)
    if (l.tempo > estouro) acc.estouro += 1
    porMes.set(mes, acc)
  }

  const meses = [...mesesSet].sort()
  const tabelaoLinhas: TabelaoDeslocamentoLinha[] = [...porNome.entries()]
    .map(([nome, porMes]) => ({
      nome,
      porMes: Object.fromEntries([...porMes.entries()].map(([mes, v]) => [
        mes, { tempoMedioMinutos: v.dias > 0 ? v.soma / v.dias : 0, diasComChecklist: v.dias, diasComEstouro: v.estouro },
      ])),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  return { meses, linhas: tabelaoLinhas }
}
