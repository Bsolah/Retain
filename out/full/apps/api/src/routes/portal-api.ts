import { prisma } from '@retain/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  cancelContract,
  pauseContract,
  resumeContract,
  skipNextDelivery,
  swapProduct,
  updateBoxItems,
} from '../services/contract-manager.js';
import { getPortalBanner } from '../services/dunning.js';
import {
  customerAccountGraphql,
  discoverCustomerAccountApi,
  refreshCustomerTokens,
} from '../services/customer-account.js';
import { readPortalTokens, setAuthCookies } from './portal-auth.js';

type PortalBoxConfig = {
  minItems?: number | null;
  maxItems?: number | null;
  allowSwaps?: boolean | null;
  slots?: Array<{
    id: string;
    label?: string | null;
    required?: boolean | null;
  }> | null;
  eligibleProductIds?: string[] | null;
};

function parsePortalBoxConfig(value: unknown): PortalBoxConfig | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return {
    minItems: row.minItems == null ? null : Number(row.minItems),
    maxItems: row.maxItems == null ? null : Number(row.maxItems),
    allowSwaps: row.allowSwaps == null ? null : Boolean(row.allowSwaps),
    slots: Array.isArray(row.slots)
      ? row.slots.map((slot) => {
          const s = slot as Record<string, unknown>;
          return {
            id: String(s.id ?? ''),
            label: s.label == null ? null : String(s.label),
            required: s.required == null ? null : Boolean(s.required),
          };
        })
      : null,
    eligibleProductIds: Array.isArray(row.eligibleProductIds)
      ? row.eligibleProductIds.map((id) => String(id))
      : null,
  };
}

function eligibleProductsForPlan(plan: {
  productIds: string[];
  boxConfig: unknown;
}): string[] {
  const config = parsePortalBoxConfig(plan.boxConfig);
  if (config?.eligibleProductIds?.length) {
    return config.eligibleProductIds;
  }
  return plan.productIds;
}

type AuthedPortal = {
  accessToken: string;
  shopDomain: string;
  graphqlApi: string;
};

async function requirePortalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthedPortal | null> {
  const tokens = readPortalTokens(request);
  const { refreshToken, expiresAt, shopDomain } = tokens;
  let { accessToken } = tokens;

  if (!shopDomain) {
    await reply.status(401).send({
      message: 'Not authenticated',
      code: 'UNAUTHENTICATED',
    });
    return null;
  }

  const discovery = await discoverCustomerAccountApi(shopDomain);

  if (refreshToken && expiresAt && expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      const tokens = await refreshCustomerTokens({
        discovery,
        refreshToken,
      });
      accessToken = tokens.accessToken;
      setAuthCookies(reply, tokens, shopDomain);
    } catch {
      // fall through with existing token
    }
  }

  if (!accessToken) {
    await reply.status(401).send({
      message: 'Not authenticated',
      code: 'UNAUTHENTICATED',
    });
    return null;
  }

  return {
    accessToken,
    shopDomain,
    graphqlApi: discovery.graphql_api,
  };
}

const SUBSCRIPTIONS_QUERY = `#graphql
  query PortalSubscriptions {
    customer {
      id
      firstName
      lastName
      emailAddress {
        emailAddress
      }
      paymentMethods(first: 5) {
        nodes {
          id
          instrument {
            ... on CustomerCreditCard {
              brand
              lastDigits
              expiryMonth
              expiryYear
            }
          }
        }
      }
      subscriptionContracts(first: 50) {
        nodes {
          id
          status
          createdAt
          nextBillingDate
          currencyCode
          deliveryPolicy {
            interval
            intervalCount
          }
          billingPolicy {
            interval
            intervalCount
          }
          deliveryMethod {
            ... on SubscriptionDeliveryMethodShipping {
              address {
                address1
                address2
                city
                province
                country
                zip
                firstName
                lastName
              }
            }
          }
          lines(first: 10) {
            nodes {
              id
              name
              quantity
              variantId
              productId
              currentPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

type PaymentInstrument = {
  brand?: string;
  lastDigits?: string;
  expiryMonth?: number;
  expiryYear?: number;
};

function mapPaymentMethod(
  customer: {
    paymentMethods?: {
      nodes?: Array<{ id: string; instrument?: PaymentInstrument | null }>;
    };
  } | null,
): {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
} | null {
  const method = customer?.paymentMethods?.nodes?.[0];
  if (!method?.instrument?.lastDigits) return null;
  return {
    id: method.id,
    brand: method.instrument.brand ?? 'Card',
    last4: method.instrument.lastDigits,
    expiryMonth: method.instrument.expiryMonth ?? null,
    expiryYear: method.instrument.expiryYear ?? null,
  };
}

function lineNodes(lines: unknown): Array<{
  id?: string;
  name?: string;
  quantity?: number;
  variantId?: string;
  productId?: string;
  currentPrice?: { amount?: string; currencyCode?: string };
}> {
  if (!lines || typeof lines !== 'object') return [];
  const nodes = (lines as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) ? (nodes as ReturnType<typeof lineNodes>) : [];
}

const SUBSCRIPTIONS_QUERY_FALLBACK = SUBSCRIPTIONS_QUERY.replace(
  /paymentMethods\(first: 5\) \{[\s\S]*?\n {6}\}/,
  '',
);

async function fetchPortalCustomer(
  graphqlApi: string,
  accessToken: string,
): Promise<{
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddress: { emailAddress: string } | null;
    paymentMethods?: {
      nodes?: Array<{ id: string; instrument?: PaymentInstrument | null }>;
    };
    subscriptionContracts: {
      nodes: Array<Record<string, unknown>>;
    };
  };
}> {
  try {
    return await customerAccountGraphql(
      graphqlApi,
      accessToken,
      SUBSCRIPTIONS_QUERY,
    );
  } catch {
    return customerAccountGraphql(
      graphqlApi,
      accessToken,
      SUBSCRIPTIONS_QUERY_FALLBACK,
    );
  }
}

function healthFromContract(input: {
  status: string;
  nextBillingDate?: string | null;
  consecutiveSkips?: number;
}): 'green' | 'yellow' | 'red' {
  const status = input.status.toUpperCase();
  if (status === 'CANCELLED' || status === 'FAILED' || status === 'EXPIRED') {
    return 'red';
  }
  if (status === 'PAUSED' || (input.consecutiveSkips ?? 0) > 0) {
    return 'yellow';
  }
  return 'green';
}

async function resolveLocalContractId(
  shopDomain: string,
  contractId: string,
): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
  });
  if (!shop) {
    throw new Error('Shop not found for portal session');
  }

  const local = await prisma.subscriptionContract.findFirst({
    where: {
      shopId: shop.id,
      OR: [{ id: contractId }, { shopifyContractId: contractId }],
    },
  });

  if (!local) {
    throw new Error(
      'Subscription is not synced locally yet. Wait for webhooks or contact support.',
    );
  }

  return local.id;
}

export async function registerPortalApiRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/portal/api/subscriptions', async (request, reply) => {
    const auth = await requirePortalAuth(request, reply);
    if (!auth) return;

    const data = await fetchPortalCustomer(auth.graphqlApi, auth.accessToken);

    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: auth.shopDomain },
    });

    const localContracts = shop
      ? await prisma.subscriptionContract.findMany({
          where: { shopId: shop.id },
          include: { plan: true },
        })
      : [];

    const byShopifyId = new Map(
      localContracts.map((contract) => [contract.shopifyContractId, contract]),
    );

    const subscriptions = await Promise.all(
      data.customer.subscriptionContracts.nodes.map(async (node) => {
        const id = String(node.id);
        const local = byShopifyId.get(id);
        const status = String(node.status ?? 'ACTIVE');
        const lines = lineNodes(node.lines);
        const primary = lines[0];
        const productIds = local ? eligibleProductsForPlan(local.plan) : [];
        const dunningBanner = local ? await getPortalBanner(local.id) : null;
        return {
          id: local?.id ?? id,
          shopifyContractId: id,
          status: (local?.status ?? status).toString().toLowerCase(),
          nextBillingDate: node.nextBillingDate ?? local?.nextBillingDate,
          planName: local?.plan.name ?? 'Subscription',
          planType: local?.plan.planType ?? 'standard',
          frequency: node.deliveryPolicy,
          lines: node.lines,
          productName: primary?.name ?? local?.plan.name ?? 'Subscription',
          imageUrl: null as string | null,
          currencyCode:
            primary?.currentPrice?.currencyCode ??
            (node.currencyCode as string | undefined) ??
            'USD',
          unitPrice: Number(primary?.currentPrice?.amount ?? 0),
          swapOptions: productIds.map((productId) => ({
            productId,
            variantId: productId.replace('/Product/', '/ProductVariant/'),
            label: productId.split('/').pop() ?? productId,
          })),
          health: healthFromContract({
            status,
            nextBillingDate: node.nextBillingDate as string | null,
            consecutiveSkips: local?.consecutiveSkips,
          }),
          consecutiveSkips: local?.consecutiveSkips ?? 0,
          totalCharges: local?.totalCharges ?? 0,
          boxItems: local?.boxItems ?? null,
          boxConfig: local ? parsePortalBoxConfig(local.plan.boxConfig) : null,
          dunningBanner,
          shippingAddress:
            node.deliveryMethod &&
            typeof node.deliveryMethod === 'object' &&
            'address' in (node.deliveryMethod as object)
              ? (node.deliveryMethod as { address: unknown }).address
              : null,
        };
      }),
    );

    return reply.send({
      customer: {
        id: data.customer.id,
        firstName: data.customer.firstName,
        lastName: data.customer.lastName,
        email: data.customer.emailAddress?.emailAddress ?? null,
      },
      paymentMethod: mapPaymentMethod(data.customer),
      subscriptions,
    });
  });

  app.get<{ Params: { contractId: string } }>(
    '/portal/api/subscriptions/:contractId',
    async (request, reply) => {
      const auth = await requirePortalAuth(request, reply);
      if (!auth) return;

      const shop = await prisma.shop.findUnique({
        where: { shopifyDomain: auth.shopDomain },
      });

      const local = shop
        ? await prisma.subscriptionContract.findFirst({
            where: {
              shopId: shop.id,
              OR: [
                { id: request.params.contractId },
                { shopifyContractId: request.params.contractId },
              ],
            },
            include: {
              plan: true,
              orders: { orderBy: { createdAt: 'desc' }, take: 20 },
            },
          })
        : null;

      const data = await fetchPortalCustomer(auth.graphqlApi, auth.accessToken);

      const node =
        data.customer.subscriptionContracts.nodes.find(
          (item) =>
            item.id === request.params.contractId ||
            item.id === local?.shopifyContractId,
        ) ?? null;

      if (!node && !local) {
        return reply.status(404).send({ message: 'Subscription not found' });
      }

      const lines = lineNodes(node?.lines ?? local?.lineItems);
      const primary = lines[0];
      const productIds = local ? eligibleProductsForPlan(local.plan) : [];
      const addOns = productIds
        .filter((productId) => productId !== primary?.productId)
        .map((productId) => ({
          productId,
          variantId: productId.replace('/Product/', '/ProductVariant/'),
          label: productId.split('/').pop() ?? productId,
          price: Number(primary?.currentPrice?.amount ?? 0),
        }));

      return reply.send({
        subscription: {
          id: local?.id ?? String(node?.id),
          shopifyContractId: local?.shopifyContractId ?? String(node?.id),
          status:
            local?.status ?? String(node?.status ?? 'active').toLowerCase(),
          planName: local?.plan.name ?? 'Subscription',
          planType: local?.plan.planType ?? 'standard',
          nextBillingDate:
            node?.nextBillingDate ?? local?.nextBillingDate ?? null,
          frequency: node?.deliveryPolicy ?? local?.deliveryPolicy,
          billingPolicy: node?.billingPolicy ?? local?.billingPolicy,
          lines: node?.lines ?? local?.lineItems,
          productName: primary?.name ?? local?.plan.name ?? 'Subscription',
          imageUrl: null as string | null,
          currencyCode:
            primary?.currentPrice?.currencyCode ??
            (node?.currencyCode as string | undefined) ??
            'USD',
          unitPrice: Number(primary?.currentPrice?.amount ?? 0),
          swapOptions: productIds.map((productId) => ({
            productId,
            variantId: productId.replace('/Product/', '/ProductVariant/'),
            label: productId.split('/').pop() ?? productId,
          })),
          addOns,
          paymentMethod: mapPaymentMethod(data.customer),
          boxItems: local?.boxItems,
          boxConfig: local ? parsePortalBoxConfig(local.plan.boxConfig) : null,
          health: healthFromContract({
            status: String(node?.status ?? local?.status ?? 'active'),
            consecutiveSkips: local?.consecutiveSkips,
          }),
          consecutiveSkips: local?.consecutiveSkips ?? 0,
          shippingAddress:
            node?.deliveryMethod &&
            typeof node.deliveryMethod === 'object' &&
            'address' in (node.deliveryMethod as object)
              ? (node.deliveryMethod as { address: unknown }).address
              : null,
          orders:
            local?.orders.map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              totalPrice: Number(order.totalPrice),
              currency: order.currency,
              trackingNumber: order.trackingNumber,
              createdAt: order.createdAt,
            })) ?? [],
        },
      });
    },
  );

  app.post<{
    Params: { contractId: string };
    Body: { duration?: number };
  }>('/portal/api/subscriptions/:contractId/pause', async (request, reply) => {
    const auth = await requirePortalAuth(request, reply);
    if (!auth) return;
    const id = await resolveLocalContractId(
      auth.shopDomain,
      request.params.contractId,
    );
    const contract = await pauseContract({
      id,
      durationDays: request.body?.duration ?? 30,
      actor: 'customer',
    });
    return reply.send({ subscription: contract });
  });

  app.post<{ Params: { contractId: string } }>(
    '/portal/api/subscriptions/:contractId/resume',
    async (request, reply) => {
      const auth = await requirePortalAuth(request, reply);
      if (!auth) return;
      const id = await resolveLocalContractId(
        auth.shopDomain,
        request.params.contractId,
      );
      const contract = await resumeContract({
        id,
        actor: 'customer',
      });
      return reply.send({ subscription: contract });
    },
  );

  app.post<{ Params: { contractId: string } }>(
    '/portal/api/subscriptions/:contractId/skip',
    async (request, reply) => {
      const auth = await requirePortalAuth(request, reply);
      if (!auth) return;
      const id = await resolveLocalContractId(
        auth.shopDomain,
        request.params.contractId,
      );
      const contract = await skipNextDelivery({
        id,
        actor: 'customer',
      });
      return reply.send({ subscription: contract });
    },
  );

  app.post<{
    Params: { contractId: string };
    Body: { newProductId: string; newVariantId: string };
  }>('/portal/api/subscriptions/:contractId/swap', async (request, reply) => {
    const auth = await requirePortalAuth(request, reply);
    if (!auth) return;
    const id = await resolveLocalContractId(
      auth.shopDomain,
      request.params.contractId,
    );
    const contract = await swapProduct({
      id,
      newProductId: request.body.newProductId,
      newVariantId: request.body.newVariantId,
      actor: 'customer',
    });
    return reply.send({ subscription: contract });
  });

  app.post<{
    Params: { contractId: string };
    Body: {
      items: Array<{
        productId: string;
        variantId: string;
        quantity: number;
        slot?: string;
      }>;
    };
  }>(
    '/portal/api/subscriptions/:contractId/box-items',
    async (request, reply) => {
      const auth = await requirePortalAuth(request, reply);
      if (!auth) return;
      const id = await resolveLocalContractId(
        auth.shopDomain,
        request.params.contractId,
      );
      const contract = await updateBoxItems({
        id,
        items: request.body.items,
        actor: 'customer',
      });
      return reply.send({ subscription: contract });
    },
  );

  app.post<{
    Params: { contractId: string };
    Body: { reason: string; feedback?: string };
  }>('/portal/api/subscriptions/:contractId/cancel', async (request, reply) => {
    const auth = await requirePortalAuth(request, reply);
    if (!auth) return;
    const id = await resolveLocalContractId(
      auth.shopDomain,
      request.params.contractId,
    );
    const contract = await cancelContract({
      id,
      reason: request.body.reason,
      feedback: request.body.feedback,
      actor: 'customer',
    });
    return reply.send({ subscription: contract });
  });

  app.get<{
    Params: { contractId: string };
    Querystring: { reason?: string };
  }>(
    '/portal/api/subscriptions/:contractId/cancel-offer',
    async (request, reply) => {
      const auth = await requirePortalAuth(request, reply);
      if (!auth) return;

      const localId = await resolveLocalContractId(
        auth.shopDomain,
        request.params.contractId,
      ).catch(() => null);
      const contract = localId
        ? await prisma.subscriptionContract.findUnique({
            where: { id: localId },
          })
        : null;
      const ltv = Number(contract?.totalRevenue ?? 0);
      const reason = request.query.reason ?? 'other';

      const offers: Record<
        string,
        { title: string; description: string; action: string }
      > = {
        too_expensive: {
          title: 'Get 20% off your next 3 orders',
          description: `As a valued subscriber ($${ltv.toFixed(0)} lifetime), keep your plan with a limited discount.`,
          action: 'apply_discount',
        },
        too_much_product: {
          title: 'Skip your next 2 deliveries',
          description: 'Take a break without losing your subscription perks.',
          action: 'skip_two',
        },
        want_different_product: {
          title: 'Swap to our bestseller',
          description: 'Switch products on your next order in one tap.',
          action: 'swap_bestseller',
        },
        not_satisfied: {
          title: 'Let us make it right + $10 credit',
          description: 'Stay subscribed and we will apply store credit.',
          action: 'credit',
        },
        other: {
          title: 'Talk to us before you go',
          description: 'We can pause or adjust your plan instead of canceling.',
          action: 'pause',
        },
      };

      return reply.send({
        offer: offers[reason] ?? offers.other,
        lifetimeValue: ltv,
      });
    },
  );
}
