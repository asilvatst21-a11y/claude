import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { sendMessage, sendGroupMessage } from "@/lib/zapi";
import {
  normalizarPedidoReposicao,
  normalizarAudioReposicao,
  verificarValidacao,
} from "@/lib/anthropic";

const VALIDADOR_TELEFONE = process.env.VALIDADOR_TELEFONE ?? "";
// Optional: ID of the WhatsApp group that receives validation requests.
// When set, requests are posted to the group and ANY member can reply.
const VALIDADOR_GRUPO_ID = process.env.VALIDADOR_GRUPO_ID ?? "";

function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "").replace(/@.*$/, "");
}

function isValidador(phone: string): boolean {
  const vPhone = normalizePhone(VALIDADOR_TELEFONE);
  const sPhone = normalizePhone(phone);
  return !!vPhone && sPhone === vPhone;
}

// True when the incoming message belongs to the configured validation group.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isValidacaoGrupo(payload: any): boolean {
  if (!VALIDADOR_GRUPO_ID) return false;
  if (payload.isGroupMsg !== true) return false;
  const groupDigits = normalizePhone(VALIDADOR_GRUPO_ID);
  const incoming = normalizePhone(payload.phone);
  return !!groupDigits && incoming === groupDigits;
}

/**
 * Sends the validation request either to the group (if configured) or the
 * single validador. Returns the messageId for quoted-reply matching.
 */
async function enviarPedidoValidacao(
  texto: string
): Promise<{ messageId?: string } | null> {
  if (VALIDADOR_GRUPO_ID) {
    return sendGroupMessage(VALIDADOR_GRUPO_ID, texto).catch(() => null);
  }
  if (VALIDADOR_TELEFONE) {
    return sendMessage(VALIDADOR_TELEFONE, texto).catch(() => null);
  }
  return null;
}

/** Replies into the validation channel (group or single validador). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responderValidacao(payload: any, texto: string) {
  if (isValidacaoGrupo(payload) && VALIDADOR_GRUPO_ID) {
    await sendGroupMessage(VALIDADOR_GRUPO_ID, texto).catch(() => null);
  } else {
    await sendMessage(normalizePhone(payload.phone), texto).catch(() => null);
  }
}

async function gerarNumero(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const { count } = await supabase
    .from("reposicoes")
    .select("*", { count: "exact", head: true });
  const n = ((count ?? 0) + 1).toString().padStart(4, "0");
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `REP-${ds}-${n}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processDriverMessage(supabase: Awaited<ReturnType<typeof createServiceClient>>, payload: any) {
  const phone = normalizePhone(payload.phone);
  const senderName: string = payload.senderName ?? payload.chatName ?? "Motorista";

  let normalizado;
  let mensagemOriginal = "";

  try {
    if (payload.audio?.audioUrl) {
      // Download audio and send to Claude for transcription + normalization
      mensagemOriginal = "[áudio]";
      const audioRes = await fetch(payload.audio.audioUrl);
      if (!audioRes.ok) throw new Error("Falha ao baixar áudio");
      const buffer = await audioRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = (payload.audio.mimeType ?? "audio/ogg").split(";")[0].trim();
      normalizado = await normalizarAudioReposicao(base64, mimeType);
    } else if (payload.text?.message) {
      mensagemOriginal = payload.text.message;
      normalizado = await normalizarPedidoReposicao(mensagemOriginal);
    } else {
      return; // nothing to process
    }
  } catch (err) {
    console.error("Erro ao normalizar pedido:", err);
    await sendMessage(
      phone,
      "❌ Não consegui processar sua mensagem. Por favor, envie um texto descrevendo a reposição com produto, quantidade, mapa e cliente."
    );
    return;
  }

  if (normalizado.confianca === "baixa") {
    await sendMessage(
      phone,
      "⚠️ Não consegui entender todos os detalhes. Por favor, informe:\n\n" +
        "• Produto e quantidade\n• Número do mapa\n• Nome do cliente\n• Motivo da reposição\n\n" +
        "Exemplo: _Skol 600ml, 2 caixas, mapa 12345, Bar do João, produto avariado_"
    );
    return;
  }

  const numero = await gerarNumero(supabase);

  const { data: rep, error } = await supabase
    .from("reposicoes")
    .insert({
      numero,
      motorista_nome: senderName,
      motorista_telefone: phone,
      mapa: normalizado.mapa,
      cliente: normalizado.cliente,
      produto: normalizado.produto,
      quantidade: normalizado.quantidade,
      motivo: normalizado.motivo,
      mensagem_original: mensagemOriginal,
      status: "pendente",
    })
    .select()
    .single();

  if (error || !rep) {
    console.error("Erro ao criar reposição:", error);
    return;
  }

  // Confirm to driver
  const confirmMsg =
    `✅ *Reposição registrada: ${numero}*\n\n` +
    `📦 Produto: ${normalizado.produto || "—"}\n` +
    `🔢 Quantidade: ${normalizado.quantidade || "—"}\n` +
    `🗺️ Mapa: ${normalizado.mapa || "—"}\n` +
    `👤 Cliente: ${normalizado.cliente || "—"}\n` +
    `❓ Motivo: ${normalizado.motivo || "—"}\n\n` +
    `Aguarde a validação do supervisor.`;

  await sendMessage(phone, confirmMsg).catch(() => null);

  // Send validation request to the group or the single validador
  const validMsg =
    `🔄 *SOLICITAÇÃO DE REPOSIÇÃO*\n` +
    `Nº ${numero}\n\n` +
    `📦 Produto: ${normalizado.produto || "—"}\n` +
    `🔢 Quantidade: ${normalizado.quantidade || "—"}\n` +
    `🗺️ Mapa: ${normalizado.mapa || "—"}\n` +
    `👤 Cliente: ${normalizado.cliente || "—"}\n` +
    `❓ Motivo: ${normalizado.motivo || "—"}\n` +
    `🚛 Motorista: ${senderName}\n\n` +
    `Para validar/negar, *responda a esta mensagem* (ou cite o número ${numero}) ` +
    `com *SIM* para validar ou *NÃO* para negar.`;

  const sent = await enviarPedidoValidacao(validMsg);

  if (sent?.messageId) {
    await supabase
      .from("reposicoes")
      .update({ validador_message_id: sent.messageId })
      .eq("id", rep.id);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processValidadorMessage(supabase: Awaited<ReturnType<typeof createServiceClient>>, payload: any) {
  const refId: string | null = payload.referenceMessageId ?? null;
  const texto: string = payload.text?.message ?? "";
  const quemRespondeu: string =
    payload.participantPhone ? normalizePhone(payload.participantPhone) : normalizePhone(payload.phone);

  if (!texto) return;

  let rep = null;

  // Try to match by quoted message ID first
  if (refId) {
    const { data } = await supabase
      .from("reposicoes")
      .select("*")
      .eq("validador_message_id", refId)
      .eq("status", "pendente")
      .maybeSingle();
    rep = data;
  }

  // If no match by reference, try to extract REP number from message text
  if (!rep) {
    const match = texto.match(/REP-\d{8}-\d+/i);
    if (match) {
      const { data } = await supabase
        .from("reposicoes")
        .select("*")
        .eq("numero", match[0].toUpperCase())
        .eq("status", "pendente")
        .maybeSingle();
      rep = data;
    }
  }

  // In a group there can be many pending requests, so we cannot guess which one
  // a loose reply refers to. Require a quote or an explicit REP number.
  if (!rep) {
    if (isValidacaoGrupo(payload)) {
      const resultadoLoose = await verificarValidacao(texto);
      // Only nudge when the message looks like an actual validation attempt
      if (resultadoLoose !== "inconclusivo") {
        await responderValidacao(
          payload,
          "❓ Não identifiquei a qual reposição você se refere. " +
            "*Responda diretamente* à mensagem da solicitação ou cite o número (ex: REP-20260605-0001)."
        );
      }
    }
    return;
  }

  const resultado = await verificarValidacao(texto);

  if (resultado === "inconclusivo") {
    await responderValidacao(
      payload,
      `❓ Não entendi a resposta para *${rep.numero}*. Responda *SIM* para validar ou *NÃO* para negar.`
    );
    return;
  }

  const newStatus = resultado === "validado" ? "validado" : "negado";
  await supabase.from("reposicoes").update({
    status: newStatus,
    validador_resposta: texto,
    validado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", rep.id);

  // Notify driver
  if (rep.motorista_telefone) {
    const icon = newStatus === "validado" ? "✅" : "❌";
    const word = newStatus === "validado" ? "VALIDADA" : "NEGADA";
    await sendMessage(
      rep.motorista_telefone,
      `${icon} Reposição *${rep.numero}* foi ${word} pelo supervisor.\n` +
        `📦 ${rep.produto}${rep.quantidade ? ` — ${rep.quantidade}` : ""}`
    ).catch(() => null);
  }

  // Confirm in the validation channel
  const confirmWord = newStatus === "validado" ? "validada ✅" : "negada ❌";
  const porQuem = quemRespondeu ? ` (por ${quemRespondeu})` : "";
  await responderValidacao(payload, `Reposição *${rep.numero}* ${confirmWord}${porQuem}`);
}

export async function POST(request: NextRequest) {
  // Z-API webhook: always return 200 quickly to avoid retries
  const payload = await request.json().catch(() => null);

  if (!payload) return Response.json({ ok: true });

  // Skip messages sent by us (fromMe)
  if (payload.fromMe === true) return Response.json({ ok: true });

  const supabase = await createServiceClient();
  const phone = normalizePhone(payload.phone);

  // Group messages: only the configured validation group is processed.
  if (payload.isGroupMsg === true) {
    if (isValidacaoGrupo(payload)) {
      await processValidadorMessage(supabase, payload).catch(console.error);
    }
    // Any other group is ignored.
    return Response.json({ ok: true });
  }

  // Direct messages: a fixed validador (when no group is used) or a driver.
  if (isValidador(phone)) {
    await processValidadorMessage(supabase, payload).catch(console.error);
  } else {
    await processDriverMessage(supabase, payload).catch(console.error);
  }

  return Response.json({ ok: true });
}
