import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addInterval,
  computeNextBillingDateFromPolicy,
  hasBillingInterval,
} from './billing-policy.js';

describe('hasBillingInterval', () => {
  it('detects snake_case webhook billing policies', () => {
    assert.equal(
      hasBillingInterval({ interval: 'month', interval_count: 1 }),
      true,
    );
  });
});

describe('computeNextBillingDateFromPolicy', () => {
  it('adds one month from the base date', () => {
    const base = new Date('2026-07-06T12:00:00.000Z');
    const next = computeNextBillingDateFromPolicy(
      { interval: 'month', interval_count: 1 },
      base,
    );
    assert.equal(next?.toISOString(), '2026-08-06T12:00:00.000Z');
  });

  it('adds daily interval from webhook policy shape', () => {
    const base = new Date('2026-07-06T12:00:00.000Z');
    const next = computeNextBillingDateFromPolicy(
      { interval: 'day', interval_count: 1 },
      base,
    );
    assert.equal(next?.toISOString(), '2026-07-07T12:00:00.000Z');
  });
});

describe('addInterval', () => {
  it('supports nested recurring policy objects', () => {
    const next = addInterval(new Date('2026-01-01T00:00:00.000Z'), {
      recurring: { interval: 'WEEK', intervalCount: 2 },
    });
    assert.equal(next.toISOString(), '2026-01-15T00:00:00.000Z');
  });
});
