export const MAX_QUERY_COMPLEXITY = 1000;

/** Only follow these keys — GraphQL AST nodes often have circular `loc`/`parent` links. */
const WALK_KEYS = new Set([
  'definitions',
  'selectionSet',
  'selections',
  'arguments',
  'directives',
  'selectionSet',
  'variableDefinitions',
  'operation',
  'type',
  'typeCondition',
  'fields',
  'values',
  'value',
]);

/**
 * Estimate query complexity by counting Field nodes.
 * Uses a visited set and allowlisted keys to avoid circular AST references.
 */
export function estimateDocumentComplexity(document: unknown): number {
  const visited = new WeakSet<object>();
  return walk(document, visited);
}

function walk(node: unknown, visited: WeakSet<object>): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  if (visited.has(node)) {
    return 0;
  }
  visited.add(node);

  if (Array.isArray(node)) {
    return node.reduce<number>(
      (total, child) => total + walk(child, visited),
      0,
    );
  }

  const record = node as Record<string, unknown>;
  let total = record.kind === 'Field' ? 1 : 0;

  for (const [key, value] of Object.entries(record)) {
    if (!WALK_KEYS.has(key)) {
      continue;
    }
    total += walk(value, visited);
  }

  return total;
}

export function assertQueryComplexity(document: unknown): void {
  const complexity = estimateDocumentComplexity(document);

  if (complexity > MAX_QUERY_COMPLEXITY) {
    const error = new Error(
      `Query is too complex: ${complexity}. Maximum allowed complexity is ${MAX_QUERY_COMPLEXITY}.`,
    ) as Error & { extensions: Record<string, unknown> };

    error.extensions = {
      code: 'QUERY_TOO_COMPLEX',
      complexity,
      maxComplexity: MAX_QUERY_COMPLEXITY,
    };

    throw error;
  }
}
