import type { MigrationCredentials, PlatformAdapter } from '../types.js';

async function fetchPlatformApi(
  baseUrl: string,
  path: string,
  credentials: MigrationCredentials,
): Promise<unknown> {
  if (!credentials.apiKey) {
    throw new Error('API key is required');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${credentials.apiKey}`,
  };
  if (credentials.apiSecret) {
    headers['X-Api-Secret'] = credentials.apiSecret;
  }

  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Platform API error ${response.status}: ${body}`);
  }
  return response.json();
}

function createRestAdapter(
  platform: PlatformAdapter['platform'],
  baseUrl: string,
  subscriptionsPath: string,
): PlatformAdapter {
  return {
    platform,
    async discover(credentials: MigrationCredentials) {
      const payload = (await fetchPlatformApi(
        baseUrl,
        subscriptionsPath,
        credentials,
      )) as {
        subscriptions?: Array<Record<string, unknown>>;
        data?: Array<Record<string, unknown>>;
      };

      const rows = payload.subscriptions ?? payload.data ?? [];
      const customers = new Map<string, import('../types.js').SourceCustomer>();
      const contracts: import('../types.js').SourceContract[] = [];
      let totalRevenue = 0;

      for (const row of rows) {
        const customerId = String(
          row.customer_id ?? row.customerId ?? row.email,
        );
        const email = String(
          row.email ?? row.customer_email ?? 'unknown@customer.local',
        );

        customers.set(customerId, {
          sourceId: customerId,
          email,
          firstName: (row.first_name as string) ?? null,
          lastName: (row.last_name as string) ?? null,
          phone: (row.phone as string) ?? null,
        });

        const price = Number(row.price ?? row.amount ?? 0);
        totalRevenue += price;

        contracts.push({
          sourceId: String(row.id ?? row.subscription_id),
          sourceCustomerId: customerId,
          status: String(row.status ?? 'active'),
          productTitle: row.product_title as string | undefined,
          variantId: row.variant_id as string | undefined,
          quantity: Number(row.quantity ?? 1),
          price,
          currency: String(row.currency ?? 'USD'),
          nextBillingDate: (row.next_billing_date as string) ?? null,
          billingInterval: String(row.interval ?? 'month'),
          billingIntervalCount: Number(row.interval_count ?? 1),
          totalRevenue: price,
          raw: row,
        });
      }

      return { customers: [...customers.values()], contracts, totalRevenue };
    },
  };
}

export const boldAdapter = createRestAdapter(
  'bold',
  'https://api.boldcommerce.com',
  '/subscriptions/v1/shops/subscriptions',
);

export const appstleAdapter = createRestAdapter(
  'appstle',
  'https://api.appstle.com',
  '/api/external/v2/subscriptions',
);

export const smartrrAdapter = createRestAdapter(
  'smartrr',
  'https://api.smartrr.com',
  '/vendor/subscriptions',
);
