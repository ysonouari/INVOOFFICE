import { test, expect } from '@playwright/test';

test.describe('SEO (app)', () => {
  test('app.html meta title correct', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('title')).not.toBeEmpty();
  });
});
