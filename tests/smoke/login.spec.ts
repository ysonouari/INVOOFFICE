import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('window.supabase est chargé', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const exists = await page.evaluate(() => typeof (window as any).supabase !== 'undefined');
    expect(exists).toBe(true);
  });

  test('supabase.createClient() fonctionne', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const works = await page.evaluate(() => {
      try {
        const c = (window as any).supabase.createClient('https://test.supabase.co', 'test');
        return typeof c.auth !== 'undefined';
      } catch { return false; }
    });
    expect(works).toBe(true);
  });

  test('modale connexion visible au clic', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinOverlay')).toBeVisible();
  });

  test('email vide affiche erreur', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await page.fill('#signinEmail', '');
    await page.fill('#signinPassword', 'test');
    await page.click('#signinSubmit');
    const valid = await page.evaluate(() => (document.getElementById('signinEmail') as HTMLInputElement).validity.valid);
    expect(valid).toBe(false);
  });

  test('fermeture modale Échap', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinOverlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#signinOverlay')).toBeHidden();
  });

  test('fermeture modale clic extérieur', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    await expect(page.locator('#signinOverlay')).toBeVisible();
    await page.click('#signinOverlay', { position: { x: 5, y: 5 } });
    await expect(page.locator('#signinOverlay')).toBeHidden();
  });

  test('password visibility toggle', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.click('button[data-action="show-signin"]');
    const input = page.locator('#signinPassword');
    await expect(input).toHaveAttribute('type', 'password');
    await page.click('.lp-password-toggle[data-target="signinPassword"]');
    await expect(input).toHaveAttribute('type', 'text');
  });
});
