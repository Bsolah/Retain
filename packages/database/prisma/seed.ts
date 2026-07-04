import {
  ContractStatus,
  HealthStatus,
  PlanStatus,
  PlanTier,
  PlanType,
  PricingStrategy,
  PrismaClient,
  ShopStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const FIRST_NAMES = [
  'Ava',
  'Noah',
  'Mia',
  'Liam',
  'Zoe',
  'Ethan',
  'Chloe',
  'Owen',
  'Ruby',
  'Leo',
];

const LAST_NAMES = [
  'Chen',
  'Patel',
  'Garcia',
  'Nguyen',
  'Brooks',
  'Kim',
  'Rivera',
  'Walsh',
  'Singh',
  'Murphy',
];

const CANCELLATION_REASONS = [
  'too_expensive',
  'product_quality',
  'moving',
  'no_longer_needed',
  'competitor',
];

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

function pick<T>(items: T[], index: number): T {
  return items[index % items.length] as T;
}

function money(value: number): string {
  return value.toFixed(2);
}

async function main() {
  await prisma.event.deleteMany();
  await prisma.intervention.deleteMany();
  await prisma.subscriberSignal.deleteMany();
  await prisma.subscriptionOrder.deleteMany();
  await prisma.subscriptionContract.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.shop.deleteMany();

  const shop = await prisma.shop.create({
    data: {
      shopifyDomain: 'retain-demo.myshopify.com',
      shopifyShopId: 'gid://shopify/Shop/100001',
      // Placeholder ciphertext — encryption is applied at the application layer.
      accessToken: 'enc:v1:seed-demo-token-not-for-production',
      planTier: PlanTier.growth,
      status: ShopStatus.active,
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
        retentionEnabled: true,
      },
      billingSettings: {
        trialEndsAt: daysFromNow(14).toISOString(),
        billingEmail: 'billing@retain-demo.example',
      },
      installedAt: daysAgo(120),
    },
  });

  const monthlyPlan = await prisma.subscriptionPlan.create({
    data: {
      shopId: shop.id,
      name: 'Monthly Essentials',
      description: 'Core subscription with monthly delivery and 10% off.',
      status: PlanStatus.active,
      planType: PlanType.standard,
      frequencies: [
        { interval: 'month', intervalCount: 1 },
        { interval: 'month', intervalCount: 2 },
      ],
      minimumCommitment: 2,
      trialPeriodDays: 0,
      pricingStrategy: PricingStrategy.percentage_discount,
      discountValue: money(10),
      productIds: [randomUUID(), randomUUID()],
      collectionIds: [randomUUID()],
    },
  });

  const boxPlan = await prisma.subscriptionPlan.create({
    data: {
      shopId: shop.id,
      name: 'Curated Box',
      description: 'Build-a-box subscription with quarterly prepaid option.',
      status: PlanStatus.active,
      planType: PlanType.box,
      frequencies: [
        { interval: 'month', intervalCount: 1 },
        { interval: 'month', intervalCount: 3 },
      ],
      minimumCommitment: 3,
      trialPeriodDays: 7,
      pricingStrategy: PricingStrategy.fixed_price,
      discountValue: money(39.0),
      boxConfig: {
        minItems: 3,
        maxItems: 6,
        allowSwaps: true,
      },
      productIds: [randomUUID(), randomUUID(), randomUUID()],
      collectionIds: [randomUUID(), randomUUID()],
    },
  });

  const plans = [monthlyPlan, boxPlan];
  const customers = [];

  for (let i = 0; i < 10; i += 1) {
    const firstName = pick(FIRST_NAMES, i);
    const lastName = pick(LAST_NAMES, i);
    const firstOrderDate = daysAgo(90 - i * 5);
    const lastOrderDate = daysAgo(i + 3);
    const activeSubscriptions = i % 3 === 0 ? 2 : 1;
    const lifetimeValue = 48 + i * 27.5;

    const customer = await prisma.customer.create({
      data: {
        shopId: shop.id,
        shopifyCustomerId: `gid://shopify/Customer/${200000 + i}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        firstName,
        lastName,
        phone: `+1555010${String(i).padStart(4, '0')}`,
        totalSubscriptions: activeSubscriptions,
        activeSubscriptions,
        lifetimeValue: money(lifetimeValue),
        firstOrderDate,
        lastOrderDate,
        acceptsMarketing: i % 2 === 0,
        emailConsent: i % 2 === 0,
        smsConsent: i % 4 === 0,
      },
    });

    customers.push(customer);
  }

  const contractStatuses: ContractStatus[] = [
    ContractStatus.active,
    ContractStatus.active,
    ContractStatus.active,
    ContractStatus.active,
    ContractStatus.active,
    ContractStatus.active,
    ContractStatus.paused,
    ContractStatus.payment_failed,
    ContractStatus.cancelled,
    ContractStatus.expired,
  ];

  for (let i = 0; i < 20; i += 1) {
    const customer = pick(customers, i);
    const plan = pick(plans, i);
    const status = pick(contractStatuses, i);
    const tenureDays = 30 + i * 8;
    const totalCharges = status === ContractStatus.expired ? 1 : 2 + (i % 8);
    const unitPrice = plan.planType === PlanType.box ? 39 : 28 + (i % 5) * 2;
    const totalRevenue = totalCharges * unitPrice;
    const churnRiskScore = Math.min(0.95, 0.12 + (i % 10) * 0.08);
    const healthStatus =
      churnRiskScore >= 0.7
        ? HealthStatus.critical
        : churnRiskScore >= 0.4
          ? HealthStatus.at_risk
          : HealthStatus.healthy;

    const isCancelled =
      status === ContractStatus.cancelled || status === ContractStatus.expired;

    const contract = await prisma.subscriptionContract.create({
      data: {
        shopId: shop.id,
        customerId: customer.id,
        planId: plan.id,
        shopifyContractId: `gid://shopify/SubscriptionContract/${300000 + i}`,
        status,
        billingPolicy: {
          interval: 'month',
          intervalCount: plan.planType === PlanType.box && i % 2 === 0 ? 3 : 1,
          anchors: [{ type: 'WEEKDAY', day: 1 }],
        },
        deliveryPolicy: {
          interval: 'month',
          intervalCount: 1,
        },
        pricingPolicy: {
          basePrice: unitPrice,
          currency: 'USD',
          discountPercent: plan.planType === PlanType.standard ? 10 : 0,
        },
        nextBillingDate: isCancelled ? null : daysFromNow(3 + (i % 14)),
        lastBillingDate: daysAgo(14 - (i % 10)),
        lastOrderId:
          totalCharges > 0 ? `gid://shopify/Order/${400000 + i}` : null,
        totalCharges,
        totalRevenue: money(totalRevenue),
        boxItems:
          plan.planType === PlanType.box
            ? {
                items: [
                  { productId: randomUUID(), quantity: 1 },
                  { productId: randomUUID(), quantity: 2 },
                ],
              }
            : undefined,
        churnRiskScore,
        healthStatus,
        predictedChurn14d: Math.min(0.99, churnRiskScore * 0.85),
        predictedChurn30d: Math.min(0.99, churnRiskScore * 1.05),
        cancelledAt: isCancelled ? daysAgo(5 + (i % 7)) : null,
        cancellationReason: isCancelled ? pick(CANCELLATION_REASONS, i) : null,
        cancellationNotes: isCancelled
          ? 'Seeded cancellation for local development.'
          : null,
      },
    });

    await prisma.subscriberSignal.create({
      data: {
        contractId: contract.id,
        daysSinceLastEngagement: i % 20,
        portalLoginCount30d: i % 6,
        productSwapCount30d: i % 3,
        skipCount90d: i % 4,
        pauseCountLifetime: status === ContractStatus.paused ? 1 : i % 2,
        cadenceDriftDays: i % 5,
        avgOrderValue: money(unitPrice),
        orderFrequencyDays: 28 + (i % 7),
        paymentFailureCount30d:
          status === ContractStatus.payment_failed ? 2 : i % 2,
        paymentFailureCount90d:
          status === ContractStatus.payment_failed ? 3 : i % 3,
        daysSinceLastPaymentFailure:
          status === ContractStatus.payment_failed ? 2 : null,
        supportTicketCount30d: i % 3,
        supportTicketSentiment: 0.2 + (i % 8) * 0.1,
        emailOpenRate30d: 0.25 + (i % 5) * 0.1,
        emailClickRate30d: 0.05 + (i % 4) * 0.03,
        smsOptOut: i % 7 === 0,
        tenureDays,
        totalRevenue: money(totalRevenue),
        subscriptionCount: customer.activeSubscriptions,
        predictedChurn14d: contract.predictedChurn14d,
        predictedChurn30d: contract.predictedChurn30d,
        modelVersion: 'seed-v1',
        calculatedAt: daysAgo(i % 3),
      },
    });
  }

  const summary = {
    shop: shop.shopifyDomain,
    customers: await prisma.customer.count({ where: { shopId: shop.id } }),
    plans: await prisma.subscriptionPlan.count({ where: { shopId: shop.id } }),
    contracts: await prisma.subscriptionContract.count({
      where: { shopId: shop.id },
    }),
    signals: await prisma.subscriberSignal.count(),
  };

  console.log('Seed complete:', summary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
