import { maskRedisUrl, parseRedisConnection } from '@retain/shared';
import { Redis } from 'ioredis';
import { env } from '../env.js';

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      ...parseRedisConnection(env.REDIS_URL),
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

export function redisConnection() {
  return parseRedisConnection(env.REDIS_URL);
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = undefined;
  }
}
