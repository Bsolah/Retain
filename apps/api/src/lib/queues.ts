import { Queue } from 'bullmq';
import {
  queueForTopic,
  WEBHOOK_QUEUES,
  type ShopCleanupJob,
  type ShopifyWebhookJob,
} from '@retain/shared';
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

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, { connection: redisConnection() });
  registerQueueForShutdown(queue);
  queues.set(name, queue);
  return queue;
}

export function getWebhookQueue(topic?: string): Queue {
  const name = topic ? queueForTopic(topic) : WEBHOOK_QUEUES.legacy;
  return getQueue(name);
}

export function getCleanupQueue(): Queue {
  return getQueue(WEBHOOK_QUEUES.cleanup);
}

export type { ShopifyWebhookJob, ShopCleanupJob };

export async function enqueueWebhookJob(
  job: ShopifyWebhookJob,
  options?: { hmac?: string; rawBody?: string },
): Promise<void> {
  const queue = getWebhookQueue(job.topic);
  await queue.add(
    'shopify-webhook',
    {
      ...job,
      hmac: options?.hmac,
      rawBody: options?.rawBody,
    },
    {
      jobId: job.webhookId,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: {
        type: 'custom',
      },
    },
  );
}
