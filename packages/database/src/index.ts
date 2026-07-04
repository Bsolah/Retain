import { createRequire } from 'node:module';
import type {
  Customer,
  Event,
  Intervention,
  PrismaClient as PrismaClientType,
  Shop,
  SubscriberSignal,
  SubscriptionContract,
  SubscriptionOrder,
  SubscriptionPlan,
} from '@prisma/client';

// @prisma/client is CJS; named ESM imports fail under Node/tsx without generate + interop.
const require = createRequire(import.meta.url);
const prismaClient =
  require('@prisma/client') as typeof import('@prisma/client');

const {
  PrismaClient: PrismaClientConstructor,
  Prisma,
  PlanTier,
  ShopStatus,
  PlanStatus,
  PlanType,
  PricingStrategy,
  ContractStatus,
  HealthStatus,
  OrderStatus,
  InterventionType,
  InterventionStatus,
  InterventionOutcome,
  EventSource,
} = prismaClient;

/** Runtime Prisma client constructor (CJS-safe). */
export const PrismaClient = PrismaClientConstructor;

/** Prisma client instance type for annotations. */
export type PrismaClient = PrismaClientType;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { Prisma };
export type {
  Shop,
  Customer,
  SubscriptionPlan,
  SubscriptionContract,
  SubscriptionOrder,
  SubscriberSignal,
  Intervention,
  Event,
};

export {
  PlanTier,
  ShopStatus,
  PlanStatus,
  PlanType,
  PricingStrategy,
  ContractStatus,
  HealthStatus,
  OrderStatus,
  InterventionType,
  InterventionStatus,
  InterventionOutcome,
  EventSource,
};
