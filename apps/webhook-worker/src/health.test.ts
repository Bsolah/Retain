import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHealthResponse } from '@retain/shared';

describe('webhook-worker health', () => {
  it('returns a 200-compatible payload', () => {
    const response = createHealthResponse('webhook-worker');

    assert.equal(response.status, 'ok');
    assert.equal(response.service, 'webhook-worker');
  });
});
