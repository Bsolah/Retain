import { Queue } from 'bullmq';
import {
  GDPR_CLEANUP_DELAY_MS,
  WEBHOOK_QUEUES,
  type ShopCleanupJob,
} from '@retain/shared';
import { redisConnection } from '../lib/redis.js';

let cleanupQueue: Queue<ShopCleanupJob> | undefined;

function getCleanupQueue(): Queue<ShopCleanupJob> {
  if (!cleanupQueue) {
    cleanupQueue = new Queue(WEBHOOK_QUEUES.cleanup, {
      connection: redisConnection(),
    });
  }
  return cleanupQueue;
}

export async function scheduleShopCleanup(
  job: ShopCleanupJob,
  webhookId: string,
): Promise<void> {
  await getCleanupQueue().add('gdpr-shop-cleanup', job, {
    jobId: `cleanup:${job.shopId}:${webhookId}`,
    delay: GDPR_CLEANUP_DELAY_MS,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
