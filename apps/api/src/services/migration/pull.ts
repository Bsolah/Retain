import type { Shop } from '@retain/database';
import type { MigrationPlatformName } from '@retain/shared';
import { discoverMigration } from './discover.js';
import { runMigrationSync } from './sync.js';
import { validateMigration, type ValidationReport } from './validate.js';
import type { MigrationCredentials } from './types.js';

/**
 * Validate = pull all source records into Retain and produce a validation report.
 * Discover → sync customers/contracts → validate counts and field parity.
 */
export async function pullAndValidateMigration(input: {
  shop: Shop;
  platform: MigrationPlatformName;
  credentials: MigrationCredentials;
}): Promise<{
  migrationId: string;
  status: string;
  preview: {
    totalContracts: number;
    totalCustomers: number;
    totalRevenue: number;
    estimatedDurationMinutes: number;
  };
  validationReport: ValidationReport;
}> {
  const { migration, preview } = await discoverMigration(input);
  await runMigrationSync(input.shop, migration.id);
  const validationReport = await validateMigration(input.shop.id, migration.id);

  return {
    migrationId: migration.id,
    status: 'validated',
    preview,
    validationReport,
  };
}
