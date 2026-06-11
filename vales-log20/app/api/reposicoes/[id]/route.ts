import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { sendMessage } from "@/lib/zapi";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, observacao } = body as { status: string; observacao?: string };

  const allowed = ["validado", "negado", "quebra", "pendente"];
  if (!allowed.includes(status)) {
    return Response.json({ error: "Status inválido" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (observacao) updates.validador_resposta = observacao;
  if (status === "validado" || status === "negado") {
    updates.validado_em = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("reposicoes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Notify driver if we have their phone and it's a definitive status
  if (data.motorista_telefone && (status === "validado" || status === "negado")) {
    const icon = status === "validado" ? "✅" : "❌";
    const word = status === "validado" ? "VALIDADA" : "NEGADA";
    const msg =
      `${icon} Sua reposição *${data.numero}* foi ${word}.\n` +
      `📦 ${data.produto} ${data.quantidade ? `— ${data.quantidade}` : ""}\n` +
      (observacao ? `💬 ${observacao}` : "");
    await sendMessage(data.motorista_telefone, msg).catch(() => null);
  }

  return Response.json(data);
}
