import { jest } from '@jest/globals';
import nock from 'nock';
import { ContractStatus } from '@retain/database';
import { buildShop } from '../../../../../../factories/shop.js';
import { encrypt } from '../../../lib/encryption.js';
import { SHOPIFY_API_VERSION } from '../../../services/shopify-client.js';

const mockContract = {
  id: 'contract-billing-1',
  shopId: 'shop-1',
  customerId: 'cust-1',
  planId: 'plan-1',
  shopifyContractId: 'gid://shopify/SubscriptionContract/1',
  status: ContractStatus.active,
  billingPolicy: { interval: 'MONTH', intervalCount: 1 },
  deliveryPolicy: { interval: 'MONTH', intervalCount: 1 },
  nextBillingDate: new Date(),
  lastBillingDate: null,
  lastBillingAttemptId: null,
  totalCharges: 2,
  shop: buildShop({
    shopifyDomain: 'billing-test.myshopify.com',
    accessToken: encrypt('shpat_billing'),
  }),
};

jest.unstable_mockModule('@retain/database', () => ({
  prisma: {
    subscriptionContract: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    subscriptionOrder: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        subscriptionOrder: { create: jest.fn() },
        subscriptionContract: { update: jest.fn() },
      }),
    ),
  },
  ContractStatus,
  OrderStatus: { paid: 'paid' },
  EventSource: { system: 'system' },
  Prisma: { Decimal: class {} },
}));

jest.unstable_mockModule('../../../services/events.js', () => ({
  logEvent: jest.fn(),
}));

jest.unstable_mockModule('../../../services/dunning.js', () => ({
  triggerDunningWorkflow: jest.fn(),
  recordDunningRecovery: jest.fn(),
}));

const { prisma } = await import('@retain/database');
const billingScheduler = await import('../../../services/billing-scheduler.js');

describe('Billing scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    nock.cleanAll();
    jest.clearAllMocks();
  });

  afterEach(() => {
    billingScheduler.stopBillingScheduler();
    jest.useRealTimers();
  });

  describe('startBillingScheduler', () => {
    it('starts without throwing and is idempotent', () => {
      expect(() => {
        billingScheduler.startBillingScheduler();
        billingScheduler.startBillingScheduler();
      }).not.toThrow();
      billingScheduler.stopBillingScheduler();
    });
  });

  describe('processDueBillings', () => {
    it('processes contracts due today', async () => {
      jest
        .mocked(prisma.subscriptionContract.findMany)
        .mockResolvedValue([{ id: mockContract.id }]);
      jest
        .mocked(prisma.subscriptionContract.findUnique)
        .mockResolvedValue(mockContract as never);
      jest
        .mocked(prisma.subscriptionContract.findFirst)
        .mockResolvedValue(null);

      nock(`https://${mockContract.shop.shopifyDomain}`)
        .post(`/admin/api/${SHOPIFY_API_VERSION}/graphql.json`)
        .reply(200, {
          data: {
            subscriptionBillingAttemptCreate: {
              subscriptionBillingAttempt: {
                id: 'gid://shopify/SubscriptionBillingAttempt/1',
                ready: true,
                errorMessage: null,
                errorCode: null,
                order: {
                  id: 'gid://shopify/Order/1',
                  name: '#1001',
                  totalPriceSet: {
                    shopMoney: { amount: '29.99', currencyCode: 'USD' },
                  },
                },
              },
              userErrors: [],
            },
          },
        });

      const result = await billingScheduler.processDueBillings(
        new Date('2026-07-05T12:00:00.000Z'),
      );

      expect(result.processed).toBe(1);
      expect(result.succeeded + result.failed).toBeLessThanOrEqual(1);
    });

    it('returns zero counts when no contracts are due', async () => {
      jest.mocked(prisma.subscriptionContract.findMany).mockResolvedValue([]);

      const result = await billingScheduler.processDueBillings();

      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });
  });

  describe('attemptBilling', () => {
    it('skips non-active contracts', async () => {
      jest.mocked(prisma.subscriptionContract.findUnique).mockResolvedValue({
        ...mockContract,
        status: ContractStatus.cancelled,
      } as never);

      const result = await billingScheduler.attemptBilling(mockContract.id, {
        bypassSchedule: true,
      });

      expect(result).toBe('skipped');
    });
  });
});
