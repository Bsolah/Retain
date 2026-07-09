import { createRequire } from 'node:module';
import type {
  Customer,
  EmailTemplate,
  Event,
  Intervention,
  MigrationError,
  MigrationJob,
  MigrationRecord,
  NotificationLog,
  PlanStatus as PlanStatusType,
  PlanType as PlanTypeType,
  PrismaClient as PrismaClientType,
  Shop,
  SubscriberSignal,
  SubscriptionContract,
  SubscriptionOrder,
  SubscriptionPlan,
  ContractStatus as ContractStatusType,
  HealthStatus as HealthStatusType,
  OrderStatus as OrderStatusType,
  InterventionType as InterventionTypeType,
  InterventionStatus as InterventionStatusType,
  InterventionOutcome as InterventionOutcomeType,
  EventSource as EventSourceType,
  PlanTier as PlanTierType,
  ShopStatus as ShopStatusType,
} from '@prisma/client';

// @prisma/client is CJS; named ESM imports fail under Node/tsx without generate + interop.
const require = createRequire(import.meta.url);
const prismaClient =
  require('@prisma/client') as typeof import('@prisma/client');

export const PrismaClient = prismaClient.PrismaClient;
export type PrismaClient = PrismaClientType;

export const Prisma = prismaClient.Prisma;

export const PlanTier = prismaClient.PlanTier;
export type PlanTier = PlanTierType;

export const ShopStatus = prismaClient.ShopStatus;
export type ShopStatus = ShopStatusType;

export const PlanStatus = prismaClient.PlanStatus;
export type PlanStatus = PlanStatusType;

export const PlanType = prismaClient.PlanType;
export type PlanType = PlanTypeType;

export const ContractStatus = prismaClient.ContractStatus;
export type ContractStatus = ContractStatusType;

export const HealthStatus = prismaClient.HealthStatus;
export type HealthStatus = HealthStatusType;

export const OrderStatus = prismaClient.OrderStatus;
export type OrderStatus = OrderStatusType;

export const InterventionType = prismaClient.InterventionType;
export type InterventionType = InterventionTypeType;

export const InterventionStatus = prismaClient.InterventionStatus;
export type InterventionStatus = InterventionStatusType;

export const InterventionOutcome = prismaClient.InterventionOutcome;
export type InterventionOutcome = InterventionOutcomeType;

export const EventSource = prismaClient.EventSource;
export type EventSource = EventSourceType;

export const NotificationChannel = prismaClient.NotificationChannel;
export type NotificationChannel = import('@prisma/client').NotificationChannel;

export const NotificationStatus = prismaClient.NotificationStatus;
export type NotificationStatus = import('@prisma/client').NotificationStatus;

export const MigrationPlatform = prismaClient.MigrationPlatform;
export type MigrationPlatform = import('@prisma/client').MigrationPlatform;

export const MigrationStatus = prismaClient.MigrationStatus;
export type MigrationStatus = import('@prisma/client').MigrationStatus;

export const MigrationRecordStatus = prismaClient.MigrationRecordStatus;
export type MigrationRecordStatus =
  import('@prisma/client').MigrationRecordStatus;

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

export type {
  Shop,
  Customer,
  SubscriptionPlan,
  SubscriptionContract,
  SubscriptionOrder,
  SubscriberSignal,
  Intervention,
  Event,
  EmailTemplate,
  NotificationLog,
  MigrationJob,
  MigrationRecord,
  MigrationError,
};
