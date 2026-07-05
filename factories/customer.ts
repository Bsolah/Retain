import { randomUUID } from 'node:crypto';
import type { Customer, Prisma } from '@retain/database';

export type CustomerFactoryOverrides = Partial<
  Omit<Prisma.CustomerCreateInput, 'shop'> & {
    shopId?: string;
    id?: string;
  }
>;

let customerCounter = 0;

export function buildCustomer(
  shopId: string,
  overrides: CustomerFactoryOverrides = {},
): Customer {
  customerCounter += 1;
  const id = overrides.id ?? randomUUID();
  const now = new Date();
  const firstName = overrides.firstName ?? `Test${customerCounter}`;
  const lastName = overrides.lastName ?? 'Customer';

  return {
    id,
    shopId: overrides.shopId ?? shopId,
    shopifyCustomerId:
      overrides.shopifyCustomerId ??
      `gid://shopify/Customer/${200000 + customerCounter}`,
    email: overrides.email ?? `customer${customerCounter}@test.example`,
    firstName,
    lastName,
    phone: overrides.phone ?? '+15550001234',
    tags: (overrides.tags as Customer['tags']) ?? [],
    totalSpent: overrides.totalSpent ?? null,
    ordersCount: overrides.ordersCount ?? 0,
    acceptsMarketing: overrides.acceptsMarketing ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  } as Customer;
}

export function buildCustomerCreateInput(
  shopId: string,
  overrides: CustomerFactoryOverrides = {},
): Prisma.CustomerCreateInput {
  const customer = buildCustomer(shopId, overrides);
  return {
    id: customer.id,
    shop: { connect: { id: shopId } },
    shopifyCustomerId: customer.shopifyCustomerId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    tags: customer.tags as Prisma.InputJsonValue,
    acceptsMarketing: customer.acceptsMarketing,
  };
}

export function resetCustomerFactoryCounter(): void {
  customerCounter = 0;
}
