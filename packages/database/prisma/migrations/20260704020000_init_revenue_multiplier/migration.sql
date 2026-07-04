-- Drop scaffold table from early local prototyping (if present).
DROP TABLE IF EXISTS "health_checks";

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('starter', 'growth', 'scale', 'enterprise');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('active', 'paused', 'uninstalled');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('standard', 'prepaid', 'box');

-- CreateEnum
CREATE TYPE "PricingStrategy" AS ENUM ('percentage_discount', 'fixed_price', 'tiered');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('active', 'paused', 'cancelled', 'expired', 'payment_failed');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('healthy', 'at_risk', 'critical');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "InterventionType" AS ENUM ('skip_offer', 'discount_offer', 'pause_offer', 'swap_suggestion', 'loyalty_bonus', 'personal_outreach', 'dunning_retry', 'cancel_save');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('pending', 'sent', 'opened', 'clicked', 'accepted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "InterventionOutcome" AS ENUM ('saved', 'churned', 'no_action', 'converted');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('system', 'merchant', 'customer', 'webhook', 'api', 'ai');

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "shopify_domain" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "plan_tier" "PlanTier" NOT NULL DEFAULT 'starter',
    "status" "ShopStatus" NOT NULL DEFAULT 'active',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "billing_settings" JSONB NOT NULL DEFAULT '{}',
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shopify_customer_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "total_subscriptions" INTEGER NOT NULL DEFAULT 0,
    "active_subscriptions" INTEGER NOT NULL DEFAULT 0,
    "lifetime_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "first_order_date" TIMESTAMP(3),
    "last_order_date" TIMESTAMP(3),
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "email_consent" BOOLEAN NOT NULL DEFAULT false,
    "sms_consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'active',
    "plan_type" "PlanType" NOT NULL DEFAULT 'standard',
    "frequencies" JSONB NOT NULL DEFAULT '[]',
    "minimum_commitment" INTEGER,
    "trial_period_days" INTEGER NOT NULL DEFAULT 0,
    "pricing_strategy" "PricingStrategy" NOT NULL DEFAULT 'percentage_discount',
    "discount_value" DECIMAL(12,2),
    "box_config" JSONB,
    "product_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "collection_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_contracts" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "shopify_contract_id" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'active',
    "billing_policy" JSONB NOT NULL DEFAULT '{}',
    "delivery_policy" JSONB NOT NULL DEFAULT '{}',
    "pricing_policy" JSONB NOT NULL DEFAULT '{}',
    "next_billing_date" TIMESTAMP(3),
    "last_billing_date" TIMESTAMP(3),
    "last_order_id" TEXT,
    "total_charges" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "box_items" JSONB,
    "churn_risk_score" DOUBLE PRECISION,
    "health_status" "HealthStatus" NOT NULL DEFAULT 'healthy',
    "predicted_churn_14d" DOUBLE PRECISION,
    "predicted_churn_30d" DOUBLE PRECISION,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "cancellation_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_orders" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "billing_cycle" INTEGER,
    "is_one_off" BOOLEAN NOT NULL DEFAULT false,
    "fulfillment_status" TEXT,
    "tracking_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriber_signals" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "days_since_last_engagement" INTEGER,
    "portal_login_count_30d" INTEGER NOT NULL DEFAULT 0,
    "product_swap_count_30d" INTEGER NOT NULL DEFAULT 0,
    "skip_count_90d" INTEGER NOT NULL DEFAULT 0,
    "pause_count_lifetime" INTEGER NOT NULL DEFAULT 0,
    "cadence_drift_days" INTEGER,
    "avg_order_value" DECIMAL(12,2),
    "order_frequency_days" DOUBLE PRECISION,
    "payment_failure_count_30d" INTEGER NOT NULL DEFAULT 0,
    "payment_failure_count_90d" INTEGER NOT NULL DEFAULT 0,
    "days_since_last_payment_failure" INTEGER,
    "support_ticket_count_30d" INTEGER NOT NULL DEFAULT 0,
    "support_ticket_sentiment" DOUBLE PRECISION,
    "email_open_rate_30d" DOUBLE PRECISION,
    "email_click_rate_30d" DOUBLE PRECISION,
    "sms_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "tenure_days" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subscription_count" INTEGER NOT NULL DEFAULT 1,
    "predicted_churn_14d" DOUBLE PRECISION,
    "predicted_churn_30d" DOUBLE PRECISION,
    "model_version" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interventions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "intervention_type" "InterventionType" NOT NULL,
    "trigger_reason" TEXT NOT NULL,
    "message_subject" TEXT,
    "message_body" TEXT,
    "offer_value" JSONB,
    "status" "InterventionStatus" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "outcome" "InterventionOutcome",
    "revenue_impact" DECIMAL(12,2),
    "is_auto" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "event_type" TEXT NOT NULL,
    "event_subtype" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "source" "EventSource" NOT NULL DEFAULT 'system',
    "user_agent" TEXT,
    "ip_address" inet,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_shopify_domain_key" ON "shops"("shopify_domain");

-- CreateIndex
CREATE UNIQUE INDEX "shops_shopify_shop_id_key" ON "shops"("shopify_shop_id");

-- CreateIndex
CREATE INDEX "shops_status_idx" ON "shops"("status");

-- CreateIndex
CREATE INDEX "customers_shop_id_idx" ON "customers"("shop_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shop_id_shopify_customer_id_key" ON "customers"("shop_id", "shopify_customer_id");

-- CreateIndex
CREATE INDEX "subscription_plans_shop_id_idx" ON "subscription_plans"("shop_id");

-- CreateIndex
CREATE INDEX "subscription_plans_status_idx" ON "subscription_plans"("status");

-- CreateIndex
CREATE INDEX "subscription_plans_plan_type_idx" ON "subscription_plans"("plan_type");

-- CreateIndex
CREATE INDEX "subscription_contracts_shop_id_idx" ON "subscription_contracts"("shop_id");

-- CreateIndex
CREATE INDEX "subscription_contracts_customer_id_idx" ON "subscription_contracts"("customer_id");

-- CreateIndex
CREATE INDEX "subscription_contracts_status_idx" ON "subscription_contracts"("status");

-- CreateIndex
CREATE INDEX "subscription_contracts_next_billing_date_idx" ON "subscription_contracts"("next_billing_date");

-- CreateIndex (partial: only rows with a churn risk score)
CREATE INDEX "subscription_contracts_churn_risk_score_idx" ON "subscription_contracts"("churn_risk_score") WHERE "churn_risk_score" IS NOT NULL;

-- CreateIndex
CREATE INDEX "subscription_contracts_health_status_idx" ON "subscription_contracts"("health_status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_contracts_shop_id_shopify_contract_id_key" ON "subscription_contracts"("shop_id", "shopify_contract_id");

-- CreateIndex
CREATE INDEX "subscription_orders_contract_id_idx" ON "subscription_orders"("contract_id");

-- CreateIndex
CREATE INDEX "subscription_orders_shop_id_idx" ON "subscription_orders"("shop_id");

-- CreateIndex
CREATE INDEX "subscription_orders_customer_id_idx" ON "subscription_orders"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_orders_shop_id_shopify_order_id_key" ON "subscription_orders"("shop_id", "shopify_order_id");

-- CreateIndex
CREATE INDEX "subscriber_signals_contract_id_idx" ON "subscriber_signals"("contract_id");

-- CreateIndex
CREATE INDEX "subscriber_signals_calculated_at_idx" ON "subscriber_signals"("calculated_at");

-- CreateIndex
CREATE INDEX "subscriber_signals_predicted_churn_14d_idx" ON "subscriber_signals"("predicted_churn_14d");

-- CreateIndex
CREATE INDEX "interventions_contract_id_idx" ON "interventions"("contract_id");

-- CreateIndex
CREATE INDEX "interventions_shop_id_idx" ON "interventions"("shop_id");

-- CreateIndex
CREATE INDEX "interventions_intervention_type_idx" ON "interventions"("intervention_type");

-- CreateIndex
CREATE INDEX "interventions_status_idx" ON "interventions"("status");

-- CreateIndex
CREATE INDEX "interventions_created_at_idx" ON "interventions"("created_at");

-- CreateIndex
CREATE INDEX "events_shop_id_idx" ON "events"("shop_id");

-- CreateIndex
CREATE INDEX "events_contract_id_idx" ON "events"("contract_id");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_contracts" ADD CONSTRAINT "subscription_contracts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_contracts" ADD CONSTRAINT "subscription_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_contracts" ADD CONSTRAINT "subscription_contracts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "subscription_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriber_signals" ADD CONSTRAINT "subscriber_signals_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "subscription_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "subscription_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "subscription_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

