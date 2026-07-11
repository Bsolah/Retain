import type { SubscriptionPlan as DbPlan } from '@retain/database';
import { computeSubscriptionValueFromLineItems } from '@retain/shopify-admin';
import type { ValidatedFrequency } from '../services/plan-validation.js';

const ACTIVE_STATUSES = new Set(['active', 'paused', 'payment_failed']);

export type PlanGql = {
  id: string;
  shopId: string;
  shopifySellingPlanGroupId: string | null;
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'archived';
  planType: 'standard' | 'prepaid' | 'box';
  frequencies: ValidatedFrequency[];
  boxConfig: {
    minItems?: number | null;
    maxItems?: number | null;
    allowSwaps?: boolean | null;
    slots?: Array<{
      id: string;
      label?: string | null;
      required?: boolean | null;
    }> | null;
    eligibleProductIds?: string[] | null;
  } | null;
  productIds: string[];
  collectionIds: string[];
  subscriberCount: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
};

function parseFrequencies(value: unknown): ValidatedFrequency[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      interval: Number(row.interval ?? 1),
      unit: String(row.unit ?? 'month') as ValidatedFrequency['unit'],
      discountPercent:
        row.discountPercent == null ? null : Number(row.discountPercent),
      prepaidBillingInterval:
        row.prepaidBillingInterval == null
          ? null
          : Number(row.prepaidBillingInterval),
    };
  });
}

function parseBoxConfig(value: unknown): PlanGql['boxConfig'] {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  const slots = Array.isArray(row.slots)
    ? row.slots.map((slot) => {
        const s = slot as Record<string, unknown>;
        return {
          id: String(s.id ?? ''),
          label: s.label == null ? null : String(s.label),
          required: s.required == null ? null : Boolean(s.required),
        };
      })
    : null;

  return {
    minItems: row.minItems == null ? null : Number(row.minItems),
    maxItems: row.maxItems == null ? null : Number(row.maxItems),
    allowSwaps: row.allowSwaps == null ? null : Boolean(row.allowSwaps),
    slots,
    eligibleProductIds: Array.isArray(row.eligibleProductIds)
      ? row.eligibleProductIds.map((id) => String(id))
      : null,
  };
}

function contractSubscriptionValue(contract: {
  lineItems?: unknown;
  totalRevenue: { toString(): string } | number;
}): number {
  const fromLineItems = computeSubscriptionValueFromLineItems(
    contract.lineItems,
  );
  if (fromLineItems > 0) {
    return fromLineItems;
  }
  return Number(contract.totalRevenue ?? 0);
}

export function mapPlanToGql(
  plan: DbPlan & {
    contracts?: Array<{
      status: string;
      lineItems?: unknown;
      totalRevenue: { toString(): string } | number;
    }>;
  },
): PlanGql {
  const contracts = plan.contracts ?? [];
  const revenue = contracts.reduce((sum, contract) => {
    if (!ACTIVE_STATUSES.has(contract.status)) {
      return sum;
    }
    return sum + contractSubscriptionValue(contract);
  }, 0);
  const subscriberCount = contracts.filter((contract) =>
    ACTIVE_STATUSES.has(contract.status),
  ).length;

  return {
    id: plan.id,
    shopId: plan.shopId,
    shopifySellingPlanGroupId: plan.shopifySellingPlanGroupId,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    planType: plan.planType,
    frequencies: parseFrequencies(plan.frequencies),
    boxConfig: parseBoxConfig(plan.boxConfig),
    productIds: plan.productIds,
    collectionIds: plan.collectionIds,
    subscriberCount,
    revenue,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
