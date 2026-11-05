-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('BANK_TRANSFER');

-- AlterEnum
ALTER TYPE "public"."BookingStatus" ADD VALUE 'PAYMENT_REVIEW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."PaymentStatus" ADD VALUE 'REPORTED';
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "public"."BookingSeat" ADD COLUMN     "passengerName" TEXT,
ADD COLUMN     "passengerPhone" TEXT;

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionCode" TEXT,
    "transferContent" TEXT,
    "reportedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "public"."Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "public"."Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_transactionCode_idx" ON "public"."Payment"("transactionCode");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "public"."SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
