import { prisma, ShopStatus } from '@retain/database';
import {
  syncContractsFromOrderWebhook,
  syncSubscriptionOrderPaymentFromWebhook,
  upsertContractFromWebhook,
} from '@retain/shopify-admin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  GDPR_CLEANUP_DELAY_MS,
  isKnownWebhookTopic,
} from '../constants/webhooks.js';
import { encrypt } from '../lib/encryption.js';
import {
  enqueueWebhookJob,
  getCleanupQueue,
  type ShopCleanupJob,
  type ShopifyWebhookJob,
} from '../lib/queues.js';
import { getRedis } from '../lib/redis.js';
import {
  getHeaderValue,
  normalizeShopDomain,
  requireWebhookHmac,
  type ShopifyWebhookRequest,
} from '../middleware/shopify.js';

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

const CONTRACT_TOPICS = new Set([
  'subscription_contracts/create',
  'subscription_contracts/update',
]);

const ORDER_SUBSCRIPTION_TOPICS = new Set(['orders/create', 'orders/paid']);

async function syncSubscriberFromWebhook(
  request: FastifyRequest,
  topic: string,
  shopDomain: string,
  webhookId: string,
  payload: unknown,
): Promise<void> {
  if (!shopDomain) return;

  if (CONTRACT_TOPICS.has(topic)) {
    try {
      const contract = await upsertContractFromWebhook({
        shopDomain,
        topic,
        payload,
        webhookId,
      });
      request.log.info(
        { webhookId, topic, shopDomain, contractId: contract.id },
        'Subscription contract synced from webhook',
      );
    } catch (error) {
      request.log.error(
        { err: error, webhookId, topic, shopDomain },
        'Failed to sync subscription contract from webhook',
      );
    }
    return;
  }

  if (ORDER_SUBSCRIPTION_TOPICS.has(topic)) {
    try {
      const result = await syncContractsFromOrderWebhook({
        shopDomain,
        topic,
        payload,
        webhookId,
      });
      if (result.synced > 0) {
        request.log.info(
          { webhookId, topic, shopDomain, synced: result.synced },
          'Subscription contracts synced from order webhook',
        );
      }
    } catch (error) {
      request.log.error(
        { err: error, webhookId, topic, shopDomain },
        'Failed to sync subscription contracts from order webhook',
      );
    }

    if (topic === 'orders/paid' || topic === 'orders/updated') {
      try {
        const shop = await prisma.shop.findUnique({
          where: { shopifyDomain: shopDomain },
        });
        if (shop) {
          const paymentResult = await syncSubscriptionOrderPaymentFromWebhook(
            shop,
            topic,
            payload as {
              id?: number | string;
              admin_graphql_api_id?: string;
              financial_status?: string;
              total_price?: string | number;
              order_number?: number | string;
              currency?: string;
            },
          );
          if (paymentResult.completed) {
            request.log.info(
              {
                webhookId,
                topic,
                shopDomain,
                orderGid: paymentResult.orderGid,
              },
              'Subscription payment link order marked paid',
            );
          }
        }
      } catch (error) {
        request.log.error(
          { err: error, webhookId, topic, shopDomain },
          'Failed to reconcile subscription order payment from webhook',
        );
      }
    }
  }
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (request, body, done) => {
        const webhookRequest = request as ShopifyWebhookRequest;
        const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
        webhookRequest.rawBody = rawBody;

        try {
          const json = JSON.parse(rawBody.toString('utf8')) as unknown;
          done(null, json);
        } catch (error) {
          done(error as Error, undefined);
        }
      },
    );

    webhookScope.post(
      '/webhooks/shopify/app/uninstalled',
      async (request, reply) => {
        await handleWebhook(request as ShopifyWebhookRequest, reply, {
          forcedTopic: 'app/uninstalled',
        });
      },
    );

    webhookScope.post('/webhooks/shopify/*', async (request, reply) => {
      const topic = (request.params as { '*': string })['*'];
      await handleWebhook(request as ShopifyWebhookRequest, reply, {
        forcedTopic: topic,
      });
    });
  });
}

async function handleWebhook(
  request: ShopifyWebhookRequest,
  reply: FastifyReply,
  options: { forcedTopic?: string },
): Promise<void> {
  try {
    const validHmac = await requireWebhookHmac(request, reply);
    if (!validHmac) {
      return;
    }

    const topicHeader = getHeaderValue(request.headers['x-shopify-topic']);
    const topic = options.forcedTopic || topicHeader || 'unknown';
    const shopDomainHeader = getHeaderValue(
      request.headers['x-shopify-shop-domain'],
    );
    const shopDomain = normalizeShopDomain(shopDomainHeader ?? '') ?? '';
    const webhookId =
      getHeaderValue(request.headers['x-shopify-webhook-id']) ??
      `missing-${Date.now()}`;

    if (await isDuplicateWebhook(webhookId)) {
      request.log.info({ webhookId, topic }, 'Duplicate webhook ignored');
      await reply.status(200).send({ ok: true, duplicate: true });
      return;
    }

    if (topic === 'app/uninstalled') {
      await handleAppUninstalled(request, shopDomain, webhookId);
      await reply.status(200).send({ ok: true });
      return;
    }

    const job: ShopifyWebhookJob = {
      topic,
      shopDomain,
      webhookId,
      payload: request.body,
      receivedAt: new Date().toISOString(),
    };

    await syncSubscriberFromWebhook(
      request,
      topic,
      shopDomain,
      webhookId,
      request.body,
    );

    const hmacHeader = getHeaderValue(request.headers['x-shopify-hmac-sha256']);

    await enqueueWebhookJob(job, {
      hmac: hmacHeader,
      rawBody: request.rawBody?.toString('utf8'),
    });

    if (!isKnownWebhookTopic(topic)) {
      request.log.warn({ topic, shopDomain }, 'Received unknown webhook topic');
    }

    await reply.status(200).send({ ok: true });
  } catch (error) {
    // Never fail the webhook delivery from Shopify's perspective.
    request.log.error({ err: error }, 'Webhook handling error');
    await reply.status(200).send({ ok: true, queued: false });
  }
}

async function isDuplicateWebhook(webhookId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(
    `webhook:idempotency:${webhookId}`,
    '1',
    'EX',
    IDEMPOTENCY_TTL_SECONDS,
    'NX',
  );
  return result === null;
}

async function handleAppUninstalled(
  request: FastifyRequest,
  shopDomain: string,
  webhookId: string,
): Promise<void> {
  if (!shopDomain) {
    request.log.warn({ webhookId }, 'Uninstall webhook missing shop domain');
    return;
  }

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
  });

  if (!shop) {
    request.log.warn({ shopDomain }, 'Uninstall for unknown shop');
    return;
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      status: ShopStatus.uninstalled,
      uninstalledAt: new Date(),
      accessToken: encrypt('REVOKED'),
    },
  });

  const cleanupJob: ShopCleanupJob = {
    shopId: shop.id,
    shopifyDomain: shop.shopifyDomain,
    reason: 'app_uninstalled',
    scheduledAt: new Date().toISOString(),
  };

  await getCleanupQueue().add('gdpr-shop-cleanup', cleanupJob, {
    jobId: `cleanup:${shop.id}:${webhookId}`,
    delay: GDPR_CLEANUP_DELAY_MS,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });

  await enqueueWebhookJob(
    {
      topic: 'app/uninstalled',
      shopDomain,
      webhookId,
      payload: request.body,
      receivedAt: new Date().toISOString(),
    },
    {
      hmac: getHeaderValue(request.headers['x-shopify-hmac-sha256']),
      rawBody: (request as ShopifyWebhookRequest).rawBody?.toString('utf8'),
    },
  );

  request.log.info(
    { shopId: shop.id, shopDomain, delayMs: GDPR_CLEANUP_DELAY_MS },
    'Shop marked uninstalled; GDPR cleanup queued',
  );
}
