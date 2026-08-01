import { supabase } from './supabase'
import { enviarMensagemGrupo } from './zapi'

export interface ClienteChapaDescarga {
  id: string
  codigo: number
  nome: string
  ativo: boolean
  chapa_habilitado: boolean
  chapa_valor_a_cada_nota: number
  chapa_valor_por_chapa: number
  descarga_habilitado: boolean
  descarga_minimo_pallets: number
  descarga_valor_por_pallet: number | null
  created_at: string
  updated_at: string
}

export type TipoLancamento = 'chapa' | 'descarga'

export interface LancamentoChapaDescarga {
  id: string
  data: string
  cliente_codigo: number
  cliente_nome: string
  mapa: string | null
  tipo: TipoLancamento
  valor_nota: number | null
  quantidade_pallets: number | null
  valor_calculado: number
  dentro_parametro: boolean
  confirmado_fora_parametro: boolean
  comprovante_url: string | null
  filial: string | null
  registrado_por: string | null
  created_at: string
}

export interface ClienteComMapaHoje {
  cliente: ClienteChapaDescarga
  mapas: string[]
}

export interface ResultadoCalculo {
  valorCalculado: number
  dentroParametro: boolean
  detalhe: string
}

export async function listarClientes(): Promise<ClienteChapaDescarga[]> {
  const { data, error } = await supabase
    .from('financeiro_chapa_clientes')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw new Error(`Erro ao carregar clientes: ${error.message}`)
  return (data ?? []) as ClienteChapaDescarga[]
}

export async function salvarCliente(
  cliente: Partial<ClienteChapaDescarga> & { codigo: number; nome: string }
): Promise<void> {
  const { error } = await supabase
    .from('financeiro_chapa_clientes')
    .upsert({ ...cliente, updated_at: new Date().toISOString() }, { onConflict: 'codigo' })
  if (error) throw new Error(`Erro ao salvar cliente: ${error.message}`)
}

// Calcula o pagamento de Chapa: a cada X reais de nota, paga-se Y por chapa.
// Ex.: a cada R$ 8.000, 1 chapa de R$ 60 → floor(valorNota / 8000) chapas.
export function calcularChapa(
  valorNota: number,
  valorACadaNota: number,
  valorPorChapa: number
): ResultadoCalculo {
  const numChapas = valorACadaNota > 0 ? Math.floor(valorNota / valorACadaNota) : 0
  const valorCalculado = numChapas * valorPorChapa
  return {
    valorCalculado,
    dentroParametro: numChapas >= 1,
    detalhe: `${numChapas} chapa(s) (a cada R$ ${valorACadaNota.toLocaleString('pt-BR')} em nota, 1 chapa de R$ ${valorPorChapa.toLocaleString('pt-BR')})`,
  }
}

// Calcula o pagamento de Descarga Paletizada: acima do mínimo de pallets,
// paga-se um valor por pallet (varia por cliente).
export function calcularDescarga(
  quantidadePallets: number,
  minimoPallets: number,
  valorPorPallet: number
): ResultadoCalculo {
  const dentroParametro = quantidadePallets > minimoPallets
  const valorCalculado = quantidadePallets * valorPorPallet
  return {
    valorCalculado,
    dentroParametro,
    detalhe: `${quantidadePallets} pallet(s) × R$ ${valorPorPallet.toLocaleString('pt-BR')} (mínimo exigido: acima de ${minimoPallets})`,
  }
}

// Mapas do dia para um cliente (pdv_codigo), vindos do CSV de Catálogo/Vendas.
export async function mapasDoDia(clienteCodigo: number, data: string): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from('vendas_dia')
    .select('mapa')
    .eq('pdv_codigo', clienteCodigo)
    .eq('data', data)
  if (error) throw new Error(`Erro ao buscar mapas do dia: ${error.message}`)
  const mapas = [...new Set((rows ?? []).map(r => r.mapa).filter(Boolean))] as string[]
  return mapas.sort()
}

// Clientes ativos (com Chapa e/ou Descarga habilitados) que têm mapa na rua
// no dia informado — base da notificação ao financeiro.
export async function clientesComMapaHoje(data: string): Promise<ClienteComMapaHoje[]> {
  const clientes = (await listarClientes()).filter(c => c.ativo && (c.chapa_habilitado || c.descarga_habilitado))
  if (clientes.length === 0) return []

  const codigos = clientes.map(c => c.codigo)
  const { data: rows, error } = await supabase
    .from('vendas_dia')
    .select('pdv_codigo, mapa')
    .eq('data', data)
    .in('pdv_codigo', codigos)
  if (error) throw new Error(`Erro ao buscar vendas do dia: ${error.message}`)

  const mapasPorCodigo = new Map<number, Set<string>>()
  for (const row of rows ?? []) {
    if (!row.mapa) continue
    if (!mapasPorCodigo.has(row.pdv_codigo)) mapasPorCodigo.set(row.pdv_codigo, new Set())
    mapasPorCodigo.get(row.pdv_codigo)!.add(row.mapa)
  }

  return clientes
    .filter(c => mapasPorCodigo.has(c.codigo))
    .map(c => ({ cliente: c, mapas: [...mapasPorCodigo.get(c.codigo)!].sort() }))
}

export async function registrarLancamento(lancamento: {
  data: string
  cliente_codigo: number
  cliente_nome: string
  mapa: string | null
  tipo: TipoLancamento
  valor_nota: number | null
  quantidade_pallets: number | null
  valor_calculado: number
  dentro_parametro: boolean
  confirmado_fora_parametro: boolean
  comprovante_url: string | null
  filial: string | null
  registrado_por: string | null
}): Promise<LancamentoChapaDescarga> {
  const { data: row, error } = await supabase
    .from('financeiro_chapa_lancamentos')
    .insert(lancamento)
    .select()
    .single()
  if (error) throw new Error(`Erro ao registrar pagamento: ${error.message}`)
  return row as LancamentoChapaDescarga
}

export async function listarLancamentosDoDia(data: string): Promise<LancamentoChapaDescarga[]> {
  const { data: rows, error } = await supabase
    .from('financeiro_chapa_lancamentos')
    .select('*')
    .eq('data', data)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao carregar lançamentos: ${error.message}`)
  return (rows ?? []) as LancamentoChapaDescarga[]
}

// Dispara, no WhatsApp do financeiro, o resumo dos clientes com mapa na rua
// no dia — chamado logo após o monitoramento importar o CSV de Catálogo/Vendas.
// Não interrompe o import se o grupo não estiver configurado ou o envio falhar.
export async function notificarFinanceiroWhatsApp(
  filial: string,
  data: string
): Promise<{ enviado: boolean; motivo?: string }> {
  const { data: filialRow, error: filialErr } = await supabase
    .from('filiais')
    .select('grupo_financeiro_whatsapp')
    .eq('nome', filial)
    .maybeSingle()
  if (filialErr) return { enviado: false, motivo: filialErr.message }
  const grupo = filialRow?.grupo_financeiro_whatsapp
  if (!grupo) return { enviado: false, motivo: 'Grupo do financeiro não configurado.' }

  const clientes = await clientesComMapaHoje(data)
  if (clientes.length === 0) return { enviado: false, motivo: 'Nenhum cliente de Chapa/Descarga com mapa hoje.' }

  const [ano, mes, dia] = data.split('-')
  const linhas = clientes.map(({ cliente, mapas }) => {
    const tipos = [cliente.chapa_habilitado && 'Chapa', cliente.descarga_habilitado && 'Descarga'].filter(Boolean).join(' / ')
    return `• ${cliente.codigo} - ${cliente.nome} (${tipos}) — mapa(s): ${mapas.join(', ')}`
  })
  const mensagem =
    `📋 *Chapa/Descarga — ${dia}/${mes}/${ano}*\n` +
    `Clientes com pedido na rua hoje:\n\n${linhas.join('\n')}\n\n` +
    `Acesse o sistema para lançar o pagamento.`

  const resultado = await enviarMensagemGrupo(grupo, mensagem)
  if (!resultado.sucesso) return { enviado: false, motivo: resultado.erro }
  return { enviado: true }
}
