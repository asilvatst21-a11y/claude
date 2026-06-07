import { formatPhoneForZAPI } from "./utils";
import type { Ajudante, Vale } from "./types";

const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

function getZAPIBaseURL(): string {
  return `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
}

interface ZAPIResponse {
  zaapId?: string;
  messageId?: string;
  id?: string;
  error?: string;
}

/**
 * Sends a WhatsApp text message via Z-API.
 */
export async function sendMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedPhone = formatPhoneForZAPI(phone);
  if (!formattedPhone) {
    return { success: false, error: "Número de telefone inválido" };
  }
  return sendTextRaw(formattedPhone, message);
}

/**
 * Sends a WhatsApp message to a group via Z-API.
 * Group IDs must NOT pass through the Brazilian phone formatter, so the
 * raw id (e.g. "120363019502650977-group") is used as-is.
 */
export async function sendGroupMessage(
  groupId: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!groupId) return { success: false, error: "ID do grupo inválido" };
  return sendTextRaw(groupId, message);
}

/**
 * Low-level send-text call. `phone` is used verbatim (already formatted or a group id).
 */
async function sendTextRaw(
  phone: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    console.warn("Z-API credentials not configured. Skipping WhatsApp message.");
    return { success: false, error: "Z-API não configurado" };
  }

  const url = `${getZAPIBaseURL()}/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone,
        message,
      }),
    });

    const data: ZAPIResponse = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return { success: true, messageId: data.messageId ?? data.zaapId ?? data.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, error: msg };
  }
}

/**
 * Sends a WhatsApp notification to an ajudante about pending vales.
 */
export async function sendValeNotificacao(
  ajudante: Ajudante,
  vales: Vale[]
): Promise<{ success: boolean; error?: string }> {
  if (!ajudante.telefone) {
    return { success: false, error: "Ajudante sem telefone cadastrado" };
  }

  const numerosVales = vales.map((v) => `#${v.numero_vale}`).join(", ");

  const message =
    `Olá ${ajudante.nome}! Você possui vale(s) pendente(s) no sistema LOG20. ` +
    `Por favor, procure o financeiro para regularizar. ` +
    `Vale(s): ${numerosVales}`;

  return sendMessage(ajudante.telefone, message);
}

/**
 * Sends a WhatsApp notification when a vale status is resolved.
 */
export async function sendValeResolvido(
  ajudante: Ajudante,
  vale: Vale
): Promise<{ success: boolean; error?: string }> {
  if (!ajudante.telefone) {
    return { success: false, error: "Ajudante sem telefone cadastrado" };
  }

  const message =
    `Olá ${ajudante.nome}! Seu vale #${vale.numero_vale} foi resolvido. ` +
    `Status: ${vale.status_vale}. ` +
    `Procure o financeiro para mais informações.`;

  return sendMessage(ajudante.telefone, message);
}
