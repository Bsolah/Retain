/**
 * Simulates the Shopify OAuth install flow against a running API.
 *
 * Usage:
 *   pnpm --filter @retain/api oauth:simulate
 *
 * Optional env:
 *   API_BASE_URL=http://localhost:3001
 *   SHOP_DOMAIN=retain-demo.myshopify.com
 *
 * For a full browser install with real Shopify, use ngrok:
 *   ngrok http 3001
 *   # set SHOPIFY_APP_URL to the ngrok https URL in apps/api/.env
 *   # Partner Dashboard → App URL / Allowed redirection URLs:
 *   #   https://<ngrok>/auth/callback
 *   open "https://<ngrok>/auth/shopify?shop=your-store.myshopify.com"
 */
import { createHmac, randomBytes } from 'node:crypto';
import { prisma, ShopStatus } from '@retain/database';
import { decrypt, encrypt } from '../src/lib/encryption.js';
import {
  normalizeShopDomain,
  verifyShopifyQueryHmac,
  verifyShopifyWebhookHmac,
} from '../src/middleware/shopify.js';
import { WEBHOOK_TOPIC_COUNT } from '../src/constants/webhooks.js';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const SHOP_DOMAIN = process.env.SHOP_DOMAIN ?? 'retain-oauth-sim.myshopify.com';
const API_SECRET = process.env.SHOPIFY_API_SECRET ?? 'dev-shopify-api-secret';

function signQuery(query: Record<string, string>): string {
  const message = Object.keys(query)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join('&');

  return createHmac('sha256', API_SECRET).update(message).digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log('— Retain OAuth simulation —');
  console.log(`API:  ${API_BASE_URL}`);
  console.log(`Shop: ${SHOP_DOMAIN}`);
  console.log(`Webhook topics configured: ${WEBHOOK_TOPIC_COUNT}`);

  const shopDomain = normalizeShopDomain(SHOP_DOMAIN);
  assert(shopDomain, 'Invalid shop domain');

  // 1) HMAC helpers
  const installQuery = {
    shop: shopDomain,
    timestamp: String(Math.floor(Date.now() / 1000)),
    host: Buffer.from(`${shopDomain}/admin`).toString('base64'),
  };
  const hmac = signQuery(installQuery);
  assert(
    verifyShopifyQueryHmac({ ...installQuery, hmac }),
    'Query HMAC verification failed',
  );
  console.log('✓ Query HMAC verification');

  const webhookBody = Buffer.from(
    JSON.stringify({ id: 1, domain: shopDomain }),
    'utf8',
  );
  const webhookHmac = createHmac('sha256', API_SECRET)
    .update(webhookBody)
    .digest('base64');
  assert(
    verifyShopifyWebhookHmac(webhookBody, webhookHmac),
    'Webhook HMAC verification failed',
  );
  console.log('✓ Webhook HMAC verification');

  // 2) Encryption round-trip (access token storage)
  const accessToken = `shpat_sim_${randomBytes(8).toString('hex')}`;
  const encrypted = encrypt(accessToken);
  assert(encrypted.startsWith('enc:v1:'), 'Encrypted payload missing prefix');
  assert(decrypt(encrypted) === accessToken, 'Decrypt mismatch');
  console.log('✓ AES-256-GCM encrypt/decrypt');

  // 3) Upsert shop as the OAuth callback would
  const shop = await prisma.shop.upsert({
    where: { shopifyDomain: shopDomain },
    create: {
      shopifyDomain: shopDomain,
      shopifyShopId: `gid://shopify/Shop/sim-${Date.now()}`,
      accessToken: encrypted,
      status: ShopStatus.active,
      settings: { scopes: ['read_products'], simulated: true },
      billingSettings: {},
      installedAt: new Date(),
    },
    update: {
      accessToken: encrypted,
      status: ShopStatus.active,
      uninstalledAt: null,
      installedAt: new Date(),
      settings: { scopes: ['read_products'], simulated: true },
    },
  });
  assert(shop.status === ShopStatus.active, 'Shop not active after upsert');
  assert(decrypt(shop.accessToken) === accessToken, 'Stored token mismatch');
  console.log(`✓ Shop upserted (${shop.id})`);

  // 4) Session token endpoint
  const sessionResponse = await fetch(`${API_BASE_URL}/auth/session-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shop: shopDomain }),
  });

  if (!sessionResponse.ok) {
    console.log(
      `⚠ POST /auth/session-token returned ${sessionResponse.status} (is the API running?)`,
    );
  } else {
    const sessionJson = (await sessionResponse.json()) as {
      token: string;
      shop: { id: string };
    };
    assert(sessionJson.token, 'Missing session token');
    assert(sessionJson.shop.id === shop.id, 'Session shop id mismatch');
    console.log('✓ POST /auth/session-token');

    const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { authorization: `Bearer ${sessionJson.token}` },
    });
    assert(meResponse.ok, `/auth/me failed: ${meResponse.status}`);
    const meJson = (await meResponse.json()) as {
      shop: { shopifyDomain: string };
    };
    assert(
      meJson.shop.shopifyDomain === shopDomain,
      'Session middleware shop mismatch',
    );
    console.log('✓ GET /auth/me (validateSessionToken)');
  }

  // 5) OAuth start redirect (HMAC-signed)
  const authUrl = new URL(`${API_BASE_URL}/auth/shopify`);
  authUrl.searchParams.set('shop', shopDomain);
  authUrl.searchParams.set('timestamp', installQuery.timestamp);
  authUrl.searchParams.set('host', installQuery.host);
  authUrl.searchParams.set('hmac', hmac);

  const authResponse = await fetch(authUrl, { redirect: 'manual' });
  if (authResponse.status === 302 || authResponse.status === 301) {
    const location = authResponse.headers.get('location') ?? '';
    assert(
      location.includes(`${shopDomain}/admin/oauth/authorize`),
      `Unexpected authorize redirect: ${location}`,
    );
    assert(location.includes('client_id='), 'Authorize URL missing client_id');
    console.log('✓ GET /auth/shopify → Shopify authorize redirect');
  } else {
    console.log(
      `⚠ GET /auth/shopify returned ${authResponse.status} (is the API running?)`,
    );
  }

  // 6) Webhook uninstall path (HMAC + idempotency + status flip)
  const uninstallBody = Buffer.from(
    JSON.stringify({ domain: shopDomain }),
    'utf8',
  );
  const uninstallHmac = createHmac('sha256', API_SECRET)
    .update(uninstallBody)
    .digest('base64');
  const webhookId = `sim-${randomBytes(8).toString('hex')}`;

  const uninstallResponse = await fetch(
    `${API_BASE_URL}/webhooks/shopify/app/uninstalled`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-topic': 'app/uninstalled',
        'x-shopify-shop-domain': shopDomain,
        'x-shopify-hmac-sha256': uninstallHmac,
        'x-shopify-webhook-id': webhookId,
      },
      body: uninstallBody,
    },
  );

  if (uninstallResponse.ok) {
    const updated = await prisma.shop.findUniqueOrThrow({
      where: { id: shop.id },
    });
    assert(
      updated.status === ShopStatus.uninstalled,
      'Shop was not marked uninstalled',
    );
    console.log('✓ POST /webhooks/shopify/app/uninstalled');

    const duplicate = await fetch(
      `${API_BASE_URL}/webhooks/shopify/app/uninstalled`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shopify-topic': 'app/uninstalled',
          'x-shopify-shop-domain': shopDomain,
          'x-shopify-hmac-sha256': uninstallHmac,
          'x-shopify-webhook-id': webhookId,
        },
        body: uninstallBody,
      },
    );
    const duplicateJson = (await duplicate.json()) as { duplicate?: boolean };
    assert(duplicate.ok, 'Duplicate webhook should still return 200');
    assert(duplicateJson.duplicate === true, 'Expected duplicate=true');
    console.log('✓ Webhook idempotency (Redis)');
  } else {
    console.log(
      `⚠ Uninstall webhook returned ${uninstallResponse.status} (is the API running?)`,
    );
  }

  console.log('\nSimulation complete.');
  console.log('\nReal install with ngrok:');
  console.log('  1. ngrok http 3001');
  console.log('  2. Set SHOPIFY_APP_URL to the ngrok https URL');
  console.log('  3. Allow redirect: https://<ngrok>/auth/callback');
  console.log(
    '  4. Open https://<ngrok>/auth/shopify?shop=your-store.myshopify.com',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
