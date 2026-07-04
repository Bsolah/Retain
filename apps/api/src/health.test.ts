import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertQueryComplexity,
  estimateDocumentComplexity,
  MAX_QUERY_COMPLEXITY,
} from './lib/complexity.js';
import { formatGraphQLError } from './lib/errors.js';

describe('api error formatting', () => {
  it('wraps errors as { message, code, extensions }', () => {
    const formatted = formatGraphQLError({
      message: 'Nope',
      extensions: { code: 'BAD_USER_INPUT', field: 'email' },
    });

    assert.equal(formatted.message, 'Nope');
    assert.equal(formatted.code, 'BAD_USER_INPUT');
    assert.equal(formatted.extensions.code, 'BAD_USER_INPUT');
    assert.equal(formatted.extensions.field, 'email');
  });

  it('defaults missing codes to INTERNAL_SERVER_ERROR', () => {
    const formatted = formatGraphQLError({ message: 'boom' });
    assert.equal(formatted.code, 'INTERNAL_SERVER_ERROR');
  });
});

describe('query complexity', () => {
  it('counts fields in a document-like AST', () => {
    const document = {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          selectionSet: {
            kind: 'SelectionSet',
            selections: [
              { kind: 'Field', name: { value: 'health' } },
              { kind: 'Field', name: { value: 'shop' } },
            ],
          },
        },
      ],
    };

    assert.equal(estimateDocumentComplexity(document), 2);
  });

  it('rejects documents above the complexity budget', () => {
    const selections = Array.from({ length: MAX_QUERY_COMPLEXITY + 1 }, () => ({
      kind: 'Field',
      name: { value: 'x' },
    }));

    assert.throws(() => {
      assertQueryComplexity({
        kind: 'Document',
        definitions: [
          {
            kind: 'OperationDefinition',
            selectionSet: { kind: 'SelectionSet', selections },
          },
        ],
      });
    }, /too complex/);
  });
});
