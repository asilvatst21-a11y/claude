import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      {
        error: "Stripe not configured",
        message:
          "Configure a variável de ambiente STRIPE_SECRET_KEY para habilitar o portal.",
      },
      { status: 503 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: "Nenhuma assinatura encontrada" },
        { status: 404 }
      );
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/pricing`,
    });

    return NextResponse.redirect(portalSession.url);
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json({ error: "Erro ao abrir portal de assinatura" }, { status: 500 });
  }
}
