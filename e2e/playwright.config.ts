import { defineConfig, devices } from '@playwright/test';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5173';
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:5174';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'merchant',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
    },
    {
      name: 'customer',
      use: { ...devices['Desktop Chrome'], baseURL: PORTAL_URL },
    },
    {
      name: 'admin-dashboard',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : [
        {
          command: 'pnpm --filter @retain/api dev',
          url: `${API_URL}/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter @retain/admin dev',
          url: ADMIN_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter @retain/portal dev',
          url: PORTAL_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
