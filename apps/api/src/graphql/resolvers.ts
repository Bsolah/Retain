import type { Resolvers } from '../generated/graphql.js';
import { version } from '../version.js';

export const resolvers: Resolvers = {
  Query: {
    health: () => ({
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
    }),
  },
};
