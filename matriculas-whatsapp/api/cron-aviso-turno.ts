/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

// Aviso diário de fechamento de turno — lembra o conferente de lançar as
// atividades da RV por Turno perto do horário de fechamento cadastrado
// (VariavelTurnoAdmin.tsx > Horário de fechamento por turno). Chamado pelo
// Vercel Cron a cada 5 minutos (ver vercel.json); cada tick verifica se
// ALGUM turno de ALGUMA filial já passou do horário de fechamento hoje e,
// se sim e ainda não foi avisado, dispara pro(s) telefone(s) daquele turno.
// A tabela variavel_turno_avisos_enviados garante um único aviso por
// (filial, turno, dia) — não a checagem de horário, que é tolerante o
// suficiente pra recuperar um tick perdido no mesmo dia.
//
// Protegido pelo cabeçalho que o próprio Vercel Cron envia automaticamente
// (Authorization: Bearer $CRON_SECRET) — configure CRON_SECRET nas env vars
// do projeto no Vercel.

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''

const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE     ?? process.env.VITE_ZAPI_INSTANCE     ?? ''
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN        ?? process.env.VITE_ZAPI_TOKEN        ?? ''
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? process.env.VITE_ZAPI_CLIENT_TOKEN ?? ''
const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TURNO_LABEL: Record<string, string> = { TA: 'Turno A', TB: 'Turno B', TC: 'Turno C' }

function limparNumero(numero: string): string {
  const limpo = numero.replace(/\D/g, '')
  return limpo.startsWith('55') ? limpo : `55${limpo}`
}

function variarTexto(variantes: string[]): string {
  return variantes[Math.floor(Math.random() * variantes.length)]
}

async function enviar(telefone: string, mensagem: string): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const resp = await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: limparNumero(telefone), message: mensagem }),
    })
    const bruto = await resp.text().catch(() => '')
    let corpo: { error?: string } | null = null
    try { corpo = bruto ? JSON.parse(bruto) : null } catch { /* resposta não-JSON */ }
    if (!resp.ok || corpo?.error) return { sucesso: false, erro: corpo?.error ?? `HTTP ${resp.status}` }
    return { sucesso: true }
  } catch (e) {
    return { sucesso: false, erro: String(e) }
  }
}

// Hora/data de agora em América/São Paulo — não do servidor (roda em UTC).
function agoraSP(): { horaMin: string; data: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return { horaMin: `${pega('hour')}:${pega('minute')}`, data: `${pega('year')}-${pega('month')}-${pega('day')}` }
}

// Já passou do horário de fechamento? Não exige o tick "exato" — só que o
// horário já tenha chegado hoje. Isso é o que torna o cron resiliente a
// falhas passageiras (ex.: uma env var errada, uma instabilidade de rede):
// se o tick certinho falhar, o PRÓXIMO tick do dia ainda pega o aviso
// atrasado, em vez de perder a janela e só tentar de novo amanhã. Quem
// impede o reenvio depois que já mandou é só a trava de
// variavel_turno_avisos_enviados (única por filial+turno+dia), não esta
// checagem de horário.
function jaPassouDoHorario(horarioFechamento: string, agora: string): boolean {
  const [hf, mf] = horarioFechamento.split(':').map(Number)
  const [ha, ma] = agora.split(':').map(Number)
  return ha * 60 + ma >= hf * 60 + mf
}

export default async function handler(req: any, res: any) {
  // O Vercel Cron chama sempre com o cabeçalho Authorization. Pra permitir
  // também um teste manual simples (colar um link no navegador, sem
  // terminal), aceita o mesmo segredo em ?secret= como alternativa.
  const auth = String(req.headers?.authorization ?? '')
  const secretQuery = String(req.query?.secret ?? '')
  if (!CRON_SECRET) { res.status(503).json({ ok: false, error: 'CRON_SECRET não configurado' }); return }
  if (auth !== `Bearer ${CRON_SECRET}` && secretQuery !== CRON_SECRET) { res.status(401).json({ ok: false, error: 'não autorizado' }); return }

  try {
    const { horaMin, data } = agoraSP()

    const { data: horarios, error: erroHorarios } = await supabase
      .from('variavel_turno_horarios')
      .select('filial, turno, horario_fechamento')
    if (erroHorarios) throw new Error(erroHorarios.message)

    const devidos = (horarios ?? []).filter((h) => jaPassouDoHorario(String(h.horario_fechamento).slice(0, 5), horaMin))

    const resultado: { filial: string; turno: string; enviados: number; erro?: string }[] = []

    for (const h of devidos) {
      // "Reivindica" o aviso do dia — se já existir (outro tick chegou primeiro
      // ou já foi enviado), o insert falha por UNIQUE e a gente pula, sem
      // mandar de novo.
      const { error: erroClaim } = await supabase
        .from('variavel_turno_avisos_enviados')
        .insert({ filial: h.filial, turno: h.turno, data })
      if (erroClaim) continue // já reivindicado antes — não duplica

      const { data: conferentes, error: erroConferentes } = await supabase
        .from('usuarios')
        .select('nome, login, telefone')
        .eq('filial', h.filial)
        .eq('turno', h.turno)
        .eq('cargo', 'Conferente RV')
        .not('telefone', 'is', null)

      if (erroConferentes) { resultado.push({ filial: h.filial, turno: h.turno, enviados: 0, erro: erroConferentes.message }); continue }
      if (!conferentes || conferentes.length === 0) {
        resultado.push({ filial: h.filial, turno: h.turno, enviados: 0, erro: 'nenhum conferente com telefone cadastrado nesse turno' })
        continue
      }

      const label = TURNO_LABEL[h.turno] ?? h.turno
      let enviados = 0
      for (const c of conferentes) {
        const nome = c.nome ?? c.login
        const mensagem = variarTexto([
          `👋 Oi, ${nome}! O ${label} está fechando — não esquece de lançar as atividades do dia na RV por Turno.`,
          `⏰ ${nome}, chegou a hora do fechamento do ${label}. Lança as atividades de hoje na RV por Turno, por favor.`,
          `Oi, ${nome}! Lembrete do ${label}: falta lançar as atividades de hoje na RV por Turno antes de fechar.`,
        ])
        const r = await enviar(c.telefone as string, mensagem)
        if (r.sucesso) enviados++
        else console.error(`cron-aviso-turno: falha ao enviar pra ${nome} (${h.filial}/${h.turno}):`, r.erro)
      }
      resultado.push({ filial: h.filial, turno: h.turno, enviados })
    }

    res.status(200).json({ ok: true, horaMin, data, verificados: (horarios ?? []).length, resultado })
  } catch (e) {
    console.error('cron-aviso-turno erro:', e)
    res.status(200).json({ ok: false, error: String(e) })
  }
}
