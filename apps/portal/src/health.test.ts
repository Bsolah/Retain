import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_NAME } from '@retain/shared';

describe('portal scaffold', () => {
  it('exposes the product name', () => {
    assert.equal(APP_NAME, 'Retain: Revenue Multiplier');
  });
});
