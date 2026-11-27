-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "createdByIp" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ONLINE';

-- CreateIndex
CREATE INDEX "Booking_createdByIp_createdAt_idx" ON "public"."Booking"("createdByIp", "createdAt");
