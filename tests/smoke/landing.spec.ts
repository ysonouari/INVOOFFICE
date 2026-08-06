import { test, expect } from '@playwright/test';

test.describe('Landing Page (guest)', () => {
  test('h1 visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('CTA boutons présents', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = page.locator('[data-action="show-signup"], [data-action="show-signin"]');
    await expect(cta.first()).toBeVisible();
    expect(await cta.count()).toBeGreaterThanOrEqual(2);
  });

  test('FAQ accordéon fonctionnel', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const faqButtons = page.locator('#faq button');
    if (await faqButtons.count() > 0) {
      await faqButtons.first().click();
      await expect(faqButtons.first()).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('thème initial défini', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBeDefined();
  });

  test('langue initiale fr', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    expect(lang).toBe('fr');
  });

  test('modale signup accessible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signup"]');
    await expect(page.locator('#signupOverlay')).toBeVisible();
  });

  test('modale signin accessible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinOverlay')).toBeVisible();
  });

  test('signup vers signin', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signup"]');
    await page.click('#switchToSignin');
    await expect(page.locator('#signinOverlay')).toBeVisible();
  });
});
