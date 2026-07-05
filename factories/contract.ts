import { randomUUID } from 'node:crypto';
import type { Prisma, SubscriptionContract } from '@retain/database';
import { ContractStatus, HealthStatus } from '@retain/database';

export type ContractFactoryOverrides = Partial<
  Omit<Prisma.SubscriptionContractCreateInput, 'shop' | 'customer' | 'plan'> & {
    shopId?: string;
    customerId?: string;
    planId?: string;
    id?: string;
  }
>;

let contractCounter = 0;

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function buildContract(
  shopId: string,
  customerId: string,
  planId: string,
  overrides: ContractFactoryOverrides = {},
): SubscriptionContract {
  contractCounter += 1;
  const id = overrides.id ?? randomUUID();
  const now = new Date();

  return {
    id,
    shopId: overrides.shopId ?? shopId,
    customerId: overrides.customerId ?? customerId,
    planId: overrides.planId ?? planId,
    shopifyContractId:
      overrides.shopifyContractId ??
      `gid://shopify/SubscriptionContract/${300000 + contractCounter}`,
    status: overrides.status ?? ContractStatus.active,
    healthStatus: overrides.healthStatus ?? HealthStatus.healthy,
    billingPolicy:
      (overrides.billingPolicy as SubscriptionContract['billingPolicy']) ?? {
        interval: 1,
        intervalCount: 1,
        minCycles: null,
        maxCycles: null,
      },
    deliveryPolicy:
      (overrides.deliveryPolicy as SubscriptionContract['deliveryPolicy']) ?? {
        interval: 1,
        intervalCount: 1,
      },
    currencyCode: overrides.currencyCode ?? 'USD',
    nextBillingDate: overrides.nextBillingDate ?? daysFromNow(0),
    lastBillingDate: overrides.lastBillingDate ?? daysFromNow(-30),
    pausedAt: overrides.pausedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    cancellationReason: overrides.cancellationReason ?? null,
    totalCharges: overrides.totalCharges ?? 3,
    totalRevenue: overrides.totalRevenue ?? null,
    consecutiveSkips: overrides.consecutiveSkips ?? 0,
    lastOrderId: overrides.lastOrderId ?? null,
    lastBillingAttemptId: overrides.lastBillingAttemptId ?? null,
    lineItems: (overrides.lineItems as SubscriptionContract['lineItems']) ?? [
      {
        id: `gid://shopify/SubscriptionLine/${contractCounter}`,
        productId: 'gid://shopify/Product/1',
        variantId: 'gid://shopify/ProductVariant/1',
        title: 'Test Product',
        quantity: 1,
        currentPrice: { amount: '29.99', currencyCode: 'USD' },
      },
    ],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  } as SubscriptionContract;
}

export function buildContractCreateInput(
  shopId: string,
  customerId: string,
  planId: string,
  overrides: ContractFactoryOverrides = {},
): Prisma.SubscriptionContractCreateInput {
  const contract = buildContract(shopId, customerId, planId, overrides);
  return {
    id: contract.id,
    shop: { connect: { id: shopId } },
    customer: { connect: { id: customerId } },
    plan: { connect: { id: planId } },
    shopifyContractId: contract.shopifyContractId,
    status: contract.status,
    healthStatus: contract.healthStatus,
    billingPolicy: contract.billingPolicy as Prisma.InputJsonValue,
    deliveryPolicy: contract.deliveryPolicy as Prisma.InputJsonValue,
    currencyCode: contract.currencyCode,
    nextBillingDate: contract.nextBillingDate,
    lastBillingDate: contract.lastBillingDate,
    totalCharges: contract.totalCharges,
    lineItems: contract.lineItems as Prisma.InputJsonValue,
  };
}

export function buildSubscriptionOrderCreateInput(
  shopId: string,
  customerId: string,
  contractId: string,
  overrides: Partial<Prisma.SubscriptionOrderCreateInput> = {},
): Prisma.SubscriptionOrderCreateInput {
  return {
    shop: { connect: { id: shopId } },
    customer: { connect: { id: customerId } },
    contract: { connect: { id: contractId } },
    shopifyOrderId:
      overrides.shopifyOrderId ?? `gid://shopify/Order/${randomUUID()}`,
    orderNumber: overrides.orderNumber ?? '#1001',
    totalPrice: overrides.totalPrice ?? '29.99',
    currency: overrides.currency ?? 'USD',
    status: overrides.status ?? 'paid',
    billingCycle: overrides.billingCycle ?? 1,
    isOneOff: overrides.isOneOff ?? false,
  };
}

export function resetContractFactoryCounter(): void {
  contractCounter = 0;
}
