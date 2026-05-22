import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { PixClient } from "./pix-client";

export default async function PixPage({ params }: { params: { paymentId: string } }) {
  const payment = await prisma.mercadoPagoPayment.findUnique({
    where: { mpPaymentId: params.paymentId },
  });

  if (!payment) notFound();
  if (payment.status === "approved") redirect("/pricing?success=1");

  return (
    <PixClient
      paymentId={params.paymentId}
      qrCode={payment.qrCode ?? ""}
      qrCodeBase64={payment.qrCodeBase64 ?? ""}
      amount={payment.amount}
      plan={payment.plan}
      expiresAt={payment.expiresAt?.toISOString() ?? null}
    />
  );
}
