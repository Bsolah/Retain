import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('database package', () => {
  it('exports a typed prisma client and domain enums', async () => {
    const mod = await import('./index.js');

    assert.equal(typeof mod.PrismaClient, 'function');
    assert.ok(mod.prisma);
    assert.equal(mod.PlanTier.growth, 'growth');
    assert.equal(mod.ContractStatus.active, 'active');
    assert.equal(mod.HealthStatus.at_risk, 'at_risk');
    assert.equal(mod.InterventionType.cancel_save, 'cancel_save');
  });
});
