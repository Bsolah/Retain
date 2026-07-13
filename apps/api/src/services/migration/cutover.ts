import {
  ContractStatus,
  EventSource,
  MigrationRecordStatus,
  MigrationStatus,
  prisma,
  type Shop,
} from '@retain/database';
import { MIGRATION_ROLLBACK_WINDOW_MS } from '@retain/shared';
import { decrypt } from '../../lib/encryption.js';
import { shopifyAdminGraphql } from '../shopify-client.js';
import { logEvent } from '../events.js';
import { sendEmail } from '../notifications.js';
import { getPlatformAdapter } from './platforms/index.js';
import { setMigrationProgress, calculatePercent } from './progress.js';
import type { MigrationCredentials, SourceContract } from './types.js';

const CUSTOMER_ADDRESS_QUERY = `#graphql
  query MigrationCustomerAddress($id: ID!) {
    customer(id: $id) {
      id
      defaultAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
        company
      }
    }
  }
`;

const SELLING_PLAN_GROUP_QUERY = `#graphql
  query MigrationSellingPlanGroup($id: ID!) {
    sellingPlanGroup(id: $id) {
      id
      sellingPlans(first: 25) {
        edges {
          node {
            id
            billingPolicy {
              ... on SellingPlanRecurringBillingPolicy {
                interval
                intervalCount
              }
            }
            deliveryPolicy {
              ... on SellingPlanRecurringDeliveryPolicy {
                interval
                intervalCount
              }
            }
          }
        }
      }
    }
  }
`;

const ATOMIC_CREATE_MUTATION = `#graphql
  mutation MigrationContractCreate($input: SubscriptionContractAtomicCreateInput!) {
    subscriptionContractAtomicCreate(input: $input) {
      contract {
        id
        status
        nextBillingDate
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INTERVAL_MAP: Record<string, string> = {
  day: 'DAY',
  days: 'DAY',
  week: 'WEEK',
  weeks: 'WEEK',
  month: 'MONTH',
  months: 'MONTH',
  year: 'YEAR',
  years: 'YEAR',
};

type MailingAddress = {
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
  company?: string | null;
};

function toShopifyInterval(value?: string | null): string {
  if (!value) return 'MONTH';
  return INTERVAL_MAP[value.toLowerCase()] ?? value.toUpperCase();
}

async function resolvePlanAndSellingPlan(
  shop: Shop,
  contract: SourceContract,
): Promise<{
  planId: string;
  sellingPlanId: string;
  billingPolicy: { interval: string; intervalCount: number };
  deliveryPolicy: { interval: string; intervalCount: number };
}> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { shopId: shop.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (!plan?.shopifySellingPlanGroupId) {
    throw new Error(
      'No active Retain plan synced to Shopify. Create a subscription plan before cutover.',
    );
  }

  const data = await shopifyAdminGraphql<{
    sellingPlanGroup: {
      sellingPlans: {
        edges: Array<{
          node: {
            id: string;
            billingPolicy: {
              interval: string;
              intervalCount: number;
            } | null;
            deliveryPolicy: {
              interval: string;
              intervalCount: number;
            } | null;
          };
        }>;
      };
    } | null;
  }>(shop, SELLING_PLAN_GROUP_QUERY, { id: plan.shopifySellingPlanGroupId });

  const plans = data.sellingPlanGroup?.sellingPlans.edges ?? [];
  if (plans.length === 0) {
    throw new Error('Shopify selling plan group has no selling plans');
  }

  const targetInterval = toShopifyInterval(contract.billingInterval);
  const targetCount = contract.billingIntervalCount ?? 1;
  const match =
    plans.find((edge) => {
      const billing = edge.node.billingPolicy;
      return (
        billing?.interval === targetInterval &&
        billing.intervalCount === targetCount
      );
    }) ?? plans[0];

  if (!match) {
    throw new Error('Shopify selling plan group has no selling plans');
  }

  const billing = match.node.billingPolicy;
  const delivery = match.node.deliveryPolicy;

  return {
    planId: plan.id,
    sellingPlanId: match.node.id,
    billingPolicy: billing
      ? { interval: billing.interval, intervalCount: billing.intervalCount }
      : { interval: targetInterval, intervalCount: targetCount },
    deliveryPolicy: delivery
      ? { interval: delivery.interval, intervalCount: delivery.intervalCount }
      : { interval: targetInterval, intervalCount: targetCount },
  };
}

async function resolveCustomerAddress(
  shop: Shop,
  shopifyCustomerId: string,
  contract: SourceContract,
): Promise<MailingAddress> {
  const fromPayload = contract.address as MailingAddress | undefined;
  if (fromPayload?.address1 && fromPayload.city && fromPayload.country) {
    return fromPayload;
  }

  const data = await shopifyAdminGraphql<{
    customer: { defaultAddress: MailingAddress | null } | null;
  }>(shop, CUSTOMER_ADDRESS_QUERY, { id: shopifyCustomerId });

  const address = data.customer?.defaultAddress;
  if (address?.address1 && address.city && address.country) {
    return address;
  }

  throw new Error(
    `Customer ${shopifyCustomerId} needs a shipping address before cutover`,
  );
}

function normalizeVariantId(variantId: string): string {
  if (variantId.startsWith('gid://')) return variantId;
  return `gid://shopify/ProductVariant/${variantId}`;
}

async function activateShopifyNativeContract(localContractId: string) {
  await prisma.subscriptionContract.update({
    where: { id: localContractId },
    data: {
      status: ContractStatus.active,
      pricingPolicy: {
        billingActive: true,
        cutoverAt: new Date().toISOString(),
        platform: 'shopify_subscriptions',
      },
    },
  });
}

async function createRetainShopifyContract(
  shop: Shop,
  localContractId: string,
  shopifyCustomerId: string,
  contract: SourceContract,
): Promise<string> {
  if (!contract.variantId) {
    throw new Error(
      `Source contract ${contract.sourceId} is missing a product variant id`,
    );
  }

  const { planId, sellingPlanId, billingPolicy, deliveryPolicy } =
    await resolvePlanAndSellingPlan(shop, contract);
  const address = await resolveCustomerAddress(
    shop,
    shopifyCustomerId,
    contract,
  );

  const nextBillingDate = contract.nextBillingDate
    ? new Date(contract.nextBillingDate)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const createResult = await shopifyAdminGraphql<{
    subscriptionContractAtomicCreate: {
      contract: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, ATOMIC_CREATE_MUTATION, {
    input: {
      customerId: shopifyCustomerId,
      currencyCode: (contract.currency ?? 'USD').toUpperCase(),
      nextBillingDate: nextBillingDate.toISOString(),
      contract: {
        status: 'ACTIVE',
        billingPolicy,
        deliveryPolicy,
        deliveryPrice: 0,
        deliveryMethod: {
          shipping: {
            address: {
              firstName: address.firstName ?? undefined,
              lastName: address.lastName ?? undefined,
              address1: address.address1,
              address2: address.address2 ?? undefined,
              city: address.city,
              province: address.province ?? undefined,
              country: address.country,
              zip: address.zip ?? undefined,
              phone: address.phone ?? undefined,
              company: address.company ?? undefined,
            },
          },
        },
      },
      lines: [
        {
          line: {
            productVariantId: normalizeVariantId(contract.variantId),
            quantity: contract.quantity ?? 1,
            currentPrice: Number(contract.price ?? 0),
            sellingPlanId,
          },
        },
      ],
    },
  });

  if (createResult.subscriptionContractAtomicCreate.userErrors.length > 0) {
    throw new Error(
      createResult.subscriptionContractAtomicCreate.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }

  const shopifyContractId =
    createResult.subscriptionContractAtomicCreate.contract?.id;
  if (!shopifyContractId) {
    throw new Error('Shopify did not return a subscription contract id');
  }

  await prisma.subscriptionContract.update({
    where: { id: localContractId },
    data: {
      planId,
      shopifyContractId,
      status: ContractStatus.active,
      billingPolicy,
      deliveryPolicy,
      nextBillingDate,
      pricingPolicy: {
        billingActive: true,
        migrated: true,
        sourceId: contract.sourceId,
        cutoverAt: new Date().toISOString(),
      },
      lineItems: [
        {
          variantId: normalizeVariantId(contract.variantId),
          quantity: contract.quantity ?? 1,
          unitPrice: Number(contract.price ?? 0),
          sellingPlanId,
        },
      ],
    },
  });

  return shopifyContractId;
}

function readCredentials(encrypted: string | null): MigrationCredentials {
  if (!encrypted) return {};
  try {
    return JSON.parse(decrypt(encrypted)) as MigrationCredentials;
  } catch {
    return {};
  }
}

export async function runMigrationCutover(
  shop: Shop,
  migrationId: string,
  options?: { cancelSourceOnCutover?: boolean },
): Promise<void> {
  const migration = await prisma.migrationJob.findFirst({
    where: { id: migrationId, shopId: shop.id },
  });
  if (!migration) throw new Error('Migration not found');

  if (migration.status !== MigrationStatus.validated) {
    throw new Error(
      `Cannot cutover from status: ${migration.status}. Validate the migration first.`,
    );
  }

  const report = migration.validationReport as { passed?: boolean } | null;
  if (!report?.passed) {
    throw new Error('Cannot cutover until validation passes');
  }

  const settings = (migration.settings ?? {}) as {
    cancelSourceOnCutover?: boolean;
  };
  const cancelSource =
    options?.cancelSourceOnCutover ?? settings.cancelSourceOnCutover ?? false;

  await prisma.migrationJob.update({
    where: { id: migrationId },
    data: {
      status: MigrationStatus.cutover,
      settings: {
        ...settings,
        cancelSourceOnCutover: cancelSource,
      },
    },
  });

  const records = await prisma.migrationRecord.findMany({
    where: {
      migrationId,
      sourceType: 'contract',
      status: MigrationRecordStatus.synced,
      localContractId: { not: null },
    },
  });

  await setMigrationProgress({
    migrationId,
    status: MigrationStatus.cutover,
    total: records.length,
    completed: 0,
    failed: 0,
    currentStep: 'Creating subscriptions on Retain / Shopify',
    percent: 0,
    updatedAt: new Date().toISOString(),
  });

  const credentials = readCredentials(migration.encryptedCredentials);
  const adapter =
    migration.platform === 'shopify_subscriptions'
      ? null
      : getPlatformAdapter(
          migration.platform as Parameters<typeof getPlatformAdapter>[0],
        );

  let completed = 0;
  let failed = 0;

  for (const record of records) {
    if (!record.localContractId) continue;
    const contract = record.payload as unknown as SourceContract;

    try {
      let shopifyContractId = record.shopifyContractId;

      if (migration.platform === 'shopify_subscriptions') {
        await activateShopifyNativeContract(record.localContractId);
      } else {
        const shopifyCustomerId = record.shopifyCustomerId;
        if (!shopifyCustomerId || shopifyCustomerId.includes('/migrated-')) {
          throw new Error(
            'Customer was not synced to a real Shopify customer id',
          );
        }

        shopifyContractId = await createRetainShopifyContract(
          shop,
          record.localContractId,
          shopifyCustomerId,
          contract,
        );
      }

      if (cancelSource && adapter?.cancelSubscription) {
        await adapter.cancelSubscription(credentials, contract.sourceId);
      }

      await prisma.migrationRecord.update({
        where: { id: record.id },
        data: {
          shopifyContractId,
          errorMessage: null,
        },
      });

      completed += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : 'Cutover failed for contract';
      await prisma.migrationError.create({
        data: {
          migrationId,
          recordId: record.id,
          code: 'CUTOVER_FAILED',
          message,
          requiresManualAction: true,
          details: {},
        },
      });
      await prisma.migrationRecord.update({
        where: { id: record.id },
        data: { errorMessage: message },
      });
    }

    await setMigrationProgress({
      migrationId,
      status: MigrationStatus.cutover,
      total: records.length,
      completed,
      failed,
      currentStep: 'Cutting over subscriptions',
      percent: calculatePercent(completed + failed, records.length),
      updatedAt: new Date().toISOString(),
    });
  }

  if (completed === 0 && records.length > 0) {
    await prisma.migrationJob.update({
      where: { id: migrationId },
      data: {
        status: MigrationStatus.failed,
        errorSummary: { failed, requiresReview: true } as object,
      },
    });
    throw new Error('Cutover failed for all contracts');
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
      progress: {
        total: records.length,
        completed,
        failed,
        percent: 100,
        currentStep:
          failed > 0
            ? `Cutover complete with ${failed} failures`
            : 'Cutover complete',
      } as object,
      errorSummary:
        failed > 0 ? ({ failed, requiresReview: true } as object) : undefined,
    },
  });

  await logEvent({
    shopId: shop.id,
    eventType: 'migration.cutover',
    payload: {
      migrationId,
      contractsActivated: completed,
      contractsFailed: failed,
      cancelSource,
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
