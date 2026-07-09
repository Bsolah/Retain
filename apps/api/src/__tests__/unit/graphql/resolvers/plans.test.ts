import { jest } from '@jest/globals';
import { PlanStatus } from '@retain/database';
import { buildShop } from '../../../../../../factories/shop.js';
import { planQueries } from '../../../../graphql/resolvers/plans.js';
import { mapPlanToGql } from '../../../../graphql/plan-mapper.js';

const shop = buildShop();

const mockPlan = {
  id: 'plan-1',
  shopId: shop.id,
  name: 'Monthly Box',
  description: 'Test plan',
  planType: 'standard',
  status: PlanStatus.active,
  frequencies: [{ interval: 1, unit: 'month', discountPercent: 10 }],
  productIds: [],
  collectionIds: [],
  contracts: [{ status: 'active', totalRevenue: { toNumber: () => 100 } }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Plan GraphQL resolvers', () => {
  const prisma = {
    subscriptionPlan: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const context = {
    prisma: prisma as never,
    shop,
    merchant: { shopId: shop.id },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('planQueries.plans', () => {
    it('returns mapped plans for authorized shop', async () => {
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      const result = await planQueries.plans(
        null,
        { shopId: shop.id },
        context,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Monthly Box');
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: shop.id },
        }),
      );
    });

    it('filters by status when provided', async () => {
      prisma.subscriptionPlan.findMany.mockResolvedValue([]);

      await planQueries.plans(
        null,
        { shopId: shop.id, status: 'paused' },
        context,
      );

      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: shop.id, status: 'paused' },
        }),
      );
    });

    it('denies access to another shop', async () => {
      await expect(
        planQueries.plans(null, { shopId: 'other-shop' }, context),
      ).rejects.toThrow(/Cannot access another shop/);
    });
  });

  describe('planQueries.plan', () => {
    it('returns single plan by id', async () => {
      prisma.subscriptionPlan.findFirst.mockResolvedValue(mockPlan);

      const result = await planQueries.plan(null, { id: mockPlan.id }, context);

      expect(result?.id).toBe(mockPlan.id);
    });

    it('returns null when plan not found', async () => {
      prisma.subscriptionPlan.findFirst.mockResolvedValue(null);

      const result = await planQueries.plan(null, { id: 'missing' }, context);

      expect(result).toBeNull();
    });
  });

  describe('mapPlanToGql', () => {
    it('maps subscriber counts from contracts', () => {
      const gql = mapPlanToGql(mockPlan as never);
      expect(gql.name).toBe('Monthly Box');
      expect(gql.subscriberCount).toBeGreaterThanOrEqual(0);
    });

    it('sums subscription line item value for active contracts', () => {
      const gql = mapPlanToGql({
        ...mockPlan,
        contracts: [
          {
            status: 'active',
            totalRevenue: 0,
            lineItems: [{ quantity: 1, unitPrice: 854.96 }],
          },
          {
            status: 'active',
            totalRevenue: 0,
            lineItems: [{ quantity: 2, unitPrice: 50 }],
          },
          {
            status: 'cancelled',
            totalRevenue: 500,
            lineItems: [{ quantity: 1, unitPrice: 100 }],
          },
        ],
      } as never);

      expect(gql.revenue).toBeCloseTo(954.96);
      expect(gql.subscriberCount).toBe(2);
    });
  });
});
