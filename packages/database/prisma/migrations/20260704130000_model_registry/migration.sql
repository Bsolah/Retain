-- CreateTable
CREATE TABLE "model_registry" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "shop_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_registry_version_key" ON "model_registry"("version");

-- CreateIndex
CREATE INDEX "model_registry_is_active_idx" ON "model_registry"("is_active");

-- CreateIndex
CREATE INDEX "model_registry_shop_id_idx" ON "model_registry"("shop_id");
