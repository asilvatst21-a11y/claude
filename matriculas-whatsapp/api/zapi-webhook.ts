import { createClient } from '@supabase/supabase-js'

// ── Configuração (lê variáveis do ambiente da Vercel) ───────────────────────────
// As variáveis VITE_* já existem no projeto; aceitamos também as sem prefixo.
const SUPABASE_URL  = process.env.SUPABASE_URL  ?? process.env.VITE_SUPABASE_URL  ?? ''
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE     ?? process.env.VITE_ZAPI_INSTANCE     ?? ''
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN        ?? process.env.VITE_ZAPI_TOKEN        ?? ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? process.env.VITE_ZAPI_CLIENT_TOKEN ?? ''

// Segredo opcional: se definido, o Z-API deve chamar /api/zapi-webhook?token=SEGREDO
const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

// Janela máxima (min) para confirmar uma solicitação aguardando
const CONFIRM_TTL_MIN = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ─────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

async function enviarGrupo(grupoId: string, message: string): Promise<void> {
  try {
    await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: grupoId, message }),
    })
  } catch (e) {
    console.error('Falha ao responder no grupo:', e)
  }
}

// Extrai colaborador + motivo de "Fluxo: NOME - MOTIVO"
function parseComando(texto: string): { nome: string; motivo: string } | null {
  const semPrefixo = texto.replace(/^[^:]*:/, '').trim() // remove "Fluxo:" (ou "#fluxo:")
  const partes = semPrefixo.split(/\s+[-–—]\s+/)          // separa por " - ", " – ", " — "
  if (partes.length < 2) return null
  const nome = partes[0].trim()
  const motivo = partes.slice(1).join(' - ').trim()
  if (!nome || !motivo) return null
  return { nome, motivo }
}

// ── Handler ──────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // Sempre responde 200 rápido para o Z-API não re-tentar; processa antes de retornar.
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, ignored: 'method' })
    return
  }

  if (WEBHOOK_SECRET && req.query?.token !== WEBHOOK_SECRET) {
    res.status(401).json({ ok: false, error: 'invalid token' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})

  try {
    const fromMe: boolean = body.fromMe === true
    const grupoId: string = String(body.phone ?? '')
    const isGroup: boolean = body.isGroup === true || grupoId.endsWith('-group')
    const texto: string = String(body?.text?.message ?? '').trim()
    const senderName: string = String(body.senderName ?? body.chatName ?? '')
    const participante: string = String(body.participantPhone ?? body.participant ?? '')

    // Ignora: mensagens próprias, não-grupo, sem texto
    if (fromMe || !isGroup || !grupoId || !texto) {
      res.status(200).json({ ok: true, ignored: 'not-applicable' })
      return
    }

    // Identifica a filial pelo ID do grupo
    const { data: filialRow } = await supabase
      .from('filiais').select('nome').eq('grupo_fluxo_whatsapp', grupoId).maybeSingle()
    if (!filialRow) {
      res.status(200).json({ ok: true, ignored: 'group-not-configured' })
      return
    }
    const filial: string = filialRow.nome
    const n = norm(texto)

    // ── 1) Novo comando: "Fluxo: NOME - MOTIVO" ──────────────────────────────────
    if (n.startsWith('fluxo:') || n.startsWith('#fluxo')) {
      const parsed = parseComando(texto)
      if (!parsed) {
        await enviarGrupo(grupoId,
          '⚠️ Formato inválido.\nUse: *Fluxo: NOME DO COLABORADOR - MOTIVO*\nEx: Fluxo: João Silva - Falta')
        res.status(200).json({ ok: true, action: 'usage' })
        return
      }

      const { data: conf } = await supabase.from('fluxo_confirmacoes').insert({
        filial, grupo_id: grupoId,
        colaborador_nome: parsed.nome, motivo: parsed.motivo,
        solicitante_nome: senderName || null, solicitante_telefone: participante || null,
        status: 'aguardando',
      }).select('id').single()

      await enviarGrupo(grupoId,
        `📋 *Confirmação de Fluxo*\n👤 Colaborador: ${parsed.nome}\n⚠️ Motivo: ${parsed.motivo}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.`)

      res.status(200).json({ ok: true, action: 'aguardando', id: conf?.id })
      return
    }

    // ── 2) Confirmação: SIM / NÃO ────────────────────────────────────────────────
    if (n === 'sim' || n === 'nao') {
      const limite = new Date(Date.now() - CONFIRM_TTL_MIN * 60_000).toISOString()
      const { data: pend } = await supabase
        .from('fluxo_confirmacoes')
        .select('*')
        .eq('grupo_id', grupoId)
        .eq('status', 'aguardando')
        .gte('created_at', limite)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!pend) {
        res.status(200).json({ ok: true, ignored: 'no-pending-confirmation' })
        return
      }

      if (n === 'nao') {
        await supabase.from('fluxo_confirmacoes').update({ status: 'cancelado' }).eq('id', pend.id)
        await enviarGrupo(grupoId, `❌ Solicitação cancelada para *${pend.colaborador_nome}*.`)
        res.status(200).json({ ok: true, action: 'cancelado' })
        return
      }

      // SIM → cria o fluxo pendente no sistema
      const hoje = new Date().toISOString().slice(0, 10)
      const { data: fluxo } = await supabase.from('fluxo_punitivo').insert({
        filial, colaborador_nome: pend.colaborador_nome,
        origem: 'Grupo', tipo_acao: null, status: 'Solicitado',
        motivo: pend.motivo, data_acao: hoje, observacao: null,
        registrado_por: pend.solicitante_nome ? `${pend.solicitante_nome} (via grupo)` : 'WhatsApp (grupo)',
        source_id: pend.id,
      }).select('id').single()

      await supabase.from('fluxo_confirmacoes')
        .update({ status: 'confirmado', fluxo_id: fluxo?.id ?? null }).eq('id', pend.id)

      await enviarGrupo(grupoId,
        `✅ Fluxo criado para *${pend.colaborador_nome}* (${pend.motivo}).\nJá está como *pendente* no sistema para o responsável definir a ação.`)

      res.status(200).json({ ok: true, action: 'confirmado', fluxo_id: fluxo?.id })
      return
    }

    // Qualquer outra mensagem do grupo é ignorada
    res.status(200).json({ ok: true, ignored: 'no-command' })
  } catch (e) {
    console.error('Erro no webhook:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
