/*
  Warnings:

  - The `status` column on the `Assistant` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Assistant" DROP COLUMN "status",
ADD COLUMN     "status" "public"."AssistantStatus" NOT NULL DEFAULT 'ACTIVE';
