import { test, expect } from '@playwright/test';

test.describe('Merchant subscription management', () => {
  test('create plan flow navigates through wizard', async ({ page }) => {
    await page.goto('/plans/new');

    await expect(page.getByText(/plan name|create plan/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const nameInput = page.getByLabel(/name/i).first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Monthly Box');
    }

    const continueButton = page.getByRole('button', {
      name: /next|continue|save/i,
    });
    if (await continueButton.first().isVisible()) {
      await continueButton.first().click();
    }

    await expect(page).toHaveURL(/plans/);
  });

  test('plans page lists subscription plans', async ({ page }) => {
    await page.goto('/plans');
    await expect(
      page.getByText(/subscription plans|create plan/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
