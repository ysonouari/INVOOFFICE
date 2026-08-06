import { test, expect } from '@playwright/test';

test.describe('PWA & Service Worker', () => {
  test('manifest.json accessible', async ({ request }) => {
    expect((await request.get('/manifest.json')).status()).toBeLessThan(500);
  });

  test('manifest a les icônes requises', async ({ request }) => {
    const resp = await request.get('/manifest.json');
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.icons.length).toBeGreaterThanOrEqual(2);
      expect(body.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
    }
  });

  test('sw.js accessible', async ({ request }) => {
    expect((await request.get('/sw.js')).ok()).toBe(true);
  });

  test('robots.txt accessible', async ({ request }) => {
    expect((await request.get('/robots.txt')).ok()).toBe(true);
  });

  test('sitemap.xml accessible', async ({ request }) => {
    expect((await request.get('/sitemap.xml')).ok()).toBe(true);
  });

  test('app.html a meta theme-color', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', { timeout: 10000 });
  });
});
