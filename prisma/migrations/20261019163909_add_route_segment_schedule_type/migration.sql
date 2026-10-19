/*
  Warnings:

  - A unique constraint covering the columns `[routeId,fromRoutePointId,toRoutePointId,scheduleType]` on the table `RouteSegment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."RouteScheduleType" AS ENUM ('NORMAL', 'TET');

-- DropIndex
DROP INDEX "public"."RouteSegment_routeId_fromRoutePointId_toRoutePointId_key";

-- AlterTable
ALTER TABLE "public"."RouteSegment" ADD COLUMN     "scheduleType" "public"."RouteScheduleType" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE UNIQUE INDEX "RouteSegment_routeId_fromRoutePointId_toRoutePointId_schedu_key" ON "public"."RouteSegment"("routeId", "fromRoutePointId", "toRoutePointId", "scheduleType");
