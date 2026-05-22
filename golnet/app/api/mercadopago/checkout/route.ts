import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const PLANS: Record<string, { amount: number; label: string; planKey: "PRO" | "ENTERPRISE" }> = {
  pro:        { amount: 5.99,  label: "PalpitaAí Pro — 30 dias",         planKey: "PRO" },
  enterprise: { amount: 49.99, label: "PalpitaAí Empresarial — 30 dias", planKey: "ENTERPRISE" },
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const plan = searchParams.get("plan");
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "MercadoPago não configurado" }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true },
  });

  const { amount, label, planKey } = PLANS[plan];
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  const appUrl = process.env.NEXTAUTH_URL ?? "https://palpitai.vercel.app";

  const body = {
    transaction_amount: amount,
    payment_method_id: "pix",
    description: label,
    payer: {
      email: user?.email ?? "payer@palpitai.com",
      first_name: user?.name?.split(" ")[0] ?? "Usuário",
      last_name: user?.name?.split(" ").slice(1).join(" ") || "PalpitaAí",
    },
    external_reference: `${session.user.id}:${planKey}`,
    date_of_expiration: expiresAt.toISOString(),
    notification_url: `${appUrl}/api/mercadopago/webhook`,
  };

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${session.user.id}-${planKey}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("MercadoPago error:", err);
    return NextResponse.json({ error: "Erro ao gerar PIX" }, { status: 500 });
  }

  const payment = await response.json();
  const txData = payment.point_of_interaction?.transaction_data;

  await prisma.mercadoPagoPayment.create({
    data: {
      userId: session.user.id,
      mpPaymentId: String(payment.id),
      plan: planKey,
      amount,
      status: payment.status ?? "pending",
      qrCode: txData?.qr_code ?? null,
      qrCodeBase64: txData?.qr_code_base64 ?? null,
      expiresAt,
    },
  });

  return NextResponse.redirect(new URL(`/pix/${payment.id}`, appUrl));
}
