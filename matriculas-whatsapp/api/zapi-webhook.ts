import { createClient } from '@supabase/supabase-js'

// ── Configuração (lê variáveis do ambiente da Vercel) ───────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL  ?? process.env.VITE_SUPABASE_URL  ?? ''
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE     ?? process.env.VITE_ZAPI_INSTANCE     ?? ''
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN        ?? process.env.VITE_ZAPI_TOKEN        ?? ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? process.env.VITE_ZAPI_CLIENT_TOKEN ?? ''

const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

const CONFIRM_TTL_MIN = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ─────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

async function enviarGrupo(grupoId: string, message: string): Promise<void> {
  try {
    await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: grupoId, message }),
    })
  } catch (e) {
    console.error('Falha ao enviar texto no grupo:', e)
  }
}

async function enviarGrupoBotoes(grupoId: string, message: string): Promise<void> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-button-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({
        phone: grupoId,
        message,
        buttonList: {
          buttons: [
            { id: 'SIM', label: '✅ Confirmar' },
            { id: 'NAO', label: '❌ Cancelar' },
          ],
        },
      }),
    })
    // Se botões não forem suportados (ex: grupo antigo), cai no texto simples
    if (!resp.ok) {
      await enviarGrupo(grupoId, message + '\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.')
    }
  } catch (e) {
    console.error('Falha ao enviar botões no grupo:', e)
    await enviarGrupo(grupoId, message + '\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.')
  }
}

// Extrai colaborador + motivo + data opcional do formato multi-linha:
//   Fluxo: João da Silva
//   Motivo - falta
//   Data: 09/06
function parseComando(texto: string): { nome: string; motivo: string; data?: string } | null {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  let nome = ''
  let motivo = ''
  let data: string | undefined

  for (const linha of linhas) {
    const n = norm(linha)

    if (n.startsWith('fluxo:') || n.startsWith('#fluxo')) {
      nome = linha.replace(/^[^:]*:/, '').trim()
    } else if (n.startsWith('motivo')) {
      motivo = linha.replace(/^[^\-:–—]*[\-:–—]/, '').trim()
    } else if (n.startsWith('data')) {
      const raw = linha.replace(/^[^\-:–—]*[\-:–—]/, '').trim()
      const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
      if (m) {
        const ano = new Date().getFullYear()
        const dd = m[1].padStart(2, '0')
        const mm = m[2].padStart(2, '0')
        data = `${ano}-${mm}-${dd}`
      }
    }
  }

  if (!nome || !motivo) return null
  return { nome, motivo, ...(data ? { data } : {}) }
}

// Extrai a resposta do usuário: texto livre OU clique em botão
function extrairResposta(body: any): 'sim' | 'nao' | null {
  // Clique em botão (send-button-list reply)
  const buttonId: string = norm(
    body?.buttonReply?.selectedButtonId ??
    body?.listResponse?.singleSelectReply?.selectedRowId ??
    ''
  )
  if (buttonId === 'sim') return 'sim'
  if (buttonId === 'nao') return 'nao'

  // Texto livre
  const texto = norm(String(body?.text?.message ?? '').trim())
  if (texto === 'sim') return 'sim'
  if (texto === 'nao' || texto === 'nao' || texto === 'não') return 'nao'

  return null
}

// ── Handler ──────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, ignored: 'method' })
    return
  }

  if (WEBHOOK_SECRET && req.query?.token !== WEBHOOK_SECRET) {
    res.status(401).json({ ok: false, error: 'invalid token' })
    return
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})

  console.log('WEBHOOK_BODY:', JSON.stringify(body))

  try {
    const fromMe: boolean = body.fromMe === true
    const grupoId: string = String(body.phone ?? '')
    const isGroup: boolean = body.isGroup === true || grupoId.endsWith('-group')
    const texto: string = String(body?.text?.message ?? '').trim()
    const temConteudo = texto || body?.buttonReply || body?.listResponse
    const senderName: string = String(body.senderName ?? body.chatName ?? '')
    const participante: string = String(body.participantPhone ?? body.participant ?? '')

    if (fromMe || !isGroup || !grupoId || !temConteudo) {
      res.status(200).json({ ok: true, ignored: 'not-applicable' })
      return
    }

    const { data: filialRow } = await supabase
      .from('filiais').select('nome').eq('grupo_fluxo_whatsapp', grupoId).maybeSingle()
    if (!filialRow) {
      res.status(200).json({ ok: true, ignored: 'group-not-configured' })
      return
    }
    const filial: string = filialRow.nome
    const n = norm(texto)

    // ── 1) Novo comando: inicia com "Fluxo:" ─────────────────────────────────────
    if (n.startsWith('fluxo:') || n.startsWith('#fluxo')) {
      const parsed = parseComando(texto)
      if (!parsed) {
        await enviarGrupo(grupoId,
          '⚠️ Formato inválido.\nUse o padrão:\n\n*Fluxo: NOME DO COLABORADOR*\n*Motivo - MOTIVO*\n*Data: DD/MM* _(opcional)_\n\nEx:\nFluxo: João Silva\nMotivo - Falta\nData: 09/06')
        res.status(200).json({ ok: true, action: 'usage' })
        return
      }

      const { data: conf } = await supabase.from('fluxo_confirmacoes').insert({
        filial, grupo_id: grupoId,
        colaborador_nome: parsed.nome, motivo: parsed.motivo,
        data_acao: parsed.data ?? null,
        solicitante_nome: senderName || null, solicitante_telefone: participante || null,
        status: 'aguardando',
      }).select('id').single()

      const dataInfo = parsed.data ? `\n📅 Data: ${parsed.data.split('-').reverse().join('/')}` : ''
      await enviarGrupoBotoes(grupoId,
        `📋 *Confirmação de Fluxo*\n👤 Colaborador: ${parsed.nome}\n⚠️ Motivo: ${parsed.motivo}${dataInfo}`)

      res.status(200).json({ ok: true, action: 'aguardando', id: conf?.id })
      return
    }

    // ── 2) Confirmação: botão ou texto SIM / NÃO ─────────────────────────────────
    const resposta = extrairResposta(body)
    if (resposta) {
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

      if (resposta === 'nao') {
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
        motivo: pend.motivo, data_acao: pend.data_acao ?? hoje, observacao: null,
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

    res.status(200).json({ ok: true, ignored: 'no-command' })
  } catch (e) {
    console.error('Erro no webhook:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
