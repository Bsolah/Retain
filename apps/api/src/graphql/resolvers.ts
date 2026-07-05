import type { Resolvers } from '../generated/graphql.js';
import { version } from '../version.js';
import { contractMutations } from './resolvers/contracts.js';
import { planMutations, planQueries } from './resolvers/plans.js';
import { storefrontQueries } from './resolvers/storefront.js';

const jsonScalar = {
  __serialize(value: unknown) {
    return value;
  },
  __parseValue(value: unknown) {
    return value;
  },
  __parseLiteral(ast: { kind: string; value?: string }) {
    if (ast.kind === 'StringValue' && ast.value) {
      try {
        return JSON.parse(ast.value) as unknown;
      } catch {
        return ast.value;
      }
    }
    return null;
  },
};

export const resolvers = {
  JSON: jsonScalar,
  Query: {
    health: () => ({
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
    }),
    ...planQueries,
    ...storefrontQueries,
  },
  Mutation: {
    ...planMutations,
    ...contractMutations,
  },
} as unknown as Resolvers;
