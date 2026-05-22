import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { paymentId: string } }) {
  const payment = await prisma.mercadoPagoPayment.findUnique({
    where: { mpPaymentId: params.paymentId },
    select: { status: true },
  });
  return NextResponse.json({ status: payment?.status ?? "not_found" });
}
