-- CreateTable
CREATE TABLE "public"."Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseClass" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_phone_key" ON "public"."Driver"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_licenseNumber_key" ON "public"."Driver"("licenseNumber");
