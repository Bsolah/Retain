import { jest } from '@jest/globals';
import { ContractStatus } from '@retain/database';
import { buildShop } from '../../../../../../factories/shop.js';

jest.unstable_mockModule('@retain/database', () => ({
  prisma: {
    subscriptionContract: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    subscriptionOrder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        subscriptionOrder: { create: jest.fn(), upsert: jest.fn() },
        subscriptionContract: { update: jest.fn() },
      }),
    ),
  },
  ContractStatus,
  OrderStatus: { paid: 'paid', pending: 'pending' },
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

jest.unstable_mockModule('../../../services/shopify-client.js', () => ({
  SHOPIFY_API_VERSION: '2026-04',
  shopifyAdminGraphql: jest.fn(),
  getAccessToken: jest.fn(() => 'shpat_billing'),
  ShopifyClientError: class ShopifyClientError extends Error {},
}));

jest.unstable_mockModule('@retain/shopify-admin', () => ({
  computeNextBillingDateFromPolicy: jest.fn(
    (_policy: unknown, from: Date) =>
      new Date(
        (from instanceof Date ? from.getTime() : Date.now()) +
          30 * 24 * 60 * 60 * 1000,
      ),
  ),
  hasBillingInterval: jest.fn(() => true),
  reconcilePendingSubscriptionOrderPayment: jest.fn(async () => false),
  ensureContractPaymentMethod: jest.fn(async () => true),
  addInterval: jest.fn(
    (from: Date) =>
      new Date(
        (from instanceof Date ? from.getTime() : Date.now()) +
          30 * 24 * 60 * 60 * 1000,
      ),
  ),
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) =>
    typeof v === 'string' && v.startsWith('enc:') ? v.slice(4) : v,
  ),
}));

const { encrypt } = await import('../../../lib/encryption.js');
const { prisma } = await import('@retain/database');
const { shopifyAdminGraphql } =
  await import('../../../services/shopify-client.js');
const billingScheduler = await import('../../../services/billing-scheduler.js');

const mockContract = {
  id: 'contract-billing-1',
  shopId: 'shop-1',
  customerId: 'cust-1',
  planId: 'plan-1',
  shopifyContractId: 'gid://shopify/SubscriptionContract/1',
  status: ContractStatus.active,
  billingPolicy: { interval: 'MONTH', intervalCount: 1 },
  deliveryPolicy: { interval: 'MONTH', intervalCount: 1 },
  nextBillingDate: new Date('2026-07-05T00:00:00.000Z'),
  lastBillingDate: null as Date | null,
  lastBillingAttemptId: null as string | null,
  lastOrderId: null as string | null,
  totalCharges: 2,
  createdAt: new Date('2026-06-05T00:00:00.000Z'),
  shop: buildShop({
    shopifyDomain: 'billing-test.myshopify.com',
    accessToken: encrypt('shpat_billing'),
  }),
};

describe('Billing scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    billingScheduler.stopBillingScheduler();
    jest.useRealTimers();
  });

  describe('startBillingScheduler', () => {
    it('starts without throwing and is idempotent', () => {
      jest.mocked(prisma.subscriptionContract.findMany).mockResolvedValue([]);

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
        .mockResolvedValueOnce([]) // reconcileBillingSchedules
        .mockResolvedValueOnce([]) // reconcilePendingBillingAttempts
        .mockResolvedValueOnce([{ id: mockContract.id }]); // due contracts

      jest.mocked(prisma.subscriptionContract.findUnique).mockResolvedValue({
        ...mockContract,
        nextBillingDate: new Date('2026-07-05T00:00:00.000Z'),
      } as never);
      jest
        .mocked(prisma.subscriptionContract.findFirst)
        .mockResolvedValue(null);
      jest.mocked(shopifyAdminGraphql).mockResolvedValue({
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

    it('creates a new billing attempt when last attempt order is already booked', async () => {
      jest.mocked(prisma.subscriptionContract.findUnique).mockResolvedValue({
        ...mockContract,
        totalCharges: 1,
        lastBillingDate: new Date('2026-06-05T12:00:00.000Z'),
        lastBillingAttemptId: 'gid://shopify/SubscriptionBillingAttempt/prior',
        lastOrderId: 'gid://shopify/Order/prior',
      } as never);
      jest
        .mocked(prisma.subscriptionContract.findFirst)
        .mockResolvedValue(null);
      jest
        .mocked(prisma.subscriptionContract.update)
        .mockResolvedValue({} as never);
      jest.mocked(prisma.subscriptionOrder.findFirst).mockResolvedValue({
        id: 'order-1',
        status: 'paid',
        shopifyOrderId: 'gid://shopify/Order/prior',
      } as never);

      jest
        .mocked(shopifyAdminGraphql)
        .mockResolvedValueOnce({
          subscriptionBillingAttempt: {
            id: 'gid://shopify/SubscriptionBillingAttempt/prior',
            ready: true,
            errorMessage: null,
            errorCode: null,
            order: {
              id: 'gid://shopify/Order/prior',
              name: '#1000',
              totalPriceSet: {
                shopMoney: { amount: '29.99', currencyCode: 'USD' },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          subscriptionBillingAttemptCreate: {
            subscriptionBillingAttempt: {
              id: 'gid://shopify/SubscriptionBillingAttempt/new',
              ready: true,
              errorMessage: null,
              errorCode: null,
              order: {
                id: 'gid://shopify/Order/new',
                name: '#1001',
                totalPriceSet: {
                  shopMoney: { amount: '29.99', currencyCode: 'USD' },
                },
              },
            },
            userErrors: [],
          },
        });

      const result = await billingScheduler.attemptBilling(mockContract.id, {
        bypassSchedule: true,
      });

      expect(result).toBe('success');
      expect(shopifyAdminGraphql).toHaveBeenCalledTimes(2);
      expect(jest.mocked(shopifyAdminGraphql).mock.calls[1]?.[1]).toContain(
        'subscriptionBillingAttemptCreate',
      );
    });
  });
});
