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

      // Install may be started from the embedded admin with only `shop` (+ optional
      // `host`). Shopify signs HMAC for application_url (admin), not for this API
      // path — so requiring HMAC here breaks reinstall/OAuth kickoff in production.
      // If Shopify did send hmac (rare for this route), still verify it.
      // CSRF is covered by OAuth `state` stored in Redis until callback.
      const hasHmac = Boolean(request.query.hmac);
      if (hasHmac && !verifyShopifyQueryHmac(request.query)) {
        return reply.status(401).send({
          message: 'Invalid HMAC',
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
          request.log.warn(
            { shop: shopDomain },
            'OAuth callback rejected: invalid HMAC (check SHOPIFY_API_SECRET matches Partner Dashboard)',
          );
          return reply
            .status(401)
            .type('text/html')
            .send(
              oauthErrorReply({
                title: 'OAuth failed: invalid HMAC',
                detail:
                  'SHOPIFY_API_SECRET in apps/api/.env does not match the Client secret in Partner Dashboard.',
              }),
            );
        }

        const redis = getRedis();
        const expectedShop = await redis.get(oauthStateKey(state));
        await redis.del(oauthStateKey(state));

        if (!expectedShop || expectedShop !== shopDomain) {
          request.log.warn(
            { shop: shopDomain, hasState: Boolean(expectedShop) },
            'OAuth callback rejected: invalid or expired state (restart install from /auth/shopify)',
          );
          return reply
            .status(401)
            .type('text/html')
            .send(
              oauthErrorReply({
                title: 'OAuth failed: invalid or expired state',
                detail:
                  'The install session expired or Redis lost the state. Open the install URL again and complete approval within 10 minutes.',
              }),
            );
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

        request.log.info(
          {
            shop: shopDomain,
            scopes: tokenResponse.scope.split(','),
            shopId: shop.id,
          },
          'OAuth completed — access token stored',
        );

        // Return to Shopify Admin so the app reloads inside the embedded iframe.
        // Session JWT is issued in-iframe via POST /auth/session-token.
        const redirectUrl = buildEmbeddedAppRedirect({
          shopDomain,
          host: request.query.host,
        });

        return reply.redirect(redirectUrl);
      } catch (error) {
        request.log.error({ err: error }, 'OAuth callback failed');
        const detail = error instanceof Error ? error.message : 'Unknown error';
        return reply
          .status(500)
          .type('text/html')
          .send(
            oauthErrorReply({
              title: 'OAuth callback failed',
              detail: `${detail}. Check API logs. Common causes: wrong API key/secret, or redirect URL in Partner Dashboard does not match SHOPIFY_APP_URL/auth/callback.`,
            }),
          );
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
  // Must match Partner Dashboard "Allowed redirection URL(s)" exactly.
  return `${env.SHOPIFY_APP_URL.replace(/\/$/, '')}/auth/callback`;
}

function buildEmbeddedAppRedirect(options: {
  shopDomain: string;
  host?: string;
}): string {
  const storeHandle = options.shopDomain.replace(/\.myshopify\.com$/, '');
  // Always return to Shopify Admin embedded app URL (keeps UI inside the iframe).
  const target = new URL(
    `https://admin.shopify.com/store/${storeHandle}/apps/${env.SHOPIFY_API_KEY}`,
  );

  target.searchParams.set('shop', options.shopDomain);
  if (options.host) {
    target.searchParams.set('host', options.host);
  }

  return target.toString();
}

function oauthErrorReply(options: { title: string; detail: string }): string {
  const callback = oauthCallbackUrl();
  const body = `
    <h1>${options.title}</h1>
    <p>${options.detail}</p>
    <p>Expected callback URL in Partner Dashboard:</p>
    <pre>${callback}</pre>
    <p>Current SHOPIFY_APP_URL: <code>${env.SHOPIFY_APP_URL}</code></p>
  `;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${options.title}</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;line-height:1.5">${body}</body></html>`;
}
