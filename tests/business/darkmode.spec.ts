import { test, expect } from '@playwright/test';

test.describe('Dark mode', () => {
  test('landing page charge avec data-theme', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBeDefined();
  });

  test('toggle thème fonctionnel', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('#themeToggle').click();
    await expect(async () => {
      const after = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(after).not.toBe(before);
    }).toPass({ timeout: 5000 });
  });

  test('app.html a thème défini', async ({ page }) => {
    await page.goto('/app');
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBeDefined();
  });

  test('meta theme-color change avec le thème', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const before = await page.locator('meta[name="theme-color"]').getAttribute('content');
    await page.locator('#themeToggle').click();
    await expect(page.locator('meta[name="theme-color"]')).not.toHaveAttribute('content', before!, { timeout: 3000 });
  });
});
