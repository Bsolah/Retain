import type { Customer, Shop } from '@retain/database';
import { prisma } from '@retain/database';
import type { GraphQLContext } from '../context.js';
import {
  forbiddenError,
  notFoundError,
  unauthenticatedError,
} from '../lib/graphql-errors.js';

export function requireShop(context: GraphQLContext): Shop {
  if (!context.shop || !context.merchant) {
    throw unauthenticatedError(
      'Merchant session required. Pass Authorization: Bearer <session-token>.',
    );
  }

  if (context.shop.status !== 'active') {
    throw forbiddenError('Shop is not active');
  }

  return context.shop;
}

export function assertShopAccess(
  context: GraphQLContext,
  shopId: string,
): Shop {
  const shop = requireShop(context);
  if (shop.id !== shopId) {
    throw forbiddenError('Cannot access another shop');
  }
  return shop;
}

export function requireCustomer(context: GraphQLContext): Customer {
  if (!context.customer) {
    throw unauthenticatedError(
      'Customer session required. Pass X-Customer-Token.',
    );
  }
  return context.customer;
}

export async function requireMerchantContract(
  context: GraphQLContext,
  contractId: string,
) {
  const shop = requireShop(context);
  const contract = await prisma.subscriptionContract.findFirst({
    where: { id: contractId, shopId: shop.id },
  });
  if (!contract) {
    throw notFoundError('Contract not found');
  }
  return contract;
}

export async function requireCustomerContract(
  context: GraphQLContext,
  contractId: string,
) {
  const customer = requireCustomer(context);
  const contract = await prisma.subscriptionContract.findFirst({
    where: { id: contractId, customerId: customer.id },
  });
  if (!contract) {
    throw notFoundError('Contract not found');
  }
  return contract;
}
