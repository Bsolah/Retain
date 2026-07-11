import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { MercuriusOptions } from 'mercurius';
import { buildContext } from './context.js';
import { env } from './env.js';
import { resolvers } from './graphql/resolvers.js';
import { assertQueryComplexity } from './lib/complexity.js';
import { mercuriusErrorFormatter } from './lib/errors.js';

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'graphql/schema.graphql',
);

/** Schema-first GraphQL SDL loaded for Mercurius. */
export const typeDefs = readFileSync(schemaPath, 'utf8');

export const mercuriusConfig = {
  schema: typeDefs,
  resolvers,
  context: buildContext,
  graphiql: env.NODE_ENV !== 'production',
  jit: 1,
  errorFormatter: mercuriusErrorFormatter,
} as unknown as MercuriusOptions;

export async function registerQueryComplexityHook(
  app: FastifyInstance,
): Promise<void> {
  app.graphql.addHook('preExecution', async (_schema, document) => {
    try {
      assertQueryComplexity(document);
    } catch (error) {
      return { errors: [error as Error] };
    }
  });
}

export { resolvers };
