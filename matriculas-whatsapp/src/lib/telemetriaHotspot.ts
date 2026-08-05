import { supabase } from './supabase'
import { enviarMensagemWhatsApp, aguardarEntreEnvios } from './zapi'
import { podeEnviarPara } from './statusAtivo'
import { buscarStatusColaboradoresPorMatricula, buscarStatusColaboradoresPorTelefone } from './statusAtivo'

// Cruza os pontos de maior incidência de telemetria (curva/frenagem/excesso)
// com a escala do dia (03.11.49.02 — mapa/matrícula/cidades_entregas), pra
// avisar o motorista quando a rota dele passa por uma região quente. Não
// existe coordenada/bairro de PDV no sistema, então o cruzamento é por
// cidade (texto livre da coluna "Cidades +Entregas"), normalizado sem acento.

const JANELA_DIAS = 90

export interface CidadeQuente { cidade: string; eventos: number }

export interface RotaRisco {
  mapa: number
  matricula: number | null
  nome: string | null
  telefone: string | null
  cidadesBatidas: CidadeQuente[]
}

export interface ConfigHotspot {
  ativo: boolean
  minEventos: number
  topN: number
}

function normalizarMatricula(s: string): string {
  return s.trim().replace(/^0+/, '') || '0'
}

function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

export async function buscarConfigHotspot(filial: string): Promise<ConfigHotspot> {
  const { data } = await supabase.from('filiais')
    .select('telemetria_hotspot_ativo, telemetria_hotspot_min_eventos, telemetria_hotspot_top_n')
    .eq('nome', filial).maybeSingle()
  return {
    ativo: data?.telemetria_hotspot_ativo ?? false,
    minEventos: data?.telemetria_hotspot_min_eventos ?? 8,
    topN: data?.telemetria_hotspot_top_n ?? 5,
  }
}

export async function salvarConfigHotspot(filial: string, cfg: ConfigHotspot): Promise<void> {
  await supabase.from('filiais').update({
    telemetria_hotspot_ativo: cfg.ativo,
    telemetria_hotspot_min_eventos: cfg.minEventos,
    telemetria_hotspot_top_n: cfg.topN,
  }).eq('nome', filial)
}

export async function buscarCidadesQuentes(filial: string, minEventos: number, topN: number): Promise<CidadeQuente[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase.from('telemetria_alertas').select('cidade, data_hora').eq('filial', filial).gte('data_hora', desde)
  const counts: Record<string, number> = {}
  ;(data ?? []).forEach((a) => {
    const c = a.cidade?.trim()
    if (!c) return
    counts[c] = (counts[c] ?? 0) + 1
  })
  return Object.entries(counts)
    .map(([cidade, eventos]) => ({ cidade, eventos }))
    .filter((c) => c.eventos >= minEventos)
    .sort((a, b) => b.eventos - a.eventos)
    .slice(0, topN)
}

export async function buscarRotasComRisco(filial: string, data: string, hotspots: CidadeQuente[]): Promise<RotaRisco[]> {
  if (hotspots.length === 0) return []
  const { data: escalas } = await supabase.from('escalas_tml')
    .select('mapa, matricula, cidades_entregas').eq('filial', filial).eq('data_entrega', data)
  if (!escalas || escalas.length === 0) return []

  const matriculas = [...new Set(escalas.map((e) => e.matricula).filter((m): m is number => m != null))]
  const [{ data: roster }, { data: cadastro }] = await Promise.all([
    supabase.from('motoristas_sala_tml').select('matricula, nome, telefone').eq('filial', filial).in('matricula', matriculas.length > 0 ? matriculas : [-1]),
    supabase.from('matriculas').select('numero, whatsapp').eq('filial', filial).eq('ativo', true),
  ])
  const nomePorMatricula = new Map((roster ?? []).map((r) => [r.matricula as number, r.nome as string | null]))
  const telefonePorMatriculaTml = new Map((roster ?? []).map((r) => [r.matricula as number, r.telefone as string | null]))
  const telefonePorNumeroCadastro = new Map((cadastro ?? []).map((m) => [normalizarMatricula(String(m.numero)), m.whatsapp as string | null]))

  const hotspotsNorm = hotspots.map((h) => ({ ...h, norm: normalizarTexto(h.cidade) }))

  const resultado: RotaRisco[] = []
  escalas.forEach((e) => {
    const texto = e.cidades_entregas ? normalizarTexto(e.cidades_entregas) : ''
    if (!texto) return
    const batidas = hotspotsNorm.filter((h) => texto.includes(h.norm)).map(({ cidade, eventos }) => ({ cidade, eventos }))
    if (batidas.length === 0) return
    const telefone = e.matricula != null
      ? telefonePorNumeroCadastro.get(normalizarMatricula(String(e.matricula))) ?? telefonePorMatriculaTml.get(e.matricula) ?? null
      : null
    resultado.push({
      mapa: e.mapa,
      matricula: e.matricula,
      nome: e.matricula != null ? nomePorMatricula.get(e.matricula) ?? null : null,
      telefone,
      cidadesBatidas: batidas,
    })
  })
  return resultado
}

export function montarMensagemAlertaRota(nome: string | null, cidadesBatidas: CidadeQuente[]): string {
  const cidadesTxt = cidadesBatidas.map((c) => c.cidade).join(', ')
  const saudacao = nome ? `Oi, ${nome.split(' ')[0]}!` : 'Oi!'
  return `⚠️ ${saudacao} Sua rota de hoje passa por ${cidadesTxt} — região com histórico recente de ocorrências de telemetria (curva brusca, freada brusca ou excesso de velocidade). Redobre a atenção e dirija com cuidado. 🙏`
}

// Nunca manda 2x a mesma matrícula+dia+cidade, mesmo que a escala seja
// reimportada no mesmo dia (o 03.11.49.02 entra pelo menos 2x/dia).
async function jaEnviadosHoje(filial: string, data: string): Promise<Set<string>> {
  const { data: rows } = await supabase.from('telemetria_alerta_rota_enviado')
    .select('matricula, cidade').eq('filial', filial).eq('data', data)
  return new Set((rows ?? []).map((r) => `${r.matricula}||${r.cidade}`))
}

export interface ResultadoChecagemHotspot {
  rotas: RotaRisco[]
  hotspots: CidadeQuente[]
  enviados: { mapa: number; nome: string | null; cidades: string }[]
  bloqueados: { mapa: number; nome: string | null; motivo: string }[]
  semTelefone: { mapa: number; nome: string | null }[]
  jaEnviadosAntes: number
}

// dryRun=true só monta o resultado (preview) — não manda mensagem nem grava
// nada. Usado tanto no botão "Testar agora" quanto, com dryRun=false, no
// gatilho automático depois do import da escala.
export async function executarChecagemHotspot(filial: string, data: string, dryRun: boolean): Promise<ResultadoChecagemHotspot> {
  const cfg = await buscarConfigHotspot(filial)
  const hotspots = await buscarCidadesQuentes(filial, cfg.minEventos, cfg.topN)
  const rotas = await buscarRotasComRisco(filial, data, hotspots)
  const jaEnviados = dryRun ? new Set<string>() : await jaEnviadosHoje(filial, data)
  const [mapaStatusPorMatricula, mapaStatusPorTelefone] = dryRun
    ? [new Map<string, string>(), new Map<string, string>()]
    : await Promise.all([buscarStatusColaboradoresPorMatricula(filial), buscarStatusColaboradoresPorTelefone(filial)])

  const enviados: { mapa: number; nome: string | null; cidades: string }[] = []
  const bloqueados: { mapa: number; nome: string | null; motivo: string }[] = []
  const semTelefone: { mapa: number; nome: string | null }[] = []
  let jaEnviadosAntes = 0

  for (const rota of rotas) {
    const cidadesNovas = rota.cidadesBatidas.filter((c) => !jaEnviados.has(`${rota.matricula}||${c.cidade}`))
    if (cidadesNovas.length === 0) { jaEnviadosAntes++; continue }
    if (!rota.telefone) { semTelefone.push({ mapa: rota.mapa, nome: rota.nome }); continue }

    const cidadesTxt = cidadesNovas.map((c) => c.cidade).join(', ')

    if (!dryRun && cfg.ativo) {
      const pode = await podeEnviarPara({
        origem: 'telemetria_hotspot_rota', filial, mapaStatus: new Map(),
        nome: rota.nome, telefone: rota.telefone, detalhe: `Mapa ${rota.mapa} — ${cidadesTxt}`,
        matricula: rota.matricula, mapaStatusPorMatricula, mapaStatusPorTelefone,
      })
      if (!pode) { bloqueados.push({ mapa: rota.mapa, nome: rota.nome, motivo: 'Colaborador inativo/opt-out' }); continue }

      await enviarMensagemWhatsApp(rota.telefone, montarMensagemAlertaRota(rota.nome, cidadesNovas))
      await supabase.from('telemetria_alerta_rota_enviado').insert(
        cidadesNovas.map((c) => ({ filial, matricula: rota.matricula, data, cidade: c.cidade }))
      )
      await aguardarEntreEnvios()
    }
    enviados.push({ mapa: rota.mapa, nome: rota.nome, cidades: cidadesTxt })
  }

  return { rotas, hotspots, enviados, bloqueados, semTelefone, jaEnviadosAntes }
}
