-- Keep the latest signal row per contract, then enforce uniqueness.
DELETE FROM "subscriber_signals" a
USING "subscriber_signals" b
WHERE a."contract_id" = b."contract_id"
  AND (
    a."calculated_at" < b."calculated_at"
    OR (a."calculated_at" = b."calculated_at" AND a."id" < b."id")
  );

DROP INDEX IF EXISTS "subscriber_signals_contract_id_idx";

CREATE UNIQUE INDEX "subscriber_signals_contract_id_key" ON "subscriber_signals"("contract_id");

ALTER TABLE "subscriber_signals"
ADD COLUMN IF NOT EXISTS "feature_vector" JSONB NOT NULL DEFAULT '{}';
