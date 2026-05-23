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
  const appUrl = process.env.NEXTAUTH_URL ?? "https://palpitai.vercel.app";

  // Checkout Pro — cria uma preferência, MP cuida de cartão/PIX/boleto
  const preference = {
    items: [{ title: label, quantity: 1, unit_price: amount, currency_id: "BRL" }],
    payer: { email: user?.email ?? "" },
    external_reference: `${session.user.id}:${planKey}`,
    back_urls: {
      success: `${appUrl}/pricing?success=1`,
      failure: `${appUrl}/pricing?cancelled=1`,
      pending: `${appUrl}/pricing?pending=1`,
    },
    auto_return: "approved",
    notification_url: `${appUrl}/api/mercadopago/webhook`,
    payment_methods: { installments: 1 },
    statement_descriptor: "PalpitaAi",
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preference),
  });

  if (!res.ok) {
    console.error("MP preference error:", await res.text());
    return NextResponse.json({ error: "Erro ao criar preferência de pagamento" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.redirect(data.init_point);
}
