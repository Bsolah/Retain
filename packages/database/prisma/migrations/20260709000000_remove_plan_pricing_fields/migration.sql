-- Drop unused plan pricing / commitment fields (discounts live on frequencies JSON).
ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "minimum_commitment";
ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "trial_period_days";
ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "pricing_strategy";
ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "discount_value";

DROP TYPE IF EXISTS "PricingStrategy";
