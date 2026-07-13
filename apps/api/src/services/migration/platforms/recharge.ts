import type { MigrationCredentials, PlatformAdapter } from '../types.js';

type RechargeSubscription = {
  id: number;
  customer_id: number;
  status: string;
  price?: string;
  quantity?: number;
  next_charge_scheduled_at?: string | null;
  order_interval_frequency?: number;
  order_interval_unit?: string;
  product_title?: string;
  shopify_variant_id?: number;
  created_at?: string;
};

type RechargeCustomer = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  billing_phone?: string;
};

async function rechargeFetch<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`https://api.rechargeapps.com${path}`, {
    headers: {
      'X-Recharge-Access-Token': apiKey,
      'X-Recharge-Version': '2021-11',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Recharge API error ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export const rechargeAdapter: PlatformAdapter = {
  platform: 'recharge',

  async discover(credentials: MigrationCredentials) {
    if (!credentials.apiKey) {
      throw new Error('Recharge API key is required');
    }

    const customers: Awaited<
      ReturnType<PlatformAdapter['discover']>
    >['customers'] = [];
    const contracts: Awaited<
      ReturnType<PlatformAdapter['discover']>
    >['contracts'] = [];
    let totalRevenue = 0;

    const customerMap = new Map<number, RechargeCustomer>();

    for (let customerPage = 1; ; customerPage += 1) {
      const payload = await rechargeFetch<{
        customers: RechargeCustomer[];
      }>(`/customers?limit=250&page=${customerPage}`, credentials.apiKey);

      if (!payload.customers?.length) break;

      for (const customer of payload.customers) {
        customerMap.set(customer.id, customer);
        customers.push({
          sourceId: String(customer.id),
          email: customer.email,
          firstName: customer.first_name ?? null,
          lastName: customer.last_name ?? null,
          phone: customer.billing_phone ?? null,
        });
      }

      if (payload.customers.length < 250) break;
    }

    for (let subPage = 1; ; subPage += 1) {
      const payload = await rechargeFetch<{
        subscriptions: RechargeSubscription[];
      }>(
        `/subscriptions?limit=250&page=${subPage}&status=active`,
        credentials.apiKey,
      );

      if (!payload.subscriptions?.length) break;

      for (const sub of payload.subscriptions) {
        const price = Number(sub.price ?? 0);
        totalRevenue += price;

        contracts.push({
          sourceId: String(sub.id),
          sourceCustomerId: String(sub.customer_id),
          status: sub.status,
          productTitle: sub.product_title,
          variantId: sub.shopify_variant_id
            ? `gid://shopify/ProductVariant/${sub.shopify_variant_id}`
            : undefined,
          quantity: sub.quantity ?? 1,
          price,
          currency: 'USD',
          nextBillingDate: sub.next_charge_scheduled_at ?? null,
          billingInterval: sub.order_interval_unit ?? 'month',
          billingIntervalCount: sub.order_interval_frequency ?? 1,
          totalRevenue: price,
          createdAt: sub.created_at,
          raw: sub as unknown as Record<string, unknown>,
        });
      }

      if (payload.subscriptions.length < 250) break;
    }

    return { customers, contracts, totalRevenue };
  },

  async cancelSubscription(credentials, sourceId) {
    if (!credentials.apiKey) {
      throw new Error(
        'Recharge API key is required to cancel source subscriptions',
      );
    }

    const response = await fetch(
      `https://api.rechargeapps.com/subscriptions/${sourceId}/cancel`,
      {
        method: 'POST',
        headers: {
          'X-Recharge-Access-Token': credentials.apiKey,
          'X-Recharge-Version': '2021-11',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancellation_reason: 'Migrated to Retain',
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Recharge cancel failed ${response.status}: ${body}`);
    }
  },
};
