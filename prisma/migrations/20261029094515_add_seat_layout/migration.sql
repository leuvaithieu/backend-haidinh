-- CreateEnum
CREATE TYPE "public"."SeatType" AS ENUM ('BERTH', 'SEAT', 'PRIVATE_ROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."SeatLayoutStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "public"."SeatLayout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."SeatLayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "vehicleId" TEXT,
    "copiedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Seat" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "type" "public"."SeatType" NOT NULL DEFAULT 'BERTH',
    "level" INTEGER NOT NULL DEFAULT 1,
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeatLayout_vehicleId_key" ON "public"."SeatLayout"("vehicleId");

-- CreateIndex
CREATE INDEX "SeatLayout_isTemplate_status_idx" ON "public"."SeatLayout"("isTemplate", "status");

-- CreateIndex
CREATE INDEX "SeatLayout_copiedFromId_idx" ON "public"."SeatLayout"("copiedFromId");

-- CreateIndex
CREATE INDEX "Seat_layoutId_isActive_idx" ON "public"."Seat"("layoutId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_layoutId_code_key" ON "public"."Seat"("layoutId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_layoutId_level_row_column_key" ON "public"."Seat"("layoutId", "level", "row", "column");

-- AddForeignKey
ALTER TABLE "public"."SeatLayout" ADD CONSTRAINT "SeatLayout_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeatLayout" ADD CONSTRAINT "SeatLayout_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "public"."SeatLayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Seat" ADD CONSTRAINT "Seat_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "public"."SeatLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
