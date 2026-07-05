-- AlterTable
ALTER TABLE "subscription_contracts"
  ADD COLUMN "resume_date" TIMESTAMP(3),
  ADD COLUMN "last_billing_attempt_id" TEXT,
  ADD COLUMN "consecutive_skips" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "line_items" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "subscription_contracts_last_billing_attempt_id_key"
  ON "subscription_contracts"("last_billing_attempt_id");
