import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addInterval,
  asDeliveryPolicy,
  startOfUtcDay,
} from './services/billing-policy.js';

describe('billing policy helpers', () => {
  it('advances monthly billing dates', () => {
    const from = new Date('2026-01-15T00:00:00.000Z');
    const next = addInterval(from, {
      recurring: { interval: 'MONTH', intervalCount: 1 },
    });
    assert.equal(next.toISOString(), '2026-02-15T00:00:00.000Z');
  });

  it('reads nested recurring policy', () => {
    const policy = asDeliveryPolicy({
      recurring: { interval: 'WEEK', intervalCount: 2 },
    });
    const next = addInterval(new Date('2026-01-01T00:00:00.000Z'), policy);
    assert.equal(next.toISOString(), '2026-01-15T00:00:00.000Z');
  });

  it('computes UTC day bounds', () => {
    const start = startOfUtcDay(new Date('2026-07-04T15:30:00.000Z'));
    assert.equal(start.toISOString(), '2026-07-04T00:00:00.000Z');
  });
});
