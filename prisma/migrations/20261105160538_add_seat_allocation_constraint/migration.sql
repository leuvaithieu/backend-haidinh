/*
  Warnings:

  - You are about to drop the column `tripSeatId` on the `BookingSeat` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[seatAllocationId]` on the table `BookingSeat` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `seatAllocationId` to the `BookingSeat` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."PricePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."PriceEntryType" AS ENUM ('FIXED', 'CONTACT');

-- CreateEnum
CREATE TYPE "public"."PricePointType" AS ENUM ('ROUTE_POINT', 'SERVICE_POINT');

-- CreateEnum
CREATE TYPE "public"."SeatAllocationStatus" AS ENUM ('HELD', 'BOOKED', 'RELEASED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "public"."BookingSeat" DROP CONSTRAINT "BookingSeat_tripSeatId_fkey";

-- DropIndex
DROP INDEX "public"."BookingSeat_bookingId_tripSeatId_key";

-- DropIndex
DROP INDEX "public"."BookingSeat_tripSeatId_idx";

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "direction" "public"."TripDirection" NOT NULL DEFAULT 'OUTBOUND';

-- AlterTable
ALTER TABLE "public"."BookingSeat" DROP COLUMN "tripSeatId",
ADD COLUMN     "dropoffRoutePointId" TEXT,
ADD COLUMN     "dropoffServicePointId" TEXT,
ADD COLUMN     "dropoffTripRoutePointId" TEXT,
ADD COLUMN     "pickupRoutePointId" TEXT,
ADD COLUMN     "pickupServicePointId" TEXT,
ADD COLUMN     "pickupTripRoutePointId" TEXT,
ADD COLUMN     "pricePolicyId" TEXT,
ADD COLUMN     "priceSnapshot" JSONB,
ADD COLUMN     "seatAllocationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."RoutePricePolicy" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "baseOriginRoutePointId" TEXT NOT NULL,
    "direction" "public"."TripDirection" NOT NULL,
    "vehicleType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "public"."PricePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "fuelSurcharge" INTEGER NOT NULL DEFAULT 0,
    "serviceSurcharge" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePricePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoutePointPrice" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "routePointId" TEXT NOT NULL,
    "priceType" "public"."PriceEntryType" NOT NULL DEFAULT 'CONTACT',
    "price" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePointPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServicePointPrice" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "servicePointId" TEXT NOT NULL,
    "priceType" "public"."PriceEntryType" NOT NULL DEFAULT 'CONTACT',
    "price" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePointPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoutePriceOverride" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "fromPointType" "public"."PricePointType" NOT NULL,
    "toPointType" "public"."PricePointType" NOT NULL,
    "fromPointKey" TEXT NOT NULL,
    "toPointKey" TEXT NOT NULL,
    "fromRoutePointId" TEXT,
    "fromServicePointId" TEXT,
    "toRoutePointId" TEXT,
    "toServicePointId" TEXT,
    "priceType" "public"."PriceEntryType" NOT NULL DEFAULT 'CONTACT',
    "price" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SeatAllocation" (
    "id" TEXT NOT NULL,
    "tripSeatId" TEXT NOT NULL,
    "direction" "public"."TripDirection" NOT NULL,
    "pickupSequence" INTEGER NOT NULL,
    "dropoffSequence" INTEGER NOT NULL,
    "status" "public"."SeatAllocationStatus" NOT NULL DEFAULT 'HELD',
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutePricePolicy_routeId_direction_status_idx" ON "public"."RoutePricePolicy"("routeId", "direction", "status");

-- CreateIndex
CREATE INDEX "RoutePricePolicy_routeId_vehicleType_idx" ON "public"."RoutePricePolicy"("routeId", "vehicleType");

-- CreateIndex
CREATE INDEX "RoutePricePolicy_effectiveFrom_effectiveTo_idx" ON "public"."RoutePricePolicy"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "RoutePointPrice_routePointId_idx" ON "public"."RoutePointPrice"("routePointId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePointPrice_policyId_routePointId_key" ON "public"."RoutePointPrice"("policyId", "routePointId");

-- CreateIndex
CREATE INDEX "ServicePointPrice_servicePointId_idx" ON "public"."ServicePointPrice"("servicePointId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePointPrice_policyId_servicePointId_key" ON "public"."ServicePointPrice"("policyId", "servicePointId");

-- CreateIndex
CREATE INDEX "RoutePriceOverride_policyId_idx" ON "public"."RoutePriceOverride"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePriceOverride_policyId_fromPointKey_toPointKey_key" ON "public"."RoutePriceOverride"("policyId", "fromPointKey", "toPointKey");

-- CreateIndex
CREATE INDEX "SeatAllocation_tripSeatId_direction_status_idx" ON "public"."SeatAllocation"("tripSeatId", "direction", "status");

-- CreateIndex
CREATE INDEX "SeatAllocation_holdExpiresAt_idx" ON "public"."SeatAllocation"("holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSeat_seatAllocationId_key" ON "public"."BookingSeat"("seatAllocationId");

-- CreateIndex
CREATE INDEX "BookingSeat_bookingId_idx" ON "public"."BookingSeat"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSeat_pricePolicyId_idx" ON "public"."BookingSeat"("pricePolicyId");

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_seatAllocationId_fkey" FOREIGN KEY ("seatAllocationId") REFERENCES "public"."SeatAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_pickupRoutePointId_fkey" FOREIGN KEY ("pickupRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_dropoffRoutePointId_fkey" FOREIGN KEY ("dropoffRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_pickupServicePointId_fkey" FOREIGN KEY ("pickupServicePointId") REFERENCES "public"."ServicePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_dropoffServicePointId_fkey" FOREIGN KEY ("dropoffServicePointId") REFERENCES "public"."ServicePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_pickupTripRoutePointId_fkey" FOREIGN KEY ("pickupTripRoutePointId") REFERENCES "public"."TripRoutePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_dropoffTripRoutePointId_fkey" FOREIGN KEY ("dropoffTripRoutePointId") REFERENCES "public"."TripRoutePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingSeat" ADD CONSTRAINT "BookingSeat_pricePolicyId_fkey" FOREIGN KEY ("pricePolicyId") REFERENCES "public"."RoutePricePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePricePolicy" ADD CONSTRAINT "RoutePricePolicy_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePricePolicy" ADD CONSTRAINT "RoutePricePolicy_baseOriginRoutePointId_fkey" FOREIGN KEY ("baseOriginRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePointPrice" ADD CONSTRAINT "RoutePointPrice_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."RoutePricePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePointPrice" ADD CONSTRAINT "RoutePointPrice_routePointId_fkey" FOREIGN KEY ("routePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicePointPrice" ADD CONSTRAINT "ServicePointPrice_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."RoutePricePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicePointPrice" ADD CONSTRAINT "ServicePointPrice_servicePointId_fkey" FOREIGN KEY ("servicePointId") REFERENCES "public"."ServicePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePriceOverride" ADD CONSTRAINT "RoutePriceOverride_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."RoutePricePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePriceOverride" ADD CONSTRAINT "RoutePriceOverride_fromRoutePointId_fkey" FOREIGN KEY ("fromRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePriceOverride" ADD CONSTRAINT "RoutePriceOverride_fromServicePointId_fkey" FOREIGN KEY ("fromServicePointId") REFERENCES "public"."ServicePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePriceOverride" ADD CONSTRAINT "RoutePriceOverride_toRoutePointId_fkey" FOREIGN KEY ("toRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoutePriceOverride" ADD CONSTRAINT "RoutePriceOverride_toServicePointId_fkey" FOREIGN KEY ("toServicePointId") REFERENCES "public"."ServicePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeatAllocation" ADD CONSTRAINT "SeatAllocation_tripSeatId_fkey" FOREIGN KEY ("tripSeatId") REFERENCES "public"."TripSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "SeatAllocation"
ADD CONSTRAINT "seat_allocation_no_overlapping_segments"
EXCLUDE USING GIST (
  "tripSeatId" WITH =,
  "direction" WITH =,
  int4range("pickupSequence", "dropoffSequence", '[)') WITH &&
)
WHERE ("status" IN ('HELD', 'BOOKED'));