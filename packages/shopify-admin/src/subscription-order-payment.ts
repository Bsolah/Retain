import {
  ContractStatus,
  OrderStatus,
  prisma,
  type Shop,
} from '@retain/database';
import { addInterval } from './billing-policy.js';
import { shopifyAdminGraphql } from './shopify-client.js';

const ORDER_FINANCIAL_QUERY = `#graphql
  query SubscriptionOrderFinancialStatus($id: ID!) {
    order(id: $id) {
      id
      name
      displayFinancialStatus
      fullyPaid
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
  }
`;

const CONTRACT_NEXT_BILLING_QUERY = `#graphql
  query SubscriptionContractNextBilling($id: ID!) {
    subscriptionContract(id: $id) {
      nextBillingDate
    }
  }
`;

export type PendingSubscriptionOrder = {
  id: string;
  contractId: string;
  customerId: string;
  shopifyOrderId: string;
  totalPrice: number | string | { toString(): string };
  status: OrderStatus;
  contract: {
    id: string;
    shopifyContractId: string;
    billingPolicy: unknown;
    totalCharges: number;
  };
};

export type OrderPaymentWebhookPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  financial_status?: string;
  total_price?: string | number;
  order_number?: number | string;
  currency?: string;
};

export function normalizeShopifyOrderGid(
  id: string | number | null | undefined,
): string | null {
  if (id == null) return null;
  const raw = String(id);
  if (raw.startsWith('gid://')) return raw;
  return `gid://shopify/Order/${raw}`;
}

export function orderGidLookupVariants(
  orderGid: string | number | null | undefined,
): string[] {
  const normalized = normalizeShopifyOrderGid(orderGid);
  if (!normalized) return [];
  const numericId = normalized.split('/').pop();
  const variants = new Set<string>([normalized]);
  if (numericId) variants.add(numericId);
  return [...variants];
}

export function isShopifyOrderPaid(input: {
  displayFinancialStatus?: string | null;
  fullyPaid?: boolean | null;
  financialStatus?: string | null;
}): boolean {
  if (input.fullyPaid === true) return true;
  const graphqlStatus = input.displayFinancialStatus?.toUpperCase();
  if (graphqlStatus === 'PAID' || graphqlStatus === 'PARTIALLY_PAID') {
    return true;
  }
  const restStatus = input.financialStatus?.toLowerCase();
  return restStatus === 'paid' || restStatus === 'partially_paid';
}

export function isOrderPaymentWebhookPaid(
  topic: string,
  payload: OrderPaymentWebhookPayload,
): boolean {
  if (topic === 'orders/paid') return true;
  return isShopifyOrderPaid({
    financialStatus: payload.financial_status ?? null,
  });
}

async function fetchContractNextBillingDate(
  shop: Shop,
  contractGid: string,
): Promise<Date | null> {
  const data = await shopifyAdminGraphql<{
    subscriptionContract: { nextBillingDate: string | null } | null;
  }>(shop, CONTRACT_NEXT_BILLING_QUERY, { id: contractGid });

  const raw = data.subscriptionContract?.nextBillingDate;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveNextBillingDate(
  shop: Shop,
  contract: PendingSubscriptionOrder['contract'],
  paidAt: Date,
): Promise<Date> {
  const policy = (contract.billingPolicy ?? {}) as Record<string, unknown>;
  const fromPolicy = addInterval(paidAt, policy);
  const fromShopify = await fetchContractNextBillingDate(
    shop,
    contract.shopifyContractId,
  );

  if (!fromShopify) return fromPolicy;

  return fromShopify.getTime() > fromPolicy.getTime()
    ? fromShopify
    : fromPolicy;
}

async function fetchShopifyOrderPaymentState(
  shop: Shop,
  orderGid: string,
): Promise<{
  id: string;
  name: string | null;
  paid: boolean;
  amount: number;
  currency: string;
} | null> {
  const normalizedGid = normalizeShopifyOrderGid(orderGid);
  if (!normalizedGid) return null;

  const data = await shopifyAdminGraphql<{
    order: {
      id: string;
      name: string | null;
      displayFinancialStatus: string | null;
      fullyPaid: boolean | null;
      totalPriceSet: {
        shopMoney: { amount: string; currencyCode: string };
      } | null;
    } | null;
  }>(shop, ORDER_FINANCIAL_QUERY, { id: normalizedGid });

  if (!data.order) return null;

  return {
    id: data.order.id,
    name: data.order.name,
    paid: isShopifyOrderPaid({
      displayFinancialStatus: data.order.displayFinancialStatus,
      fullyPaid: data.order.fullyPaid,
    }),
    amount: Number(data.order.totalPriceSet?.shopMoney.amount ?? 0),
    currency: data.order.totalPriceSet?.shopMoney.currencyCode ?? 'USD',
  };
}

async function findSubscriptionOrderByShopifyGid(
  shopId: string,
  orderGid: string | number | null | undefined,
) {
  const variants = orderGidLookupVariants(orderGid);
  if (variants.length === 0) return null;

  return prisma.subscriptionOrder.findFirst({
    where: {
      shopId,
      shopifyOrderId: { in: variants },
    },
    include: { contract: true },
  });
}

async function findContractByLastOrderGid(shopId: string, orderGid: string) {
  const variants = orderGidLookupVariants(orderGid);
  if (variants.length === 0) return null;

  return prisma.subscriptionContract.findFirst({
    where: {
      shopId,
      lastOrderId: { in: variants },
    },
  });
}

function sameOrderGid(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftVariants = new Set(orderGidLookupVariants(left));
  return orderGidLookupVariants(right).some((variant) =>
    leftVariants.has(variant),
  );
}

function toPendingOrderInput(
  order: {
    id: string;
    contractId: string;
    customerId: string;
    shopifyOrderId: string;
    totalPrice: PendingSubscriptionOrder['totalPrice'];
    status: OrderStatus;
  },
  contract: {
    id: string;
    shopifyContractId: string;
    billingPolicy: unknown;
    totalCharges: number;
  },
): PendingSubscriptionOrder {
  return {
    id: order.id,
    contractId: order.contractId,
    customerId: order.customerId,
    shopifyOrderId:
      normalizeShopifyOrderGid(order.shopifyOrderId) ?? order.shopifyOrderId,
    totalPrice: order.totalPrice,
    status: order.status,
    contract: {
      id: contract.id,
      shopifyContractId: contract.shopifyContractId,
      billingPolicy: contract.billingPolicy,
      totalCharges: contract.totalCharges,
    },
  };
}

async function applyPaidSubscriptionOrderCharge(
  shop: Shop,
  order: PendingSubscriptionOrder,
  options?: { verifyShopifyPaid?: boolean },
): Promise<boolean> {
  const contractRow = await prisma.subscriptionContract.findUnique({
    where: { id: order.contractId },
  });
  if (!contractRow) return false;

  const normalizedOrderGid =
    normalizeShopifyOrderGid(order.shopifyOrderId) ?? order.shopifyOrderId;
  const alreadyRecorded =
    contractRow.totalCharges > 0 &&
    contractRow.lastBillingDate != null &&
    sameOrderGid(contractRow.lastOrderId, normalizedOrderGid);

  if (alreadyRecorded) {
    if (order.status !== OrderStatus.paid) {
      await prisma.subscriptionOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.paid },
      });
    }
    return false;
  }

  const verifyShopifyPaid = options?.verifyShopifyPaid ?? true;
  if (verifyShopifyPaid) {
    const shopifyState = await fetchShopifyOrderPaymentState(
      shop,
      order.shopifyOrderId,
    );
    if (!shopifyState?.paid) {
      return false;
    }
  }

  const amount = Number(order.totalPrice);
  const paidAt = new Date();
  const nextBillingDate = await resolveNextBillingDate(
    shop,
    order.contract,
    paidAt,
  );

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionOrder.update({
      where: { id: order.id },
      data: { status: OrderStatus.paid },
    });

    await tx.subscriptionContract.update({
      where: { id: order.contractId },
      data: {
        status: ContractStatus.active,
        lastBillingDate: paidAt,
        nextBillingDate,
        lastOrderId: normalizedOrderGid,
        totalCharges: { increment: 1 },
        totalRevenue: { increment: amount },
        consecutiveSkips: 0,
      },
    });

    await tx.customer.update({
      where: { id: order.customerId },
      data: { lifetimeValue: { increment: amount } },
    });
  });

  try {
    await attachCustomerPaymentMethodToContract(
      shop,
      order.contract.shopifyContractId,
      normalizedOrderGid,
    );
  } catch (error) {
    console.warn(
      '[subscription-order-payment] failed to attach payment method after first pay',
      {
        contractId: order.contractId,
        orderId: normalizedOrderGid,
        error: error instanceof Error ? error.message : error,
      },
    );
  }

  // Clear sticky first-invoice attempt so the hourly scheduler can create
  // a fresh SubscriptionBillingAttempt on the next cycle.
  await prisma.subscriptionContract.update({
    where: { id: order.contractId },
    data: { lastBillingAttemptId: null },
  });

  return true;
}

const CONTRACT_PAYMENT_METHOD_QUERY = `#graphql
  query ContractPaymentMethod($id: ID!) {
    subscriptionContract(id: $id) {
      id
      customerPaymentMethod {
        id
      }
      customer {
        id
        paymentMethods(first: 10) {
          nodes {
            id
            revokedAt
          }
        }
      }
    }
  }
`;

const SUBSCRIPTION_DRAFT_CREATE = `#graphql
  mutation PaymentLinkContractDraft($contractId: ID!) {
    subscriptionContractUpdate(contractId: $contractId) {
      draft {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

const SUBSCRIPTION_DRAFT_UPDATE = `#graphql
  mutation PaymentLinkDraftPaymentMethod($draftId: ID!, $input: SubscriptionDraftInput!) {
    subscriptionDraftUpdate(draftId: $draftId, input: $input) {
      draft {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

const SUBSCRIPTION_DRAFT_COMMIT = `#graphql
  mutation PaymentLinkDraftCommit($draftId: ID!) {
    subscriptionDraftCommit(draftId: $draftId) {
      contract {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

/**
 * After a payment-link order is paid, copy the customer's vaulted payment
 * method onto the subscription contract so renewals can charge.
 * Returns true when the contract already has a PM or one was attached.
 */
export async function ensureContractPaymentMethod(
  shop: Shop,
  contractGid: string,
): Promise<boolean> {
  if (contractGid.includes('/migrated-')) {
    return false;
  }
  try {
    await attachCustomerPaymentMethodToContract(shop, contractGid, '');
    const data = await shopifyAdminGraphql<{
      subscriptionContract: {
        customerPaymentMethod: { id: string } | null;
      } | null;
    }>(shop, CONTRACT_PAYMENT_METHOD_QUERY, { id: contractGid });
    return Boolean(data.subscriptionContract?.customerPaymentMethod?.id);
  } catch (error) {
    console.warn(
      '[subscription-order-payment] ensureContractPaymentMethod failed',
      {
        contractGid,
        error: error instanceof Error ? error.message : error,
      },
    );
    return false;
  }
}

async function attachCustomerPaymentMethodToContract(
  shop: Shop,
  contractGid: string,
  _orderGid: string,
): Promise<void> {
  const data = await shopifyAdminGraphql<{
    subscriptionContract: {
      id: string;
      customerPaymentMethod: { id: string } | null;
      customer: {
        id: string;
        paymentMethods: {
          nodes: Array<{ id: string; revokedAt: string | null }>;
        };
      } | null;
    } | null;
  }>(shop, CONTRACT_PAYMENT_METHOD_QUERY, { id: contractGid });

  const contract = data.subscriptionContract;
  if (!contract) return;
  if (contract.customerPaymentMethod?.id) return;

  const paymentMethodId = contract.customer?.paymentMethods.nodes.find(
    (method) => method.revokedAt == null,
  )?.id;
  if (!paymentMethodId) return;

  const draftResult = await shopifyAdminGraphql<{
    subscriptionContractUpdate: {
      draft: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, SUBSCRIPTION_DRAFT_CREATE, { contractId: contractGid });

  if (draftResult.subscriptionContractUpdate.userErrors.length > 0) {
    throw new Error(
      draftResult.subscriptionContractUpdate.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }

  const draftId = draftResult.subscriptionContractUpdate.draft?.id;
  if (!draftId) return;

  const updateResult = await shopifyAdminGraphql<{
    subscriptionDraftUpdate: {
      draft: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, SUBSCRIPTION_DRAFT_UPDATE, {
    draftId,
    input: { paymentMethodId },
  });

  if (updateResult.subscriptionDraftUpdate.userErrors.length > 0) {
    throw new Error(
      updateResult.subscriptionDraftUpdate.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }

  const commitResult = await shopifyAdminGraphql<{
    subscriptionDraftCommit: {
      contract: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, SUBSCRIPTION_DRAFT_COMMIT, { draftId });

  if (commitResult.subscriptionDraftCommit.userErrors.length > 0) {
    throw new Error(
      commitResult.subscriptionDraftCommit.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }
}

export async function completePendingSubscriptionOrderPayment(
  shop: Shop,
  order: PendingSubscriptionOrder,
): Promise<boolean> {
  if (order.status !== OrderStatus.pending) {
    return false;
  }

  return applyPaidSubscriptionOrderCharge(shop, order, {
    verifyShopifyPaid: true,
  });
}

export async function reconcilePendingSubscriptionOrderPayment(
  shop: Shop,
  order: PendingSubscriptionOrder,
): Promise<boolean> {
  if (order.status !== OrderStatus.pending) {
    return false;
  }

  return applyPaidSubscriptionOrderCharge(shop, order, {
    verifyShopifyPaid: true,
  });
}

async function repairPaidOrderMissingCharge(
  shop: Shop,
  order: {
    id: string;
    contractId: string;
    customerId: string;
    shopifyOrderId: string;
    totalPrice: PendingSubscriptionOrder['totalPrice'];
    status: OrderStatus;
  },
  contract: {
    id: string;
    shopifyContractId: string;
    billingPolicy: unknown;
    totalCharges: number;
  },
): Promise<boolean> {
  if (order.status !== OrderStatus.paid || contract.totalCharges > 0) {
    return false;
  }

  return applyPaidSubscriptionOrderCharge(
    shop,
    toPendingOrderInput(order, contract),
    { verifyShopifyPaid: false },
  );
}

export async function reconcileContractPaymentStatus(
  shop: Shop,
  contractId: string,
): Promise<boolean> {
  const contract = await prisma.subscriptionContract.findFirst({
    where: { id: contractId, shopId: shop.id },
    include: {
      orders: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!contract) return false;

  let reconciled = false;

  for (const order of contract.orders.filter(
    (row) => row.status === OrderStatus.pending,
  )) {
    const result = await reconcilePendingSubscriptionOrderPayment(
      shop,
      toPendingOrderInput(order, contract),
    );
    if (result) reconciled = true;
  }

  for (const order of contract.orders.filter(
    (row) => row.status === OrderStatus.paid,
  )) {
    const result = await repairPaidOrderMissingCharge(shop, order, contract);
    if (result) reconciled = true;
  }

  if (reconciled) return true;

  const lastOrderGid = normalizeShopifyOrderGid(contract.lastOrderId);
  if (!lastOrderGid) return false;

  const existing = await findSubscriptionOrderByShopifyGid(
    shop.id,
    lastOrderGid,
  );

  if (existing?.status === OrderStatus.pending && existing.contract) {
    return reconcilePendingSubscriptionOrderPayment(
      shop,
      toPendingOrderInput(existing, existing.contract),
    );
  }

  if (existing?.contract) {
    return repairPaidOrderMissingCharge(shop, existing, existing.contract);
  }

  if (contract.totalCharges > 0) {
    return false;
  }

  const shopifyState = await fetchShopifyOrderPaymentState(shop, lastOrderGid);
  if (!shopifyState?.paid) {
    return false;
  }

  const amount =
    shopifyState.amount > 0
      ? shopifyState.amount
      : Number(existing?.totalPrice ?? 0);
  const paidAt = new Date();
  const nextBillingDate = await resolveNextBillingDate(shop, contract, paidAt);

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionOrder.upsert({
      where: {
        shopId_shopifyOrderId: {
          shopId: shop.id,
          shopifyOrderId: lastOrderGid,
        },
      },
      create: {
        shopId: shop.id,
        customerId: contract.customerId,
        contractId: contract.id,
        shopifyOrderId: lastOrderGid,
        orderNumber: shopifyState.name ?? lastOrderGid,
        totalPrice: amount,
        currency: shopifyState.currency,
        status: OrderStatus.paid,
        billingCycle: 1,
      },
      update: {
        status: OrderStatus.paid,
        orderNumber: shopifyState.name ?? undefined,
      },
    });

    await tx.subscriptionContract.update({
      where: { id: contract.id },
      data: {
        status: ContractStatus.active,
        lastBillingDate: paidAt,
        nextBillingDate,
        lastOrderId: lastOrderGid,
        totalCharges: { increment: 1 },
        totalRevenue: { increment: amount },
        consecutiveSkips: 0,
      },
    });

    await tx.customer.update({
      where: { id: contract.customerId },
      data: { lifetimeValue: { increment: amount } },
    });
  });

  return true;
}

export async function syncSubscriptionOrderPaymentFromWebhook(
  shop: Shop,
  topic: string,
  payload: OrderPaymentWebhookPayload,
): Promise<{ orderGid: string; completed: boolean }> {
  const orderGid = normalizeShopifyOrderGid(
    payload.admin_graphql_api_id ?? payload.id,
  );
  if (!orderGid) {
    throw new Error('Missing order id');
  }

  if (!isOrderPaymentWebhookPaid(topic, payload)) {
    return { orderGid, completed: false };
  }

  const existing = await findSubscriptionOrderByShopifyGid(shop.id, orderGid);

  if (existing?.contract) {
    if (existing.status === OrderStatus.pending) {
      const completed = await completePendingSubscriptionOrderPayment(shop, {
        id: existing.id,
        contractId: existing.contractId,
        customerId: existing.customerId,
        shopifyOrderId: existing.shopifyOrderId,
        totalPrice: existing.totalPrice,
        status: OrderStatus.pending,
        contract: {
          id: existing.contract.id,
          shopifyContractId: existing.contract.shopifyContractId,
          billingPolicy: existing.contract.billingPolicy,
          totalCharges: existing.contract.totalCharges,
        },
      });
      return { orderGid, completed };
    }

    const repaired = await repairPaidOrderMissingCharge(
      shop,
      existing,
      existing.contract,
    );
    if (repaired) {
      return { orderGid, completed: true };
    }

    const reconciled = await reconcileContractPaymentStatus(
      shop,
      existing.contractId,
    );
    return { orderGid, completed: reconciled };
  }

  const contract = await findContractByLastOrderGid(shop.id, orderGid);
  if (contract) {
    const reconciled = await reconcileContractPaymentStatus(shop, contract.id);
    return { orderGid, completed: reconciled };
  }

  return { orderGid, completed: false };
}
