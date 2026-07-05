import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPreview,
  estimateDurationMinutes,
} from './services/migration/types.js';

describe('migration discovery helpers', () => {
  it('estimates duration from contract count', () => {
    assert.equal(estimateDurationMinutes(30), 1);
    assert.equal(estimateDurationMinutes(120), 4);
  });

  it('builds preview summary', () => {
    const preview = buildPreview({
      customers: [{ sourceId: '1', email: 'a@b.com' }],
      contracts: [
        {
          sourceId: 's1',
          sourceCustomerId: '1',
          status: 'active',
          price: 10,
          raw: {},
        },
      ],
      totalRevenue: 10,
    });

    assert.equal(preview.totalContracts, 1);
    assert.equal(preview.totalCustomers, 1);
    assert.equal(preview.totalRevenue, 10);
  });
});
