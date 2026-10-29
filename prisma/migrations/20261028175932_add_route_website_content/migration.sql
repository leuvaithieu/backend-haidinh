-- CreateTable
CREATE TABLE "public"."RouteWebsiteContent" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "bannerUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteWebsiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteWebsiteContent_routeId_key" ON "public"."RouteWebsiteContent"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteWebsiteContent_slug_key" ON "public"."RouteWebsiteContent"("slug");

-- AddForeignKey
ALTER TABLE "public"."RouteWebsiteContent" ADD CONSTRAINT "RouteWebsiteContent_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
