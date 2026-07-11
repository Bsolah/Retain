/**
 * Safe Shopify token diagnostic — never prints access tokens.
 *
 * Usage:
 *   pnpm --filter @retain/api exec tsx scripts/diagnose-shop-token.ts
 *   SHOP_DOMAIN=your-store.myshopify.com pnpm --filter @retain/api exec tsx scripts/diagnose-shop-token.ts
 */
import { prisma } from '@retain/database';
import { decrypt } from '../src/lib/encryption.js';
import { env } from '../src/env.js';
import {
  fetchShopIdentity,
  ShopifyClientError,
} from '../src/services/shopify-client.js';

const SHOP_DOMAIN =
  process.env.SHOP_DOMAIN ?? 'basic-store-app-test.myshopify.com';

function tokenLooksValid(plain: string): boolean {
  return /^shpat_[a-f0-9]+$/i.test(plain) || /^shpua_[a-f0-9]+$/i.test(plain);
}

async function main() {
  console.log('— Retain shop token diagnostic —');
  console.log(`Shop: ${SHOP_DOMAIN}`);
  console.log(`API key (last 6): ...${env.SHOPIFY_API_KEY.slice(-6)}`);
  console.log(
    `OAuth callback: ${env.SHOPIFY_APP_URL.replace(/\/$/, '')}/auth/callback`,
  );

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: SHOP_DOMAIN },
  });

  if (!shop) {
    console.log('RESULT: shop not found in database — OAuth never completed');
    process.exit(1);
  }

  console.log(`DB status: ${shop.status}`);
  console.log(`Installed: ${shop.installedAt.toISOString()}`);
  console.log(`Updated:   ${shop.updatedAt.toISOString()}`);
  console.log(
    `Scopes (at install): ${JSON.stringify((shop.settings as { scopes?: string[] })?.scopes ?? [])}`,
  );

  const encrypted = shop.accessToken;
  if (encrypted.includes('REVOKED')) {
    console.log('RESULT: access token is REVOKED — reinstall required');
    process.exit(1);
  }

  if (!encrypted.startsWith('enc:v1:')) {
    console.log('RESULT: access token is not encrypted (unexpected format)');
    process.exit(1);
  }

  let plain: string;
  try {
    plain = decrypt(encrypted);
    console.log('Decrypt: OK');
  } catch (error) {
    console.log(
      `RESULT: decrypt failed — ENCRYPTION_KEY may have changed (${error instanceof Error ? error.message : 'unknown'})`,
    );
    process.exit(1);
  }

  if (!tokenLooksValid(plain)) {
    const kind = plain.startsWith('shpat_sim')
      ? 'simulated (oauth:simulate script — not valid against Shopify)'
      : plain.startsWith('shpat_')
        ? 'shpat_ but unexpected format'
        : `unexpected (${plain.length} chars)`;
    console.log(`Token shape: INVALID — ${kind}`);
  } else {
    console.log('Token shape: OK (shpat_/shpua_)');
  }

  const requiredScopes = env.SCOPES.split(',').map((s) => s.trim());
  const installedScopes =
    (shop.settings as { scopes?: string[] })?.scopes ?? [];
  const missing = requiredScopes.filter((s) => !installedScopes.includes(s));
  if (missing.length > 0) {
    console.log(`Missing scopes vs .env SCOPES: ${missing.join(', ')}`);
    console.log('(Reinstall after updating SCOPES in apps/api/.env)');
  }

  try {
    const identity = await fetchShopIdentity(shop.shopifyDomain, plain);
    console.log(
      `Shopify API: OK — shop id ${identity.id}, name "${identity.name}"`,
    );
    console.log('RESULT: token is valid');
  } catch (error) {
    if (error instanceof ShopifyClientError) {
      console.log(
        `Shopify API: FAILED — HTTP ${error.statusCode ?? 'unknown'}`,
      );
      if (error.statusCode === 401) {
        console.log(
          'RESULT: Shopify rejected the stored token. Re-run OAuth and confirm /auth/callback updates updated_at.',
        );
        console.log(
          `Install URL: ${env.SHOPIFY_APP_URL.replace(/\/$/, '')}/auth/shopify?shop=${SHOP_DOMAIN}`,
        );
      } else {
        console.log(`RESULT: ${error.message}`);
      }
    } else {
      console.log(
        `RESULT: unexpected error — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
