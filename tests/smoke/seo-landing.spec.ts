import { test, expect } from '@playwright/test';

test.describe('SEO landing page (guest)', () => {
  test('title unique', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title.length).toBeGreaterThan(10);
    expect(title).toContain('INVOOFFICE');
  });

  test('meta description', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const desc = page.locator('meta[name="description"]');
    const content = await desc.getAttribute('content');
    expect(content!.length).toBeGreaterThan(50);
  });

  test('canonical', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href');
  });

  test('robots meta', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count() > 0) {
      const content = await robots.getAttribute('content');
      if (content) expect(content).toContain('index');
    }
  });

  test('OG tags', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content');
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content');
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content');
  });

  test('JSON-LD', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();
  });

  test('hreflang', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(2);
  });

  test('pages SEO 200', async ({ request }) => {
    const pages = ['/fonctionnalites.html', '/pourquoi-invooffice.html', '/faq.html', '/cgu.html', '/confidentialite.html'];
    for (const p of pages) {
      expect((await request.get(p)).ok(), p).toBe(true);
    }
  });
});
