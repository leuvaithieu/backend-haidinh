/*
  Warnings:

  - A unique constraint covering the columns `[routeId,sequence]` on the table `RoutePoint` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "RoutePoint_routeId_sequence_key" ON "public"."RoutePoint"("routeId", "sequence");
