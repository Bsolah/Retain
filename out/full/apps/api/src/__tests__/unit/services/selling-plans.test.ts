import { describe, expect, it } from '@jest/globals';
import {
  buildSellingPlanReplaceInput,
  sellingPlanInputFromRecord,
  sellingPlansNeedReplace,
  shopifySellingPlansDrift,
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
    };

    const payload = buildSellingPlanReplaceInput(input, [
      'gid://shopify/SellingPlan/1',
      'gid://shopify/SellingPlan/2',
      'gid://shopify/SellingPlan/3',
    ]);

    expect(payload.name).toBe('Monthly Coffee Box');
    expect(payload.appId).toBe('retain');
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
    };

    const payload = buildSellingPlanReplaceInput(input, []);
    expect(payload.sellingPlansToCreate).toEqual([
      expect.objectContaining({ name: 'VIP Membership' }),
    ]);
  });

  it('deduplicates identical delivery option labels within one plan', () => {
    const input = {
      name: 'Duplicate Frequency Plan',
      planType: 'standard' as const,
      frequencies: [
        { interval: 2, unit: 'week' as const },
        { interval: 2, unit: 'week' as const },
      ],
      productIds: ['gid://shopify/Product/1'],
      collectionIds: [],
    };

    const payload = buildSellingPlanReplaceInput(input, []);
    const options = (
      payload.sellingPlansToCreate as Array<{ options: string[] }>
    ).map((plan) => plan.options[0]);

    expect(options).toEqual(['2 Weeks', '2 Weeks (2)']);
  });
});

describe('sellingPlansNeedReplace', () => {
  const baseInput = {
    name: 'Monthly Coffee Box',
    planType: 'standard' as const,
    frequencies: [{ interval: 1, unit: 'month' as const, discountPercent: 10 }],
    productIds: ['gid://shopify/Product/1'],
    collectionIds: [],
  };

  it('returns true when plan name changes', () => {
    expect(
      sellingPlansNeedReplace(baseInput, {
        ...baseInput,
        name: 'Renamed plan',
      }),
    ).toBe(true);
  });

  it('returns false when only products or collections change', () => {
    expect(
      sellingPlansNeedReplace(baseInput, {
        ...baseInput,
        productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
        collectionIds: ['gid://shopify/Collection/1'],
      }),
    ).toBe(false);
  });

  it('returns true when frequencies change', () => {
    expect(
      sellingPlansNeedReplace(baseInput, {
        ...baseInput,
        frequencies: [
          { interval: 2, unit: 'week' as const, discountPercent: 10 },
        ],
      }),
    ).toBe(true);
  });
});

describe('shopifySellingPlansDrift', () => {
  const input = {
    name: 'Monthly Coffee Box',
    planType: 'standard' as const,
    frequencies: [
      { interval: 2, unit: 'week' as const },
      { interval: 1, unit: 'month' as const },
    ],
    productIds: ['gid://shopify/Product/1'],
    collectionIds: [],
  };

  it('returns false when Shopify matches Retain selling plans', () => {
    expect(
      shopifySellingPlansDrift(
        [
          { name: 'Monthly Coffee Box — 2 Weeks', options: ['2 Weeks'] },
          { name: 'Monthly Coffee Box — 1 Month', options: ['1 Month'] },
        ],
        input,
      ),
    ).toBe(false);
  });

  it('returns true when plan names differ after a Retain rename', () => {
    expect(
      shopifySellingPlansDrift(
        [
          { name: 'Old Name — 2 Weeks', options: ['2 Weeks'] },
          { name: 'Old Name — 1 Month', options: ['1 Month'] },
        ],
        input,
      ),
    ).toBe(true);
  });

  it('returns true when plan count or options differ', () => {
    expect(
      shopifySellingPlansDrift(
        [{ name: 'Monthly Coffee Box — 2 Weeks', options: ['2 Weeks'] }],
        input,
      ),
    ).toBe(true);

    expect(
      shopifySellingPlansDrift(
        [
          { name: 'Monthly Coffee Box — 2 Weeks', options: ['2 Weeks'] },
          { name: 'Monthly Coffee Box — 1 Month', options: ['1 Month'] },
        ].map((plan) => ({ ...plan, options: ['Wrong option'] })),
        input,
      ),
    ).toBe(true);
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
      },
      [{ interval: 1, unit: 'month' }],
    );

    expect(input.name).toBe('Snack Box');
    expect(input.productIds).toEqual(['gid://shopify/Product/9']);
  });
});
