import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateFrequencies } from './services/plan-validation.js';

describe('query complexity walker', () => {
  it('does not blow up on circular AST-like objects', async () => {
    const { estimateDocumentComplexity } = await import('./lib/complexity.js');
    const field: Record<string, unknown> = {
      kind: 'Field',
      name: { value: 'plans' },
    };
    const selectionSet: Record<string, unknown> = {
      kind: 'SelectionSet',
      selections: [field],
    };
    field.selectionSet = selectionSet;
    // Circular parent pointer (as in real GraphQL ASTs)
    field.parent = selectionSet;

    const document = {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          selectionSet,
        },
      ],
    };

    assert.equal(estimateDocumentComplexity(document), 1);
  });
});

describe('plan frequency validation', () => {
  it('accepts valid frequencies', () => {
    const result = validateFrequencies([
      { interval: 2, unit: 'week', discountPercent: 15 },
    ]);
    assert.equal(result[0]?.interval, 2);
    assert.equal(result[0]?.unit, 'week');
  });

  it('rejects invalid interval', () => {
    assert.throws(
      () => validateFrequencies([{ interval: 0, unit: 'month' }]),
      /interval/,
    );
  });

  it('rejects invalid unit', () => {
    assert.throws(
      () => validateFrequencies([{ interval: 1, unit: 'fortnight' }]),
      /unit/,
    );
  });
});
