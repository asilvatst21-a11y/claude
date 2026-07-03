import { supabase } from './supabase'

export interface PesoCadastradoPlaca {
  id: string
  filial: string
  placa: string
  peso_tara: number | null
  peso_lotacao: number | null
  importado_em: string | null
  foto_tara_url: string | null
  foto_tara_em: string | null
  created_at: string
}

// Peso de referência usado no cálculo de excesso: a Lotação cadastrada no
// Frota Legal (peso máximo de carga da placa).
export function pesoReferencia(p: Pick<PesoCadastradoPlaca, 'peso_lotacao'>): number | null {
  return p.peso_lotacao ?? null
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
