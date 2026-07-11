import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDiscountOffer,
  CANCEL_REASONS,
} from './services/cancel-flow.js';
import { getOptimalRetryHour, shouldSendSmsEarly } from './services/dunning.js';
import {
  createPaymentUpdateToken,
  verifyPaymentUpdateToken,
} from './lib/payment-token.js';

describe('cancel-flow', () => {
  it('exposes standard cancel reasons', () => {
    assert.equal(CANCEL_REASONS.length, 6);
    assert.ok(CANCEL_REASONS.includes('too_expensive'));
  });

  it('scales discount with LTV', () => {
    assert.equal(calculateDiscountOffer(50).value, 10);
    assert.equal(calculateDiscountOffer(250).value, 20);
    assert.equal(calculateDiscountOffer(600).value, 25);
  });
});

describe('dunning retry optimization', () => {
  it('flags frequent failers for earlier SMS', () => {
    assert.equal(shouldSendSmsEarly(1), false);
    assert.equal(shouldSendSmsEarly(3), true);
  });

  it('schedules insufficient funds retries at a future date', () => {
    const retryAt = getOptimalRetryHour({
      failureCode: 'insufficient_funds',
      cardBrand: 'visa',
      timezoneOffsetMinutes: 0,
    });
    assert.ok(retryAt instanceof Date);
  });
});

describe('payment update token', () => {
  it('round-trips contract identity', () => {
    const token = createPaymentUpdateToken({
      contractId: 'contract_1',
      shopId: 'shop_1',
      customerId: 'cust_1',
      expiresInHours: 1,
    });

    const decoded = verifyPaymentUpdateToken(token);
    assert.equal(decoded?.contractId, 'contract_1');
    assert.equal(decoded?.shopId, 'shop_1');
  });
});
