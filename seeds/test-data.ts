import {
  ContractStatus,
  HealthStatus,
  PlanStatus,
  PlanType,
  PricingStrategy,
  prisma,
} from '@retain/database';
import {
  buildContractCreateInput,
  buildCustomerCreateInput,
  buildShopCreateInput,
  buildSubscriptionOrderCreateInput,
  resetContractFactoryCounter,
  resetCustomerFactoryCounter,
  resetShopFactoryCounter,
} from '../factories/index.js';

export type TestDataset = {
  shopId: string;
  planIds: { monthly: string; quarterly: string };
  customerIds: string[];
  contractIds: { active: string; atRisk: string; paused: string };
};

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

/** Wipe and seed a complete integration-test dataset. */
export async function seedTestData(): Promise<TestDataset> {
  resetShopFactoryCounter();
  resetCustomerFactoryCounter();
  resetContractFactoryCounter();

  await prisma.event.deleteMany();
  await prisma.intervention.deleteMany();
  await prisma.subscriberSignal.deleteMany();
  await prisma.subscriptionOrder.deleteMany();
  await prisma.subscriptionContract.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.shop.deleteMany();

  const shop = await prisma.shop.create({
    data: buildShopCreateInput({
      shopifyDomain: 'retain-test.myshopify.com',
      shopifyShopId: 'gid://shopify/Shop/900001',
      accessToken: 'enc:v1:seed-demo-token-not-for-production',
    }),
  });

  const monthlyPlan = await prisma.subscriptionPlan.create({
    data: {
      shopId: shop.id,
      shopifySellingPlanGroupId: 'gid://shopify/SellingPlanGroup/9001',
      name: 'Monthly Essentials',
      description: 'Test monthly plan',
      planType: PlanType.standard,
      status: PlanStatus.active,
      pricingStrategy: PricingStrategy.percentage_discount,
      discountValue: 10,
      frequencies: [{ interval: 1, unit: 'month', discountPercent: 10 }],
      productIds: ['gid://shopify/Product/1'],
      collectionIds: [],
    },
  });

  const quarterlyPlan = await prisma.subscriptionPlan.create({
    data: {
      shopId: shop.id,
      shopifySellingPlanGroupId: 'gid://shopify/SellingPlanGroup/9002',
      name: 'Quarterly Box',
      description: 'Test quarterly plan',
      planType: PlanType.box,
      status: PlanStatus.active,
      pricingStrategy: PricingStrategy.percentage_discount,
      discountValue: 15,
      frequencies: [{ interval: 3, unit: 'month', discountPercent: 15 }],
      productIds: [],
      collectionIds: ['gid://shopify/Collection/1'],
    },
  });

  const customers = await Promise.all(
    [1, 2, 3].map((index) =>
      prisma.customer.create({
        data: buildCustomerCreateInput(shop.id, {
          email: `subscriber${index}@test.example`,
          firstName: `Subscriber${index}`,
        }),
      }),
    ),
  );

  const activeContract = await prisma.subscriptionContract.create({
    data: buildContractCreateInput(shop.id, customers[0]!.id, monthlyPlan.id, {
      status: ContractStatus.active,
      healthStatus: HealthStatus.healthy,
      nextBillingDate: daysFromNow(0),
      totalCharges: 5,
    }),
  });

  const atRiskContract = await prisma.subscriptionContract.create({
    data: buildContractCreateInput(shop.id, customers[1]!.id, monthlyPlan.id, {
      status: ContractStatus.active,
      healthStatus: HealthStatus.at_risk,
      nextBillingDate: daysFromNow(7),
      consecutiveSkips: 2,
    }),
  });

  const pausedContract = await prisma.subscriptionContract.create({
    data: buildContractCreateInput(
      shop.id,
      customers[2]!.id,
      quarterlyPlan.id,
      {
        status: ContractStatus.paused,
        healthStatus: HealthStatus.healthy,
        pausedAt: daysAgo(3),
        nextBillingDate: daysFromNow(30),
      },
    ),
  });

  await prisma.subscriptionOrder.create({
    data: buildSubscriptionOrderCreateInput(
      shop.id,
      customers[0]!.id,
      activeContract.id,
      { billingCycle: 5, orderNumber: '#9001' },
    ),
  });

  return {
    shopId: shop.id,
    planIds: { monthly: monthlyPlan.id, quarterly: quarterlyPlan.id },
    customerIds: customers.map((customer) => customer.id),
    contractIds: {
      active: activeContract.id,
      atRisk: atRiskContract.id,
      paused: pausedContract.id,
    },
  };
}

export async function cleanupTestData(): Promise<void> {
  await prisma.event.deleteMany();
  await prisma.intervention.deleteMany();
  await prisma.subscriberSignal.deleteMany();
  await prisma.subscriptionOrder.deleteMany();
  await prisma.subscriptionContract.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.shop.deleteMany();
}
