-- CreateEnum
CREATE TYPE "public"."TripDirection" AS ENUM ('OUTBOUND', 'RETURN');

-- AlterTable
ALTER TABLE "public"."Trip" ADD COLUMN     "returnPlannedDeparture" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."TripRoutePoint" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "routePointId" TEXT,
    "pointName" TEXT NOT NULL,
    "direction" "public"."TripDirection" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedTime" TIMESTAMP(3) NOT NULL,
    "actualTime" TIMESTAMP(3),

    CONSTRAINT "TripRoutePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripRoutePoint_tripId_direction_idx" ON "public"."TripRoutePoint"("tripId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "TripRoutePoint_tripId_direction_sequence_key" ON "public"."TripRoutePoint"("tripId", "direction", "sequence");

-- AddForeignKey
ALTER TABLE "public"."TripRoutePoint" ADD CONSTRAINT "TripRoutePoint_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TripRoutePoint" ADD CONSTRAINT "TripRoutePoint_routePointId_fkey" FOREIGN KEY ("routePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
