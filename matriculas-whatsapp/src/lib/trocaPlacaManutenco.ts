import { supabase } from './supabase'

export interface TrocaPlaca {
  mapa: number
  data: string // yyyy-mm-dd
  placaGerado: string
  placaCarregado: string
}

export interface OsNoturna {
  data: string // formato do Excel: "DD/MM/YYYY HH:MM"
  os: string | number
  placa: string
  tipoOs: string
  problema: string
  horario: number // hora (0-23)
}

// Buscar trocas de placa do 031120 (Mapa em Gerado vs Carregado)
// Filtra CRW e REC automaticamente
export async function buscarTrocasPlacaArmazem(filial: string, dataInicio?: string, dataFim?: string): Promise<TrocaPlaca[]> {
  const PAGINA = 1000
  const trocas: TrocaPlaca[] = []
  const mapasAgrupados = new Map<number, { gerado?: string; carregado?: string; data?: string }>()

  // Paginar pois pode ter muitos dados
  for (let offset = 0; ; offset += PAGINA) {
    let query = supabase
      .from('mapa_fase')
      .select('mapa, data_operacao, placa, fase')
      .eq('filial', filial)
      .in('fase', ['Gerado', 'Carregado'])
      .order('mapa')
      .order('data_operacao')
      .range(offset, offset + PAGINA - 1)

    if (dataInicio) query = query.gte('data_operacao', dataInicio)
    if (dataFim) query = query.lte('data_operacao', dataFim)

    const { data, error } = await query

    if (error) throw new Error(error.message)
    if (!data?.length) break

    for (const row of data) {
      // Filtrar CRW e REC
      if (row.placa?.includes('CRW') || row.placa?.includes('REC')) continue

      const mapa = row.mapa
      if (!mapasAgrupados.has(mapa)) {
        mapasAgrupados.set(mapa, {})
      }
      const info = mapasAgrupados.get(mapa)!

      if (row.fase?.trim() === 'Gerado') {
        info.gerado = row.placa
        info.data = row.data_operacao
      } else if (row.fase?.trim() === 'Carregado') {
        info.carregado = row.placa
      }
    }

    if (data.length < PAGINA) break
  }

  // Extrair trocas onde placa mudou
  for (const [mapa, info] of mapasAgrupados) {
    if (info.gerado && info.carregado && info.gerado !== info.carregado && info.data) {
      trocas.push({
        mapa,
        data: info.data,
        placaGerado: info.gerado,
        placaCarregado: info.carregado,
      })
    }
  }

  return trocas.sort((a, b) => a.data.localeCompare(b.data))
}

// Buscar OS noturnas (22h-06h) para um período
// Retorna dados estruturados prontos para correlacionar
export async function buscarOsNoturnas(
  filial: string,
  dataInicio: string,
  dataFim: string
): Promise<OsNoturna[]> {
  // Nota: essa função é um placeholder para a implementação futura
  // Por enquanto, retorna um array vazio
  // A integração real dependerá de como os dados de OS estão armazenados no Supabase
  console.warn('buscarOsNoturnas: função ainda não integrada com dados reais de OS')
  return []
}

// Correlacionar uma troca de placa com possíveis OS noturnas
export function correlacionarTrocaComOs(
  troca: TrocaPlaca,
  osNoturnas: OsNoturna[]
): OsNoturna[] {
  const dataTroca = troca.data // yyyy-mm-dd
  const placas = [troca.placaGerado, troca.placaCarregado]

  // Buscar OS para as placas no mesmo dia ou dia seguinte
  return osNoturnas.filter(os => {
    const dataOs = os.data.substring(0, 10).split('/').reverse().join('-') // Converter DD/MM/YYYY para yyyy-mm-dd
    return (
      placas.includes(os.placa) &&
      (dataOs === dataTroca || dataOs === new Date(new Date(dataTroca).getTime() + 86400000).toISOString().split('T')[0])
    )
  })
}

// Calcular estatísticas
export function calcularEstatisticas(trocas: TrocaPlaca[], osNoturnas: OsNoturna[]) {
  const trocasComOs = trocas.filter(t => correlacionarTrocaComOs(t, osNoturnas).length > 0)
  return {
    totalTrocas: trocas.length,
    trocasComOs: trocasComOs.length,
    trocasSemOs: trocas.length - trocasComOs.length,
    cobertura: trocas.length > 0 ? (trocasComOs.length / trocas.length * 100).toFixed(1) : '0',
  }
}
