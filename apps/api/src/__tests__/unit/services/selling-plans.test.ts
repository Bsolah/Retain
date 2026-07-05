import { describe, expect, it } from '@jest/globals';
import {
  buildSellingPlanReplaceInput,
  sellingPlanInputFromRecord,
} from '../../../services/selling-plans.js';

describe('buildSellingPlanReplaceInput', () => {
  it('deletes existing Shopify selling plans and creates fresh ones from Retain', () => {
    const input = {
      name: 'Monthly Coffee Box',
      planType: 'standard' as const,
      frequencies: [
        { interval: 2, unit: 'week' as const },
        { interval: 1, unit: 'month' as const },
      ],
      productIds: ['gid://shopify/Product/1'],
      collectionIds: [],
      pricingStrategy: 'percentage_discount',
      discountValue: 10,
    };

    const payload = buildSellingPlanReplaceInput(input, [
      'gid://shopify/SellingPlan/1',
      'gid://shopify/SellingPlan/2',
      'gid://shopify/SellingPlan/3',
    ]);

    expect(payload.name).toBe('Monthly Coffee Box');
    expect(payload.sellingPlansToDelete).toEqual([
      'gid://shopify/SellingPlan/1',
      'gid://shopify/SellingPlan/2',
      'gid://shopify/SellingPlan/3',
    ]);
    expect(payload.sellingPlansToCreate).toHaveLength(2);
    expect(payload.sellingPlansToCreate).toEqual([
      expect.objectContaining({ name: 'Monthly Coffee Box — 2 Weeks' }),
      expect.objectContaining({ name: 'Monthly Coffee Box — 1 Month' }),
    ]);
  });

  it('uses the Retain plan name for single-frequency plans', () => {
    const input = {
      name: 'VIP Membership',
      planType: 'standard' as const,
      frequencies: [{ interval: 1, unit: 'month' as const }],
      productIds: ['gid://shopify/Product/1'],
      collectionIds: [],
      pricingStrategy: 'percentage_discount',
      discountValue: 5,
    };

    const payload = buildSellingPlanReplaceInput(input, []);
    expect(payload.sellingPlansToCreate).toEqual([
      expect.objectContaining({ name: 'VIP Membership' }),
    ]);
  });
});

describe('sellingPlanInputFromRecord', () => {
  it('maps a Retain plan row into Shopify sync input', () => {
    const input = sellingPlanInputFromRecord(
      {
        name: 'Snack Box',
        description: 'Tasty',
        planType: 'standard',
        frequencies: [],
        productIds: ['gid://shopify/Product/9'],
        collectionIds: [],
        pricingStrategy: 'percentage_discount',
        discountValue: null,
      },
      [{ interval: 1, unit: 'month' }],
    );

    expect(input.name).toBe('Snack Box');
    expect(input.productIds).toEqual(['gid://shopify/Product/9']);
  });
});
