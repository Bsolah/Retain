import { Queue, Worker } from 'bullmq';
import {
  WEBHOOK_QUEUES,
  type ShopifyWebhookJob,
  type ShopCleanupJob,
} from '@retain/shared';
import { moveToDeadLetterQueue, webhookBackoff } from '../lib/dlq.js';
import {
  processedTotal,
  processingDuration,
  queueDepth,
} from '../lib/metrics.js';
import { processWebhookJob } from '../lib/processor.js';
import { redisConnection } from '../lib/redis.js';
import { handleCleanupJob } from '../handlers/index.js';

const workers: Worker[] = [];
const monitoredQueues: Queue[] = [];

function createWebhookWorker(queueName: string): Worker {
  const worker = new Worker<ShopifyWebhookJob>(
    queueName,
    async (job) => {
      const end = processingDuration.startTimer({
        topic: job.data.topic,
        queue: queueName,
      });
      try {
        const result = await processWebhookJob(job.data);
        processedTotal.inc({
          topic: job.data.topic,
          queue: queueName,
          status: 'success',
        });
        return result;
      } catch (error) {
        processedTotal.inc({
          topic: job.data.topic,
          queue: queueName,
          status: 'failure',
        });
        throw error;
      } finally {
        end();
      }
    },
    {
      connection: redisConnection(),
      settings: {
        backoffStrategy: webhookBackoff,
      },
    },
  );

  worker.on('failed', async (job, error) => {
    if (!job || !error) return;
    console.error(`Job ${job.id} failed on ${queueName}:`, error.message);

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await moveToDeadLetterQueue(job.data, queueName, error);
    }
  });

  workers.push(worker);
  return worker;
}

export function startWorkers(): void {
  const queueNames = [
    WEBHOOK_QUEUES.critical,
    WEBHOOK_QUEUES.high,
    WEBHOOK_QUEUES.medium,
    WEBHOOK_QUEUES.low,
    WEBHOOK_QUEUES.legacy,
  ];

  for (const name of queueNames) {
    createWebhookWorker(name);
    monitoredQueues.push(new Queue(name, { connection: redisConnection() }));
    console.log(`Webhook worker listening on ${name}`);
  }

  const cleanupWorker = new Worker<ShopCleanupJob>(
    WEBHOOK_QUEUES.cleanup,
    async (job) => handleCleanupJob(job.data),
    { connection: redisConnection() },
  );
  cleanupWorker.on('failed', (job, error) => {
    console.error(`Cleanup job ${job?.id} failed:`, error?.message);
  });
  workers.push(cleanupWorker);
  monitoredQueues.push(
    new Queue(WEBHOOK_QUEUES.cleanup, { connection: redisConnection() }),
  );
  console.log(`Cleanup worker listening on ${WEBHOOK_QUEUES.cleanup}`);
}

export async function refreshQueueMetrics(): Promise<void> {
  for (const queue of monitoredQueues) {
    const counts = await queue.getJobCounts('waiting', 'delayed', 'active');
    const depth =
      (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
    queueDepth.set({ queue: queue.name }, depth);
  }
}

export async function shutdownWorkers(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(monitoredQueues.map((queue) => queue.close()));
  workers.length = 0;
  monitoredQueues.length = 0;
}
