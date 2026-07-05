import { Queue } from 'bullmq';
import {
  WEBHOOK_QUEUES,
  WEBHOOK_RETRY_DELAYS_MS,
  type ShopifyWebhookJob,
} from '@retain/shared';
import { env } from '../env.js';
import { redisConnection } from './redis.js';
import { dlqTotal } from './metrics.js';

let dlqQueue: Queue | undefined;

function getDlqQueue(): Queue {
  if (!dlqQueue) {
    dlqQueue = new Queue(WEBHOOK_QUEUES.dlq, { connection: redisConnection() });
  }
  return dlqQueue;
}

export async function moveToDeadLetterQueue(
  job: ShopifyWebhookJob,
  queueName: string,
  error: Error,
): Promise<void> {
  await getDlqQueue().add('dead-letter', {
    ...job,
    failedQueue: queueName,
    error: {
      message: error.message,
      stack: error.stack,
    },
    movedAt: new Date().toISOString(),
  });

  dlqTotal.inc({ topic: job.topic, queue: queueName });

  if (env.MONITORING_WEBHOOK_URL) {
    try {
      await fetch(env.MONITORING_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `Webhook DLQ: ${job.topic} from ${job.shopDomain} — ${error.message}`,
          job,
        }),
      });
    } catch (alertError) {
      console.error('Failed to alert monitoring channel', alertError);
    }
  }
}

export function webhookBackoff(attemptsMade: number): number {
  return WEBHOOK_RETRY_DELAYS_MS[attemptsMade - 1] ?? 900_000;
}
