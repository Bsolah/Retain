import { Queue } from 'bullmq';
import {
  MIGRATION_QUEUES,
  type MigrationCutoverJob,
  type MigrationSyncJob,
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

export async function enqueueMigrationSync(
  job: MigrationSyncJob,
): Promise<void> {
  await getQueue(MIGRATION_QUEUES.sync).add('migration-sync', job, {
    jobId: `sync:${job.migrationId}`,
    removeOnComplete: 500,
    removeOnFail: 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
}

export async function enqueueMigrationCutover(
  job: MigrationCutoverJob,
): Promise<void> {
  await getQueue(MIGRATION_QUEUES.cutover).add('migration-cutover', job, {
    jobId: `cutover:${job.migrationId}`,
    removeOnComplete: 500,
    removeOnFail: 1000,
    attempts: 2,
    backoff: { type: 'exponential', delay: 60_000 },
  });
}

export function getMigrationSyncQueue(): Queue {
  return getQueue(MIGRATION_QUEUES.sync);
}

export function getMigrationCutoverQueue(): Queue {
  return getQueue(MIGRATION_QUEUES.cutover);
}
