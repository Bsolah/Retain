import {
  ContractStatus,
  EventSource,
  MigrationStatus,
  prisma,
  type Shop,
} from '@retain/database';
import { MIGRATION_ROLLBACK_WINDOW_MS } from '@retain/shared';
import { logEvent } from '../events.js';
import { sendEmail } from '../notifications.js';
import { setMigrationProgress } from './progress.js';

export async function runMigrationCutover(
  shop: Shop,
  migrationId: string,
  options?: { cancelSourceOnCutover?: boolean },
): Promise<void> {
  const migration = await prisma.migrationJob.findFirst({
    where: { id: migrationId, shopId: shop.id },
  });
  if (!migration) throw new Error('Migration not found');

  if (
    migration.status !== MigrationStatus.validated &&
    migration.status !== MigrationStatus.syncing
  ) {
    throw new Error(`Cannot cutover from status: ${migration.status}`);
  }

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: { status: MigrationStatus.cutover },
  });

  await setMigrationProgress({
    migrationId,
    status: MigrationStatus.cutover,
    total: 100,
    completed: 0,
    failed: 0,
    currentStep: 'Activating billing on Retain',
    percent: 10,
    updatedAt: new Date().toISOString(),
  });

  const records = await prisma.migrationRecord.findMany({
    where: {
      migrationId,
      sourceType: 'contract',
      localContractId: { not: null },
    },
    include: { migration: true },
  });

  for (const record of records) {
    if (!record.localContractId) continue;
    await prisma.subscriptionContract.update({
      where: { id: record.localContractId },
      data: {
        status: ContractStatus.active,
        pricingPolicy: {
          ...(typeof record.payload === 'object' ? record.payload : {}),
          billingActive: true,
          cutoverAt: new Date().toISOString(),
        } as object,
      },
    });
  }

  const template = (migration.communicationTemplate ?? {}) as {
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
  };

  const customerRecords = await prisma.migrationRecord.findMany({
    where: {
      migrationId,
      sourceType: 'customer',
      localCustomerId: { not: null },
    },
  });

  for (const record of customerRecords.slice(0, 50)) {
    const customer = await prisma.customer.findUnique({
      where: { id: record.localCustomerId! },
    });
    if (!customer?.email) continue;

    try {
      await sendEmail({
        to: customer.email,
        subject: template.subject,
        body: template.bodyText,
        shopId: shop.id,
        metadata: { migrationId, type: 'cutover_communication' },
      });
    } catch (error) {
      console.warn('Cutover email failed', customer.email, error);
    }
  }

  const rollbackDeadline = new Date(Date.now() + MIGRATION_ROLLBACK_WINDOW_MS);

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: {
      status: MigrationStatus.completed,
      cutoverAt: new Date(),
      rollbackDeadline,
      completedAt: new Date(),
      settings: {
        ...(migration.settings as object),
        cancelSourceOnCutover: options?.cancelSourceOnCutover ?? false,
      },
      progress: {
        total: records.length,
        completed: records.length,
        failed: 0,
        percent: 100,
        currentStep: 'Cutover complete',
      } as object,
    },
  });

  await logEvent({
    shopId: shop.id,
    eventType: 'migration.cutover',
    payload: {
      migrationId,
      contractsActivated: records.length,
      rollbackDeadline: rollbackDeadline.toISOString(),
    },
    source: EventSource.api,
  });
}

export async function runMigrationRollback(
  shop: Shop,
  migrationId: string,
): Promise<void> {
  const migration = await prisma.migrationJob.findFirst({
    where: { id: migrationId, shopId: shop.id },
  });
  if (!migration) throw new Error('Migration not found');

  if (migration.status !== MigrationStatus.completed) {
    throw new Error('Rollback only available for completed migrations');
  }

  if (migration.rollbackDeadline && migration.rollbackDeadline < new Date()) {
    throw new Error('Rollback window has expired (48h)');
  }

  const records = await prisma.migrationRecord.findMany({
    where: { migrationId, localContractId: { not: null } },
  });

  for (const record of records) {
    if (!record.localContractId) continue;
    await prisma.subscriptionContract.update({
      where: { id: record.localContractId },
      data: {
        status: ContractStatus.cancelled,
        cancelledAt: new Date(),
        pricingPolicy: {
          rolledBack: true,
          rolledBackAt: new Date().toISOString(),
        },
      },
    });
  }

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: { status: MigrationStatus.rolled_back },
  });

  await logEvent({
    shopId: shop.id,
    eventType: 'migration.rollback',
    payload: { migrationId, contractsCancelled: records.length },
    source: EventSource.api,
  });
}
