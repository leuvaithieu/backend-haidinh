/*
  Warnings:

  - You are about to drop the column `fuelSurcharge` on the `RoutePricePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `serviceSurcharge` on the `RoutePricePolicy` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."RoutePricePolicy_effectiveFrom_effectiveTo_idx";

-- DropIndex
DROP INDEX "public"."RoutePricePolicy_routeId_direction_status_idx";

-- DropIndex
DROP INDEX "public"."RoutePricePolicy_routeId_vehicleType_idx";

-- AlterTable
ALTER TABLE "public"."RoutePricePolicy" DROP COLUMN "fuelSurcharge",
DROP COLUMN "serviceSurcharge",
ADD COLUMN     "fullRoutePrice" INTEGER,
ADD COLUMN     "pricingMode" "public"."RouteScheduleType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "routeAdjustmentAmount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "baseOriginRoutePointId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "RoutePricePolicy_routeId_pricingMode_direction_status_idx" ON "public"."RoutePricePolicy"("routeId", "pricingMode", "direction", "status");

-- CreateIndex
CREATE INDEX "RoutePricePolicy_routeId_vehicleType_effectiveFrom_effectiv_idx" ON "public"."RoutePricePolicy"("routeId", "vehicleType", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "RoutePricePolicy_routeId_pricingMode_direction_version_idx" ON "public"."RoutePricePolicy"("routeId", "pricingMode", "direction", "version");

-- Add pricing policy constraints
ALTER TABLE "public"."RoutePricePolicy"
ADD CONSTRAINT "RoutePricePolicy_pricing_mode_check"
CHECK (
    (
        "pricingMode" = 'NORMAL'
        AND "baseOriginRoutePointId" IS NOT NULL
        AND "fullRoutePrice" IS NULL
    )
    OR
    (
        "pricingMode" = 'TET'
        AND "baseOriginRoutePointId" IS NULL
        AND "fullRoutePrice" > 0
        AND "routeAdjustmentAmount" = 0
    )
);

-- Validate effective date range
ALTER TABLE "public"."RoutePricePolicy"
ADD CONSTRAINT "RoutePricePolicy_effective_date_check"
CHECK (
    "effectiveTo" IS NULL
    OR "effectiveTo" > "effectiveFrom"
);
