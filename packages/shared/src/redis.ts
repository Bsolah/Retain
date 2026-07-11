export type RedisConnectionConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  /** Dual-stack DNS for Railway private networking (IPv6). */
  family: 0;
  maxRetriesPerRequest: null;
  tls?: {
    rejectUnauthorized: boolean;
  };
};

export function validateRedisUrl(input: string): string {
  const trimmed = input.trim().replace(/^['"]|['"]$/g, '');
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

export function collectRedisUrlCandidates(): string[] {
  const candidates = [
    process.env.REDIS_URL,
    process.env.REDIS_PRIVATE_URL,
    process.env.REDIS_PUBLIC_URL,
  ];

  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim().replace(/^['"]|['"]$/g, '');
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    try {
      resolved.push(validateRedisUrl(trimmed));
      seen.add(trimmed);
    } catch {
      // Ignore invalid fallback entries and keep trying others.
    }
  }

  return resolved;
}

export function redisUrlWithFamily(redisUrl: string): string {
  const url = new URL(validateRedisUrl(redisUrl));
  url.searchParams.set('family', '0');
  return url.toString();
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
    ...(url.protocol === 'rediss:'
      ? { tls: { rejectUnauthorized: false } }
      : {}),
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
