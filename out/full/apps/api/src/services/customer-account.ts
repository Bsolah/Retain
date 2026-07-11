import { createHash, randomBytes } from 'node:crypto';
import { env } from '../env.js';

export type CustomerAccountDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  graphql_api: string;
  end_session_endpoint?: string;
};

export type CustomerTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  idToken?: string;
};

const discoveryCache = new Map<string, CustomerAccountDiscovery>();

export async function discoverCustomerAccountApi(
  shopDomain: string,
): Promise<CustomerAccountDiscovery> {
  const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const cached = discoveryCache.get(domain);
  if (cached) return cached;

  const [customerAccountResponse, openIdResponse] = await Promise.all([
    fetch(`https://${domain}/.well-known/customer-account-api`),
    fetch(`https://${domain}/.well-known/openid-configuration`),
  ]);

  if (!customerAccountResponse.ok) {
    throw new Error(
      `Customer Account API discovery failed (${customerAccountResponse.status})`,
    );
  }
  if (!openIdResponse.ok) {
    throw new Error(
      `OpenID discovery failed (${openIdResponse.status}). Enable new customer accounts on the store.`,
    );
  }

  const customerAccount = (await customerAccountResponse.json()) as {
    graphql_api: string;
  };
  const openId = (await openIdResponse.json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
    end_session_endpoint?: string;
  };

  const discovery: CustomerAccountDiscovery = {
    authorization_endpoint: openId.authorization_endpoint,
    token_endpoint: openId.token_endpoint,
    graphql_api: customerAccount.graphql_api,
    end_session_endpoint: openId.end_session_endpoint,
  };

  discoveryCache.set(domain, discovery);
  return discovery;
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizationUrl(options: {
  discovery: CustomerAccountDiscovery;
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const url = new URL(options.discovery.authorization_endpoint);
  url.searchParams.set('client_id', env.CUSTOMER_ACCOUNT_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('state', options.state);
  url.searchParams.set('scope', 'openid email customer-account-api:full');
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeAuthorizationCode(options: {
  discovery: CustomerAccountDiscovery;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<CustomerTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.CUSTOMER_ACCOUNT_CLIENT_ID,
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
  });

  const response = await fetch(options.discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    idToken: payload.id_token,
  };
}

export async function refreshCustomerTokens(options: {
  discovery: CustomerAccountDiscovery;
  refreshToken: string;
}): Promise<CustomerTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.CUSTOMER_ACCOUNT_CLIENT_ID,
    refresh_token: options.refreshToken,
  });

  const response = await fetch(options.discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? options.refreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
    idToken: payload.id_token,
  };
}

export async function customerAccountGraphql<T>(
  graphqlApi: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(graphqlApi, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).join('; ') ??
        `Customer Account API HTTP ${response.status}`,
    );
  }

  if (!payload.data) {
    throw new Error('Customer Account API returned no data');
  }

  return payload.data;
}
