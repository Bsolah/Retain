import { prisma } from '@retain/database';
import type { Shop } from '@retain/database';
import { shopifyAdminGraphql } from '../../shopify-client.js';
import type { MigrationCredentials, PlatformAdapter } from '../types.js';

export const shopifySubscriptionsAdapter: PlatformAdapter = {
  platform: 'shopify_subscriptions',

  async discover(_credentials: MigrationCredentials) {
    throw new Error(
      'Shopify Subscriptions discovery uses the connected shop — call discoverFromShop instead',
    );
  },
};

type ContractNode = {
  id: string;
  status: string;
  nextBillingDate: string | null;
  createdAt: string;
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
  lines: {
    edges: Array<{
      node: {
        title: string;
        quantity: number;
        currentPrice: { amount: string; currencyCode: string };
        variantId: string | null;
      };
    }>;
  };
};

export async function discoverFromShop(shop: Shop) {
  const customers = new Map<string, ReturnType<typeof mapCustomer>>();
  const contracts: Awaited<
    ReturnType<PlatformAdapter['discover']>
  >['contracts'] = [];
  let totalRevenue = 0;
  let cursor: string | null = null;

  for (;;) {
    const data: {
      subscriptionContracts: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: ContractNode }>;
      };
    } = await shopifyAdminGraphql(
      shop,
      `#graphql
        query MigrationDiscoverContracts($first: Int!, $after: String) {
          subscriptionContracts(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                status
                nextBillingDate
                createdAt
                customer {
                  id
                  email
                  firstName
                  lastName
                  phone
                }
                lines(first: 10) {
                  edges {
                    node {
                      title
                      quantity
                      currentPrice { amount currencyCode }
                      variantId
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { first: 100, after: cursor },
    );

    for (const edge of data.subscriptionContracts.edges) {
      const node = edge.node;
      const customer = node.customer;
      if (customer?.id) {
        customers.set(customer.id, mapCustomer(customer));
      }

      const line = node.lines.edges[0]?.node;
      const price = Number(line?.currentPrice.amount ?? 0);
      totalRevenue += price;

      contracts.push({
        sourceId: node.id,
        sourceCustomerId: customer?.id ?? 'unknown',
        status: node.status,
        productTitle: line?.title,
        variantId: line?.variantId ?? undefined,
        quantity: line?.quantity ?? 1,
        price,
        currency: line?.currentPrice.currencyCode ?? 'USD',
        nextBillingDate: node.nextBillingDate,
        createdAt: node.createdAt,
        raw: node as unknown as Record<string, unknown>,
      });
    }

    if (!data.subscriptionContracts.pageInfo.hasNextPage) break;
    cursor = data.subscriptionContracts.pageInfo.endCursor;
    if (!cursor) break;
  }

  return {
    customers: [...customers.values()],
    contracts,
    totalRevenue,
  };
}

function mapCustomer(customer: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}) {
  return {
    sourceId: customer.id,
    email: customer.email ?? 'unknown@customer.local',
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
  };
}

export async function discoverLocalContracts(shopId: string) {
  const contracts = await prisma.subscriptionContract.findMany({
    where: { shopId },
    include: { customer: true, plan: true },
  });

  const customers = new Map<string, ReturnType<typeof mapCustomer>>();
  let totalRevenue = 0;

  for (const contract of contracts) {
    customers.set(contract.customer.shopifyCustomerId, {
      sourceId: contract.customer.shopifyCustomerId,
      email: contract.customer.email,
      firstName: contract.customer.firstName,
      lastName: contract.customer.lastName,
      phone: contract.customer.phone,
    });
    totalRevenue += Number(contract.totalRevenue);
  }

  return {
    customers: [...customers.values()],
    contracts: contracts.map((contract) => ({
      sourceId: contract.shopifyContractId,
      sourceCustomerId: contract.customer.shopifyCustomerId,
      status: contract.status,
      productTitle: contract.plan.name,
      nextBillingDate: contract.nextBillingDate?.toISOString() ?? null,
      price: Number(contract.totalRevenue),
      totalRevenue: Number(contract.totalRevenue),
      raw: contract as unknown as Record<string, unknown>,
    })),
    totalRevenue,
  };
}
