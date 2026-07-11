import { createHmac } from 'node:crypto';
import request from 'supertest';
import { seedTestData } from '../../../../../seeds/test-data.js';
import { createSessionToken, getTestApp } from '../../test/helpers.js';

describe('Integration: GraphQL', () => {
  it('returns health query without auth', async () => {
    const app = await getTestApp();
    const response = await request(app.server)
      .post('/graphql')
      .send({ query: '{ health { status service } }' });

    expect(response.status).toBe(200);
    expect(response.body.data.health.status).toBe('ok');
    expect(response.body.data.health.version).toBeDefined();
  });

  it('lists plans for authenticated merchant', async () => {
    const dataset = await seedTestData();
    const app = await getTestApp();
    const token = createSessionToken(app, {
      shopId: dataset.shopId,
      shopifyDomain: 'retain-test.myshopify.com',
      shopifyShopId: 'gid://shopify/Shop/900001',
    });

    const response = await request(app.server)
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          query Plans($shopId: ID!) {
            plans(shopId: $shopId) {
              id
              name
              status
            }
          }
        `,
        variables: { shopId: dataset.shopId },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.plans.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.plans[0].name).toMatch(/Monthly|Quarterly/);
  });

  it('rejects plan query without session', async () => {
    const dataset = await seedTestData();
    const app = await getTestApp();

    const response = await request(app.server)
      .post('/graphql')
      .send({
        query: `
          query Plans($shopId: ID!) {
            plans(shopId: $shopId) { id }
          }
        `,
        variables: { shopId: dataset.shopId },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]?.message).toMatch(
      /Merchant session required/,
    );
  });
});

describe('Integration: OAuth flow', () => {
  it('redirects to Shopify authorize URL', async () => {
    const app = await getTestApp();

    const response = await request(app.server)
      .get('/auth/shopify')
      .query({ shop: 'retain-test.myshopify.com' })
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(
      /retain-test\.myshopify\.com\/admin\/oauth\/authorize/,
    );
    expect(response.headers.location).toContain('client_id=');
  });
});

describe('Integration: Webhooks', () => {
  it('accepts valid HMAC webhook and enqueues processing', async () => {
    await seedTestData();
    const app = await getTestApp();
    const body = JSON.stringify({ id: 1, name: 'Test Shop' });
    const hmac = createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
      .update(body)
      .digest('base64');

    const response = await request(app.server)
      .post('/webhooks/shopify/customers/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'customers/create')
      .set('X-Shopify-Shop-Domain', 'retain-test.myshopify.com')
      .set('X-Shopify-Webhook-Id', `wh-${Date.now()}`)
      .set('X-Shopify-Hmac-Sha256', hmac)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('rejects webhook with invalid HMAC', async () => {
    const app = await getTestApp();
    const body = JSON.stringify({ id: 1 });

    const response = await request(app.server)
      .post('/webhooks/shopify/customers/create')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'customers/create')
      .set('X-Shopify-Shop-Domain', 'retain-test.myshopify.com')
      .set('X-Shopify-Hmac-Sha256', 'invalid')
      .send(body);

    expect(response.status).toBe(401);
  });
});

describe('Integration: Billing scheduler', () => {
  it('processes due billing with mocked Shopify API', async () => {
    const nock = (await import('nock')).default;
    const { prisma } = await import('@retain/database');
    const { encrypt } = await import('../../lib/encryption.js');
    const { SHOPIFY_API_VERSION } =
      await import('../../services/shopify-client.js');
    const { processDueBillings } =
      await import('../../services/billing-scheduler.js');

    const dataset = await seedTestData();
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: dataset.shopId },
    });

    await prisma.shop.update({
      where: { id: shop.id },
      data: { accessToken: encrypt('shpat_integration_test') },
    });

    const contract = await prisma.subscriptionContract.findUniqueOrThrow({
      where: { id: dataset.contractIds.active },
    });

    const today = new Date();
    await prisma.subscriptionContract.update({
      where: { id: contract.id },
      data: { nextBillingDate: today, lastBillingAttemptId: null },
    });

    nock(`https://${shop.shopifyDomain}`)
      .post(`/admin/api/${SHOPIFY_API_VERSION}/graphql.json`)
      .reply(200, {
        data: {
          subscriptionBillingAttemptCreate: {
            subscriptionBillingAttempt: {
              id: 'gid://shopify/SubscriptionBillingAttempt/99',
              ready: true,
              errorMessage: null,
              errorCode: null,
              order: {
                id: 'gid://shopify/Order/99',
                name: '#1099',
                totalPriceSet: {
                  shopMoney: { amount: '29.99', currencyCode: 'USD' },
                },
              },
            },
            userErrors: [],
          },
        },
      });

    const result = await processDueBillings(today);

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    nock.cleanAll();
  });
});
