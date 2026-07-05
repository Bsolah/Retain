-- CreateEnum
CREATE TYPE "MigrationPlatform" AS ENUM ('recharge', 'shopify_subscriptions', 'bold', 'appstle', 'smartrr', 'csv');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('discovered', 'syncing', 'validated', 'cutover', 'completed', 'rolled_back', 'failed');

-- CreateEnum
CREATE TYPE "MigrationRecordStatus" AS ENUM ('pending', 'synced', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "migration_jobs" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "platform" "MigrationPlatform" NOT NULL,
    "status" "MigrationStatus" NOT NULL DEFAULT 'discovered',
    "encrypted_credentials" TEXT,
    "preview" JSONB NOT NULL DEFAULT '{}',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "validation_report" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "communication_template" JSONB,
    "cutover_at" TIMESTAMP(3),
    "rollback_deadline" TIMESTAMP(3),
    "error_summary" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_records" (
    "id" TEXT NOT NULL,
    "migration_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "shopify_contract_id" TEXT,
    "shopify_customer_id" TEXT,
    "local_contract_id" TEXT,
    "local_customer_id" TEXT,
    "status" "MigrationRecordStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_errors" (
    "id" TEXT NOT NULL,
    "migration_id" TEXT NOT NULL,
    "record_id" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "requires_manual_action" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_jobs_shop_id_idx" ON "migration_jobs"("shop_id");

-- CreateIndex
CREATE INDEX "migration_jobs_status_idx" ON "migration_jobs"("status");

-- CreateIndex
CREATE INDEX "migration_jobs_platform_idx" ON "migration_jobs"("platform");

-- CreateIndex
CREATE INDEX "migration_records_migration_id_idx" ON "migration_records"("migration_id");

-- CreateIndex
CREATE INDEX "migration_records_status_idx" ON "migration_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "migration_records_migration_id_source_id_source_type_key" ON "migration_records"("migration_id", "source_id", "source_type");

-- CreateIndex
CREATE INDEX "migration_errors_migration_id_idx" ON "migration_errors"("migration_id");

-- CreateIndex
CREATE INDEX "migration_errors_record_id_idx" ON "migration_errors"("record_id");

-- CreateIndex
CREATE INDEX "migration_errors_resolved_idx" ON "migration_errors"("resolved");

-- AddForeignKey
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_records" ADD CONSTRAINT "migration_records_migration_id_fkey" FOREIGN KEY ("migration_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_errors" ADD CONSTRAINT "migration_errors_migration_id_fkey" FOREIGN KEY ("migration_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_errors" ADD CONSTRAINT "migration_errors_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "migration_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
