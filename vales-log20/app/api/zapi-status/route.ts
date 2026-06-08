import { NextRequest } from "next/server";
import { formatPhoneForZAPI } from "@/lib/utils";

const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testPhone = searchParams.get("phone");

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
    return Response.json({ error: "ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados" }, { status: 500 });
  }

  const base = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ZAPI_CLIENT_TOKEN) headers["Client-Token"] = ZAPI_CLIENT_TOKEN;

  // Check instance status
  const statusRes = await fetch(`${base}/status`, { headers }).catch((e) => ({ ok: false, error: e.message }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusData = statusRes instanceof Response && statusRes.ok ? await statusRes.json() : { error: "Falha ao buscar status" } as any;

  const result: Record<string, unknown> = {
    instance_id: ZAPI_INSTANCE_ID,
    client_token_set: !!ZAPI_CLIENT_TOKEN,
    status: statusData,
  };

  if (testPhone) {
    const formatted = formatPhoneForZAPI(testPhone);
    result.phone_original = testPhone;
    result.phone_formatted = formatted;
    result.phone_valid = !!formatted;
  }

  return Response.json(result);
}
