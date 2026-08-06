import { test, expect } from '@playwright/test';

test.describe('Sécurité', () => {
  test('Supabase anon key pas inline', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const hasKey = await page.evaluate(() => {
      for (const s of document.querySelectorAll('script')) {
        if (s.textContent?.includes('SUPABASE_ANON_KEY')) return true;
      }
      return false;
    });
    expect(hasKey).toBe(false);
  });

  test('service role key absente', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const found = await page.evaluate(() => {
      for (const s of document.querySelectorAll('script')) {
        if (s.textContent?.includes('service_role') || s.textContent?.includes('SERVICE_ROLE_KEY')) return true;
      }
      return false;
    });
    expect(found).toBe(false);
  });

  test('input password type password', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinPassword')).toHaveAttribute('type', 'password');
  });

  test('honeypot anti-bot présent', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    const hp = page.locator('#signinWebsite');
    await expect(hp).toHaveAttribute('tabindex', '-1');
    await expect(hp).toHaveAttribute('autocomplete', 'off');
  });

  test('formulaires avec novalidate', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinForm')).toHaveAttribute('novalidate');
  });

  test('admin page a noindex', async ({ request }) => {
    const resp = await request.get('/admin');
    const html = await resp.text();
    expect(html).toContain('noindex');
  });

  test('pas de .env exposé', async ({ request }) => {
    expect((await request.get('/.env')).status()).toBe(404);
    expect((await request.get('/.env.local')).status()).toBe(404);
  });
});
