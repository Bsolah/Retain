import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { WEBHOOK_TOPIC_COUNT } from './constants/webhooks.js';
import { decrypt, encrypt } from './lib/encryption.js';
import {
  normalizeShopDomain,
  verifyShopifyQueryHmac,
  verifyShopifyWebhookHmac,
} from './middleware/shopify.js';

describe('shopify auth primitives', () => {
  it('configures 19 required webhook topics', () => {
    assert.equal(WEBHOOK_TOPIC_COUNT, 19);
  });

  it('normalizes valid myshopify domains', () => {
    assert.equal(
      normalizeShopDomain('Retain-Demo.myshopify.com'),
      'retain-demo.myshopify.com',
    );
    assert.equal(normalizeShopDomain('not-a-shop.com'), null);
  });

  it('verifies OAuth query HMAC', () => {
    const query = {
      shop: 'retain-demo.myshopify.com',
      timestamp: '1710000000',
      host: 'abc',
    };
    const message = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key as keyof typeof query]}`)
      .join('&');
    const hmac = createHmac('sha256', process.env.SHOPIFY_API_SECRET as string)
      .update(message)
      .digest('hex');

    assert.equal(verifyShopifyQueryHmac({ ...query, hmac }), true);
    assert.equal(verifyShopifyQueryHmac({ ...query, hmac: 'nope' }), false);
  });

  it('verifies webhook HMAC-SHA256', () => {
    const body = Buffer.from('{"ok":true}', 'utf8');
    const hmac = createHmac('sha256', process.env.SHOPIFY_API_SECRET as string)
      .update(body)
      .digest('base64');

    assert.equal(verifyShopifyWebhookHmac(body, hmac), true);
    assert.equal(verifyShopifyWebhookHmac(body, 'nope'), false);
  });

  it('encrypts access tokens with AES-256-GCM', () => {
    const token = 'shpat_test_token';
    const encrypted = encrypt(token);
    assert.match(encrypted, /^enc:v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    assert.equal(decrypt(encrypted), token);
  });
});
