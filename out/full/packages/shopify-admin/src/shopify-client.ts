import type { Shop } from '@retain/database';
import { decrypt } from './encryption.js';

export const SHOPIFY_API_VERSION = '2025-01';

type ShopifyGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export class ShopifyClientError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ShopifyClientError';
  }
}

export function getAccessToken(shop: Shop): string {
  return decrypt(shop.accessToken);
}

export async function shopifyAdminGraphql<T>(
  shop: Shop,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const accessToken = getAccessToken(shop);
  const url = `https://${shop.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ShopifyClientError(
      `Shopify Admin API HTTP ${response.status}`,
      response.status,
      body,
    );
  }

  const payload = (await response.json()) as ShopifyGraphqlResponse<T>;

  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).join('; ');
    throw new ShopifyClientError(message, response.status, payload.errors);
  }

  if (!payload.data) {
    throw new ShopifyClientError('Shopify Admin API returned no data');
  }

  return payload.data;
}
