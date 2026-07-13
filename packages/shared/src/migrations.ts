export const MIGRATION_QUEUES = {
  sync: 'migration-sync',
  cutover: 'migration-cutover',
} as const;

export type MigrationSyncJob = {
  migrationId: string;
  shopId: string;
};

export type MigrationCutoverJob = {
  migrationId: string;
  shopId: string;
  cancelSourceOnCutover?: boolean;
};

export const MIGRATION_ROLLBACK_WINDOW_MS = 48 * 60 * 60 * 1000;

export const SUPPORTED_MIGRATION_PLATFORMS = [
  'recharge',
  'shopify_subscriptions',
  'bold',
  'appstle',
  'smartrr',
  'csv',
] as const;

export type MigrationPlatformName =
  (typeof SUPPORTED_MIGRATION_PLATFORMS)[number];
