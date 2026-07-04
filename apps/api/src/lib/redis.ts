import { Redis } from 'ioredis';
import { env } from '../env.js';

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  return redis;
}

export async function connectRedis(): Promise<Redis> {
  const client = getRedis();
  await client.ping();
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }

  redis = undefined;
}
