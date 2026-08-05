import { supabase } from './supabase'

export type PerfilVaga = 'toco' | 'truck' | 'vuc'

export const PERFIL_LABEL: Record<PerfilVaga, string> = {
  toco: 'Toco',
  truck: 'Truck',
  vuc: 'VUC',
}

// Mesmas cores usadas no layout original em Excel (tema Office: accent1 azul
// pro bloco Toco/Truck, accent2 vermelho pras vagas de VUC).
export const PERFIL_COR: Record<PerfilVaga, string> = {
  toco: '#4f81bd',
  truck: '#2f5f8a',
  vuc: '#c0504d',
}

export interface Ponto { x: number; y: number }

export interface FormaVaga {
  id: string
  tipo: 'vaga'
  perfil: PerfilVaga
  label: string
  cor: string
  pontos: [Ponto, Ponto] // canto A e canto B do retângulo
}

export interface FormaFaixa {
  id: string
  tipo: 'faixa'
  label: string
  pontos: Ponto[] // polilinha (2+ pontos)
}

export type Forma = FormaVaga | FormaFaixa

export interface LayoutPatio {
  imagemUrl: string | null
  desenho: Forma[]
  atualizadoEm: string | null
  atualizadoPor: string | null
}

export async function buscarLayoutPatio(filial: string): Promise<LayoutPatio> {
  const { data, error } = await supabase
    .from('armazem_layout_patio')
    .select('imagem_url, desenho, atualizado_em, atualizado_por')
    .eq('filial', filial)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    imagemUrl: data?.imagem_url ?? null,
    desenho: (data?.desenho as Forma[] | null) ?? [],
    atualizadoEm: data?.atualizado_em ?? null,
    atualizadoPor: data?.atualizado_por ?? null,
  }
}

export async function salvarLayoutPatio(
  filial: string,
  layout: { imagemUrl: string | null; desenho: Forma[] },
  usuarioNome: string
): Promise<void> {
  const { error } = await supabase.from('armazem_layout_patio').upsert(
    {
      filial,
      imagem_url: layout.imagemUrl,
      desenho: layout.desenho,
      atualizado_em: new Date().toISOString(),
      atualizado_por: usuarioNome,
    },
    { onConflict: 'filial' }
  )
  if (error) throw new Error(error.message)
}

export async function enviarImagemFundoPatio(file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('armazem-layout-patio').upload(path, file, { upsert: true })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('armazem-layout-patio').getPublicUrl(path)
  return data.publicUrl
}
