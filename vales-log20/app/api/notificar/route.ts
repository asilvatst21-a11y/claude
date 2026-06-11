import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendMessage, sendValeResolvido } from "@/lib/zapi";
import { formatPhoneForZAPI } from "@/lib/utils";

const TEMPLATE_DEFAULT =
  "Olá {nome}! Você possui {qtd} vale(s) pendente(s) no sistema LOG20 que precisam ser tratados. " +
  "Vale(s): {vales}. Por favor, procure o financeiro para regularizar.";

function buildMensagem(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vale_id, tipo = "pendente" } = body;

    if (!vale_id) {
      return NextResponse.json(
        { error: "vale_id é obrigatório" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Get vale with ajudantes
    const { data: vale, error: valeError } = await supabase
      .from("vales")
      .select(
        `
        id,
        numero_vale,
        status_vale,
        notificacao_pendente_enviada,
        notificacao_final_enviada,
        vale_ajudantes (
          ajudantes (
            id,
            nome,
            telefone,
            codigo
          )
        )
      `
      )
      .eq("id", vale_id)
      .single();

    if (valeError || !vale) {
      return NextResponse.json(
        { error: "Vale não encontrado" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ajudantes = (vale.vale_ajudantes as any[])
      .map((va) => va.ajudantes)
      .filter((a) => a && a.telefone);

    if (ajudantes.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhum ajudante com telefone cadastrado para este vale",
          sent: 0,
        },
        { status: 200 }
      );
    }

    // Load message template from settings
    const { data: configRows } = await supabase.from("configuracoes").select("chave, valor");
    const config: Record<string, string> = {};
    for (const row of configRows ?? []) config[row.chave] = row.valor ?? "";
    const template = config.notificacao_template_pendente || TEMPLATE_DEFAULT;

    let sent = 0;
    const errors: string[] = [];

    for (const ajudante of ajudantes) {
      let result: { success: boolean; error?: string };

      if (tipo === "resolvido") {
        result = await sendValeResolvido(ajudante, vale as never);
      } else {
        const phone = formatPhoneForZAPI(ajudante.telefone);
        if (!phone) {
          result = { success: false, error: "Número inválido" };
        } else {
          const mensagemFinal = buildMensagem(template, {
            nome: ajudante.nome,
            qtd: "1",
            vales: `#${vale.numero_vale}`,
          });
          result = await sendMessage(phone, mensagemFinal);
        }
      }

      // Record notification
      await supabase.from("notificacoes").insert({
        vale_id: vale.id,
        ajudante_id: ajudante.id,
        tipo,
        telefone: ajudante.telefone,
        mensagem:
          tipo === "resolvido"
            ? `Vale #${vale.numero_vale} resolvido - Status: ${vale.status_vale}`
            : `Vale #${vale.numero_vale} - notificação pendente`,
        status: result.success ? "enviado" : "erro",
        erro_detalhe: result.error ?? null,
        enviada_em: result.success ? new Date().toISOString() : null,
      });

      if (result.success) {
        sent++;
      } else {
        errors.push(`${ajudante.nome}: ${result.error}`);
      }
    }

    // Update vale notification flags
    if (tipo === "resolvido" && sent > 0) {
      await supabase
        .from("vales")
        .update({ notificacao_final_enviada: true })
        .eq("id", vale.id);
    } else if (tipo === "pendente" && sent > 0) {
      await supabase
        .from("vales")
        .update({ notificacao_pendente_enviada: true })
        .eq("id", vale.id);
    }

    return NextResponse.json({
      success: true,
      sent,
      total: ajudantes.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Notification error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
