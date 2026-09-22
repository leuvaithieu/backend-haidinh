/*
  Warnings:

  - Made the column `cccd` on table `Assistant` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Assistant" ALTER COLUMN "cccd" SET NOT NULL;
