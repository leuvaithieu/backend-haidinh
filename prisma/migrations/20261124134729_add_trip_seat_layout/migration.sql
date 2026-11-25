
-- Drop existing foreign keys before changing nullability.
ALTER TABLE "public"."Trip" DROP CONSTRAINT "Trip_assistant1Id_fkey";
ALTER TABLE "public"."Trip" DROP CONSTRAINT "Trip_driver1Id_fkey";
ALTER TABLE "public"."Trip" DROP CONSTRAINT "Trip_driver2Id_fkey";
ALTER TABLE "public"."Trip" DROP CONSTRAINT "Trip_vehicleId_fkey";

-- Add seatLayoutId as nullable first.
ALTER TABLE "public"."Trip"
ADD COLUMN "seatLayoutId" TEXT;

-- Allow vehicle and staff assignments to remain optional.
ALTER TABLE "public"."Trip"
ALTER COLUMN "vehicleId" DROP NOT NULL,
ALTER COLUMN "driver1Id" DROP NOT NULL,
ALTER COLUMN "driver2Id" DROP NOT NULL,
ALTER COLUMN "assistant1Id" DROP NOT NULL;

-- Backfill existing trips using the corresponding seat layout templates.
UPDATE "public"."Trip"
SET "seatLayoutId" = CASE
  WHEN "vehicleId" = 'cmu14tlzw0002voqgs2dccsqr'
    THEN 'template_34_aef80d27bed2'
  WHEN "vehicleId" IN (
    'cmukrydev0000vokwx5pg4m3h',
    'cmu14sn0c0000voqgbohqd7lq'
  )
    THEN 'cmw2x0xt30000vop08qxbx364'
  ELSE NULL
END
WHERE "seatLayoutId" IS NULL;

-- Require every trip to have a seat layout.
ALTER TABLE "public"."Trip"
ALTER COLUMN "seatLayoutId" SET NOT NULL;

-- Restore foreign keys.
ALTER TABLE "public"."Trip"
ADD CONSTRAINT "Trip_seatLayoutId_fkey"
FOREIGN KEY ("seatLayoutId")
REFERENCES "public"."SeatLayout"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Trip"
ADD CONSTRAINT "Trip_vehicleId_fkey"
FOREIGN KEY ("vehicleId")
REFERENCES "public"."Vehicle"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Trip"
ADD CONSTRAINT "Trip_driver1Id_fkey"
FOREIGN KEY ("driver1Id")
REFERENCES "public"."Driver"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Trip"
ADD CONSTRAINT "Trip_driver2Id_fkey"
FOREIGN KEY ("driver2Id")
REFERENCES "public"."Driver"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Trip"
ADD CONSTRAINT "Trip_assistant1Id_fkey"
FOREIGN KEY ("assistant1Id")
REFERENCES "public"."Assistant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
