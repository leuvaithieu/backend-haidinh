/*
  Warnings:

  - A unique constraint covering the columns `[cccd]` on the table `Assistant` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Assistant_cccd_key" ON "public"."Assistant"("cccd");
