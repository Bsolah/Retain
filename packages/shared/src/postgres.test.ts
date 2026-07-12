import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePostgresUrlFromEnv, validatePostgresUrl } from './postgres.js';

describe('validatePostgresUrl', () => {
  it('accepts postgresql URLs', () => {
    assert.equal(
      validatePostgresUrl('postgresql://retain:retain@localhost:5433/retain'),
      'postgresql://retain:retain@localhost:5433/retain',
    );
  });

  it('rejects https Railway domains', () => {
    assert.throws(
      () => validatePostgresUrl('https://postgres.up.railway.app'),
      /postgresql:\/\/ or postgres:\/\//,
    );
  });

  it('rejects unresolved Railway references', () => {
    assert.throws(
      () => validatePostgresUrl('${{Postgres.DATABASE_URL}}'),
      /unresolved Railway reference/,
    );
  });
});

describe('resolvePostgresUrlFromEnv', () => {
  it('prefers a valid DATABASE_PUBLIC_URL when DATABASE_URL is invalid', () => {
    const resolved = resolvePostgresUrlFromEnv({
      DATABASE_URL: 'https://wrong.up.railway.app',
      DATABASE_PUBLIC_URL:
        'postgresql://user:pass@host.proxy.rlwy.net:1234/railway',
    });
    assert.equal(
      resolved,
      'postgresql://user:pass@host.proxy.rlwy.net:1234/railway',
    );
  });
});
