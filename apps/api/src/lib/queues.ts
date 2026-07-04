import { Queue } from 'bullmq';
import { env } from '../env.js';
import { registerQueueForShutdown } from './shutdown.js';

function redisConnection() {
  const url = new URL(env.REDIS_URL);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

let webhookQueue: Queue | undefined;
let cleanupQueue: Queue | undefined;

export function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue('shopify-webhooks', {
      connection: redisConnection(),
    });
    registerQueueForShutdown(webhookQueue);
  }

  return webhookQueue;
}

export function getCleanupQueue(): Queue {
  if (!cleanupQueue) {
    cleanupQueue = new Queue('shop-cleanup', {
      connection: redisConnection(),
    });
    registerQueueForShutdown(cleanupQueue);
  }

  return cleanupQueue;
}

export type ShopifyWebhookJob = {
  topic: string;
  shopDomain: string;
  webhookId: string;
  payload: unknown;
  receivedAt: string;
};

export type ShopCleanupJob = {
  shopId: string;
  shopifyDomain: string;
  reason: 'app_uninstalled';
  scheduledAt: string;
};
