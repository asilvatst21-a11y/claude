import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { paymentId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const payment = await prisma.mercadoPagoPayment.findUnique({
    where: { mpPaymentId: params.paymentId },
    select: { status: true, userId: true },
  });

  if (!payment || payment.userId !== session.user.id) {
    return NextResponse.json({ status: "not_found" });
  }

  return NextResponse.json({ status: payment.status });
}
