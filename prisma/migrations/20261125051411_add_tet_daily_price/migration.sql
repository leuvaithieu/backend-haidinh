-- CreateTable
CREATE TABLE "public"."TetDailyPrice" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "departureDate" DATE NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TetDailyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TetDailyPrice_departureDate_idx" ON "public"."TetDailyPrice"("departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "TetDailyPrice_policyId_departureDate_key" ON "public"."TetDailyPrice"("policyId", "departureDate");

-- AddForeignKey
ALTER TABLE "public"."TetDailyPrice" ADD CONSTRAINT "TetDailyPrice_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."RoutePricePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
