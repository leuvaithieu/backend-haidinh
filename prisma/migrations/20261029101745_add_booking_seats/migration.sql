-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."TripSeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED');

-- AlterTable
ALTER TABLE "public"."Trip" ADD COLUMN     "ticketPrice" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "customerId" TEXT,
    "tripId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingSeat" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tripSeatId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TripSeat" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "status" "public"."TripSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "public"."Booking"("bookingCode");

-- CreateIndex
CREATE INDEX "Booking_tripId_status_idx" ON "public"."Booking"("tripId", "status");

-- CreateIndex
CREATE INDEX "Booking_customerPhone_idx" ON "public"."Booking"("customerPhone");

-- CreateIndex
CREATE INDEX "Booking_holdExpiresAt_idx" ON "public"."Booking"("holdExpiresAt");

-- CreateIndex
CREATE INDEX "BookingSeat_tripSeatId_idx" ON "public"."BookingSeat"("tripSeatId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSeat_bookingId_tripSeatId_key" ON "public"."BookingSeat"("bookingId", "tripSeatId");

-- CreateIndex
CREATE INDEX "TripSeat_tripId_status_idx" ON "public"."TripSeat"("tripId", "status");

-- CreateIndex
CREATE INDEX "TripSeat_holdExpiresAt_idx" ON "public"."TripSeat"("holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripSeat_tripId_seatId_key" ON "public"."TripSeat"("tripId", "seatId");

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_tripSeatId_fkey" FOREIGN KEY ("tripSeatId") REFERENCES "public"."TripSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TripSeat" ADD CONSTRAINT "TripSeat_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TripSeat" ADD CONSTRAINT "TripSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "public"."Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
