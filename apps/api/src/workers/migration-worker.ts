import { Worker } from 'bullmq';
import {
  MIGRATION_QUEUES,
  parseRedisConnection,
  type MigrationCutoverJob,
  type MigrationSyncJob,
} from '@retain/shared';
import { prisma } from '@retain/database';
import { env } from '../env.js';
import { runMigrationCutover } from '../services/migration/cutover.js';
import { runMigrationSync } from '../services/migration/sync.js';

let syncWorker: Worker | undefined;
let cutoverWorker: Worker | undefined;

function redisConnection() {
  return parseRedisConnection(env.REDIS_URL);
}

export function startMigrationWorkers(): void {
  if (syncWorker) return;

  syncWorker = new Worker<MigrationSyncJob>(
    MIGRATION_QUEUES.sync,
    async (job) => {
      const shop = await prisma.shop.findUnique({
        where: { id: job.data.shopId },
      });
      if (!shop) throw new Error('Shop not found for migration sync');
      await runMigrationSync(shop, job.data.migrationId);
    },
    { connection: redisConnection() },
  );

  cutoverWorker = new Worker<MigrationCutoverJob>(
    MIGRATION_QUEUES.cutover,
    async (job) => {
      const shop = await prisma.shop.findUnique({
        where: { id: job.data.shopId },
      });
      if (!shop) throw new Error('Shop not found for migration cutover');
      await runMigrationCutover(shop, job.data.migrationId);
    },
    { connection: redisConnection() },
  );

  syncWorker.on('failed', (job, error) => {
    console.error(`Migration sync job ${job?.id} failed:`, error?.message);
  });
  cutoverWorker.on('failed', (job, error) => {
    console.error(`Migration cutover job ${job?.id} failed:`, error?.message);
  });

  console.log('Migration workers started');
}

export async function stopMigrationWorkers(): Promise<void> {
  await Promise.all([syncWorker?.close(), cutoverWorker?.close()]);
  syncWorker = undefined;
  cutoverWorker = undefined;
}
