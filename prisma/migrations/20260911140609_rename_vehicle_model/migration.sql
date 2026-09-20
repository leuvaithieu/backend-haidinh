/*
  Warnings:

  - You are about to drop the `vehicle` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."vehicle";

-- CreateTable
CREATE TABLE "public"."Vehicle" (
    "id" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_licensePlate_key" ON "public"."Vehicle"("licensePlate");
