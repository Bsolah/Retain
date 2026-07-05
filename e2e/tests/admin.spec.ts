import { test, expect } from '@playwright/test';

test.describe('Admin dashboard & AI', () => {
  test('dashboard loads analytics overview', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(
      page.getByText(/dashboard|revenue|subscribers|overview/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('retention cohorts page loads', async ({ page }) => {
    await page.goto('/cohorts');

    await expect(
      page.getByText(/retention|cohort|subscriber/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('AI performance page loads risk metrics', async ({ page }) => {
    await page.goto('/ai');

    await expect(
      page.getByText(/ai|intervention|risk|performance/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
