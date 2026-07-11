import {
  ContractStatus,
  EventSource,
  prisma,
  type Shop,
  type SubscriptionContract,
} from '@retain/database';
import { shopifyAdminGraphql } from './shopify-client.js';
import {
  computeNextBillingDateFromPolicy,
  hasBillingInterval,
} from './billing-policy.js';

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

export function toShopifyGid(resource: string, id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/${resource}/${id}`;
}

async function logEvent(options: {
  shopId: string;
  contractId?: string | null;
  eventType: string;
  eventSubtype?: string | null;
  payload?: Record<string, unknown>;
  source?: EventSource;
}): Promise<void> {
  await prisma.event.create({
    data: {
      shopId: options.shopId,
      contractId: options.contractId ?? null,
      eventType: options.eventType,
      eventSubtype: options.eventSubtype ?? null,
      payload: (options.payload ?? {}) as object,
      source: options.source ?? EventSource.webhook,
    },
  });
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

/** Extract selling plan group GIDs from a subscription contract webhook payload. */
export function collectSellingPlanGroupIds(payload: JsonRecord): string[] {
  const groupIds = new Set<string>();
  const lines = Array.isArray(payload.lines)
    ? payload.lines
    : Array.isArray(asRecord(payload.lines).edges)
      ? (asRecord(payload.lines).edges as unknown[])
      : [];

  for (const line of lines) {
    const node = asRecord(asRecord(line).node ?? line);
    const sellingPlan = asRecord(node.selling_plan ?? node.sellingPlan);
    const groupId =
      asString(sellingPlan.selling_plan_group_id) ??
      asString(sellingPlan.groupId) ??
      asString(asRecord(sellingPlan.group).id) ??
      asString(asRecord(sellingPlan.sellingPlanGroup).id);
    if (groupId) {
      groupIds.add(
        groupId.startsWith('gid://')
          ? groupId
          : toShopifyGid('SellingPlanGroup', groupId),
      );
    }
  }

  return [...groupIds];
}

const SELLING_PLAN_GROUPS_MAP_QUERY = `#graphql
  query SellingPlanGroupsMap($first: Int!) {
    sellingPlanGroups(first: $first) {
      edges {
        node {
          id
          sellingPlans(first: 50) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    }
  }
`;

async function buildSellingPlanToGroupMap(
  shop: Shop,
): Promise<Map<string, string>> {
  const data = await shopifyAdminGraphql<{
    sellingPlanGroups: {
      edges: Array<{
        node: {
          id: string;
          sellingPlans: {
            edges: Array<{ node: { id: string } }>;
          };
        };
      }>;
    };
  }>(shop, SELLING_PLAN_GROUPS_MAP_QUERY, { first: 50 });

  const map = new Map<string, string>();
  for (const groupEdge of data.sellingPlanGroups.edges) {
    const groupId = groupEdge.node.id;
    for (const planEdge of groupEdge.node.sellingPlans.edges) {
      map.set(planEdge.node.id, groupId);
    }
  }
  return map;
}

async function fetchSellingPlanGroupIdsFromPlanIds(
  shop: Shop,
  sellingPlanIds: string[],
  planToGroup?: Map<string, string>,
): Promise<string[]> {
  const uniqueIds = [...new Set(sellingPlanIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const map = planToGroup ?? (await buildSellingPlanToGroupMap(shop));
  const groupIds = new Set<string>();
  for (const planId of uniqueIds) {
    const groupId = map.get(planId);
    if (groupId) groupIds.add(groupId);
  }
  return [...groupIds];
}

async function fetchSellingPlanGroupIdsFromContract(
  shop: Shop,
  contractGid: string,
): Promise<string[]> {
  const data = await shopifyAdminGraphql<{
    subscriptionContract: {
      lines: {
        edges: Array<{
          node: {
            sellingPlanId: string | null;
          };
        }>;
      };
    } | null;
  }>(
    shop,
    `#graphql
      query ContractSellingPlanGroups($id: ID!) {
        subscriptionContract(id: $id) {
          lines(first: 20) {
            edges {
              node {
                sellingPlanId
              }
            }
          }
        }
      }
    `,
    { id: contractGid },
  );

  const sellingPlanIds =
    data.subscriptionContract?.lines.edges
      .map((edge) => edge.node.sellingPlanId)
      .filter((id): id is string => Boolean(id)) ?? [];

  return fetchSellingPlanGroupIdsFromPlanIds(shop, sellingPlanIds);
}

export async function resolvePlanId(
  shop: Shop,
  payload: JsonRecord,
): Promise<string> {
  let sellingPlanGroupIds = collectSellingPlanGroupIds(payload);

  if (sellingPlanGroupIds.length === 0) {
    const contractGid =
      asString(payload.admin_graphql_api_id) ??
      (payload.id != null
        ? toShopifyGid('SubscriptionContract', String(payload.id))
        : null);

    if (contractGid) {
      sellingPlanGroupIds = await fetchSellingPlanGroupIdsFromContract(
        shop,
        contractGid,
      );
    }
  }

  for (const groupId of sellingPlanGroupIds) {
    const numericSuffix = groupId.split('/').pop();
    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        shopId: shop.id,
        OR: [
          { shopifySellingPlanGroupId: groupId },
          ...(numericSuffix
            ? [{ shopifySellingPlanGroupId: { endsWith: `/${numericSuffix}` } }]
            : []),
        ],
      },
    });
    if (plan) return plan.id;
  }

  throw new Error(
    sellingPlanGroupIds.length === 0
      ? 'Could not determine selling plan group for subscription contract'
      : `No Retain plan linked to Shopify selling plan group(s): ${sellingPlanGroupIds.join(', ')}`,
  );
}

export type ContractLineItem = {
  productId: string | null;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  title?: string | null;
};

function parseMoneyAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    const amount = asRecord(value).amount;
    if (amount == null) return null;
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapLineNodeToContractLineItem(node: JsonRecord): ContractLineItem {
  const unitPrice =
    parseMoneyAmount(node.current_price) ??
    parseMoneyAmount(node.currentPrice) ??
    parseMoneyAmount(node.line_discounted_price) ??
    parseMoneyAmount(node.lineDiscountedPrice) ??
    0;

  return {
    productId: asString(node.product_id) ?? asString(node.productId),
    variantId:
      asString(node.variant_id) ??
      asString(node.variantId) ??
      asString(asRecord(node.variant).id),
    quantity: Number(node.quantity ?? 1),
    unitPrice,
    title: asString(node.title),
  };
}

export function extractLineItems(payload: JsonRecord): ContractLineItem[] {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  return lines.map((line) =>
    mapLineNodeToContractLineItem(asRecord(asRecord(line).node ?? line)),
  );
}

function lineItemsHavePricing(lineItems: ContractLineItem[]): boolean {
  return lineItems.length > 0 && lineItems.some((line) => line.unitPrice > 0);
}

/** Sum of subscription line item values (unitPrice × quantity) per billing cycle. */
export function computeSubscriptionValueFromLineItems(
  lineItems: unknown,
): number {
  if (!Array.isArray(lineItems)) return 0;

  return lineItems.reduce((sum, line) => {
    const row = line as ContractLineItem;
    const quantity = Number(row.quantity ?? 1);
    const unitPrice = Number(row.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return sum;
    }
    return sum + quantity * unitPrice;
  }, 0);
}

const CONTRACT_NEXT_BILLING_QUERY = `#graphql
  query ContractNextBilling($id: ID!) {
    subscriptionContract(id: $id) {
      nextBillingDate
    }
  }
`;

async function fetchContractNextBillingDate(
  shop: Shop,
  contractGid: string,
): Promise<Date | null> {
  const data = await shopifyAdminGraphql<{
    subscriptionContract: {
      nextBillingDate: string | null;
    } | null;
  }>(shop, CONTRACT_NEXT_BILLING_QUERY, { id: contractGid });

  return parseDate(data.subscriptionContract?.nextBillingDate);
}

async function resolveNextBillingDate(options: {
  shop: Shop;
  contractGid: string;
  payload: JsonRecord;
  billingPolicy: JsonRecord;
  existing: SubscriptionContract | null;
}): Promise<Date | null> {
  const fromPayload = parseDate(
    options.payload.next_billing_date ?? options.payload.nextBillingDate,
  );
  if (fromPayload) return fromPayload;

  const fromShopify = await fetchContractNextBillingDate(
    options.shop,
    options.contractGid,
  );
  if (fromShopify) return fromShopify;

  if (options.existing?.nextBillingDate) {
    return options.existing.nextBillingDate;
  }

  if (
    options.existing?.status === ContractStatus.cancelled ||
    options.existing?.status === ContractStatus.expired
  ) {
    return null;
  }

  const status = mapContractStatus(asString(options.payload.status));
  if (
    status === ContractStatus.cancelled ||
    status === ContractStatus.expired
  ) {
    return null;
  }

  if (hasBillingInterval(options.billingPolicy)) {
    const base =
      options.existing?.lastBillingDate ??
      options.existing?.createdAt ??
      new Date();
    return computeNextBillingDateFromPolicy(options.billingPolicy, base);
  }

  return null;
}

const CONTRACT_LINE_ITEMS_QUERY = `#graphql
  query ContractLineItems($id: ID!) {
    subscriptionContract(id: $id) {
      lines(first: 20) {
        edges {
          node {
            quantity
            title
            productId
            variantId
            currentPrice {
              amount
            }
            lineDiscountedPrice {
              amount
            }
          }
        }
      }
    }
  }
`;

async function fetchContractLineItems(
  shop: Shop,
  contractGid: string,
): Promise<ContractLineItem[]> {
  const data = await shopifyAdminGraphql<{
    subscriptionContract: {
      lines: {
        edges: Array<{
          node: {
            quantity: number;
            title: string | null;
            productId: string | null;
            variantId: string | null;
            currentPrice: { amount: string } | null;
            lineDiscountedPrice: { amount: string } | null;
          };
        }>;
      };
    } | null;
  }>(shop, CONTRACT_LINE_ITEMS_QUERY, { id: contractGid });

  return (data.subscriptionContract?.lines.edges ?? []).map((edge) =>
    mapLineNodeToContractLineItem(edge.node as unknown as JsonRecord),
  );
}

async function resolveContractLineItems(
  shop: Shop,
  contractGid: string,
  payload: JsonRecord,
): Promise<ContractLineItem[]> {
  const fromPayload = extractLineItems(payload);
  if (lineItemsHavePricing(fromPayload)) {
    return fromPayload;
  }
  return fetchContractLineItems(shop, contractGid);
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

  const existing = await prisma.subscriptionContract.findUnique({
    where: {
      shopId_shopifyContractId: {
        shopId: shop.id,
        shopifyContractId,
      },
    },
  });

  const customerId = await ensureCustomer(shop, payload);
  const planId = await resolvePlanId(shop, payload);
  const status = mapContractStatus(asString(payload.status));

  const billingPolicy =
    asRecord(payload.billing_policy ?? payload.billingPolicy) ?? {};
  const deliveryPolicy =
    asRecord(payload.delivery_policy ?? payload.deliveryPolicy) ?? {};
  const pricingPolicy =
    asRecord(payload.pricing_policy ?? payload.pricingPolicy) ?? {};

  const nextBillingDate = await resolveNextBillingDate({
    shop,
    contractGid: shopifyContractId,
    payload,
    billingPolicy,
    existing,
  });

  const resolvedNextBillingDate =
    nextBillingDate ??
    (status === ContractStatus.active && hasBillingInterval(billingPolicy)
      ? computeNextBillingDateFromPolicy(
          billingPolicy,
          existing?.lastBillingDate ?? existing?.createdAt ?? new Date(),
        )
      : null);

  const lineItems = await resolveContractLineItems(
    shop,
    shopifyContractId,
    payload,
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
      nextBillingDate: resolvedNextBillingDate,
      lineItems: lineItems as object,
    },
    update: {
      customerId,
      planId,
      status,
      billingPolicy: billingPolicy as object,
      deliveryPolicy: deliveryPolicy as object,
      pricingPolicy: pricingPolicy as object,
      ...(resolvedNextBillingDate != null
        ? { nextBillingDate: resolvedNextBillingDate }
        : {}),
      lineItems: lineItems as object,
      ...(status === ContractStatus.cancelled
        ? { cancelledAt: new Date() }
        : {}),
    },
  });

  if (!existing) {
    await updateCustomerSubscriptionCounts(customerId, { total: 1, active: 1 });
  }

  await logEvent({
    shopId: shop.id,
    contractId: contract.id,
    eventType: existing ? 'contract.updated' : 'contract.created',
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

const ORDER_CONTRACTS_QUERY = `#graphql
  query OrderSubscriptionContracts($id: ID!) {
    order(id: $id) {
      customer {
        id
        email
        firstName
        lastName
      }
      lineItems(first: 20) {
        edges {
          node {
            contract {
              id
              status
              nextBillingDate
              lines(first: 10) {
                edges {
                  node {
                    sellingPlanId
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function orderHasSellingPlanLine(payload: JsonRecord): boolean {
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  return lineItems.some((line) => asRecord(line).selling_plan_id != null);
}

/**
 * When an order includes a selling plan, ensure linked subscription contracts
 * exist in Retain (fallback if contract webhooks were missed).
 */
export async function syncContractsFromOrderWebhook(options: {
  shopDomain: string;
  topic: string;
  payload: unknown;
  webhookId: string;
}): Promise<{ synced: number }> {
  const payload = asRecord(options.payload);
  if (!orderHasSellingPlanLine(payload)) {
    return { synced: 0 };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: options.shopDomain },
  });
  if (!shop) {
    return { synced: 0 };
  }

  const orderGid =
    asString(payload.admin_graphql_api_id) ??
    (payload.id != null ? toShopifyGid('Order', String(payload.id)) : null);
  if (!orderGid) {
    return { synced: 0 };
  }

  const data = await shopifyAdminGraphql<{
    order: {
      customer: {
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
      } | null;
      lineItems: {
        edges: Array<{
          node: {
            contract: {
              id: string;
              status: string;
              nextBillingDate: string | null;
              lines: {
                edges: Array<{
                  node: {
                    sellingPlanId: string | null;
                  };
                }>;
              };
            } | null;
          };
        }>;
      };
    } | null;
  }>(shop, ORDER_CONTRACTS_QUERY, { id: orderGid });

  const customer = data.order?.customer;
  const seenContracts = new Set<string>();
  const planToGroup = await buildSellingPlanToGroupMap(shop);
  let synced = 0;

  for (const edge of data.order?.lineItems.edges ?? []) {
    const contractNode = edge.node.contract;
    if (!contractNode?.id || seenContracts.has(contractNode.id)) {
      continue;
    }
    seenContracts.add(contractNode.id);

    const sellingPlanIds = contractNode.lines.edges
      .map((line) => line.node.sellingPlanId)
      .filter((id): id is string => Boolean(id));
    const groupIds = await fetchSellingPlanGroupIdsFromPlanIds(
      shop,
      sellingPlanIds,
      planToGroup,
    );
    const lines = groupIds.map((groupId) => ({
      selling_plan: { selling_plan_group_id: groupId },
    }));

    try {
      await upsertContractFromWebhook({
        shopDomain: options.shopDomain,
        topic: `${options.topic}:contract-sync`,
        payload: {
          admin_graphql_api_id: contractNode.id,
          status: contractNode.status,
          next_billing_date: contractNode.nextBillingDate,
          customer: customer
            ? {
                admin_graphql_api_id: customer.id,
                email: customer.email,
                first_name: customer.firstName,
                last_name: customer.lastName,
              }
            : asRecord(payload.customer),
          lines,
        },
        webhookId: `${options.webhookId}:${contractNode.id}`,
      });
      synced += 1;
    } catch {
      // Contract not linked to a Retain plan — skip.
    }
  }

  return { synced };
}

const SYNC_CONTRACTS_QUERY = `#graphql
  query SyncSubscriptionContracts($first: Int!) {
    subscriptionContracts(first: $first) {
      edges {
        node {
          id
          status
          nextBillingDate
          customer {
            id
            email
            firstName
            lastName
          }
          lines(first: 10) {
            edges {
              node {
                sellingPlanId
              }
            }
          }
        }
      }
    }
  }
`;

/** Pull recent Shopify subscription contracts into Retain (recovery / backfill). */
export async function syncSubscriptionContractsForShop(
  shopId: string,
): Promise<{ synced: number; skipped: number }> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new Error('Shop not found');
  }

  const data = await shopifyAdminGraphql<{
    subscriptionContracts: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          nextBillingDate: string | null;
          customer: {
            id: string;
            email: string | null;
            firstName: string | null;
            lastName: string | null;
          } | null;
          lines: {
            edges: Array<{
              node: {
                sellingPlanId: string | null;
              };
            }>;
          };
        };
      }>;
    };
  }>(shop, SYNC_CONTRACTS_QUERY, { first: 50 });

  const planToGroup = await buildSellingPlanToGroupMap(shop);
  let synced = 0;
  let skipped = 0;

  for (const edge of data.subscriptionContracts.edges) {
    const node = edge.node;
    try {
      const sellingPlanIds = node.lines.edges
        .map((line) => line.node.sellingPlanId)
        .filter((id): id is string => Boolean(id));
      const groupIds = await fetchSellingPlanGroupIdsFromPlanIds(
        shop,
        sellingPlanIds,
        planToGroup,
      );

      await upsertContractFromWebhook({
        shopDomain: shop.shopifyDomain,
        topic: 'subscription_contracts/sync',
        payload: {
          admin_graphql_api_id: node.id,
          status: node.status,
          next_billing_date: node.nextBillingDate,
          customer: node.customer
            ? {
                admin_graphql_api_id: node.customer.id,
                email: node.customer.email,
                first_name: node.customer.firstName,
                last_name: node.customer.lastName,
              }
            : undefined,
          lines: groupIds.map((groupId) => ({
            selling_plan: { selling_plan_group_id: groupId },
          })),
        },
        webhookId: `sync-${node.id}`,
      });
      synced += 1;
    } catch {
      skipped += 1;
    }
  }

  return { synced, skipped };
}
