import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
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
