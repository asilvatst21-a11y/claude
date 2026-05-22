-- CreateTable
CREATE TABLE "MercadoPagoPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mpPaymentId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "qrCode" TEXT,
    "qrCodeBase64" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoPagoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercadoPagoPayment_mpPaymentId_key" ON "MercadoPagoPayment"("mpPaymentId");

-- AddForeignKey
ALTER TABLE "MercadoPagoPayment" ADD CONSTRAINT "MercadoPagoPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
