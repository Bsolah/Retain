import { maskRedisUrl, parseRedisConnection } from '@retain/shared';
import { Redis } from 'ioredis';
import { env } from '../env.js';

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      ...parseRedisConnection(env.REDIS_URL),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('error', (error) => {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'Redis client error',
          redisUrl: maskRedisUrl(env.REDIS_URL),
          err: error.message,
        }),
      );
    });
  }

  return redis;
}

export async function connectRedis(): Promise<Redis> {
  const client = getRedis();

  try {
    await client.connect();
    await client.ping();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Redis connection failed for ${maskRedisUrl(env.REDIS_URL)}: ${message}`,
    );
  }

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
