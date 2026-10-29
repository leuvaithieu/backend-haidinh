-- AlterTable
ALTER TABLE "public"."TripSeat" ADD COLUMN     "heldByBookingId" TEXT;

-- CreateIndex
CREATE INDEX "TripSeat_heldByBookingId_idx" ON "public"."TripSeat"("heldByBookingId");
