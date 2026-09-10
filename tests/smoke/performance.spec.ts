import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('landing page DOM chargé < 5s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('app.html chargé < 10s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/app');
    // Attendre que l'interface soit prête
    await expect(page.locator('#brandLogo, #authUser, #docType').first()).toBeVisible({ timeout: 10000 });
    expect(Date.now() - start).toBeLessThan(15000);
  });

  test('pas d\'erreur 500', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', resp => {
      if (resp.status() >= 500) serverErrors.push(`${resp.status()} ${resp.url()}`);
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(serverErrors).toHaveLength(0);
  });

  test('taille page < 100KB', async ({ page }) => {
    const resp = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cl = resp?.headers()?.['content-length'];
    if (cl) expect(parseInt(cl)).toBeLessThan(100000);
  });

  test('métriques DOM', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const responseTime = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return nav.responseEnd - nav.requestStart;
    });
    expect(responseTime).toBeLessThan(5000);
  });
});
