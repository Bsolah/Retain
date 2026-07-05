import {
  ContractStatus,
  EventSource,
  MigrationRecordStatus,
  MigrationStatus,
  prisma,
  type Shop,
} from '@retain/database';
import { shopifyAdminGraphql } from '../shopify-client.js';
import { logEvent } from '../events.js';
import { setMigrationProgress, calculatePercent } from './progress.js';
import type { SourceContract, SourceCustomer } from './types.js';

const CUSTOMER_CREATE_MUTATION = `#graphql
  mutation MigrationCustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id email }
      userErrors { field message }
    }
  }
`;

async function ensureShopifyCustomer(
  shop: Shop,
  customer: SourceCustomer,
): Promise<string> {
  const existing = await prisma.customer.findFirst({
    where: { shopId: shop.id, email: customer.email },
  });
  if (existing) return existing.shopifyCustomerId;

  try {
    const result = await shopifyAdminGraphql<{
      customerCreate: {
        customer: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(shop, CUSTOMER_CREATE_MUTATION, {
      input: {
        email: customer.email,
        firstName: customer.firstName ?? undefined,
        lastName: customer.lastName ?? undefined,
        phone: customer.phone ?? undefined,
      },
    });

    if (result.customerCreate.userErrors.length > 0) {
      throw new Error(
        result.customerCreate.userErrors.map((e) => e.message).join('; '),
      );
    }

    const gid = result.customerCreate.customer?.id;
    if (!gid) throw new Error('Customer create returned no id');

    await prisma.customer.upsert({
      where: {
        shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: gid },
      },
      create: {
        shopId: shop.id,
        shopifyCustomerId: gid,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
      update: {
        firstName: customer.firstName ?? undefined,
        lastName: customer.lastName ?? undefined,
        phone: customer.phone ?? undefined,
      },
    });

    return gid;
  } catch (error) {
    const fallbackGid = `gid://shopify/Customer/migrated-${customer.sourceId}`;
    await prisma.customer.upsert({
      where: {
        shopId_shopifyCustomerId: {
          shopId: shop.id,
          shopifyCustomerId: fallbackGid,
        },
      },
      create: {
        shopId: shop.id,
        shopifyCustomerId: fallbackGid,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
      update: {},
    });
    return fallbackGid;
  }
}

async function syncContractRecord(
  shop: Shop,
  migrationId: string,
  recordId: string,
  contract: SourceContract,
  customerGidMap: Map<string, string>,
) {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { shopId: shop.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (!plan) throw new Error('No active subscription plan for shop');

  const shopifyCustomerId =
    customerGidMap.get(contract.sourceCustomerId) ??
    `gid://shopify/Customer/migrated-${contract.sourceCustomerId}`;

  const localCustomer = await prisma.customer.findUnique({
    where: {
      shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId },
    },
  });
  if (!localCustomer) throw new Error('Local customer not found for contract');

  const shopifyContractId = `gid://shopify/SubscriptionContract/migrated-${contract.sourceId}`;

  const localContract = await prisma.subscriptionContract.upsert({
    where: {
      shopId_shopifyContractId: { shopId: shop.id, shopifyContractId },
    },
    create: {
      shopId: shop.id,
      customerId: localCustomer.id,
      planId: plan.id,
      shopifyContractId,
      status: mapStatus(contract.status),
      billingPolicy: {
        interval: contract.billingInterval ?? 'month',
        intervalCount: contract.billingIntervalCount ?? 1,
      },
      deliveryPolicy: {},
      pricingPolicy: { migrated: true, sourceId: contract.sourceId },
      nextBillingDate: contract.nextBillingDate
        ? new Date(contract.nextBillingDate)
        : null,
      totalRevenue: contract.totalRevenue ?? contract.price ?? 0,
      lineItems: contract.variantId
        ? [{ variantId: contract.variantId, quantity: contract.quantity ?? 1 }]
        : [],
    },
    update: {
      status: mapStatus(contract.status),
      nextBillingDate: contract.nextBillingDate
        ? new Date(contract.nextBillingDate)
        : null,
      pricingPolicy: { migrated: true, sourceId: contract.sourceId },
    },
  });

  await prisma.migrationRecord.update({
    where: { id: recordId },
    data: {
      status: MigrationRecordStatus.synced,
      shopifyContractId,
      shopifyCustomerId,
      localContractId: localContract.id,
      localCustomerId: localCustomer.id,
      syncedAt: new Date(),
      errorMessage: null,
    },
  });
}

function mapStatus(status: string): ContractStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes('cancel')) return ContractStatus.cancelled;
  if (normalized.includes('pause')) return ContractStatus.paused;
  if (normalized.includes('fail')) return ContractStatus.payment_failed;
  return ContractStatus.active;
}

export async function runMigrationSync(
  shop: Shop,
  migrationId: string,
): Promise<void> {
  const migration = await prisma.migrationJob.findFirst({
    where: { id: migrationId, shopId: shop.id },
  });
  if (!migration) throw new Error('Migration not found');

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: { status: MigrationStatus.syncing },
  });

  const records = await prisma.migrationRecord.findMany({
    where: { migrationId, status: MigrationRecordStatus.pending },
    orderBy: { sourceType: 'asc' },
  });

  const total = records.length;
  let completed = 0;
  let failed = 0;
  const customerGidMap = new Map<string, string>();

  await setMigrationProgress({
    migrationId,
    status: MigrationStatus.syncing,
    total,
    completed,
    failed,
    currentStep: 'Syncing customers and contracts',
    percent: 0,
    updatedAt: new Date().toISOString(),
  });

  const customerRecords = records.filter((r) => r.sourceType === 'customer');
  for (const record of customerRecords) {
    try {
      const customer = record.payload as unknown as SourceCustomer;
      const gid = await ensureShopifyCustomer(shop, customer);
      customerGidMap.set(customer.sourceId, gid);
      await prisma.migrationRecord.update({
        where: { id: record.id },
        data: {
          status: MigrationRecordStatus.synced,
          shopifyCustomerId: gid,
          localCustomerId: (
            await prisma.customer.findUnique({
              where: {
                shopId_shopifyCustomerId: {
                  shopId: shop.id,
                  shopifyCustomerId: gid,
                },
              },
            })
          )?.id,
          syncedAt: new Date(),
        },
      });
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'Sync failed';
      await logMigrationError(
        migrationId,
        record.id,
        'CUSTOMER_SYNC_FAILED',
        message,
      );
      await prisma.migrationRecord.update({
        where: { id: record.id },
        data: { status: MigrationRecordStatus.failed, errorMessage: message },
      });
    }

    await setMigrationProgress({
      migrationId,
      status: MigrationStatus.syncing,
      total,
      completed,
      failed,
      currentStep: 'Syncing customers',
      percent: calculatePercent(completed + failed, total),
      updatedAt: new Date().toISOString(),
    });
  }

  const contractRecords = records.filter((r) => r.sourceType === 'contract');
  for (const record of contractRecords) {
    try {
      const contract = record.payload as unknown as SourceContract;
      await syncContractRecord(
        shop,
        migrationId,
        record.id,
        contract,
        customerGidMap,
      );
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'Sync failed';
      await logMigrationError(
        migrationId,
        record.id,
        'CONTRACT_SYNC_FAILED',
        message,
        true,
      );
      await prisma.migrationRecord.update({
        where: { id: record.id },
        data: {
          status: MigrationRecordStatus.failed,
          errorMessage: message,
          retryCount: { increment: 1 },
        },
      });
    }

    await setMigrationProgress({
      migrationId,
      status: MigrationStatus.syncing,
      total,
      completed,
      failed,
      currentStep: 'Syncing contracts',
      percent: calculatePercent(completed + failed, total),
      updatedAt: new Date().toISOString(),
    });
  }

  const nextStatus =
    failed > 0 && completed === 0
      ? MigrationStatus.failed
      : MigrationStatus.validated;

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: {
      status: nextStatus,
      progress: {
        total,
        completed,
        failed,
        percent: calculatePercent(completed, total),
      } as object,
      errorSummary:
        failed > 0 ? ({ failed, requiresReview: true } as object) : undefined,
    },
  });

  await logEvent({
    shopId: shop.id,
    eventType: 'migration.synced',
    payload: { migrationId, completed, failed },
    source: EventSource.api,
  });
}

export async function retryMigrationRecord(
  shop: Shop,
  migrationId: string,
  recordId: string,
): Promise<void> {
  const record = await prisma.migrationRecord.findFirst({
    where: { id: recordId, migrationId, migration: { shopId: shop.id } },
  });
  if (!record || record.status !== MigrationRecordStatus.failed) {
    throw new Error('Record not found or not in failed state');
  }

  await prisma.migrationRecord.update({
    where: { id: recordId },
    data: { status: MigrationRecordStatus.pending, errorMessage: null },
  });

  await runMigrationSync(shop, migrationId);
}

async function logMigrationError(
  migrationId: string,
  recordId: string,
  code: string,
  message: string,
  requiresManualAction = false,
) {
  await prisma.migrationError.create({
    data: {
      migrationId,
      recordId,
      code,
      message,
      requiresManualAction,
      details: {},
    },
  });
}
