import {
  ContractStatus,
  EventSource,
  HealthStatus,
  OrderStatus,
  Prisma,
  ShopStatus,
  prisma,
  type Shop,
} from '@retain/database';
import { logEvent } from '../services/events.js';
import {
  billingAttemptSchema,
  contractWebhookSchema,
  customerWebhookSchema,
  fulfillmentWebhookSchema,
  inventoryWebhookSchema,
  orderWebhookSchema,
  productWebhookSchema,
  shopWebhookSchema,
} from '../schemas/index.js';
import type { ShopifyWebhookJob, ShopCleanupJob } from '@retain/shared';
import { addInterval } from '../lib/billing-policy.js';
import { runChurnAnalysis } from '../services/churn.js';
import { scheduleShopCleanup } from '../services/cleanup-queue.js';
import { triggerDunningWorkflow } from '../services/dunning.js';
import { upsertProductCache } from '../services/product-cache.js';
import {
  computeNextBillingDateFromPolicy,
  upsertContractFromWebhook,
  syncContractsFromOrderWebhook,
} from '@retain/shopify-admin';

function toGid(resource: string, id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/${resource}/${id}`;
}

async function getShop(shopDomain: string): Promise<Shop> {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
  });
  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);
  return shop;
}

function mapHealthStatus(riskLevel: string | undefined): HealthStatus {
  if (riskLevel === 'critical' || riskLevel === 'high')
    return HealthStatus.critical;
  if (riskLevel === 'medium') return HealthStatus.at_risk;
  return HealthStatus.healthy;
}

async function updateCustomerSubscriptionCounts(
  customerId: string,
  delta: { total?: number; active?: number },
): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(delta.total != null
        ? { totalSubscriptions: { increment: delta.total } }
        : {}),
      ...(delta.active != null
        ? { activeSubscriptions: { increment: delta.active } }
        : {}),
    },
  });
}

async function findContractByShopifyId(shopId: string, rawId: unknown) {
  if (rawId == null) return null;
  const gid = String(rawId).startsWith('gid://')
    ? String(rawId)
    : toGid('SubscriptionContract', String(rawId));
  return prisma.subscriptionContract.findFirst({
    where: { shopId, shopifyContractId: gid },
    include: { plan: true, customer: true },
  });
}

export async function handleContractCreate(job: ShopifyWebhookJob) {
  contractWebhookSchema.parse(job.payload);
  const contract = await upsertContractFromWebhook({
    shopDomain: job.shopDomain,
    topic: job.topic,
    payload: job.payload,
    webhookId: job.webhookId,
  });
  return { contractId: contract.id };
}

export async function handleContractUpdate(job: ShopifyWebhookJob) {
  const payload = contractWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);
  const shopifyContractId =
    payload.admin_graphql_api_id ??
    (payload.id != null
      ? toGid('SubscriptionContract', String(payload.id))
      : null);
  if (!shopifyContractId) throw new Error('Missing contract id');

  const existing = await prisma.subscriptionContract.findUnique({
    where: {
      shopId_shopifyContractId: { shopId: shop.id, shopifyContractId },
    },
  });

  const contract = await upsertContractFromWebhook({
    shopDomain: job.shopDomain,
    topic: job.topic,
    payload: job.payload,
    webhookId: job.webhookId,
  });

  const nextStatus = contract.status;

  if (
    existing &&
    existing.status !== ContractStatus.cancelled &&
    nextStatus === ContractStatus.cancelled
  ) {
    await updateCustomerSubscriptionCounts(contract.customerId, { active: -1 });

    const prediction = await runChurnAnalysis(contract.id);
    if (prediction?.churn_probability != null) {
      await prisma.subscriptionContract.update({
        where: { id: contract.id },
        data: {
          churnRiskScore: prediction.churn_probability,
          predictedChurn30d: prediction.churn_probability,
          healthStatus: mapHealthStatus(prediction.risk_level),
        },
      });
    }

    await logEvent({
      shopId: shop.id,
      contractId: contract.id,
      eventType: 'churn.detected',
      eventSubtype: 'contract_cancelled',
      payload: {
        webhookId: job.webhookId,
        churnProbability: prediction?.churn_probability ?? null,
        cohortMonth: contract.createdAt.toISOString().slice(0, 7),
      },
      source: EventSource.webhook,
    });
  }

  return { contractId: contract.id, status: nextStatus };
}

export async function handleBillingSuccess(job: ShopifyWebhookJob) {
  const payload = billingAttemptSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);
  const contract = await findContractByShopifyId(
    shop.id,
    payload.subscription_contract_id,
  );
  if (!contract) throw new Error('Contract not found for billing success');

  const amount = Number(payload.amount ?? 0);
  const orderGid =
    payload.order_id != null
      ? toGid('Order', String(payload.order_id))
      : `gid://shopify/Order/webhook-${job.webhookId}`;
  const billingAnchor = contract.nextBillingDate ?? new Date();
  const nextBillingDate =
    computeNextBillingDateFromPolicy(contract.billingPolicy, billingAnchor) ??
    addInterval(billingAnchor, {});

  const existingOrder = await prisma.subscriptionOrder.findUnique({
    where: {
      shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: orderGid },
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionOrder.upsert({
      where: {
        shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: orderGid },
      },
      create: {
        shopId: shop.id,
        customerId: contract.customerId,
        contractId: contract.id,
        shopifyOrderId: orderGid,
        orderNumber: payload.admin_graphql_api_id ?? orderGid,
        totalPrice: new Prisma.Decimal(amount),
        currency: (payload.currency ?? 'USD').slice(0, 3),
        status: OrderStatus.paid,
        billingCycle: contract.totalCharges + 1,
      },
      update: {
        status: OrderStatus.paid,
        totalPrice: new Prisma.Decimal(amount),
      },
    });

    await tx.subscriptionContract.update({
      where: { id: contract.id },
      data: {
        status: ContractStatus.active,
        lastBillingDate: new Date(),
        nextBillingDate,
        lastOrderId: orderGid,
        ...(existingOrder
          ? {}
          : {
              totalCharges: { increment: 1 },
              totalRevenue: { increment: amount },
            }),
        consecutiveSkips: 0,
      },
    });

    await tx.subscriberSignal.upsert({
      where: { contractId: contract.id },
      create: {
        contractId: contract.id,
        paymentFailureCount30d: 0,
        paymentFailureCount90d: 0,
        daysSinceLastPaymentFailure: null,
        modelVersion: 'webhook-reset',
      },
      update: {
        paymentFailureCount30d: 0,
        paymentFailureCount90d: 0,
        daysSinceLastPaymentFailure: null,
      },
    });
  });

  await logEvent({
    shopId: shop.id,
    contractId: contract.id,
    eventType: 'billing.success',
    payload: { amount, webhookId: job.webhookId },
    source: EventSource.webhook,
  });

  return { contractId: contract.id, amount };
}

export async function handleBillingFailure(job: ShopifyWebhookJob) {
  const payload = billingAttemptSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);
  const contract = await findContractByShopifyId(
    shop.id,
    payload.subscription_contract_id,
  );
  if (!contract) throw new Error('Contract not found for billing failure');

  await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: { status: ContractStatus.payment_failed },
  });

  await prisma.subscriberSignal.upsert({
    where: { contractId: contract.id },
    create: {
      contractId: contract.id,
      paymentFailureCount30d: 1,
      paymentFailureCount90d: 1,
      daysSinceLastPaymentFailure: 0,
      modelVersion: 'webhook',
    },
    update: {
      paymentFailureCount30d: { increment: 1 },
      paymentFailureCount90d: { increment: 1 },
      daysSinceLastPaymentFailure: 0,
    },
  });

  await triggerDunningWorkflow(
    contract.id,
    payload.error_message ?? payload.error_code ?? 'payment_failed',
    { failureCode: payload.error_code },
  );

  await logEvent({
    shopId: shop.id,
    contractId: contract.id,
    eventType: 'billing.failure',
    payload: {
      errorCode: payload.error_code,
      errorMessage: payload.error_message,
      webhookId: job.webhookId,
    },
    source: EventSource.webhook,
  });

  return { contractId: contract.id };
}

export async function handleOrderWebhook(job: ShopifyWebhookJob) {
  const payload = orderWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);

  if (job.topic === 'orders/create' || job.topic === 'orders/paid') {
    try {
      await syncContractsFromOrderWebhook({
        shopDomain: job.shopDomain,
        topic: job.topic,
        payload: job.payload,
        webhookId: job.webhookId,
      });
    } catch (error) {
      console.error('Order subscription contract sync failed:', error);
    }
  }

  const orderGid =
    payload.admin_graphql_api_id ??
    (payload.id != null ? toGid('Order', String(payload.id)) : null);
  if (!orderGid) throw new Error('Missing order id');

  const status =
    job.topic === 'orders/cancelled'
      ? payload.financial_status === 'refunded'
        ? OrderStatus.refunded
        : OrderStatus.cancelled
      : job.topic === 'orders/paid'
        ? OrderStatus.paid
        : OrderStatus.pending;

  const existing = await prisma.subscriptionOrder.findFirst({
    where: { shopId: shop.id, shopifyOrderId: orderGid },
    include: { contract: true, customer: true },
  });

  if (existing) {
    const refundAmount = Number(payload.total_price ?? existing.totalPrice);
    const isRefund =
      status === OrderStatus.cancelled || status === OrderStatus.refunded;

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionOrder.update({
        where: { id: existing.id },
        data: {
          status,
          ...(isRefund ? { fulfillmentStatus: 'cancelled' } : {}),
        },
      });

      if (
        isRefund &&
        existing.status !== OrderStatus.refunded &&
        existing.status !== OrderStatus.cancelled
      ) {
        await tx.subscriptionContract.update({
          where: { id: existing.contractId },
          data: {
            totalRevenue: { decrement: refundAmount },
            totalCharges: {
              decrement: existing.contract.totalCharges > 0 ? 1 : 0,
            },
          },
        });
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { lifetimeValue: { decrement: refundAmount } },
        });
      }
    });
  }

  await logEvent({
    shopId: shop.id,
    contractId: existing?.contractId,
    eventType: `order.${status}`,
    eventSubtype: job.topic,
    payload: { orderGid, webhookId: job.webhookId },
    source: EventSource.webhook,
  });

  return { orderGid, status };
}

export async function handleCustomerWebhook(job: ShopifyWebhookJob) {
  const payload = customerWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);
  const gid =
    payload.admin_graphql_api_id ??
    (payload.id != null ? toGid('Customer', String(payload.id)) : null);
  if (!gid) throw new Error('Missing customer id');

  if (job.topic === 'customers/delete') {
    await prisma.customer.deleteMany({
      where: { shopId: shop.id, shopifyCustomerId: gid },
    });
  } else {
    await prisma.customer.upsert({
      where: {
        shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: gid },
      },
      create: {
        shopId: shop.id,
        shopifyCustomerId: gid,
        email: payload.email ?? 'unknown@customer.local',
        firstName: payload.first_name,
        lastName: payload.last_name,
        phone: payload.phone,
      },
      update: {
        email: payload.email ?? undefined,
        firstName: payload.first_name,
        lastName: payload.last_name,
        phone: payload.phone,
      },
    });
  }

  await logEvent({
    shopId: shop.id,
    eventType: 'customer.updated',
    eventSubtype: job.topic,
    payload: { customerGid: gid, webhookId: job.webhookId },
    source: EventSource.webhook,
  });

  return { customerGid: gid };
}

export async function handleProductUpdate(job: ShopifyWebhookJob) {
  const payload = productWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);
  const { productGid, priceChanged, cached } = await upsertProductCache(
    shop.id,
    payload,
  );

  const contracts = await prisma.subscriptionContract.findMany({
    where: { shopId: shop.id, status: ContractStatus.active },
    include: { plan: true },
  });

  let repriced = 0;
  for (const contract of contracts) {
    const lineItems = Array.isArray(contract.lineItems)
      ? (contract.lineItems as Array<{ productId?: string }>)
      : [];
    const usesProduct = lineItems.some((line) => line.productId === productGid);
    if (!usesProduct && !contract.plan.productIds.includes(productGid)) {
      continue;
    }

    if (priceChanged) {
      const pricingPolicy =
        contract.pricingPolicy && typeof contract.pricingPolicy === 'object'
          ? { ...(contract.pricingPolicy as Record<string, unknown>) }
          : {};
      pricingPolicy.cachedProduct = cached;
      pricingPolicy.lastPriceSync = new Date().toISOString();

      await prisma.subscriptionContract.update({
        where: { id: contract.id },
        data: { pricingPolicy: pricingPolicy as object },
      });
      repriced += 1;
    }
  }

  await logEvent({
    shopId: shop.id,
    eventType: 'product.updated',
    eventSubtype: job.topic,
    payload: {
      productGid,
      priceChanged,
      repricedContracts: repriced,
      webhookId: job.webhookId,
    },
    source: EventSource.webhook,
  });

  return { productGid, repriced, priceChanged };
}

export async function handleAppUninstalled(job: ShopifyWebhookJob) {
  const shop = await getShop(job.shopDomain);
  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      status: ShopStatus.uninstalled,
      uninstalledAt: new Date(),
    },
  });

  await scheduleShopCleanup(
    {
      shopId: shop.id,
      shopifyDomain: shop.shopifyDomain,
      reason: 'app_uninstalled',
      scheduledAt: new Date().toISOString(),
    },
    job.webhookId,
  );

  await logEvent({
    shopId: shop.id,
    eventType: 'shop.uninstalled',
    payload: { webhookId: job.webhookId },
    source: EventSource.webhook,
  });

  return { shopId: shop.id };
}

export async function handleShopUpdate(job: ShopifyWebhookJob) {
  const payload = shopWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);

  await logEvent({
    shopId: shop.id,
    eventType: 'shop.updated',
    payload: { domain: payload.domain, webhookId: job.webhookId },
    source: EventSource.webhook,
  });

  return { ok: true };
}

export async function handleInventoryUpdate(job: ShopifyWebhookJob) {
  const payload = inventoryWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);

  await logEvent({
    shopId: shop.id,
    eventType: 'inventory.updated',
    eventSubtype: job.topic,
    payload: {
      inventoryItemId: payload.inventory_item_id,
      locationId: payload.location_id,
      available: payload.available,
      webhookId: job.webhookId,
    },
    source: EventSource.webhook,
  });

  return { logged: true };
}

export async function handleFulfillmentUpdate(job: ShopifyWebhookJob) {
  const payload = fulfillmentWebhookSchema.parse(job.payload);
  const shop = await getShop(job.shopDomain);
  const orderGid =
    payload.order_id != null ? toGid('Order', String(payload.order_id)) : null;

  let order: Awaited<ReturnType<typeof prisma.subscriptionOrder.findFirst>> =
    null;

  if (orderGid) {
    order = await prisma.subscriptionOrder.findFirst({
      where: { shopId: shop.id, shopifyOrderId: orderGid },
    });
    if (order) {
      await prisma.subscriptionOrder.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: payload.status ?? order.fulfillmentStatus,
          trackingNumber: payload.tracking_number ?? order.trackingNumber,
        },
      });
    }
  }

  await logEvent({
    shopId: shop.id,
    contractId: order?.contractId,
    eventType: 'fulfillment.updated',
    eventSubtype: job.topic,
    payload: {
      orderGid,
      status: payload.status,
      trackingNumber: payload.tracking_number,
      webhookId: job.webhookId,
    },
    source: EventSource.webhook,
  });

  return { orderGid, status: payload.status };
}

export async function handleGeneric(job: ShopifyWebhookJob) {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: job.shopDomain },
  });
  if (!shop) return { skipped: true };

  await logEvent({
    shopId: shop.id,
    eventType: 'webhook.received',
    eventSubtype: job.topic,
    payload: { webhookId: job.webhookId },
    source: EventSource.webhook,
  });

  return { logged: true };
}

export async function handleCleanupJob(job: ShopCleanupJob): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { id: job.shopId } });
  if (!shop || shop.status !== ShopStatus.uninstalled) {
    return;
  }

  await prisma.$transaction([
    prisma.intervention.deleteMany({ where: { shopId: job.shopId } }),
    prisma.event.deleteMany({ where: { shopId: job.shopId } }),
    prisma.subscriptionOrder.deleteMany({ where: { shopId: job.shopId } }),
    prisma.subscriberSignal.deleteMany({
      where: { contract: { shopId: job.shopId } },
    }),
    prisma.subscriptionContract.deleteMany({ where: { shopId: job.shopId } }),
    prisma.customer.deleteMany({ where: { shopId: job.shopId } }),
    prisma.subscriptionPlan.deleteMany({ where: { shopId: job.shopId } }),
    prisma.shop.delete({ where: { id: job.shopId } }),
  ]);

  console.info(
    { shopId: job.shopId, shopifyDomain: job.shopifyDomain },
    'GDPR shop cleanup completed',
  );
}
