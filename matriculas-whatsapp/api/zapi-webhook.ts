import { createClient } from '@supabase/supabase-js'

// ── Configuração ────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL  ?? process.env.VITE_SUPABASE_URL  ?? ''
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE     ?? process.env.VITE_ZAPI_INSTANCE     ?? ''
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN        ?? process.env.VITE_ZAPI_TOKEN        ?? ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? process.env.VITE_ZAPI_CLIENT_TOKEN ?? ''

const WEBHOOK_SECRET = process.env.ZAPI_WEBHOOK_SECRET ?? ''

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

const CONFIRM_TTL_MIN = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Envio de mensagens ──────────────────────────────────────────────────────────

async function enviar(destino: string, message: string): Promise<void> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: destino, message }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      console.error('enviar HTTP error:', resp.status, txt)
    }
  } catch (e) {
    console.error('enviar exception:', e)
  }
}

/** @deprecated use enviar */
const enviarGrupo = enviar

// ── Helpers ─────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
}

// Extrai a resposta do usuário: texto livre OU clique em botão
function extrairResposta(body: any): 'sim' | 'nao' | null {
  const buttonId: string = norm(
    body?.buttonsResponseMessage?.buttonId ??
    body?.listResponse?.singleSelectReply?.selectedRowId ??
    ''
  )
  if (buttonId === 'sim') return 'sim'
  if (buttonId === 'nao') return 'nao'

  const texto = norm(String(body?.text?.message ?? '').trim())
  if (texto === 'sim') return 'sim'
  if (/^n[aã]o$/.test(texto) || texto === 'nao') return 'nao'

  return null
}

// Extrai colaborador + motivo + data opcional do formato multi-linha
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
        data = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      }
    }
  }

  if (!nome || !motivo) return null
  return { nome, motivo, ...(data ? { data } : {}) }
}

// Parseia uma solicitação de reposição com campos chave:valor
function parseReposicao(texto: string): { mapa: string; produto: string; quantidade: string; cliente: string; motivo: string } {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const result: Record<string, string> = { mapa: '', produto: '', quantidade: '', cliente: '', motivo: '' }

  for (const linha of linhas) {
    const sep = linha.match(/^([^:\-–]+)[\:\-–]\s*(.+)$/)
    if (!sep) continue
    const chave = norm(sep[1])
    const valor = sep[2].trim()
    if (/mapa/.test(chave))             result.mapa = valor
    else if (/produto/.test(chave))     result.produto = valor
    else if (/qtd|quant/.test(chave))   result.quantidade = valor
    else if (/cliente/.test(chave))     result.cliente = valor
    else if (/motivo|razao/.test(chave))result.motivo = valor
  }

  return result as { mapa: string; produto: string; quantidade: string; cliente: string; motivo: string }
}

function buildResumoReposicao(p: ReturnType<typeof parseReposicao>, nome: string): string {
  const linhas = [`📦 *Confirmação de Reposição*\n👤 Motorista: ${nome}`]
  if (p.mapa)       linhas.push(`🗺️ Mapa: ${p.mapa}`)
  if (p.produto)    linhas.push(`📋 Produto: ${p.produto}`)
  if (p.quantidade) linhas.push(`📊 Qtde: ${p.quantidade}`)
  if (p.cliente)    linhas.push(`🏪 Cliente: ${p.cliente}`)
  if (p.motivo)     linhas.push(`⚠️ Motivo: ${p.motivo}`)
  linhas.push('\nEstá correto? Responda *SIM* para confirmar ou *NÃO* para cancelar.')
  return linhas.join('\n')
}

async function gerarNumeroReposicao(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await supabase
    .from('reposicoes')
    .select('*', { count: 'exact', head: true })
    .like('numero', `REP-${hoje}-%`)
  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return `REP-${hoje}-${seq}`
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

  console.log('WEBHOOK type:', body.type, '| fromMe:', body.fromMe, '| isGroup:', body.isGroup, '| phone:', body.phone)

  try {
    const fromMe: boolean = body.fromMe === true
    const grupoId: string = String(body.phone ?? '')
    const isGroup: boolean =
      body.isGroup === true || body.isGroup === 'true' ||
      grupoId.endsWith('-group') || grupoId.endsWith('@g.us')
    const texto: string = String(
      body?.text?.message ??
      body?.message ??
      body?.body ??
      ''
    ).trim()
    const temConteudo = texto || body?.buttonsResponseMessage || body?.listResponse
    const senderName: string = String(body.senderName ?? body.chatName ?? body.pushName ?? '')
    const participante: string = String(body.participantPhone ?? body.participant ?? '')

    if (fromMe || !grupoId || !temConteudo) {
      res.status(200).json({ ok: true, ignored: 'fromMe-or-empty' })
      return
    }

    // ════════════════════════════════════════════════════════════════════════════
    // MENSAGENS DIRETAS — fluxo de reposição do motorista
    // ════════════════════════════════════════════════════════════════════════════
    if (!isGroup) {
      const telefone = grupoId

      // 1) SIM / NÃO para confirmação pendente de reposição
      const resposta = extrairResposta(body)
      if (resposta) {
        const limite = new Date(Date.now() - CONFIRM_TTL_MIN * 60_000).toISOString()
        const { data: pend } = await supabase
          .from('reposicao_confirmacoes')
          .select('*')
          .eq('motorista_telefone', telefone)
          .eq('status', 'aguardando')
          .gte('created_at', limite)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!pend) {
          res.status(200).json({ ok: true, ignored: 'no-pending-repos' })
          return
        }

        if (resposta === 'nao') {
          await supabase.from('reposicao_confirmacoes').update({ status: 'cancelado' }).eq('id', pend.id)
          await enviar(telefone, '❌ Solicitação cancelada. Envie uma nova mensagem quando quiser.')
          res.status(200).json({ ok: true, action: 'repos-cancelado' })
          return
        }

        // SIM → salva a reposição e avisa o grupo
        const numero = await gerarNumeroReposicao()
        const { error: insErr } = await supabase.from('reposicoes').insert({
          numero,
          motorista_nome: pend.motorista_nome,
          motorista_telefone: telefone,
          mapa: pend.mapa || null,
          cliente: pend.cliente || null,
          produto: pend.produto || null,
          quantidade: pend.quantidade || null,
          motivo: pend.motivo || null,
          mensagem_original: pend.mensagem_original,
          status: 'pendente',
        })

        if (insErr) {
          console.error('Erro ao inserir reposição:', insErr)
          await enviar(telefone, '❌ Erro ao registrar a solicitação. Tente novamente.')
          res.status(200).json({ ok: false, error: insErr.message })
          return
        }

        await supabase.from('reposicao_confirmacoes').update({ status: 'confirmado' }).eq('id', pend.id)

        // Avisa o motorista
        await enviar(telefone,
          `✅ Solicitação *${numero}* registrada!\nO financeiro irá analisar em breve.`)

        // Envia ao grupo da filial para validação
        const { data: filialRow } = await supabase
          .from('filiais').select('grupo_fluxo_whatsapp').eq('nome', pend.filial).single()
        const grupo = filialRow?.grupo_fluxo_whatsapp ?? null
        if (grupo) {
          const grupoMsg =
            `📦 *Nova Solicitação de Reposição*\n` +
            `🔢 Ref: ${numero}\n` +
            `📍 Filial: ${pend.filial}\n` +
            `👤 Motorista: ${pend.motorista_nome ?? 'N/I'}\n` +
            (pend.mapa      ? `🗺️ Mapa: ${pend.mapa}\n`         : '') +
            (pend.produto   ? `📋 Produto: ${pend.produto}\n`    : '') +
            (pend.quantidade? `📊 Qtde: ${pend.quantidade}\n`    : '') +
            (pend.cliente   ? `🏪 Cliente: ${pend.cliente}\n`    : '') +
            (pend.motivo    ? `⚠️ Motivo: ${pend.motivo}\n`      : '') +
            `\n_Acesse Vales → Reposições para validar._`
          await enviar(grupo, grupoMsg)
          await supabase.from('disparos').insert({
            filial: pend.filial, whatsapp: grupo, mensagem: grupoMsg,
            status: 'enviado', erro: null,
          })
        }

        res.status(200).json({ ok: true, action: 'repos-confirmado', numero })
        return
      }

      // 2) Nova solicitação de reposição
      const n = norm(texto)
      const ehReposicao = /^rep[o]?s|^reposi/i.test(n)

      if (!ehReposicao) {
        // Mensagem direta sem trigger — envia ajuda
        await enviar(telefone,
          '📦 Para solicitar uma *reposição*, envie:\n\n' +
          '*Reposição*\n' +
          '*Mapa: [número]*\n' +
          '*Produto: [produto]*\n' +
          '*Qtde: [quantidade]*\n' +
          '*Cliente: [cliente]*\n' +
          '*Motivo: [motivo]*\n\n' +
          '_Exemplo:_\n' +
          'Reposição\nMapa: 12345\nProduto: Cerveja 350ml\nQtde: 2 caixas\nCliente: Supermercado XYZ\nMotivo: produto quebrado')
        res.status(200).json({ ok: true, action: 'repos-help' })
        return
      }

      // Busca o motorista pelo telefone na tabela de matrículas
      const { data: matricula } = await supabase
        .from('matriculas')
        .select('nome, filial')
        .eq('whatsapp', telefone)
        .eq('ativo', true)
        .maybeSingle()

      if (!matricula) {
        await enviar(telefone,
          '⚠️ Número não cadastrado no sistema.\nEntre em contato com o financeiro.')
        res.status(200).json({ ok: true, ignored: 'motorista-not-found' })
        return
      }

      const parsed = parseReposicao(texto)

      await supabase.from('reposicao_confirmacoes').insert({
        filial: matricula.filial,
        motorista_telefone: telefone,
        motorista_nome: matricula.nome,
        mensagem_original: texto,
        mapa: parsed.mapa || null,
        cliente: parsed.cliente || null,
        produto: parsed.produto || null,
        quantidade: parsed.quantidade || null,
        motivo: parsed.motivo || null,
        status: 'aguardando',
      })

      await enviar(telefone, buildResumoReposicao(parsed, matricula.nome))
      res.status(200).json({ ok: true, action: 'repos-aguardando' })
      return
    }

    // ════════════════════════════════════════════════════════════════════════════
    // MENSAGENS DE GRUPO — fluxo punitivo
    // ════════════════════════════════════════════════════════════════════════════

    const { data: filialRow, error: filialErr } = await supabase
      .from('filiais').select('nome').eq('grupo_fluxo_whatsapp', grupoId).maybeSingle()
    if (filialErr) console.error('Erro ao buscar filial:', filialErr)
    if (!filialRow) {
      console.log('Grupo não configurado em filiais:', grupoId)
      res.status(200).json({ ok: true, ignored: 'group-not-configured' })
      return
    }
    const filial: string = filialRow.nome
    const n = norm(texto)

    // ── 1) Novo comando: inicia com "Fluxo:" ────────────────────────────────────
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
      await enviarGrupo(grupoId,
        `📋 *Confirmação de Fluxo*\n👤 Colaborador: ${parsed.nome}\n⚠️ Motivo: ${parsed.motivo}${dataInfo}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.`)

      res.status(200).json({ ok: true, action: 'aguardando', id: conf?.id })
      return
    }

    // ── 2) Confirmação: SIM / NÃO ───────────────────────────────────────────────
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
