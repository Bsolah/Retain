/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: {
    '^@retain/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@retain/shared$': '<rootDir>/../../packages/shared/dist/index.js',
    '^.+/factories/shop\\.js$': '<rootDir>/../../factories/shop.ts',
    '^\\.\\./\\.\\./\\.\\./graphql/auth\\.js$': '<rootDir>/src/graphql/auth.ts',
    '^\\.\\./\\.\\./\\.\\./context\\.js$': '<rootDir>/src/context.ts',
    '^\\.\\./\\.\\./\\.\\./lib/encryption\\.js$': '<rootDir>/src/lib/encryption.ts',
    '^\\.\\./\\.\\./\\.\\./middleware/session\\.js$':
      '<rootDir>/src/middleware/session.ts',
    '^\\.\\./\\.\\./\\.\\./services/shopify-client\\.js$':
      '<rootDir>/src/services/shopify-client.ts',
    '^\\.\\./\\.\\./\\.\\./services/billing-scheduler\\.js$':
      '<rootDir>/src/services/billing-scheduler.ts',
    '^\\.\\./\\.\\./\\.\\./\\.\\./graphql/resolvers/plans\\.js$':
      '<rootDir>/src/graphql/resolvers/plans.ts',
    '^\\.\\./\\.\\./\\.\\./\\.\\./graphql/plan-mapper\\.js$':
      '<rootDir>/src/graphql/plan-mapper.ts',
    '^(\\.\\./)+lib/graphql-errors\\.js$': '<rootDir>/src/lib/graphql-errors.ts',
    '^(\\.\\./)+services/plan-validation\\.js$':
      '<rootDir>/src/services/plan-validation.ts',
    '^(\\.\\./)+services/catalog\\.js$': '<rootDir>/src/services/catalog.ts',
    '^(\\.\\./)+services/selling-plans\\.js$':
      '<rootDir>/src/services/selling-plans.ts',
    '^(\\.\\./)+services/storefront-widget\\.js$':
      '<rootDir>/src/services/storefront-widget.ts',
    '^(\\.\\./)+services/billing-policy\\.js$':
      '<rootDir>/src/services/billing-policy.ts',
    '^(\\.\\./)+services/events\\.js$': '<rootDir>/src/services/events.ts',
    '^(\\.\\./)+services/dunning\\.js$': '<rootDir>/src/services/dunning.ts',
    '^(\\.\\./)+env\\.js$': '<rootDir>/src/env.ts',
    '^(\\.\\./)+lib/encryption\\.js$': '<rootDir>/src/lib/encryption.ts',
    '^(\\.\\./)+graphql/auth\\.js$': '<rootDir>/src/graphql/auth.ts',
    '^(\\.\\./)+graphql/plan-mapper\\.js$': '<rootDir>/src/graphql/plan-mapper.ts',
    '^(\\.\\./)+generated/graphql\\.js$': '<rootDir>/src/generated/graphql.ts',
    '^(\\.\\./)+version\\.js$': '<rootDir>/src/version.ts',
    '^\\./shopify-client\\.js$': '<rootDir>/src/services/shopify-client.ts',
    // Do not map '^\\./billing-policy\\.js$' — it hijacks @retain/shopify-admin internals.
    '^\\.\\./billing-policy\\.js$': '<rootDir>/src/services/billing-policy.ts',
    '^(\\.\\./)+services/billing-policy\\.js$':
      '<rootDir>/src/services/billing-policy.ts',
    '^\\./events\\.js$': '<rootDir>/src/services/events.ts',
    '^\\./dunning\\.js$': '<rootDir>/src/services/dunning.ts',
    '^(\\.\\./)+auth\\.js$': '<rootDir>/src/graphql/auth.ts',
    '^(\\.\\./){3}middleware/shopify\\.js$': '<rootDir>/src/middleware/shopify.ts',
    '^(\\.\\./){3}lib/portal-shop\\.js$': '<rootDir>/src/lib/portal-shop.ts',
    '^(\\.\\./)+middleware/shopify\\.js$': '<rootDir>/src/middleware/shopify.ts',
    '^(\\.\\./)+lib/portal-shop\\.js$': '<rootDir>/src/lib/portal-shop.ts',
    '^\\.\\./plan-mapper\\.js$': '<rootDir>/src/graphql/plan-mapper.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
  setupFiles: ['<rootDir>/src/test/jest.env.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testMatch: ['<rootDir>/src/__tests__/unit/**/*.test.ts'],
  collectCoverageFrom: [
    'src/graphql/auth.ts',
    'src/graphql/resolvers/plans.ts',
    'src/graphql/plan-mapper.ts',
    'src/middleware/session.ts',
    'src/services/shopify-client.ts',
    'src/services/billing-scheduler.ts',
    'src/services/billing-policy.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      lines: 40,
      branches: 20,
      functions: 40,
      statements: 40,
    },
  },
  testTimeout: 15_000,
};
