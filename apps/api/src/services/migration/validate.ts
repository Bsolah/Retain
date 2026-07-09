import {
  MigrationRecordStatus,
  MigrationStatus,
  prisma,
} from '@retain/database';
import type { SourceContract } from './types.js';

export type ValidationIssue = {
  code: string;
  message: string;
  recordId?: string;
  sourceId?: string;
  severity: 'error' | 'warning';
};

export type ValidationReport = {
  sourceContractCount: number;
  syncedContractCount: number;
  sourceCustomerCount: number;
  syncedCustomerCount: number;
  discrepancies: ValidationIssue[];
  passed: boolean;
  validatedAt: string;
};

export async function validateMigration(
  shopId: string,
  migrationId: string,
): Promise<ValidationReport> {
  const migration = await prisma.migrationJob.findFirst({
    where: { id: migrationId, shopId },
  });
  if (!migration) throw new Error('Migration not found');

  const records = await prisma.migrationRecord.findMany({
    where: { migrationId },
  });

  const sourceContracts = records.filter((r) => r.sourceType === 'contract');
  const syncedContracts = sourceContracts.filter(
    (r) => r.status === MigrationRecordStatus.synced,
  );
  const sourceCustomers = records.filter((r) => r.sourceType === 'customer');
  const syncedCustomers = sourceCustomers.filter(
    (r) => r.status === MigrationRecordStatus.synced,
  );

  const discrepancies: ValidationIssue[] = [];

  if (syncedContracts.length < sourceContracts.length) {
    discrepancies.push({
      code: 'CONTRACT_COUNT_MISMATCH',
      message: `${sourceContracts.length - syncedContracts.length} contracts failed to sync`,
      severity: 'error',
    });
  }

  const pendingRecords = records.filter(
    (r) => r.status === MigrationRecordStatus.pending,
  );
  if (pendingRecords.length > 0) {
    discrepancies.push({
      code: 'SYNC_INCOMPLETE',
      message: `${pendingRecords.length} records were never synced. Run Step 2 — Start sync and wait for it to finish before validating.`,
      severity: 'error',
    });
  }

  for (const record of sourceContracts) {
    if (record.status === MigrationRecordStatus.pending) {
      continue;
    }
    if (record.status !== MigrationRecordStatus.synced) {
      discrepancies.push({
        code: 'CONTRACT_NOT_SYNCED',
        message: record.errorMessage ?? 'Contract not synced',
        recordId: record.id,
        sourceId: record.sourceId,
        severity: 'error',
      });
      continue;
    }

    const contract = record.payload as unknown as SourceContract;
    const local = record.localContractId
      ? await prisma.subscriptionContract.findUnique({
          where: { id: record.localContractId },
        })
      : null;

    if (!local) {
      discrepancies.push({
        code: 'LOCAL_CONTRACT_MISSING',
        message: 'Synced contract missing in local database',
        recordId: record.id,
        sourceId: record.sourceId,
        severity: 'error',
      });
      continue;
    }

    if (contract.nextBillingDate && local.nextBillingDate) {
      const sourceDate = new Date(contract.nextBillingDate).toDateString();
      const localDate = local.nextBillingDate.toDateString();
      if (sourceDate !== localDate) {
        discrepancies.push({
          code: 'BILLING_DATE_MISMATCH',
          message: `Next billing date mismatch: source ${sourceDate} vs local ${localDate}`,
          recordId: record.id,
          sourceId: record.sourceId,
          severity: 'warning',
        });
      }
    }

    if (!contract.variantId && !contract.productTitle) {
      discrepancies.push({
        code: 'PRODUCT_MISSING',
        message: 'No product reference on source contract',
        recordId: record.id,
        sourceId: record.sourceId,
        severity: 'warning',
      });
    }
  }

  const failedRecords = records.filter(
    (r) => r.status === MigrationRecordStatus.failed,
  );
  for (const record of failedRecords) {
    discrepancies.push({
      code: 'SYNC_FAILED',
      message: record.errorMessage ?? 'Record sync failed',
      recordId: record.id,
      sourceId: record.sourceId,
      severity: 'error',
    });
  }

  const report: ValidationReport = {
    sourceContractCount: sourceContracts.length,
    syncedContractCount: syncedContracts.length,
    sourceCustomerCount: sourceCustomers.length,
    syncedCustomerCount: syncedCustomers.length,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'error').length === 0,
    validatedAt: new Date().toISOString(),
  };

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: {
      status: MigrationStatus.validated,
      validationReport: report as object,
    },
  });

  return report;
}
