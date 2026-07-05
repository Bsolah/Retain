import { jest } from '@jest/globals';
import { prisma, ShopStatus } from '@retain/database';
import { buildShop } from '../../../../../../factories/shop.js';
import type { GraphQLContext } from '../../../context.js';
import {
  assertShopAccess,
  requireCustomer,
  requireMerchantContract,
  requireShop,
} from '../../../graphql/auth.js';

const mockShop = buildShop();
const mockCustomer = {
  id: 'cust-1',
  shopId: mockShop.id,
  shopifyCustomerId: 'gid://shopify/Customer/1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: null,
  tags: [],
  totalSpent: null,
  ordersCount: 0,
  acceptsMarketing: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function merchantContext(
  overrides: Partial<GraphQLContext> = {},
): GraphQLContext {
  return {
    prisma: {} as GraphQLContext['prisma'],
    shop: mockShop,
    merchant: { shopId: mockShop.id },
    customer: undefined,
    ...overrides,
  };
}

describe('GraphQL auth guards', () => {
  describe('requireShop', () => {
    it('returns shop when merchant session is valid', () => {
      const shop = requireShop(merchantContext());
      expect(shop.id).toBe(mockShop.id);
    });

    it('throws when no merchant session', () => {
      expect(() =>
        requireShop({ prisma: {} as GraphQLContext['prisma'] }),
      ).toThrow(/Merchant session required/);
    });

    it('throws when shop is not active', () => {
      const inactive = buildShop({ status: ShopStatus.paused });
      expect(() =>
        requireShop(
          merchantContext({
            shop: inactive,
            merchant: { shopId: inactive.id },
          }),
        ),
      ).toThrow(/Shop is not active/);
    });
  });

  describe('assertShopAccess', () => {
    it('allows access to own shop', () => {
      const shop = assertShopAccess(merchantContext(), mockShop.id);
      expect(shop.id).toBe(mockShop.id);
    });

    it('denies access to another shop', () => {
      expect(() =>
        assertShopAccess(merchantContext(), 'other-shop-id'),
      ).toThrow(/Cannot access another shop/);
    });
  });

  describe('requireCustomer', () => {
    it('returns customer when session exists', () => {
      const customer = requireCustomer(
        merchantContext({
          customer: mockCustomer,
          merchant: undefined,
          shop: undefined,
        }),
      );
      expect(customer.email).toBe('test@example.com');
    });

    it('throws when no customer session', () => {
      expect(() => requireCustomer(merchantContext())).toThrow(
        /Customer session required/,
      );
    });
  });

  describe('requireMerchantContract', () => {
    it('returns contract when found for shop', async () => {
      const contract = { id: 'contract-1', shopId: mockShop.id };
      jest
        .spyOn(prisma.subscriptionContract, 'findFirst')
        .mockResolvedValue(contract as never);

      const result = await requireMerchantContract(
        merchantContext(),
        'contract-1',
      );

      expect(result).toEqual(contract);
    });

    it('throws when contract not found', async () => {
      const prisma = {
        subscriptionContract: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      await expect(
        requireMerchantContract(
          merchantContext({ prisma: prisma as GraphQLContext['prisma'] }),
          'missing',
        ),
      ).rejects.toThrow(/Contract not found/);
    });
  });
});
