import { test, expect } from '@playwright/test';

test.describe('Storage', () => {
  test('localStorage accessible', async ({ page }) => {
    await page.goto('/app');
    const hasStorage = await page.evaluate(() => {
      try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
      catch { return false; }
    });
    expect(hasStorage).toBe(true);
  });

  test('thème persisté', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('fb_theme', 'light'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    await page.evaluate(() => localStorage.setItem('fb_theme', 'dark'));
  });

  test('langue persistée', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('fb_lang', 'ar'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => localStorage.getItem('fb_lang'))).toBe('ar');
    await page.evaluate(() => localStorage.setItem('fb_lang', 'fr'));
  });
});
