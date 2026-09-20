-- CreateTable
CREATE TABLE "public"."vehicle" (
    "id" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_licensePlate_key" ON "public"."vehicle"("licensePlate");
