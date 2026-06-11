import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function verifyMPSignature(req: Request, secret: string): boolean {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  const dataId = new URL(req.url).searchParams.get("data.id");
  if (!xSignature) return false;

  // Parse ts and v1 from x-signature header
  const parts = Object.fromEntries(xSignature.split(",").map((p) => p.trim().split("=")));
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId ?? ""};request-id:${xRequestId ?? ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (webhookSecret && !verifyMPSignature(req, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Ignora notificações que não são de pagamento
  const topic = body?.type ?? body?.topic;
  if (topic && topic !== "payment") return NextResponse.json({ ok: true });

  const paymentId = body?.data?.id ?? new URL(req.url).searchParams.get("id");
  if (!paymentId) return NextResponse.json({ ok: true });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ ok: true });

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return NextResponse.json({ ok: true });

  const payment = await res.json();

  // Já existe registro? Atualiza status
  const existing = await prisma.mercadoPagoPayment.findUnique({
    where: { mpPaymentId: String(paymentId) },
  });

  if (existing) {
    if (existing.status === "approved") return NextResponse.json({ ok: true }); // já processado
    if (payment.status !== "approved") {
      await prisma.mercadoPagoPayment.update({
        where: { mpPaymentId: String(paymentId) },
        data: { status: payment.status },
      });
      return NextResponse.json({ ok: true });
    }
  }

  if (payment.status !== "approved") return NextResponse.json({ ok: true });

  // Extrai userId e planKey do external_reference  ("userId:PRO")
  const ref = payment.external_reference ?? "";
  const [userId, planKey] = ref.split(":");
  if (!userId || !planKey || !["PRO", "ENTERPRISE"].includes(planKey)) {
    console.error("MP webhook: external_reference inválido:", ref);
    return NextResponse.json({ ok: true });
  }

  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.mercadoPagoPayment.upsert({
      where: { mpPaymentId: String(paymentId) },
      create: {
        userId,
        mpPaymentId: String(paymentId),
        plan: planKey,
        amount: payment.transaction_amount ?? 0,
        status: "approved",
      },
      update: { status: "approved" },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { plan: planKey as "PRO" | "ENTERPRISE", planExpiresAt: oneYear },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
