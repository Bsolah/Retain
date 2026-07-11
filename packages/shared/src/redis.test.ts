import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  maskRedisUrl,
  parseRedisConnection,
  validateRedisUrl,
} from './redis.js';

describe('validateRedisUrl', () => {
  it('accepts a standard redis URL', () => {
    assert.equal(
      validateRedisUrl('redis://localhost:6380'),
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

  it('masks passwords in logs', () => {
    const masked = maskRedisUrl(
      'redis://default:secret@redis.railway.internal:6379',
    );
    assert.match(
      masked,
      /redis:\/\/default:\*\*\*@redis\.railway\.internal:6379/,
    );
  });
});
