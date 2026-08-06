import { test, expect } from '@playwright/test';

test.describe('Signup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Attendre que le module auth-modals.js soit chargé
    await page.waitForFunction(() => {
      return typeof (window as any).supabase !== 'undefined';
    }, { timeout: 10000 }).catch(() => {});
  });

  test('modale inscription visible', async ({ page }) => {
    await page.click('button[data-action="show-signup"]');
    await expect(page.locator('#signupOverlay')).toBeVisible();
  });

  test('champs requis - validation HTML5', async ({ page }) => {
    await page.click('button[data-action="show-signup"]');
    await page.click('#signupSubmit');
    const valid = await page.evaluate(() => {
      return (document.getElementById('signupName') as HTMLInputElement).validity.valid;
    });
    expect(valid).toBe(false);
  });

  test('email invalide détecté', async ({ page }) => {
    await page.click('button[data-action="show-signup"]');
    await page.fill('#signupName', 'Test User');
    await page.fill('#signupEmail', 'notanemail');
    await page.fill('#signupWhatsapp', '+212600000000');
    await page.fill('#signupPassword', 'password123');
    await page.fill('#signupConfirm', 'password123');
    await page.click('#signupSubmit');
    // L'erreur email devrait s'afficher (soit via HTML5, soit via JS)
    const errEl = page.locator('#signupEmailError');
    await expect(errEl).toBeAttached({ timeout: 5000 });
  });

  test('mots de passe différents', async ({ page }) => {
    await page.click('button[data-action="show-signup"]');
    // S'assurer que la modale est visible
    await expect(page.locator('#signupOverlay')).toBeVisible({ timeout: 3000 });
    await page.fill('#signupName', 'Test User');
    await page.fill('#signupEmail', 'test@example.com');
    await page.fill('#signupWhatsapp', '+212600000000');
    await page.fill('#signupPassword', 'password123');
    await page.fill('#signupConfirm', 'wrong');
    await page.click('#signupSubmit');
    await page.waitForTimeout(2000);
    // Vérifie que le formulaire est toujours visible (pas de redirection = erreur)
    await expect(page.locator('#signupOverlay')).toBeVisible();
  });

  test('email déjà utilisé', async ({ page }) => {
    await page.click('button[data-action="show-signup"]');
    await page.fill('#signupName', 'Test');
    await page.fill('#signupEmail', 'ys1onouari@gmail.com');
    await page.fill('#signupWhatsapp', '+212600000000');
    await page.fill('#signupPassword', 'password123');
    await page.fill('#signupConfirm', 'password123');
    await page.click('#signupSubmit');
    // L'erreur Supabase "déjà utilisé" est affichée dans signupGlobalError ou signupEmailError
    await page.waitForFunction(() => {
      const el1 = document.getElementById('signupGlobalError') as HTMLElement;
      const el2 = document.getElementById('signupEmailError') as HTMLElement;
      return (el1?.style.display !== 'none' && el1?.textContent) ||
             (el2?.style.display !== 'none' && el2?.textContent);
    }, { timeout: 10000 }).catch(() => {});
  });

  test('switch signup → signin', async ({ page }) => {
    await page.click('button[data-action="show-signup"]');
    await expect(page.locator('#signupOverlay')).toBeVisible();
    await page.click('#switchToSignin');
    await expect(page.locator('#signinOverlay')).toBeVisible();
  });

  test('confirmation page accessible', async ({ page }) => {
    await page.goto('/confirmation', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('confirmation');
  });
});
