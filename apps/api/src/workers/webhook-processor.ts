import {
  parseRedisConnection,
  WEBHOOK_QUEUES,
  type ShopifyWebhookJob,
} from '@retain/shared';
import { upsertContractFromWebhook } from '@retain/shopify-admin';
import { Worker } from 'bullmq';
import { env } from '../env.js';
import { registerQueueForShutdown } from '../lib/shutdown.js';

function redisConnection() {
  return parseRedisConnection(env.REDIS_URL);
}

const CONTRACT_TOPICS = new Set([
  'subscription_contracts/create',
  'subscription_contracts/update',
]);

const WEBHOOK_QUEUE_NAMES = [
  WEBHOOK_QUEUES.critical,
  WEBHOOK_QUEUES.high,
  WEBHOOK_QUEUES.medium,
  WEBHOOK_QUEUES.low,
  WEBHOOK_QUEUES.legacy,
] as const;

const workers: Worker[] = [];

async function processContractJob(job: ShopifyWebhookJob) {
  const { topic, shopDomain, payload, webhookId } = job;

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
}

export function startWebhookProcessor(): Worker[] {
  if (workers.length > 0) {
    return workers;
  }

  for (const queueName of WEBHOOK_QUEUE_NAMES) {
    const worker = new Worker<ShopifyWebhookJob>(
      queueName,
      async (job) => processContractJob(job.data),
      { connection: redisConnection() },
    );

    worker.on('failed', (job, error) => {
      console.error(
        `Webhook job ${job?.id ?? 'unknown'} on ${queueName} failed:`,
        error.message,
      );
    });

    registerQueueForShutdown(worker);
    workers.push(worker);
  }

  console.log(
    `Webhook processor started (subscription contracts on ${WEBHOOK_QUEUE_NAMES.join(', ')})`,
  );
  return workers;
}
