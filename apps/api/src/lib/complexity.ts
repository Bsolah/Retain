export const MAX_QUERY_COMPLEXITY = 1000;

type AstNode = {
  kind?: string;
  [key: string]: unknown;
};

/**
 * Estimate query complexity by counting fields in the operation AST.
 * Uses a plain object walk so we never mix GraphQL package realms
 * (pnpm can install parallel `graphql` copies used by Mercurius vs app code).
 */
export function estimateDocumentComplexity(document: unknown): number {
  return walk(document);
}

function walk(node: unknown): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  if (Array.isArray(node)) {
    return node.reduce<number>((total, child) => total + walk(child), 0);
  }

  const astNode = node as AstNode;
  let total = astNode.kind === 'Field' ? 1 : 0;

  for (const value of Object.values(astNode)) {
    total += walk(value);
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
