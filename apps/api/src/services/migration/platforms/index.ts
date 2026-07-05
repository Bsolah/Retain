import type { MigrationPlatformName } from '@retain/shared';
import { rechargeAdapter } from './recharge.js';
import { csvAdapter } from './csv.js';
import { boldAdapter, appstleAdapter, smartrrAdapter } from './rest-stub.js';
import { shopifySubscriptionsAdapter } from './shopify-native.js';
import type { PlatformAdapter } from '../types.js';

const adapters: Record<MigrationPlatformName, PlatformAdapter> = {
  recharge: rechargeAdapter,
  shopify_subscriptions: shopifySubscriptionsAdapter,
  bold: boldAdapter,
  appstle: appstleAdapter,
  smartrr: smartrrAdapter,
  csv: csvAdapter,
};

export function getPlatformAdapter(
  platform: MigrationPlatformName,
): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return adapter;
}
