import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PRICE_IDS: Record<string, string> = {
  pro: "price_pro_monthly",
  enterprise: "price_enterprise_monthly",
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const plan = searchParams.get("plan");

  if (!plan || !PRICE_IDS[plan]) {
    return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      {
        error: "Stripe not configured",
        message:
          "Configure a variável de ambiente STRIPE_SECRET_KEY para habilitar pagamentos.",
      },
      { status: 503 }
    );
  }

  try {
    // Dynamically import Stripe only when the key is available
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, stripeCustomerId: true },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: PRICE_IDS[plan],
          quantity: 1,
        },
      ],
      customer: user?.stripeCustomerId ?? undefined,
      customer_email: user?.stripeCustomerId ? undefined : (user?.email ?? undefined),
      metadata: {
        userId: session.user.id,
        plan,
      },
      success_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/pricing?success=1`,
      cancel_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/pricing?cancelled=1`,
    });

    return NextResponse.redirect(checkoutSession.url ?? "/pricing");
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Erro ao criar sessão de pagamento" }, { status: 500 });
  }
}
