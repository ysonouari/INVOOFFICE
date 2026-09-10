import { test, expect } from '@playwright/test';

const PUBLIC_PAGES = [
  '/',
  '/fonctionnalites.html',
  '/pourquoi-invooffice.html',
  '/faq.html',
  '/cgu.html',
  '/confidentialite.html',
  '/blog/index.html',
  '/blog/facturation/index.html',
  '/blog/facturation/comment-creer-facture-conforme-maroc.html',
  '/blog/auto-entrepreneur/facturation-auto-entrepreneur-guide.html',
];

const EXPECTED_CANONICAL: Record<string, string> = {
  '/': '/',
  '/fonctionnalites.html': '/fonctionnalites.html',
  '/pourquoi-invooffice.html': '/pourquoi-invooffice.html',
  '/faq.html': '/faq.html',
  '/cgu.html': '/cgu.html',
  '/confidentialite.html': '/confidentialite.html',
  '/blog/index.html': '/blog/',
  '/blog/facturation/index.html': '/blog/facturation/',
  '/blog/facturation/comment-creer-facture-conforme-maroc.html': '/blog/facturation/comment-creer-facture-conforme-maroc.html',
  '/blog/auto-entrepreneur/facturation-auto-entrepreneur-guide.html': '/blog/auto-entrepreneur/facturation-auto-entrepreneur-guide.html',
};

const EVERGREEN = ['/fonctionnalites.html', '/pourquoi-invooffice.html', '/cgu.html', '/confidentialite.html'];

const PRIVATE_PATHS = ['/app', '/admin', '/confirmation'];

const MUST_NOT_BE_IN_SITEMAP = ['/app', '/admin', '/confirmation', '/template-article'];

test.describe('SEO architecture (publique)', () => {
  for (const pagePath of PUBLIC_PAGES) {
    test(`métadonnées complètes — ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath, { waitUntil: 'domcontentloaded' });

      const title = await page.title();
      expect(title.length).toBeGreaterThan(10);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute('href', 'https://www.invooffice.com' + EXPECTED_CANONICAL[pagePath]);

      const description = page.locator('meta[name="description"]');
      if (await description.count() > 0) {
        const content = (await description.getAttribute('content')) || '';
        expect(content.length).toBeGreaterThan(50);
        expect(content.length).toBeLessThanOrEqual(165);
      }

      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /./);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /./);
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', /./);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image-1200x630\.png/);
      await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
      await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /og-image-1200x630\.png/);

      const robots = page.locator('meta[name="robots"]');
      if (await robots.count() > 0) {
        expect((await robots.getAttribute('content')) || '').toContain('index');
      }
    });
  }

  test('H1 unique et cohérent — landing', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const h1s = page.locator('h1');
    expect(await h1s.count()).toBe(1);
    await expect(h1s.first()).toContainText('simplement');
  });

  test('pas de placeholder public', async ({ page }) => {
    for (const pagePath of PUBLIC_PAGES) {
      const response = await page.request.get(pagePath);
      expect(response.ok(), pagePath).toBe(true);
      const html = await response.text();
      expect(html, pagePath).not.toContain('{{PLACEHOLDER}}');
      expect(html, pagePath).not.toContain('{{TITLE}}');
    }
  });

  for (const pagePath of EVERGREEN) {
    test(`og:type=website (evergreen) — ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    });
  }

  test('JSON-LD landing — organisation, site et offre', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();
    expect(count).toBeGreaterThanOrEqual(3);

    const types: string[] = [];
    for (let i = 0; i < count; i++) {
      const raw = await scripts.nth(i).textContent();
      if (!raw) continue;
      try {
        const json = JSON.parse(raw);
        types.push(json['@type']);
        if (json['@type'] === 'WebApplication') {
          expect(json.offers).toBeDefined();
          expect(json.offers.price).toBeDefined();
          expect(json.offers.priceCurrency).toBe('MAD');
        }
      } catch {
        throw new Error(`JSON-LD invalide au script ${i}`);
      }
    }
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
    expect(types).toContain('WebApplication');
  });

  test('templates et pages privées hors sitemap', async ({ request }) => {
    const indexResponse = await request.get('/sitemap.xml');
    expect(indexResponse.ok()).toBe(true);
    const indexText = await indexResponse.text();
    expect(indexText).toContain('sitemap-fr.xml');

    const response = await request.get('/sitemap-fr.xml');
    expect(response.ok()).toBe(true);
    const sitemap = await response.text();

    expect(sitemap).toContain('https://www.invooffice.com/');
    for (const hidden of MUST_NOT_BE_IN_SITEMAP) {
      expect(sitemap, hidden).not.toContain(hidden);
    }

    const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(20);

    for (const clean of urls) {
      const cleanPath = clean.replace('https://www.invooffice.com', '');
      const resp = await request.get(cleanPath);
      expect(resp.ok(), `sitemap → ${cleanPath}`).toBe(true);
    }
  });

  test('robots.txt — sitemap présent, aucune directive morte', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBe(true);
    const robots = await response.text();

    expect(robots).toContain('Sitemap:');
    expect(robots).toContain('sitemap.xml');
    expect(robots).not.toContain('verif-fontsize');

    const disallows = Array.from(robots.matchAll(/^Disallow:\s*(.+)$/gm)).map((m) => m[1].trim());
    for (const d of disallows) {
      expect(d.startsWith('/'), `Disallow non absolu: ${d}`).toBe(true);
      const target = new URL(d, 'http://localhost:3000');
      const resp = await request.get(target.pathname);
      if (resp.ok() && PRIVATE_PATHS.some((p) => d.startsWith(p))) {
        expect(PRIVATE_PATHS.some((p) => d.startsWith(p)), `Disallow ${d} → 200`).toBe(true);
      }
    }
  });

  test('privé — robots noindex des zones non-app (KNOWN DEFERRED: /app)', async ({ request }) => {
    for (const raw of ['/admin/index.html', '/confirmation/index.html']) {
      const resp = await request.get(raw);
      expect(resp.ok(), raw).toBe(true);
      const html = await resp.text();
      expect(html, raw).toMatch(/name="robots" content="noindex/);
    }
  });

  test('404 brandée', async ({ request }) => {
    const response = await request.get('/page-inexistante-xyz');
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).toContain('Page introuvable');
  });

  test('manifest — nom de marque', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.name).toContain('INVOOFFICE');
    expect(json.short_name).toBe('INVOOFFICE');
  });
});