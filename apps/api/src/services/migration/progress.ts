import { getRedis } from '../../lib/redis.js';
import type { MigrationStatus } from '@retain/database';

export type MigrationProgress = {
  migrationId: string;
  status: MigrationStatus;
  total: number;
  completed: number;
  failed: number;
  currentStep: string;
  percent: number;
  updatedAt: string;
};

function progressKey(migrationId: string): string {
  return `migration:progress:${migrationId}`;
}

export async function setMigrationProgress(
  progress: MigrationProgress,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    progressKey(progress.migrationId),
    JSON.stringify(progress),
    'EX',
    60 * 60 * 24,
  );
}

export async function getMigrationProgress(
  migrationId: string,
): Promise<MigrationProgress | null> {
  const redis = getRedis();
  const raw = await redis.get(progressKey(migrationId));
  if (!raw) return null;
  return JSON.parse(raw) as MigrationProgress;
}

export function calculatePercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}
