import { prisma, ShopStatus } from '@retain/database';
import { env } from '../env.js';
import { normalizeShopDomain } from '../middleware/shopify.js';

export type PortalShopErrorCode =
  'NOT_CONFIGURED' | 'INVALID_SHOP' | 'SHOP_NOT_INSTALLED';

export type ResolvePortalShopResult =
  | { ok: true; shopDomain: string }
  | { ok: false; code: PortalShopErrorCode; message: string };

export async function resolvePortalShopDomain(
  rawShop?: string,
): Promise<ResolvePortalShopResult> {
  if (!env.CUSTOMER_ACCOUNT_CLIENT_ID) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message:
        'Customer Account API is not configured. Set CUSTOMER_ACCOUNT_CLIENT_ID.',
    };
  }

  const candidate =
    rawShop?.trim() || env.CUSTOMER_ACCOUNT_SHOP_DOMAIN.trim() || '';
  const shopDomain = candidate ? normalizeShopDomain(candidate) : null;

  if (!shopDomain) {
    return {
      ok: false,
      code: 'INVALID_SHOP',
      message:
        'Missing or invalid shop. Open the subscription link from your store.',
    };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { status: true },
  });

  if (!shop || shop.status !== ShopStatus.active) {
    return {
      ok: false,
      code: 'SHOP_NOT_INSTALLED',
      message: 'This store has not installed Retain or is inactive.',
    };
  }

  return { ok: true, shopDomain };
}

export function portalLoginRedirectUrl(
  shopDomain?: string,
  error?: string,
): string {
  const base = env.PORTAL_URL.replace(/\/$/, '');
  const url = new URL(`${base}/login`);
  if (shopDomain) {
    url.searchParams.set('shop', shopDomain);
  }
  if (error) {
    url.searchParams.set('error', error);
  }
  return url.toString();
}

export const PORTAL_SHOP_STORAGE_KEY = 'retain_portal_shop';
