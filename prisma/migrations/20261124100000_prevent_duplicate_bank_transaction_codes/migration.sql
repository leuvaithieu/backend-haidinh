-- Prevent one non-empty bank transaction reference from being attached to multiple payments.
-- Abort safely instead of silently changing historical payment records if duplicates already exist.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Payment"
        WHERE "transactionCode" IS NOT NULL
          AND BTRIM("transactionCode") <> ''
        GROUP BY LOWER(BTRIM("transactionCode"))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate non-empty Payment.transactionCode values exist. Resolve them before applying this migration.';
    END IF;
END $$;

CREATE UNIQUE INDEX "Payment_transactionCode_normalized_key"
ON "Payment" (LOWER(BTRIM("transactionCode")))
WHERE "transactionCode" IS NOT NULL AND BTRIM("transactionCode") <> '';
