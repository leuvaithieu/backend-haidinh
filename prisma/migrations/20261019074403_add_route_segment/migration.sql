-- CreateTable
CREATE TABLE "public"."RouteSegment" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "fromRoutePointId" TEXT NOT NULL,
    "toRoutePointId" TEXT NOT NULL,
    "travelDurationMinutes" INTEGER NOT NULL,

    CONSTRAINT "RouteSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteSegment_routeId_fromRoutePointId_toRoutePointId_key" ON "public"."RouteSegment"("routeId", "fromRoutePointId", "toRoutePointId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteSegment_routeId_key" ON "public"."RouteSegment"("routeId");

-- AddForeignKey
ALTER TABLE "public"."RouteSegment" ADD CONSTRAINT "RouteSegment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RouteSegment" ADD CONSTRAINT "RouteSegment_fromRoutePointId_fkey" FOREIGN KEY ("fromRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RouteSegment" ADD CONSTRAINT "RouteSegment_toRoutePointId_fkey" FOREIGN KEY ("toRoutePointId") REFERENCES "public"."RoutePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
