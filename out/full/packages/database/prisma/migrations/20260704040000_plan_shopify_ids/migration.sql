-- AlterTable
ALTER TABLE "subscription_plans"
  ADD COLUMN "shopify_selling_plan_group_id" TEXT;

-- Shopify GIDs are not UUIDs; store as text arrays.
ALTER TABLE "subscription_plans"
  ALTER COLUMN "product_ids" TYPE TEXT[] USING "product_ids"::TEXT[],
  ALTER COLUMN "collection_ids" TYPE TEXT[] USING "collection_ids"::TEXT[];
