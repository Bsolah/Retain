import {
  ContractStatus,
  EventSource,
  prisma,
  type Shop,
  type SubscriptionContract,
} from '@retain/database';
import { shopifyAdminGraphql } from './shopify-client.js';
import { logEvent } from './events.js';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapContractStatus(status: string | null | undefined): ContractStatus {
  const normalized = (status ?? 'active').toLowerCase().replace(/-/g, '_');
  switch (normalized) {
    case 'paused':
      return ContractStatus.paused;
    case 'cancelled':
    case 'canceled':
      return ContractStatus.cancelled;
    case 'expired':
      return ContractStatus.expired;
    case 'failed':
    case 'payment_failed':
      return ContractStatus.payment_failed;
    default:
      return ContractStatus.active;
  }
}

function toShopifyGid(resource: string, id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/${resource}/${id}`;
}

async function ensureCustomer(
  shop: Shop,
  payload: JsonRecord,
): Promise<string> {
  const customerNode = asRecord(payload.customer);
  const shopifyCustomerId =
    asString(customerNode.admin_graphql_api_id) ??
    asString(customerNode.id) ??
    (payload.customer_id != null
      ? toShopifyGid('Customer', String(payload.customer_id))
      : null);

  if (!shopifyCustomerId) {
    throw new Error('Webhook payload missing customer id');
  }

  const gid = shopifyCustomerId.startsWith('gid://')
    ? shopifyCustomerId
    : toShopifyGid('Customer', shopifyCustomerId);

  const existing = await prisma.customer.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shop.id,
        shopifyCustomerId: gid,
      },
    },
  });

  if (existing) {
    return existing.id;
  }

  // Prefer payload fields; fall back to Shopify Admin API.
  let email = asString(customerNode.email) ?? asString(payload.customer_email);
  let firstName = asString(customerNode.first_name);
  let lastName = asString(customerNode.last_name);
  let phone = asString(customerNode.phone);

  if (!email) {
    const data = await shopifyAdminGraphql<{
      customer: {
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
    }>(
      shop,
      `#graphql
        query CustomerById($id: ID!) {
          customer(id: $id) {
            email
            firstName
            lastName
            phone
          }
        }
      `,
      { id: gid },
    );

    email = data.customer?.email ?? `${gid.split('/').pop()}@unknown.customer`;
    firstName = data.customer?.firstName ?? firstName;
    lastName = data.customer?.lastName ?? lastName;
    phone = data.customer?.phone ?? phone;
  }

  const customer = await prisma.customer.create({
    data: {
      shopId: shop.id,
      shopifyCustomerId: gid,
      email: email ?? 'unknown@customer.local',
      firstName,
      lastName,
      phone,
      totalSubscriptions: 1,
      activeSubscriptions: 1,
    },
  });

  return customer.id;
}

async function resolvePlanId(shop: Shop, payload: JsonRecord): Promise<string> {
  const lines = Array.isArray(payload.lines)
    ? payload.lines
    : Array.isArray(asRecord(payload.lines).edges)
      ? (asRecord(payload.lines).edges as unknown[])
      : [];

  const sellingPlanGroupIds = new Set<string>();

  for (const line of lines) {
    const node = asRecord(asRecord(line).node ?? line);
    const sellingPlan = asRecord(node.selling_plan ?? node.sellingPlan);
    const groupId =
      asString(sellingPlan.selling_plan_group_id) ??
      asString(sellingPlan.groupId) ??
      asString(asRecord(sellingPlan.group).id);
    if (groupId) {
      sellingPlanGroupIds.add(
        groupId.startsWith('gid://')
          ? groupId
          : toShopifyGid('SellingPlanGroup', groupId),
      );
    }
  }

  // Fetch from Shopify when webhook payload lacks line selling-plan data.
  if (sellingPlanGroupIds.size === 0) {
    const contractGid =
      asString(payload.admin_graphql_api_id) ??
      (payload.id != null
        ? toShopifyGid('SubscriptionContract', String(payload.id))
        : null);

    if (contractGid) {
      const data = await shopifyAdminGraphql<{
        subscriptionContract: {
          lines: {
            edges: Array<{
              node: {
                sellingPlanId: string | null;
                sellingPlanName: string | null;
              };
            }>;
          };
        } | null;
      }>(
        shop,
        `#graphql
          query ContractLines($id: ID!) {
            subscriptionContract(id: $id) {
              lines(first: 20) {
                edges {
                  node {
                    sellingPlanId
                    sellingPlanName
                  }
                }
              }
            }
          }
        `,
        { id: contractGid },
      );

      for (const edge of data.subscriptionContract?.lines.edges ?? []) {
        if (edge.node.sellingPlanId) {
          // Resolve plan group via selling plan → group lookup on local plans.
          const plans = await prisma.subscriptionPlan.findMany({
            where: {
              shopId: shop.id,
              shopifySellingPlanGroupId: { not: null },
            },
          });
          // Prefer any plan for this shop when we only have sellingPlanId.
          if (plans[0]) {
            return plans[0].id;
          }
        }
      }
    }
  }

  for (const groupId of sellingPlanGroupIds) {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { shopId: shop.id, shopifySellingPlanGroupId: groupId },
    });
    if (plan) return plan.id;
  }

  const fallback = await prisma.subscriptionPlan.findFirst({
    where: { shopId: shop.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallback) {
    throw new Error('No subscription plan available to link contract');
  }

  return fallback.id;
}

function extractLineItems(payload: JsonRecord): unknown {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  return lines.map((line) => {
    const node = asRecord(line);
    return {
      productId: asString(node.product_id) ?? asString(node.productId),
      variantId:
        asString(node.variant_id) ??
        asString(node.variantId) ??
        asString(asRecord(node.variant).id),
      quantity: Number(node.quantity ?? 1),
    };
  });
}

export async function upsertContractFromWebhook(options: {
  shopDomain: string;
  topic: string;
  payload: unknown;
  webhookId: string;
}): Promise<SubscriptionContract> {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: options.shopDomain },
  });

  if (!shop) {
    throw new Error(`Shop not found for domain ${options.shopDomain}`);
  }

  const payload = asRecord(options.payload);
  const shopifyContractId =
    asString(payload.admin_graphql_api_id) ??
    (payload.id != null
      ? toShopifyGid('SubscriptionContract', String(payload.id))
      : null);

  if (!shopifyContractId) {
    throw new Error('Webhook payload missing subscription contract id');
  }

  const customerId = await ensureCustomer(shop, payload);
  const planId = await resolvePlanId(shop, payload);
  const status = mapContractStatus(asString(payload.status));

  const billingPolicy =
    asRecord(payload.billing_policy ?? payload.billingPolicy) ?? {};
  const deliveryPolicy =
    asRecord(payload.delivery_policy ?? payload.deliveryPolicy) ?? {};
  const pricingPolicy =
    asRecord(payload.pricing_policy ?? payload.pricingPolicy) ?? {};

  const nextBillingDate = parseDate(
    payload.next_billing_date ?? payload.nextBillingDate,
  );

  const contract = await prisma.subscriptionContract.upsert({
    where: {
      shopId_shopifyContractId: {
        shopId: shop.id,
        shopifyContractId,
      },
    },
    create: {
      shopId: shop.id,
      customerId,
      planId,
      shopifyContractId,
      status,
      billingPolicy: billingPolicy as object,
      deliveryPolicy: deliveryPolicy as object,
      pricingPolicy: pricingPolicy as object,
      nextBillingDate,
      lineItems: extractLineItems(payload) as object,
    },
    update: {
      customerId,
      planId,
      status,
      billingPolicy: billingPolicy as object,
      deliveryPolicy: deliveryPolicy as object,
      pricingPolicy: pricingPolicy as object,
      nextBillingDate,
      lineItems: extractLineItems(payload) as object,
      ...(status === ContractStatus.cancelled
        ? { cancelledAt: new Date() }
        : {}),
    },
  });

  await logEvent({
    shopId: shop.id,
    contractId: contract.id,
    eventType: 'subscription_contract.synced',
    eventSubtype: options.topic,
    payload: {
      shopifyContractId,
      webhookId: options.webhookId,
      status,
    },
    source: EventSource.webhook,
  });

  return contract;
}
