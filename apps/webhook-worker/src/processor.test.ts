import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  WEBHOOK_QUEUES,
  WEBHOOK_RETRY_DELAYS_MS,
  queueForTopic,
} from '@retain/shared';
import { verifyWebhookHmac } from './lib/hmac.js';
import { webhookBackoff } from './lib/dlq.js';

describe('webhook queue routing', () => {
  it('routes billing topics to critical queue', () => {
    assert.equal(
      queueForTopic('subscription_billing_attempts/success'),
      WEBHOOK_QUEUES.critical,
    );
    assert.equal(
      queueForTopic('subscription_billing_attempts/failure'),
      WEBHOOK_QUEUES.critical,
    );
  });

  it('routes contract and order topics to high queue', () => {
    assert.equal(
      queueForTopic('subscription_contracts/create'),
      WEBHOOK_QUEUES.high,
    );
    assert.equal(queueForTopic('orders/paid'), WEBHOOK_QUEUES.high);
  });

  it('routes customer and product topics to medium queue', () => {
    assert.equal(queueForTopic('customers/update'), WEBHOOK_QUEUES.medium);
    assert.equal(queueForTopic('products/update'), WEBHOOK_QUEUES.medium);
  });

  it('routes shop and fulfillment topics to low queue', () => {
    assert.equal(queueForTopic('shop/update'), WEBHOOK_QUEUES.low);
    assert.equal(queueForTopic('fulfillments/update'), WEBHOOK_QUEUES.low);
  });
});

describe('webhook retry backoff', () => {
  it('uses exponential delays of 1m, 5m, 15m', () => {
    assert.equal(webhookBackoff(1), WEBHOOK_RETRY_DELAYS_MS[0]);
    assert.equal(webhookBackoff(2), WEBHOOK_RETRY_DELAYS_MS[1]);
    assert.equal(webhookBackoff(3), WEBHOOK_RETRY_DELAYS_MS[2]);
    assert.equal(webhookBackoff(4), 900_000);
  });
});

describe('webhook hmac verification', () => {
  it('accepts valid signatures', () => {
    const secret = process.env.SHOPIFY_API_SECRET ?? '';
    const body = '{"id":1}';
    const digest = createHmac('sha256', secret).update(body).digest('base64');

    assert.equal(verifyWebhookHmac(body, digest), true);
  });

  it('rejects invalid signatures', () => {
    assert.equal(verifyWebhookHmac('{"id":1}', 'invalid'), false);
  });
});
