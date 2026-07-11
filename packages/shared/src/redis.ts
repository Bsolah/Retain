export type RedisConnectionConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  /** Dual-stack DNS for Railway private networking (IPv6). */
  family: 0;
  maxRetriesPerRequest: null;
  tls?: Record<string, never>;
};

export function validateRedisUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(
      'REDIS_URL is required. On Railway, link the Redis plugin and set REDIS_URL=${{Redis.REDIS_URL}}.',
    );
  }

  if (!trimmed.startsWith('redis://') && !trimmed.startsWith('rediss://')) {
    throw new Error(
      `REDIS_URL must start with redis:// or rediss:// (got "${trimmed.slice(0, 48)}").`,
    );
  }

  const url = new URL(trimmed);
  if (!url.hostname) {
    throw new Error(
      'REDIS_URL must include a hostname (for example redis://localhost:6379).',
    );
  }

  return trimmed;
}

export function parseRedisConnection(redisUrl: string): RedisConnectionConfig {
  const url = new URL(validateRedisUrl(redisUrl));

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    family: 0,
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function maskRedisUrl(redisUrl: string): string {
  try {
    const url = new URL(redisUrl);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '<invalid-redis-url>';
  }
}
