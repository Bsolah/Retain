import os from 'node:os';
import type { CodegenConfig } from '@graphql-codegen/cli';

// Some environments report 0 CPUs, which breaks graphql-codegen's worker pool.
if (os.cpus().length === 0) {
  Object.defineProperty(os, 'cpus', {
    value: () => [
      {
        model: 'codegen',
        speed: 0,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
    ],
  });
}

const config: CodegenConfig = {
  schema: 'src/graphql/schema.graphql',
  generates: {
    'src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#GraphQLContext',
        useIndexSignature: true,
        enumsAsTypes: true,
        makeResolverTypeCallable: true,
      },
    },
  },
};

export default config;
