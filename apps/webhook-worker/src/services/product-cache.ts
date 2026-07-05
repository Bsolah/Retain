import { getRedis } from '../lib/redis.js';

export type CachedProduct = {
  productGid: string;
  title: string | null;
  variants: Array<{
    id: string;
    price: string;
    sku?: string;
  }>;
  updatedAt: string;
};

function cacheKey(shopId: string, productGid: string): string {
  return `product:cache:${shopId}:${productGid}`;
}

function toGid(resource: string, id: string | number): string {
  const raw = String(id);
  if (raw.startsWith('gid://')) return raw;
  return `gid://shopify/${resource}/${raw}`;
}

function extractVariants(variants: unknown): CachedProduct['variants'] {
  if (!Array.isArray(variants)) return [];
  const rows: CachedProduct['variants'] = [];
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;
    const row = variant as Record<string, unknown>;
    const id = row.admin_graphql_api_id ?? row.id;
    const price = row.price;
    if (id == null || price == null) continue;
    rows.push({
      id: toGid('ProductVariant', String(id)),
      price: String(price),
      ...(typeof row.sku === 'string' ? { sku: row.sku } : {}),
    });
  }
  return rows;
}

export async function upsertProductCache(
  shopId: string,
  payload: {
    admin_graphql_api_id?: string;
    id?: string | number;
    title?: string;
    variants?: unknown;
  },
): Promise<{
  productGid: string;
  priceChanged: boolean;
  cached: CachedProduct;
}> {
  const productGid =
    payload.admin_graphql_api_id ??
    (payload.id != null ? toGid('Product', payload.id) : null);
  if (!productGid) throw new Error('Missing product id');

  const next: CachedProduct = {
    productGid,
    title: payload.title ?? null,
    variants: extractVariants(payload.variants),
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedis();
  const key = cacheKey(shopId, productGid);
  const previousRaw = await redis.get(key);
  let priceChanged = false;

  if (previousRaw) {
    try {
      const previous = JSON.parse(previousRaw) as CachedProduct;
      const prevPrices = previous.variants
        .map((v) => v.price)
        .sort()
        .join(',');
      const nextPrices = next.variants
        .map((v) => v.price)
        .sort()
        .join(',');
      priceChanged = prevPrices !== nextPrices;
    } catch {
      priceChanged = true;
    }
  }

  await redis.set(key, JSON.stringify(next), 'EX', 60 * 60 * 24 * 30);
  return { productGid, priceChanged, cached: next };
}

export async function getProductCache(
  shopId: string,
  productGid: string,
): Promise<CachedProduct | null> {
  const raw = await getRedis().get(cacheKey(shopId, productGid));
  if (!raw) return null;
  return JSON.parse(raw) as CachedProduct;
}
