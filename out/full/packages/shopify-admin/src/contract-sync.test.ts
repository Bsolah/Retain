import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectSellingPlanGroupIds,
  computeSubscriptionValueFromLineItems,
} from './contract-sync.js';

describe('collectSellingPlanGroupIds', () => {
  it('reads selling plan group id from webhook line items', () => {
    const ids = collectSellingPlanGroupIds({
      lines: [
        {
          selling_plan: {
            selling_plan_group_id: 'gid://shopify/SellingPlanGroup/111',
          },
        },
      ],
    });

    assert.deepEqual(ids, ['gid://shopify/SellingPlanGroup/111']);
  });

  it('normalizes numeric group ids to GIDs', () => {
    const ids = collectSellingPlanGroupIds({
      lines: [{ selling_plan: { selling_plan_group_id: '949485647' } }],
    });

    assert.deepEqual(ids, ['gid://shopify/SellingPlanGroup/949485647']);
  });

  it('returns empty when no lines', () => {
    assert.deepEqual(collectSellingPlanGroupIds({}), []);
  });
});

describe('computeSubscriptionValueFromLineItems', () => {
  it('sums unitPrice × quantity across lines', () => {
    const value = computeSubscriptionValueFromLineItems([
      { quantity: 2, unitPrice: 25 },
      { quantity: 1, unitPrice: 10.5 },
    ]);
    assert.equal(value, 60.5);
  });

  it('returns 0 for missing or invalid line items', () => {
    assert.equal(computeSubscriptionValueFromLineItems(null), 0);
    assert.equal(computeSubscriptionValueFromLineItems([]), 0);
  });
});
