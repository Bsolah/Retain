import { Worker } from 'bullmq';
import { env } from '../env.js';
import type { ShopifyWebhookJob } from '../lib/queues.js';
import { registerQueueForShutdown } from '../lib/shutdown.js';
import { upsertContractFromWebhook } from '../services/contract-sync.js';

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

const CONTRACT_TOPICS = new Set([
  'subscription_contracts/create',
  'subscription_contracts/update',
]);

let worker: Worker | undefined;

export function startWebhookProcessor(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker<ShopifyWebhookJob>(
    'shopify-webhooks',
    async (job) => {
      const { topic, shopDomain, payload, webhookId } = job.data;

      if (!CONTRACT_TOPICS.has(topic)) {
        return { skipped: true, topic };
      }

      const contract = await upsertContractFromWebhook({
        shopDomain,
        topic,
        payload,
        webhookId,
      });

      return { contractId: contract.id, topic };
    },
    { connection: redisConnection() },
  );

  registerQueueForShutdown(worker);

  worker.on('failed', (job, error) => {
    console.error(`Webhook job ${job?.id ?? 'unknown'} failed:`, error.message);
  });

  console.log('Webhook processor started (subscription contracts)');
  return worker;
}
