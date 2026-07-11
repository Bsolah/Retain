import type { SubscriptionContract } from '@retain/database';

type BoxItem = {
  productId: string;
  variantId: string;
  quantity: number;
  slot?: string | null;
};

function mapItems(value: unknown): BoxItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      productId: String(row.productId ?? ''),
      variantId: String(row.variantId ?? ''),
      quantity: Number(row.quantity ?? 1),
      slot: row.slot == null ? null : String(row.slot),
    };
  });
}

export function mapContractToGql(contract: SubscriptionContract) {
  return {
    id: contract.id,
    shopId: contract.shopId,
    customerId: contract.customerId,
    planId: contract.planId,
    shopifyContractId: contract.shopifyContractId,
    status: contract.status,
    billingPolicy: contract.billingPolicy,
    deliveryPolicy: contract.deliveryPolicy,
    pricingPolicy: contract.pricingPolicy,
    nextBillingDate: contract.nextBillingDate?.toISOString() ?? null,
    lastBillingDate: contract.lastBillingDate?.toISOString() ?? null,
    resumeDate: contract.resumeDate?.toISOString() ?? null,
    lastBillingAttemptId: contract.lastBillingAttemptId,
    totalCharges: contract.totalCharges,
    totalRevenue: Number(contract.totalRevenue),
    consecutiveSkips: contract.consecutiveSkips,
    boxItems: mapItems(contract.boxItems),
    lineItems: mapItems(contract.lineItems),
    cancelledAt: contract.cancelledAt?.toISOString() ?? null,
    cancellationReason: contract.cancellationReason,
    cancellationNotes: contract.cancellationNotes,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
}
