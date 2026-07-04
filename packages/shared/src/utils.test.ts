import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHealthResponse } from './utils.js';

describe('createHealthResponse', () => {
  it('returns an ok health payload', () => {
    const response = createHealthResponse('api');

    assert.equal(response.status, 'ok');
    assert.equal(response.service, 'api');
    assert.equal(typeof response.timestamp, 'string');
  });
});
