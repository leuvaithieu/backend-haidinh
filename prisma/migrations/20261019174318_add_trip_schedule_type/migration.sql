-- AlterTable
ALTER TABLE "public"."Trip" ADD COLUMN     "scheduleType" "public"."RouteScheduleType" NOT NULL DEFAULT 'NORMAL';
