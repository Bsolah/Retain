import { PlanStatus, Prisma } from '@retain/database';
import type { GraphQLContext } from '../../context.js';
import { notFoundError, userInputError } from '../../lib/graphql-errors.js';
import { listCollections, searchProducts } from '../../services/catalog.js';
import {
  validateBoxConfig,
  validateFrequencies,
  validatePlanName,
} from '../../services/plan-validation.js';
import {
  createSellingPlanGroup,
  hideSellingPlanGroupFromProducts,
  sellingPlanInputFromRecord,
  updateSellingPlanGroup,
} from '../../services/selling-plans.js';
import { assertShopAccess, requireShop } from '../auth.js';
import { mapPlanToGql } from '../plan-mapper.js';

type PlanInput = {
  name: string;
  description?: string | null;
  planType: string;
  frequencies: Array<{
    interval: number;
    unit: string;
    discountPercent?: number | null;
    prepaidBillingInterval?: number | null;
  }>;
  minimumCommitment?: number | null;
  trialPeriodDays?: number | null;
  pricingStrategy: string;
  discountValue?: number | null;
  boxConfig?: {
    minItems?: number | null;
    maxItems?: number | null;
    allowSwaps?: boolean | null;
    slots?: Array<{
      id: string;
      label?: string | null;
      required?: boolean | null;
    }> | null;
    eligibleProductIds?: string[] | null;
  } | null;
  productIds?: string[] | null;
  collectionIds?: string[] | null;
};

const planInclude = {
  contracts: {
    select: { status: true, totalRevenue: true },
  },
} as const;

export const planQueries = {
  plans: async (
    _parent: unknown,
    args: {
      shopId: string;
      status?: 'active' | 'paused' | 'archived' | null;
    },
    context: GraphQLContext,
  ) => {
    assertShopAccess(context, args.shopId);

    const plans = await context.prisma.subscriptionPlan.findMany({
      where: {
        shopId: args.shopId,
        ...(args.status ? { status: args.status } : {}),
      },
      include: planInclude,
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(mapPlanToGql);
  },

  plan: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const plan = await context.prisma.subscriptionPlan.findFirst({
      where: { id: args.id, shopId: shop.id },
      include: planInclude,
    });

    return plan ? mapPlanToGql(plan) : null;
  },

  searchProducts: async (
    _parent: unknown,
    args: { query: string; first?: number | null },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    return searchProducts(shop, args.query, args.first ?? 20);
  },

  collections: async (
    _parent: unknown,
    args: { first?: number | null },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    return listCollections(shop, args.first ?? 50);
  },
};

export const planMutations = {
  createPlan: async (
    _parent: unknown,
    args: { input: PlanInput },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const input = args.input;
    const name = validatePlanName(input.name);
    const planType = input.planType as 'standard' | 'prepaid' | 'box';
    const frequencies = validateFrequencies(input.frequencies, planType);
    const productIds = input.productIds ?? [];
    const collectionIds = input.collectionIds ?? [];
    const boxConfig = validateBoxConfig(
      input.boxConfig,
      planType,
      productIds,
      collectionIds,
    );

    if (productIds.length === 0 && collectionIds.length === 0) {
      throw userInputError(
        'Select at least one product or collection for the plan',
      );
    }

    const sellingInput = {
      name,
      description: input.description,
      planType,
      frequencies,
      productIds,
      collectionIds,
      pricingStrategy: input.pricingStrategy,
      discountValue: input.discountValue,
    };

    let shopifySellingPlanGroupId: string;
    try {
      shopifySellingPlanGroupId = await createSellingPlanGroup(
        shop,
        sellingInput,
      );
    } catch (error) {
      throw userInputError(
        error instanceof Error
          ? `Shopify sync failed: ${error.message}`
          : 'Shopify sync failed',
      );
    }

    const plan = await context.prisma.subscriptionPlan.create({
      data: {
        shopId: shop.id,
        shopifySellingPlanGroupId,
        name,
        description: input.description ?? null,
        status: PlanStatus.active,
        planType,
        frequencies,
        minimumCommitment: input.minimumCommitment ?? null,
        trialPeriodDays: input.trialPeriodDays ?? 0,
        pricingStrategy: input.pricingStrategy as
          'percentage_discount' | 'fixed_price' | 'tiered',
        discountValue:
          input.discountValue == null
            ? null
            : new Prisma.Decimal(input.discountValue),
        boxConfig: boxConfig ?? Prisma.JsonNull,
        productIds,
        collectionIds,
      },
      include: planInclude,
    });

    return mapPlanToGql(plan);
  },

  updatePlan: async (
    _parent: unknown,
    args: { id: string; input: PlanInput },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const existing = await context.prisma.subscriptionPlan.findFirst({
      where: { id: args.id, shopId: shop.id },
    });

    if (!existing) {
      throw notFoundError('Plan not found');
    }

    if (existing.status === PlanStatus.archived) {
      throw userInputError('Archived plans cannot be updated');
    }

    const input = args.input;
    const name = validatePlanName(input.name);
    const planType = input.planType as 'standard' | 'prepaid' | 'box';
    const frequencies = validateFrequencies(input.frequencies, planType);
    const productIds = input.productIds ?? [];
    const collectionIds = input.collectionIds ?? [];
    const boxConfig = validateBoxConfig(
      input.boxConfig,
      planType,
      productIds,
      collectionIds,
    );

    if (existing.shopifySellingPlanGroupId) {
      try {
        await updateSellingPlanGroup(shop, existing.shopifySellingPlanGroupId, {
          name,
          description: input.description,
          planType,
          frequencies,
          productIds,
          collectionIds,
          pricingStrategy: input.pricingStrategy,
          discountValue: input.discountValue,
        });
      } catch (error) {
        throw userInputError(
          error instanceof Error
            ? `Shopify sync failed: ${error.message}`
            : 'Shopify sync failed',
        );
      }
    }

    const plan = await context.prisma.subscriptionPlan.update({
      where: { id: existing.id },
      data: {
        name,
        description: input.description ?? null,
        planType,
        frequencies,
        minimumCommitment: input.minimumCommitment ?? null,
        trialPeriodDays: input.trialPeriodDays ?? 0,
        pricingStrategy: input.pricingStrategy as
          'percentage_discount' | 'fixed_price' | 'tiered',
        discountValue:
          input.discountValue == null
            ? null
            : new Prisma.Decimal(input.discountValue),
        boxConfig: boxConfig ?? Prisma.JsonNull,
        productIds,
        collectionIds,
      },
      include: planInclude,
    });

    return mapPlanToGql(plan);
  },

  resyncPlan: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const existing = await context.prisma.subscriptionPlan.findFirst({
      where: { id: args.id, shopId: shop.id },
    });

    if (!existing) {
      throw notFoundError('Plan not found');
    }

    if (existing.status === PlanStatus.archived) {
      throw userInputError('Archived plans cannot be synced');
    }

    if (!existing.shopifySellingPlanGroupId) {
      throw userInputError('Plan is not linked to Shopify yet');
    }

    const frequencies = validateFrequencies(
      existing.frequencies as PlanInput['frequencies'],
      existing.planType as 'standard' | 'prepaid' | 'box',
    );

    try {
      await updateSellingPlanGroup(shop, existing.shopifySellingPlanGroupId, {
        name: existing.name,
        description: existing.description,
        planType: existing.planType as 'standard' | 'prepaid' | 'box',
        frequencies,
        productIds: existing.productIds,
        collectionIds: existing.collectionIds,
        pricingStrategy: existing.pricingStrategy,
        discountValue:
          existing.discountValue == null
            ? null
            : Number(existing.discountValue),
      });
    } catch (error) {
      throw userInputError(
        error instanceof Error
          ? `Shopify sync failed: ${error.message}`
          : 'Shopify sync failed',
      );
    }

    const plan = await context.prisma.subscriptionPlan.findFirst({
      where: { id: existing.id },
      include: planInclude,
    });

    return mapPlanToGql(plan!);
  },

  archivePlan: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const existing = await context.prisma.subscriptionPlan.findFirst({
      where: { id: args.id, shopId: shop.id },
      include: planInclude,
    });

    if (!existing) {
      throw notFoundError('Plan not found');
    }

    if (existing.shopifySellingPlanGroupId) {
      try {
        await hideSellingPlanGroupFromProducts(
          shop,
          existing.shopifySellingPlanGroupId,
        );
      } catch (error) {
        context.request.log.warn(
          { err: error, planId: existing.id },
          'Failed to remove selling plan group from Shopify on archive',
        );
      }
    }

    const plan = await context.prisma.subscriptionPlan.update({
      where: { id: existing.id },
      data: {
        status: PlanStatus.archived,
        shopifySellingPlanGroupId: null,
      },
      include: planInclude,
    });

    return mapPlanToGql(plan);
  },

  unarchivePlan: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const existing = await context.prisma.subscriptionPlan.findFirst({
      where: { id: args.id, shopId: shop.id },
      include: planInclude,
    });

    if (!existing) {
      throw notFoundError('Plan not found');
    }

    if (existing.status !== PlanStatus.archived) {
      throw userInputError('Only archived plans can be unarchived');
    }

    const frequencies = validateFrequencies(
      existing.frequencies as Array<{
        interval: number;
        unit: string;
        discountPercent?: number | null;
        prepaidBillingInterval?: number | null;
      }>,
      existing.planType,
    );

    let shopifySellingPlanGroupId = existing.shopifySellingPlanGroupId;
    try {
      shopifySellingPlanGroupId = await createSellingPlanGroup(
        shop,
        sellingPlanInputFromRecord(existing, frequencies),
      );
    } catch (error) {
      throw userInputError(
        error instanceof Error
          ? `Shopify sync failed: ${error.message}`
          : 'Shopify sync failed',
      );
    }

    const plan = await context.prisma.subscriptionPlan.update({
      where: { id: existing.id },
      data: {
        status: PlanStatus.active,
        shopifySellingPlanGroupId,
      },
      include: planInclude,
    });

    return mapPlanToGql(plan);
  },

  deletePlan: async (
    _parent: unknown,
    args: { id: string },
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    const existing = await context.prisma.subscriptionPlan.findFirst({
      where: { id: args.id, shopId: shop.id },
      include: planInclude,
    });

    if (!existing) {
      throw notFoundError('Plan not found');
    }

    const subscriberCount = existing.contracts.filter(
      (contract) =>
        contract.status === 'active' ||
        contract.status === 'paused' ||
        contract.status === 'payment_failed',
    ).length;

    if (subscriberCount > 0) {
      throw userInputError(
        `Cannot delete a plan with ${subscriberCount} active subscriber${subscriberCount === 1 ? '' : 's'}. Archive the plan instead.`,
      );
    }

    if (existing.shopifySellingPlanGroupId) {
      try {
        await hideSellingPlanGroupFromProducts(
          shop,
          existing.shopifySellingPlanGroupId,
        );
      } catch (error) {
        context.request.log.warn(
          { err: error, planId: existing.id },
          'Failed to delete selling plan group in Shopify',
        );
      }
    }

    const snapshot = mapPlanToGql(existing);
    await context.prisma.subscriptionPlan.delete({
      where: { id: existing.id },
    });

    return snapshot;
  },
};
