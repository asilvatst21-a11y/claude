import { formatPhoneForZAPI } from "./valesUtils";

const ZAPI_INSTANCE_ID = import.meta.env.VITE_ZAPI_INSTANCE as string;
const ZAPI_TOKEN = import.meta.env.VITE_ZAPI_TOKEN as string;
const ZAPI_CLIENT_TOKEN = import.meta.env.VITE_ZAPI_CLIENT_TOKEN as string;

function getZAPIBaseURL(): string {
  return `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
}

export async function sendMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedPhone = formatPhoneForZAPI(phone);
  if (!formattedPhone) {
    return { success: false, error: "Número de telefone inválido" };
  }

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
    return { success: false, error: "Z-API não configurado" };
  }

  const url = `${getZAPIBaseURL()}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ZAPI_CLIENT_TOKEN) headers["Client-Token"] = ZAPI_CLIENT_TOKEN;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: formattedPhone, message }),
    });
    const data = await res.json() as { zaapId?: string; messageId?: string; id?: string; error?: string };
    if (!res.ok || data.error) {
      return { success: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { success: true, messageId: data.zaapId ?? data.messageId ?? data.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro de rede" };
  }
}
