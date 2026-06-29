/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

// ── Configuração ────────────────────────────────────────────────────────────────
// Self-contained (igual a zapi-webhook.ts): roda como Vercel Serverless
// Function, fora do build do Vite, então não pode usar import.meta.env nem
// importar de src/lib (que dependem do bundler do front-end).
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE ?? process.env.VITE_ZAPI_INSTANCE ?? ''
const ZAPI_TOKEN = process.env.ZAPI_TOKEN ?? process.env.VITE_ZAPI_TOKEN ?? ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? process.env.VITE_ZAPI_CLIENT_TOKEN ?? ''
const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

const CRON_SECRET = process.env.CRON_SECRET ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Regras de vencimento do GSD (espelha src/lib/gsdpqVencimento.ts) ──────────────
const CICLO_PADRAO_DIAS = 60
const CICLO_NOVATO_DIAS = 30
const LIMITE_NOVATO_MESES = 3
const THRESHOLDS_CICLO_PADRAO = [45, 50, 55, 60]
const THRESHOLDS_CICLO_NOVATO = [15, 20, 25, 30]

function ehMotoristaOuAjudante(funcao: string | null): boolean {
  const f = (funcao ?? '').toUpperCase()
  return f.includes('MOTORISTA') || f.includes('AJUDANTE')
}

function mesesDeEmpresa(dataAdmissao: string, hoje: Date): number {
  const adm = new Date(dataAdmissao.slice(0, 10) + 'T00:00:00')
  let meses = (hoje.getFullYear() - adm.getFullYear()) * 12 + (hoje.getMonth() - adm.getMonth())
  if (hoje.getDate() < adm.getDate()) meses -= 1
  return meses
}

function cicloDiasColaborador(dataAdmissao: string | null, hoje: Date): number {
  if (!dataAdmissao) return CICLO_PADRAO_DIAS
  return mesesDeEmpresa(dataAdmissao, hoje) >= LIMITE_NOVATO_MESES ? CICLO_PADRAO_DIAS : CICLO_NOVATO_DIAS
}

function diasEntre(de: string, hoje: Date): number {
  const d = new Date(de.slice(0, 10) + 'T00:00:00')
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000)
}

function thresholdsParaCiclo(cicloDias: number): number[] {
  return cicloDias === CICLO_NOVATO_DIAS ? THRESHOLDS_CICLO_NOVATO : THRESHOLDS_CICLO_PADRAO
}

function limparNumero(numero: string): string {
  const limpo = numero.replace(/\D/g, '')
  return limpo.startsWith('55') ? limpo : `55${limpo}`
}

async function enviarWhatsApp(numero: string, mensagem: string): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: limparNumero(numero), message: mensagem }),
    })
    if (!resp.ok) return { sucesso: false, erro: await resp.text().catch(() => '') }
    return { sucesso: true }
  } catch (e) {
    return { sucesso: false, erro: String(e) }
  }
}

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano.slice(2)}`
}

// ── Handler ──────────────────────────────────────────────────────────────────────
// Disparado diariamente pelo Vercel Cron (vercel.json). Para cada motorista/
// ajudante ativo cujo dia atual do ciclo bate com um dos thresholds de aviso,
// notifica o supervisor da equipe (gsdpq_supervisores) e registra em
// gsdpq_vencimento_notificacoes para não repetir o mesmo aviso no mesmo ciclo.
export default async function handler(req: any, res: any) {
  if (CRON_SECRET) {
    const auth = String(req.headers?.authorization ?? '')
    const token = String(req.query?.token ?? '')
    if (auth !== `Bearer ${CRON_SECRET}` && token !== CRON_SECRET) {
      res.status(401).json({ ok: false, error: 'invalid token' })
      return
    }
  }

  try {
    const hoje = new Date()

    const [{ data: colaboradores }, { data: avaliacoes }, { data: supervisores }] = await Promise.all([
      supabase.from('gsdpq_colaboradores').select('id, filial, nome, equipe, funcao, status, data_admissao'),
      supabase.from('gsdpq_avaliacoes').select('filial, colaborador_nome, data_avaliacao').order('data_avaliacao', { ascending: false }).limit(20000),
      supabase.from('gsdpq_supervisores').select('filial, equipe, nome, telefone'),
    ])

    const ultimaAvaliacaoPorChave = new Map<string, string>()
    for (const av of avaliacoes ?? []) {
      if (!av.data_avaliacao) continue
      const chave = `${av.filial}|${av.colaborador_nome}`
      if (!ultimaAvaliacaoPorChave.has(chave)) ultimaAvaliacaoPorChave.set(chave, av.data_avaliacao)
    }

    const supervisorPorChave = new Map(
      (supervisores ?? []).map(s => [`${s.filial}|${s.equipe}`, s])
    )

    let notificacoesEnviadas = 0
    let erros = 0

    for (const c of colaboradores ?? []) {
      if ((c.status ?? '').toUpperCase() === 'DESLIGADO') continue
      if (!ehMotoristaOuAjudante(c.funcao)) continue

      const ultimaAvaliacao = ultimaAvaliacaoPorChave.get(`${c.filial}|${c.nome}`) ?? null
      const cicloInicio = ultimaAvaliacao || c.data_admissao
      if (!cicloInicio) continue

      const cicloDias = cicloDiasColaborador(c.data_admissao, hoje)
      const diasDesdeCiclo = diasEntre(cicloInicio, hoje)
      const thresholds = thresholdsParaCiclo(cicloDias)
      if (!thresholds.includes(diasDesdeCiclo)) continue

      const supervisor = c.equipe ? supervisorPorChave.get(`${c.filial}|${c.equipe}`) : undefined
      if (!supervisor) continue

      const cicloInicioIso = cicloInicio.slice(0, 10)
      const { error: dupErr } = await supabase.from('gsdpq_vencimento_notificacoes').insert({
        filial: c.filial,
        colaborador_id: c.id,
        ciclo_inicio: cicloInicioIso,
        dias_threshold: diasDesdeCiclo,
      })
      // Conflito de UNIQUE(colaborador_id, ciclo_inicio, dias_threshold) = já notificado neste ciclo.
      if (dupErr) continue

      const diasRestantes = cicloDias - diasDesdeCiclo
      const mensagem = diasRestantes <= 0
        ? `🔴 *GSD Vencido*\n👤 Colaborador: ${c.nome}\n👥 Equipe: ${c.equipe}\n📋 Última avaliação: ${ultimaAvaliacao ? dataBR(ultimaAvaliacao) : 'nunca avaliado'}\n⚠️ O ciclo de ${cicloDias} dias já venceu. É necessário aplicar o GSD com urgência.`
        : `🟡 *Vencimento de GSD se aproximando*\n👤 Colaborador: ${c.nome}\n👥 Equipe: ${c.equipe}\n📋 Última avaliação: ${ultimaAvaliacao ? dataBR(ultimaAvaliacao) : 'nunca avaliado'}\n⏳ Faltam ${diasRestantes} dia(s) para vencer o ciclo de ${cicloDias} dias.`

      const { sucesso, erro } = await enviarWhatsApp(supervisor.telefone, mensagem)
      await supabase.from('disparos').insert({
        filial: c.filial,
        whatsapp: supervisor.telefone,
        mensagem,
        status: sucesso ? 'enviado' : 'erro',
        erro: erro ?? null,
      })
      if (sucesso) notificacoesEnviadas++
      else erros++
    }

    res.status(200).json({ ok: true, notificacoesEnviadas, erros })
  } catch (e) {
    console.error('Erro no cron de vencimento GSD:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}
