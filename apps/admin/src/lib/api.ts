import {
  clearSession,
  getShopDomain,
  resolveApiUrl,
  setSession,
} from './session';

const API_URL = resolveApiUrl();
const SHOP_KEY = 'retain.shopDomain';

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; code?: string }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function mintSessionToken(shop: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/session-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shop }),
    });
  } catch {
    throw new ApiError(
      `Failed to reach API at ${API_URL}. Check VITE_API_URL / admin deploy.`,
      'NETWORK_ERROR',
    );
  }

  const payload = (await response.json()) as {
    token?: string;
    shop?: { id: string; shopifyDomain: string };
    message?: string;
    code?: string;
  };

  if (!response.ok || !payload.token || !payload.shop) {
    throw new ApiError(
      payload.message ?? 'Unable to create session token',
      payload.code ?? 'UNAUTHENTICATED',
    );
  }

  setSession({
    token: payload.token,
    shopDomain: payload.shop.shopifyDomain,
    shopId: payload.shop.id,
  });

  return payload.token;
}

export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const shop = getShopDomain();
  if (!shop) {
    throw new ApiError(
      'Missing shop session. Re-open the app from Shopify Admin.',
      'UNAUTHENTICATED',
    );
  }

  const token = await mintSessionToken(shop);

  const response = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as GraphqlResponse<T>;

  if (payload.errors?.length) {
    const message = payload.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join('; ');
    throw new ApiError(message || 'GraphQL error', payload.errors[0]?.code);
  }

  if (!payload.data) {
    throw new ApiError('Empty GraphQL response');
  }

  return payload.data;
}

export async function fetchShopContext(): Promise<{
  id: string;
  shopifyDomain: string;
}> {
  const shopDomain = getShopDomain();
  if (!shopDomain) {
    throw new ApiError(
      'Missing shop context. Open the app from Shopify Admin.',
      'UNAUTHENTICATED',
    );
  }

  // Drop any stale JWT (e.g. after uninstall) and mint a fresh one.
  clearSession();
  sessionStorage.setItem(SHOP_KEY, shopDomain);

  try {
    const token = await mintSessionToken(shopDomain);

    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const payload = (await response.json()) as {
      shop?: { id: string; shopifyDomain: string };
      message?: string;
      code?: string;
    };

    if (!response.ok || !payload.shop) {
      throw new ApiError(
        payload.message ?? 'Failed to load shop context',
        payload.code ?? 'UNAUTHENTICATED',
      );
    }

    setSession({
      token,
      shopDomain: payload.shop.shopifyDomain,
      shopId: payload.shop.id,
    });

    return payload.shop;
  } catch (error) {
    clearSession();
    sessionStorage.setItem(SHOP_KEY, shopDomain);
    throw error;
  }
}
