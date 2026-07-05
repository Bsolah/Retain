const SESSION_KEY = 'retain.sessionToken';
const SHOP_KEY = 'retain.shopDomain';
const SHOP_ID_KEY = 'retain.shopId';

export function getSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function getShopDomain(): string | null {
  return sessionStorage.getItem(SHOP_KEY);
}

export function getShopId(): string | null {
  return sessionStorage.getItem(SHOP_ID_KEY);
}

export function setSession(options: {
  token: string;
  shopDomain: string;
  shopId?: string;
}): void {
  sessionStorage.setItem(SESSION_KEY, options.token);
  sessionStorage.setItem(SHOP_KEY, options.shopDomain);
  if (options.shopId) {
    sessionStorage.setItem(SHOP_ID_KEY, options.shopId);
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SHOP_KEY);
  sessionStorage.removeItem(SHOP_ID_KEY);
}

/** Bootstrap session from OAuth redirect query params. */
export function bootstrapSessionFromUrl(): {
  shop: string | null;
  host: string | null;
  hasSession: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('session');
  const shop = params.get('shop');
  const host = params.get('host');

  if (token && shop) {
    setSession({ token, shopDomain: shop });
    params.delete('session');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({}, '', next);
    return { shop, host, hasSession: true };
  }

  // Persist shop from Shopify iframe query so /auth/session-token can run in-frame.
  if (shop && !getShopDomain()) {
    sessionStorage.setItem(SHOP_KEY, shop);
  }

  return {
    shop: shop ?? getShopDomain(),
    host,
    hasSession: Boolean(getSessionToken()),
  };
}

/** Public API base for OAuth (must be reachable by Shopify — tunnel URL). */
export function getPublicApiUrl(): string {
  return (
    import.meta.env.VITE_API_PUBLIC_URL ??
    import.meta.env.VITE_API_URL ??
    'http://localhost:3001'
  ).replace(/\/$/, '');
}

/** Start OAuth at top-level (required — cannot complete OAuth inside iframe). */
export function redirectToInstall(shop: string, host?: string | null): void {
  const url = new URL(`${getPublicApiUrl()}/auth/shopify`);
  url.searchParams.set('shop', shop);
  if (host) {
    url.searchParams.set('host', host);
  }
  const target = window.top ?? window;
  target.location.href = url.toString();
}
