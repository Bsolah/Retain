import { MigrationStatus, prisma, type Shop } from '@retain/database';
import type { MigrationPlatformName } from '@retain/shared';
import { encrypt } from '../../lib/encryption.js';
import { getPlatformAdapter } from './platforms/index.js';
import {
  discoverFromShop,
  discoverLocalContracts,
} from './platforms/shopify-native.js';
import type {
  SourceContract,
  SourceCustomer,
  MigrationCredentials,
} from './types.js';
import { buildPreview } from './types.js';

const DEFAULT_COMMUNICATION_TEMPLATE = {
  subject: 'Your subscription is moving to a better experience',
  bodyHtml:
    '<p>Hi {{customer.firstName}},</p><p>Your subscription at {{shop.name}} is being upgraded. You do not need to take any action — your next order will process automatically on {{subscription.nextBillingDate}}.</p>',
  bodyText:
    'Hi {{customer.firstName}},\n\nYour subscription at {{shop.name}} is being upgraded. Your next order will process automatically on {{subscription.nextBillingDate}}.',
};

export async function discoverMigration(input: {
  shop: Shop;
  platform: MigrationPlatformName;
  credentials: MigrationCredentials;
}) {
  let discovery;
  if (input.platform === 'shopify_subscriptions') {
    try {
      discovery = await discoverFromShop(input.shop);
    } catch {
      discovery = await discoverLocalContracts(input.shop.id);
    }
  } else {
    const adapter = getPlatformAdapter(input.platform);
    discovery = await adapter.discover(input.credentials);
  }

  const preview = buildPreview(discovery);
  const encryptedCredentials =
    input.platform === 'shopify_subscriptions'
      ? null
      : encrypt(JSON.stringify(input.credentials));

  const migration = await prisma.migrationJob.create({
    data: {
      shopId: input.shop.id,
      platform: input.platform,
      status: MigrationStatus.discovered,
      encryptedCredentials,
      preview: preview as object,
      communicationTemplate: DEFAULT_COMMUNICATION_TEMPLATE,
      settings: {
        cancelSourceOnCutover: false,
      },
    },
  });

  await prisma.migrationRecord.createMany({
    data: [
      ...discovery.customers.map((customer: SourceCustomer) => ({
        migrationId: migration.id,
        sourceId: customer.sourceId,
        sourceType: 'customer',
        payload: customer as object,
      })),
      ...discovery.contracts.map((contract: SourceContract) => ({
        migrationId: migration.id,
        sourceId: contract.sourceId,
        sourceType: 'contract',
        payload: contract as object,
      })),
    ],
    skipDuplicates: true,
  });

  return { migration, preview };
}

export async function getMigration(shopId: string, migrationId: string) {
  return prisma.migrationJob.findFirst({
    where: { id: migrationId, shopId },
    include: {
      _count: {
        select: {
          records: true,
          errors: true,
        },
      },
    },
  });
}

export async function listMigrations(shopId: string) {
  return prisma.migrationJob.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { records: true, errors: true },
      },
    },
  });
}

export async function updateCommunicationTemplate(
  shopId: string,
  migrationId: string,
  template: { subject: string; bodyHtml: string; bodyText: string },
) {
  return prisma.migrationJob.update({
    where: { id: migrationId, shopId },
    data: { communicationTemplate: template as object },
  });
}
