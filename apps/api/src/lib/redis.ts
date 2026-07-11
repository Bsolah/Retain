import {
  collectRedisUrlCandidates,
  maskRedisUrl,
  redisUrlWithFamily,
  sleep,
} from '@retain/shared';
import { Redis, type RedisOptions } from 'ioredis';

let redis: Redis | undefined;
let connectedRedisUrl: string | undefined;

const STARTUP_ATTEMPTS = 8;
const STARTUP_DELAY_MS = 2500;

function createRedisClient(redisUrl: string): Redis {
  const options: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 15_000,
    retryStrategy: (times) => Math.min(times * 250, 2_000),
    ...(redisUrl.startsWith('rediss://')
      ? { tls: { rejectUnauthorized: false } }
      : {}),
  };

  return new Redis(redisUrlWithFamily(redisUrl), options);
}

export function getRedis(): Redis {
  if (!redis) {
    throw new Error(
      'Redis is not connected yet. Call connectRedis() during startup.',
    );
  }

  return redis;
}

export async function connectRedis(): Promise<Redis> {
  if (redis) {
    return redis;
  }

  const candidates = collectRedisUrlCandidates();
  if (candidates.length === 0) {
    throw new Error(
      'No valid Redis URL found. Set REDIS_URL (Railway: REDIS_URL=${{Redis.REDIS_URL}}) and link the Redis service.',
    );
  }

  const failures: string[] = [];

  for (const candidate of candidates) {
    const client = createRedisClient(candidate);

    client.on('error', (error) => {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'Redis client error',
          redisUrl: maskRedisUrl(connectedRedisUrl ?? candidate),
          err: error.message,
        }),
      );
    });

    for (let attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt += 1) {
      try {
        await client.connect();
        await client.ping();
        redis = client;
        connectedRedisUrl = candidate;
        console.info(
          JSON.stringify({
            level: 'info',
            msg: 'Redis connected',
            redisUrl: maskRedisUrl(candidate),
            attempt,
          }),
        );
        return client;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(
          `${maskRedisUrl(candidate)} (attempt ${attempt}/${STARTUP_ATTEMPTS}): ${message}`,
        );

        try {
          client.disconnect();
        } catch {
          // Ignore disconnect errors while retrying another attempt.
        }

        if (attempt < STARTUP_ATTEMPTS) {
          await sleep(STARTUP_DELAY_MS);
          continue;
        }
      }
    }
  }

  throw new Error(
    `Redis connection failed after trying ${candidates.length} URL(s):\n${failures.join('\n')}`,
  );
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
  connectedRedisUrl = undefined;
}
