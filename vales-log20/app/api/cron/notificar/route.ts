import { createServiceClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/zapi";
import { formatPhoneForZAPI } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TEMPLATE_DEFAULT =
  "Olá {nome}! Você possui {qtd} vale(s) pendente(s) no sistema LOG20 que precisam ser tratados. " +
  "Vale(s): {vales}. Por favor, procure o financeiro para regularizar.";

function buildMensagem(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function GET(request: Request) {
  // Vercel Cron sends CRON_SECRET in Authorization header
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers ? (request as Request & { headers: Headers }).headers.get("authorization") : null;
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = await createServiceClient();

  // Load settings
  const { data: configRows } = await supabase.from("configuracoes").select("chave, valor");
  const config: Record<string, string> = {};
  for (const row of configRows ?? []) config[row.chave] = row.valor ?? "";

  if (config.notificacao_automatica !== "true") {
    return Response.json({ skipped: true, reason: "notificação automática desativada" });
  }

  const template = config.notificacao_template_pendente || TEMPLATE_DEFAULT;

  // Load all pending vales without transportadora treatment
  const { data: vales } = await supabase
    .from("vales")
    .select(`
      id, numero_vale, data_emissao,
      vale_ajudantes (
        ajudantes ( id, nome, telefone )
      )
    `)
    .eq("status_vale", "Sem Ação")
    .or("acao_transportadora.is.null,acao_transportadora.eq.Sem ação");

  if (!vales?.length) return Response.json({ sent: 0, reason: "nenhum vale pendente" });

  // Group by ajudante
  const byAjudante = new Map<string, { nome: string; telefone: string; vales: number[] }>();
  for (const vale of vales) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ajudantes = (vale.vale_ajudantes as any[]).map((va) => va.ajudantes).filter(Boolean);
    for (const aj of ajudantes) {
      if (!aj.telefone) continue;
      const phone = formatPhoneForZAPI(aj.telefone);
      if (!phone) continue;
      if (!byAjudante.has(aj.id)) {
        byAjudante.set(aj.id, { nome: aj.nome, telefone: phone, vales: [] });
      }
      byAjudante.get(aj.id)!.vales.push(vale.numero_vale);
    }
  }

  let sent = 0;
  const errors: string[] = [];

  for (const [, aj] of byAjudante) {
    const mensagem = buildMensagem(template, {
      nome: aj.nome,
      qtd: String(aj.vales.length),
      vales: aj.vales.map((n) => `#${n}`).join(", "),
    });

    const result = await sendMessage(aj.telefone, mensagem).catch(() => ({ success: false, error: "Erro de rede" }));
    if (result.success) sent++;
    else errors.push(`${aj.nome}: ${result.error}`);
  }

  return Response.json({ sent, total: byAjudante.size, errors: errors.length ? errors : undefined });
}
