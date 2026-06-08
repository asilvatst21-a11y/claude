import { NextRequest } from "next/server";
import { formatPhoneForZAPI } from "@/lib/utils";

const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testPhone = searchParams.get("phone");
  const testMsg = searchParams.get("msg") ?? "Teste de envio LOG20";

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
    return Response.json({ error: "ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados" }, { status: 500 });
  }

  const base = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ZAPI_CLIENT_TOKEN) headers["Client-Token"] = ZAPI_CLIENT_TOKEN;

  // Check instance status
  let statusData: unknown = null;
  try {
    const statusRes = await fetch(`${base}/status`, { headers });
    statusData = await statusRes.json();
  } catch (e) {
    statusData = { error: String(e) };
  }

  const result: Record<string, unknown> = {
    instance_id: ZAPI_INSTANCE_ID,
    client_token_set: !!ZAPI_CLIENT_TOKEN,
    zapi_status: statusData,
  };

  // If phone provided, show formatting and attempt a real send
  if (testPhone) {
    const formatted = formatPhoneForZAPI(testPhone);
    result.phone_original = testPhone;
    result.phone_formatted = formatted;
    result.phone_valid = !!formatted;

    if (formatted) {
      try {
        const sendRes = await fetch(`${base}/send-text`, {
          method: "POST",
          headers,
          body: JSON.stringify({ phone: formatted, message: testMsg }),
        });
        const sendData = await sendRes.json();
        result.send_http_status = sendRes.status;
        result.send_response = sendData;
      } catch (e) {
        result.send_error = String(e);
      }
    }
  }

  return Response.json(result, { status: 200 });
}
