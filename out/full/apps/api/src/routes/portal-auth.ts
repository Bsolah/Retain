import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import {
  portalLoginRedirectUrl,
  resolvePortalShopDomain,
} from '../lib/portal-shop.js';
import { getRedis } from '../lib/redis.js';
import {
  buildAuthorizationUrl,
  createPkcePair,
  discoverCustomerAccountApi,
  exchangeAuthorizationCode,
  refreshCustomerTokens,
  type CustomerTokens,
} from '../services/customer-account.js';

const COOKIE_ACCESS = 'retain_caa_access';
const COOKIE_REFRESH = 'retain_caa_refresh';
const COOKIE_EXPIRY = 'retain_caa_expires';
const COOKIE_SHOP = 'retain_caa_shop';
const PKCE_TTL_SECONDS = 60 * 10;
const ACCESS_MAX_AGE = 60 * 60; // 1 hour

function portalRedirectUri(): string {
  return `${env.SHOPIFY_APP_URL.replace(/\/$/, '')}/portal/auth/callback`;
}

function cookieSecure(): boolean {
  return env.SHOPIFY_APP_URL.startsWith('https://');
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: CustomerTokens,
  shopDomain: string,
): void {
  const secure = cookieSecure();
  const common = {
    httpOnly: true,
    secure,
    sameSite: secure ? ('none' as const) : ('lax' as const),
    path: '/',
  };

  reply.setCookie(COOKIE_ACCESS, tokens.accessToken, {
    ...common,
    maxAge: ACCESS_MAX_AGE,
  });
  if (tokens.refreshToken) {
    reply.setCookie(COOKIE_REFRESH, tokens.refreshToken, {
      ...common,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  reply.setCookie(COOKIE_EXPIRY, String(tokens.expiresAt), {
    ...common,
    maxAge: ACCESS_MAX_AGE,
  });
  reply.setCookie(COOKIE_SHOP, shopDomain, {
    ...common,
    maxAge: 60 * 60 * 24 * 30,
  });
}

function clearAuthCookies(reply: FastifyReply): void {
  for (const name of [
    COOKIE_ACCESS,
    COOKIE_REFRESH,
    COOKIE_EXPIRY,
    COOKIE_SHOP,
  ]) {
    reply.clearCookie(name, { path: '/' });
  }
}

export function readPortalTokens(request: FastifyRequest): {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  shopDomain: string | null;
} {
  const cookies = request.cookies ?? {};
  return {
    accessToken: cookies[COOKIE_ACCESS] ?? null,
    refreshToken: cookies[COOKIE_REFRESH] ?? null,
    expiresAt: cookies[COOKIE_EXPIRY] ? Number(cookies[COOKIE_EXPIRY]) : null,
    shopDomain: cookies[COOKIE_SHOP] ?? null,
  };
}

export async function registerPortalAuthRoutes(
  app: FastifyInstance,
): Promise<void> {
  await app.register(cookie);

  app.get<{ Querystring: { shop?: string } }>(
    '/portal/auth/start',
    async (request, reply) => {
      const resolved = await resolvePortalShopDomain(request.query.shop);
      if (!resolved.ok) {
        if (resolved.code === 'NOT_CONFIGURED') {
          return reply.status(503).send({
            message: resolved.message,
            code: resolved.code,
          });
        }

        return reply.redirect(
          portalLoginRedirectUrl(
            request.query.shop?.trim() || undefined,
            resolved.code === 'SHOP_NOT_INSTALLED'
              ? 'shop_not_installed'
              : 'missing_shop',
          ),
        );
      }

      const { shopDomain } = resolved;
      const discovery = await discoverCustomerAccountApi(shopDomain);
      const state = randomBytes(16).toString('hex');
      const { codeVerifier, codeChallenge } = createPkcePair();

      await getRedis().set(
        `portal:pkce:${state}`,
        JSON.stringify({ codeVerifier, shopDomain }),
        'EX',
        PKCE_TTL_SECONDS,
      );

      const url = buildAuthorizationUrl({
        discovery,
        state,
        codeChallenge,
        redirectUri: portalRedirectUri(),
      });

      return reply.redirect(url);
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/portal/auth/callback',
    async (request, reply) => {
      if (request.query.error) {
        return reply.redirect(
          portalLoginRedirectUrl(undefined, request.query.error),
        );
      }

      const code = request.query.code;
      const state = request.query.state;
      if (!code || !state) {
        return reply.redirect(
          portalLoginRedirectUrl(undefined, 'missing_code'),
        );
      }

      const raw = await getRedis().get(`portal:pkce:${state}`);
      await getRedis().del(`portal:pkce:${state}`);
      if (!raw) {
        return reply.redirect(
          portalLoginRedirectUrl(undefined, 'invalid_state'),
        );
      }

      const { codeVerifier, shopDomain } = JSON.parse(raw) as {
        codeVerifier: string;
        shopDomain: string;
      };

      const discovery = await discoverCustomerAccountApi(shopDomain);
      const tokens = await exchangeAuthorizationCode({
        discovery,
        code,
        codeVerifier,
        redirectUri: portalRedirectUri(),
      });

      setAuthCookies(reply, tokens, shopDomain);
      return reply.redirect(`${env.PORTAL_URL.replace(/\/$/, '')}/portal`);
    },
  );

  app.post('/portal/auth/refresh', async (request, reply) => {
    const { refreshToken, shopDomain, expiresAt } = readPortalTokens(request);
    if (!refreshToken || !shopDomain) {
      return reply.status(401).send({
        message: 'Not authenticated',
        code: 'UNAUTHENTICATED',
      });
    }

    // Silent refresh when within 5 minutes of expiry (or already expired).
    if (expiresAt && expiresAt - Date.now() > 5 * 60 * 1000) {
      return reply.status(200).send({
        ok: true,
        expiresAt,
        refreshed: false,
      });
    }

    const discovery = await discoverCustomerAccountApi(shopDomain);
    const tokens = await refreshCustomerTokens({
      discovery,
      refreshToken,
    });
    setAuthCookies(reply, tokens, shopDomain);

    return reply.status(200).send({
      ok: true,
      expiresAt: tokens.expiresAt,
      refreshed: true,
    });
  });

  app.post('/portal/auth/logout', async (_request, reply) => {
    clearAuthCookies(reply);
    return reply.status(200).send({ ok: true });
  });

  app.get('/portal/auth/session', async (request, reply) => {
    const tokens = readPortalTokens(request);
    if (!tokens.accessToken || !tokens.shopDomain) {
      return reply.status(200).send({
        authenticated: false,
      });
    }

    return reply.status(200).send({
      authenticated: true,
      shopDomain: tokens.shopDomain,
      expiresAt: tokens.expiresAt,
    });
  });
}
