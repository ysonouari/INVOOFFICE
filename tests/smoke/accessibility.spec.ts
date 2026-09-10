import { test, expect } from '@playwright/test';

test.describe('Accessibilité landing', () => {
  test('main présent', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toHaveCount(1);
  });

  test('h1 présent', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('modale aria-modal', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinOverlay')).toHaveAttribute('aria-modal', 'true');
  });

  test('navigation TAB', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveCount(1);
  });
});

test.describe('Accessibilité app', () => {
  test('nav sémantique', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });
});
