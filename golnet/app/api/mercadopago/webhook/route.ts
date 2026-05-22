import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  // MercadoPago sends: { action: "payment.updated", data: { id: "..." } }
  const paymentId = body?.data?.id ?? new URL(req.url).searchParams.get("id");
  if (!paymentId) return NextResponse.json({ ok: true });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ ok: true });

  // Fetch payment status from MercadoPago
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return NextResponse.json({ ok: true });

  const payment = await res.json();
  if (payment.status !== "approved") {
    // Update status in DB but don't activate plan
    await prisma.mercadoPagoPayment.updateMany({
      where: { mpPaymentId: String(paymentId) },
      data: { status: payment.status },
    });
    return NextResponse.json({ ok: true });
  }

  const record = await prisma.mercadoPagoPayment.findUnique({
    where: { mpPaymentId: String(paymentId) },
  });

  if (!record || record.status === "approved") {
    // Already processed or not found
    return NextResponse.json({ ok: true });
  }

  const planKey = record.plan as "PRO" | "ENTERPRISE";
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.mercadoPagoPayment.update({
      where: { mpPaymentId: String(paymentId) },
      data: { status: "approved" },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { plan: planKey, planExpiresAt: thirtyDays },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

// MercadoPago also sends GET for validation
export async function GET() {
  return NextResponse.json({ ok: true });
}
