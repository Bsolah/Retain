import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

const SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function normalizeShopDomain(shop: string): string | null {
  const value = shop.trim().toLowerCase();
  if (!SHOP_DOMAIN_PATTERN.test(value)) {
    return null;
  }
  return value;
}

export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Validate Shopify OAuth / install query HMAC.
 * See: https://shopify.dev/docs/apps/auth/oauth/getting-started
 */
export function verifyShopifyQueryHmac(
  query: Record<string, string | string[] | undefined>,
): boolean {
  const hmac = headerOrQueryValue(query.hmac);
  if (!hmac) {
    return false;
  }

  const message = Object.keys(query)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => {
      const value = headerOrQueryValue(query[key]) ?? '';
      return `${key}=${value}`;
    })
    .join('&');

  const digest = createHmac('sha256', env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  return safeCompare(digest, hmac);
}

/** Validate Shopify webhook HMAC-SHA256 (base64) against the raw request body. */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string | undefined,
): boolean {
  if (!hmacHeader) {
    return false;
  }

  const digest = createHmac('sha256', env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  return safeCompare(digest, hmacHeader);
}

export function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function headerOrQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return getHeaderValue(value);
}

export type ShopifyWebhookRequest = FastifyRequest & {
  rawBody?: Buffer;
  shopifyTopic?: string;
  shopifyShopDomain?: string;
  shopifyWebhookId?: string;
};

export async function requireWebhookHmac(
  request: ShopifyWebhookRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const rawBody = request.rawBody;
  const hmac = getHeaderValue(request.headers['x-shopify-hmac-sha256']);

  if (!rawBody || !verifyShopifyWebhookHmac(rawBody, hmac)) {
    await reply.status(401).send({
      message: 'Invalid webhook HMAC',
      code: 'UNAUTHORIZED',
      extensions: {},
    });
    return false;
  }

  return true;
}
