export const PORTAL_SHOP_STORAGE_KEY = 'retain_portal_shop';

export function readStoredPortalShop(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(PORTAL_SHOP_STORAGE_KEY);
}

export function storePortalShop(shop: string): void {
  sessionStorage.setItem(PORTAL_SHOP_STORAGE_KEY, shop);
}

export function resolvePortalShopFromSearch(
  searchParams: URLSearchParams,
): string | null {
  const fromQuery = searchParams.get('shop')?.trim();
  if (fromQuery) {
    storePortalShop(fromQuery);
    return fromQuery;
  }
  return readStoredPortalShop();
}

export function portalLoginPath(shop: string): string {
  const params = new URLSearchParams({ shop });
  return `/login?${params.toString()}`;
}
