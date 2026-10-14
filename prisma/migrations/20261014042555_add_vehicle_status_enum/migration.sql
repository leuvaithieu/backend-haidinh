/*
  Warnings:

  - The `status` column on the `Vehicle` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "public"."Vehicle" DROP COLUMN "status",
ADD COLUMN     "status" "public"."VehicleStatus" NOT NULL DEFAULT 'ACTIVE';
