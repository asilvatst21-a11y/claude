import { supabase } from './supabase'

export interface PesoCadastradoPlaca {
  id: string
  filial: string
  placa: string
  peso_freightech: number | null
  peso_frota_legal: number | null
  importado_freightech_em: string | null
  importado_frota_legal_em: string | null
  foto_tara_url: string | null
  foto_tara_em: string | null
  created_at: string
}

// Peso de referência usado no cálculo de excesso: o menor valor cadastrado
// entre Freightech e Frota Legal (mais conservador — evita deixar passar
// excesso enquanto a divergência de cadastro não é corrigida). Se só uma
// fonte tem a placa cadastrada, usa essa; se nenhuma tem, não há referência.
export function pesoReferencia(p: Pick<PesoCadastradoPlaca, 'peso_freightech' | 'peso_frota_legal'>): number | null {
  if (p.peso_freightech != null && p.peso_frota_legal != null) {
    return Math.min(p.peso_freightech, p.peso_frota_legal)
  }
  return p.peso_freightech ?? p.peso_frota_legal ?? null
}

export function divergente(p: Pick<PesoCadastradoPlaca, 'peso_freightech' | 'peso_frota_legal'>): boolean {
  return p.peso_freightech != null && p.peso_frota_legal != null && p.peso_freightech !== p.peso_frota_legal
}

export async function buscarPesoCadastrado(filial: string): Promise<PesoCadastradoPlaca[]> {
  const { data } = await supabase
    .from('peso_cadastrado_placas')
    .select('*')
    .eq('filial', filial)
    .order('placa')
  return data ?? []
}

export interface EscalaComPeso {
  mapa: number
  placa: string | null
  peso_carregado: number | null
}

export type SituacaoExcesso = 'dentro_limite' | 'excesso' | 'sem_referencia' | 'sem_peso_carregado'

export interface LinhaExcessoPeso {
  mapa: number
  placa: string
  pesoReferencia: number | null
  pesoCarregado: number | null
  excesso: number | null
  situacao: SituacaoExcesso
}

// Cruza a escala do dia (já importada em Distribuição → Carta de Controle
// TML, tabela escalas_tml) com o peso cadastrado por placa. Não lê nenhum
// arquivo aqui — só consulta o que outra tela já colocou no banco.
export async function buscarEscalaComPesoHoje(filial: string, data: string): Promise<EscalaComPeso[]> {
  const { data: escalas } = await supabase
    .from('escalas_tml')
    .select('mapa, placa, peso_carregado')
    .eq('filial', filial)
    .eq('data_entrega', data)
  return escalas ?? []
}

export function calcularExcessoPeso(
  escalas: EscalaComPeso[],
  pesosCadastrados: PesoCadastradoPlaca[],
): LinhaExcessoPeso[] {
  const pesoPorPlaca = new Map(pesosCadastrados.map((p) => [p.placa, p]))

  return escalas
    .filter((e) => e.placa)
    .map((e) => {
      const placa = e.placa!.toUpperCase()
      const cadastro = pesoPorPlaca.get(placa)
      const referencia = cadastro ? pesoReferencia(cadastro) : null
      const carregado = e.peso_carregado

      let situacao: SituacaoExcesso
      let excesso: number | null = null
      if (referencia == null) {
        situacao = 'sem_referencia'
      } else if (carregado == null) {
        situacao = 'sem_peso_carregado'
      } else {
        excesso = carregado - referencia
        situacao = excesso > 0 ? 'excesso' : 'dentro_limite'
      }

      return { mapa: e.mapa, placa, pesoReferencia: referencia, pesoCarregado: carregado, excesso, situacao }
    })
    .sort((a, b) => a.mapa - b.mapa)
}
