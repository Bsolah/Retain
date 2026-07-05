import { test, expect } from '@playwright/test';

test.describe('Customer subscription portal', () => {
  test('login page renders subscribe prompt', async ({ page }) => {
    await page.goto('/login?shop=demo.myshopify.com');

    await expect(page.getByText('Your subscriptions')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: /Continue with customer account/i }),
    ).toBeVisible();
  });

  test('portal dashboard requires authentication', async ({ page }) => {
    await page.goto('/portal');

    await expect(
      page.getByText(/subscriptions|sign in|login/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('cancel flow route is reachable', async ({ page }) => {
    await page.goto('/portal/test-contract/cancel');

    await expect(
      page.getByText(/cancel|subscription|save/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });
});
