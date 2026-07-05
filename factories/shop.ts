import { randomUUID } from 'node:crypto';
import type { Prisma, Shop } from '@retain/database';
import { PlanTier, ShopStatus } from '@retain/database';

export type ShopFactoryOverrides = Partial<
  Omit<Prisma.ShopCreateInput, 'id'> & { id?: string }
>;

let shopCounter = 0;

export function buildShop(overrides: ShopFactoryOverrides = {}): Shop {
  shopCounter += 1;
  const id = overrides.id ?? randomUUID();
  const now = new Date();

  return {
    id,
    shopifyDomain:
      overrides.shopifyDomain ?? `test-shop-${shopCounter}.myshopify.com`,
    shopifyShopId:
      overrides.shopifyShopId ?? `gid://shopify/Shop/${100000 + shopCounter}`,
    accessToken:
      overrides.accessToken ?? 'enc:v1:seed-demo-token-not-for-production',
    planTier: overrides.planTier ?? PlanTier.growth,
    status: overrides.status ?? ShopStatus.active,
    settings: (overrides.settings as Shop['settings']) ?? {
      timezone: 'America/New_York',
      currency: 'USD',
      retentionEnabled: true,
      auto_interventions_enabled: true,
    },
    billingSettings: (overrides.billingSettings as Shop['billingSettings']) ?? {
      billingEmail: `billing-${shopCounter}@test.example`,
    },
    installedAt: overrides.installedAt ?? now,
    uninstalledAt: overrides.uninstalledAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  } as Shop;
}

export function buildShopCreateInput(
  overrides: ShopFactoryOverrides = {},
): Prisma.ShopCreateInput {
  const shop = buildShop(overrides);
  return {
    id: shop.id,
    shopifyDomain: shop.shopifyDomain,
    shopifyShopId: shop.shopifyShopId,
    accessToken: shop.accessToken,
    planTier: shop.planTier,
    status: shop.status,
    settings: shop.settings as Prisma.InputJsonValue,
    billingSettings: shop.billingSettings as Prisma.InputJsonValue,
    installedAt: shop.installedAt,
    uninstalledAt: shop.uninstalledAt,
  };
}

export function resetShopFactoryCounter(): void {
  shopCounter = 0;
}
