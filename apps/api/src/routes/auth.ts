import { prisma, ShopStatus } from '@retain/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { encrypt } from '../lib/encryption.js';
import { getRedis } from '../lib/redis.js';
import {
  normalizeShopDomain,
  verifyShopifyQueryHmac,
} from '../middleware/shopify.js';
import {
  generateSessionToken,
  validateSessionToken,
  type AuthenticatedRequest,
} from '../middleware/session.js';
import {
  exchangeAuthorizationCode,
  fetchShopIdentity,
} from '../services/shopify-client.js';
import { subscribeRequiredWebhooks } from '../services/webhook-subscriber.js';

const OAUTH_STATE_TTL_SECONDS = 60 * 10;

type ShopifyAuthQuery = {
  shop?: string;
  hmac?: string;
  timestamp?: string;
  host?: string;
  session?: string;
};

type ShopifyCallbackQuery = ShopifyAuthQuery & {
  code?: string;
  state?: string;
};

type SessionTokenBody = {
  shop?: string;
};

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ShopifyAuthQuery }>(
    '/auth/shopify',
    async (request, reply) => {
      const shopDomain = normalizeShopDomain(request.query.shop ?? '');
      if (!shopDomain) {
        return reply.status(400).send({
          message: 'Missing or invalid shop domain',
          code: 'BAD_USER_INPUT',
          extensions: {},
        });
      }

      // Install requests from Shopify Admin include HMAC; require it when present
      // or when not in local test mode.
      const hasHmac = Boolean(request.query.hmac);
      if (hasHmac && !verifyShopifyQueryHmac(request.query)) {
        return reply.status(401).send({
          message: 'Invalid HMAC',
          code: 'UNAUTHORIZED',
          extensions: {},
        });
      }

      if (!hasHmac && env.NODE_ENV === 'production') {
        return reply.status(401).send({
          message: 'Missing HMAC',
          code: 'UNAUTHORIZED',
          extensions: {},
        });
      }

      const state = randomBytes(16).toString('hex');
      const redis = getRedis();
      await redis.set(
        oauthStateKey(state),
        shopDomain,
        'EX',
        OAUTH_STATE_TTL_SECONDS,
      );

      const authorizeUrl = new URL(
        `https://${shopDomain}/admin/oauth/authorize`,
      );
      authorizeUrl.searchParams.set('client_id', env.SHOPIFY_API_KEY);
      authorizeUrl.searchParams.set('scope', env.SCOPES);
      authorizeUrl.searchParams.set('redirect_uri', oauthCallbackUrl());
      authorizeUrl.searchParams.set('state', state);

      return reply.redirect(authorizeUrl.toString());
    },
  );

  app.get<{ Querystring: ShopifyCallbackQuery }>(
    '/auth/callback',
    async (request, reply) => {
      try {
        const shopDomain = normalizeShopDomain(request.query.shop ?? '');
        const code = request.query.code;
        const state = request.query.state;

        if (!shopDomain || !code || !state) {
          return reply.status(400).send({
            message: 'Missing shop, code, or state',
            code: 'BAD_USER_INPUT',
            extensions: {},
          });
        }

        if (!verifyShopifyQueryHmac(request.query)) {
          return reply.status(401).send({
            message: 'Invalid HMAC',
            code: 'UNAUTHORIZED',
            extensions: {},
          });
        }

        const redis = getRedis();
        const expectedShop = await redis.get(oauthStateKey(state));
        await redis.del(oauthStateKey(state));

        if (!expectedShop || expectedShop !== shopDomain) {
          return reply.status(401).send({
            message: 'Invalid OAuth state',
            code: 'UNAUTHORIZED',
            extensions: {},
          });
        }

        const tokenResponse = await exchangeAuthorizationCode({
          shopDomain,
          code,
        });

        const identity = await fetchShopIdentity(
          shopDomain,
          tokenResponse.access_token,
        );

        const encryptedToken = encrypt(tokenResponse.access_token);

        const shop = await prisma.shop.upsert({
          where: { shopifyDomain: shopDomain },
          create: {
            shopifyDomain: shopDomain,
            shopifyShopId: identity.id,
            accessToken: encryptedToken,
            status: ShopStatus.active,
            planTier: 'starter',
            settings: {
              scopes: tokenResponse.scope.split(','),
              name: identity.name,
            },
            billingSettings: {},
            installedAt: new Date(),
            uninstalledAt: null,
          },
          update: {
            shopifyShopId: identity.id,
            accessToken: encryptedToken,
            status: ShopStatus.active,
            settings: {
              scopes: tokenResponse.scope.split(','),
              name: identity.name,
            },
            installedAt: new Date(),
            uninstalledAt: null,
          },
        });

        const webhookResults = await subscribeRequiredWebhooks(shop);
        const failedWebhooks = webhookResults.filter((result) => result.error);

        if (failedWebhooks.length > 0) {
          request.log.warn(
            { shop: shopDomain, failedWebhooks },
            'Some webhook subscriptions failed during install',
          );
        }

        const sessionToken = await generateSessionToken(request, shop);
        const redirectUrl = buildEmbeddedAppRedirect({
          shopDomain,
          host: request.query.host,
          sessionToken,
        });

        return reply.redirect(redirectUrl);
      } catch (error) {
        request.log.error({ err: error }, 'OAuth callback failed');
        return reply.status(500).send({
          message: 'OAuth callback failed',
          code: 'INTERNAL_SERVER_ERROR',
          extensions: {},
        });
      }
    },
  );

  app.post<{ Body: SessionTokenBody }>(
    '/auth/session-token',
    async (request, reply) => {
      const shopDomain = normalizeShopDomain(request.body?.shop ?? '');
      if (!shopDomain) {
        return reply.status(400).send({
          message: 'Missing or invalid shop domain',
          code: 'BAD_USER_INPUT',
          extensions: {},
        });
      }

      const shop = await prisma.shop.findUnique({
        where: { shopifyDomain: shopDomain },
      });

      if (!shop || shop.status !== ShopStatus.active) {
        return reply.status(401).send({
          message: 'Shop is not installed or not active',
          code: 'UNAUTHENTICATED',
          extensions: {},
        });
      }

      const token = await generateSessionToken(request, shop);

      return reply.status(200).send({
        token,
        expiresIn: 60 * 15,
        shop: {
          id: shop.id,
          shopifyDomain: shop.shopifyDomain,
        },
      });
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: async (request, reply) => {
        await validateSessionToken(request as AuthenticatedRequest, reply);
      },
    },
    async (request: FastifyRequest, reply) => {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.shop) {
        return reply;
      }

      return reply.status(200).send({
        shop: {
          id: authRequest.shop.id,
          shopifyDomain: authRequest.shop.shopifyDomain,
          status: authRequest.shop.status,
          planTier: authRequest.shop.planTier,
        },
      });
    },
  );
}

function oauthStateKey(state: string): string {
  return `oauth:state:${state}`;
}

function oauthCallbackUrl(): string {
  return `${env.SHOPIFY_APP_URL.replace(/\/$/, '')}/auth/callback`;
}

function buildEmbeddedAppRedirect(options: {
  shopDomain: string;
  host?: string;
  sessionToken: string;
}): string {
  const storeHandle = options.shopDomain.replace(/\.myshopify\.com$/, '');
  const embeddedAdminUrl = `https://admin.shopify.com/store/${storeHandle}/apps/${env.SHOPIFY_API_KEY}`;
  const target = new URL(
    env.ADMIN_APP_URL.length > 0 ? env.ADMIN_APP_URL : embeddedAdminUrl,
  );

  target.searchParams.set('shop', options.shopDomain);
  target.searchParams.set('session', options.sessionToken);
  if (options.host) {
    target.searchParams.set('host', options.host);
  }

  return target.toString();
}
