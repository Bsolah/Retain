import type { Shop } from '@retain/database';
import { env } from '../env.js';
import { decrypt } from '../lib/encryption.js';

export const SHOPIFY_API_VERSION = '2024-10';

export type ShopifyGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: Record<string, unknown>;
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
    throw new ShopifyClientError(
      payload.errors.map((error) => error.message).join('; '),
      response.status,
      payload.errors,
    );
  }

  if (!payload.data) {
    throw new ShopifyClientError('Shopify Admin API returned no data');
  }

  return payload.data;
}

export type OfflineAccessTokenResponse = {
  access_token: string;
  scope: string;
};

export async function exchangeAuthorizationCode(options: {
  shopDomain: string;
  code: string;
}): Promise<OfflineAccessTokenResponse> {
  const url = `https://${options.shopDomain}/admin/oauth/access_token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code: options.code,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ShopifyClientError(
      `Token exchange failed with HTTP ${response.status}`,
      response.status,
      body,
    );
  }

  return (await response.json()) as OfflineAccessTokenResponse;
}

export async function fetchShopIdentity(
  shopDomain: string,
  accessToken: string,
): Promise<{ id: string; name: string; myshopifyDomain: string }> {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({
      query: `#graphql
        query ShopIdentity {
          shop {
            id
            name
            myshopifyDomain
          }
        }
      `,
    }),
  });

  if (!response.ok) {
    throw new ShopifyClientError(
      `Failed to load shop identity (${response.status})`,
      response.status,
    );
  }

  const payload = (await response.json()) as ShopifyGraphqlResponse<{
    shop: { id: string; name: string; myshopifyDomain: string };
  }>;

  if (!payload.data?.shop) {
    throw new ShopifyClientError('Shop identity query returned no shop');
  }

  return payload.data.shop;
}
