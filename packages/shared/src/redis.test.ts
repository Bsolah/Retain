import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectRedisUrlCandidates,
  maskRedisUrl,
  parseRedisConnection,
  redisUrlWithFamily,
  validateRedisUrl,
} from './redis.js';

describe('validateRedisUrl', () => {
  it('accepts a standard redis URL', () => {
    assert.equal(
      validateRedisUrl('redis://localhost:6380'),
      'redis://localhost:6380',
    );
  });

  it('strips surrounding quotes', () => {
    assert.equal(
      validateRedisUrl('"redis://localhost:6380"'),
      'redis://localhost:6380',
    );
  });

  it('rejects empty values', () => {
    assert.throws(() => validateRedisUrl(''), /REDIS_URL is required/);
  });

  it('rejects malformed URLs that would hit a unix socket', () => {
    assert.throws(() => validateRedisUrl('/'), /redis:\/\/ or rediss:\/\//);
    assert.throws(() => validateRedisUrl('redis://'), /hostname/);
  });
});

describe('collectRedisUrlCandidates', () => {
  it('deduplicates fallback URLs', () => {
    const original = { ...process.env };
    process.env.REDIS_URL = 'redis://primary:6379';
    process.env.REDIS_PRIVATE_URL = 'redis://primary:6379';
    process.env.REDIS_PUBLIC_URL = 'redis://public:6379';

    try {
      assert.deepEqual(collectRedisUrlCandidates(), [
        'redis://primary:6379',
        'redis://public:6379',
      ]);
    } finally {
      process.env = original;
    }
  });
});

describe('parseRedisConnection', () => {
  it('enables dual-stack DNS for Railway', () => {
    const config = parseRedisConnection(
      'redis://default:secret@redis.railway.internal:6379',
    );

    assert.equal(config.host, 'redis.railway.internal');
    assert.equal(config.port, 6379);
    assert.equal(config.password, 'secret');
    assert.equal(config.family, 0);
    assert.equal(config.maxRetriesPerRequest, null);
  });

  it('adds TLS options for rediss URLs', () => {
    const config = parseRedisConnection(
      'rediss://default:secret@proxy.rlwy.net:6379',
    );
    assert.deepEqual(config.tls, { rejectUnauthorized: false });
  });

  it('masks passwords in logs', () => {
    const masked = maskRedisUrl(
      'redis://default:secret@redis.railway.internal:6379',
    );
    assert.match(
      masked,
      /redis:\/\/default:\*\*\*@redis\.railway\.internal:6379/,
    );
  });

  it('appends family=0 to redis URLs', () => {
    assert.match(
      redisUrlWithFamily('redis://default:secret@redis.railway.internal:6379'),
      /family=0$/,
    );
  });
});
