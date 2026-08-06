import { test, expect } from '@playwright/test';

test.describe('Dashboard (auth via storageState)', () => {

  test('utilisateur connecté affiché', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#authUser')).toBeVisible({ timeout: 15000 });
  });

  test('menu navigation visible', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#navNouveau')).toBeVisible({ timeout: 15000 });
  });

  test('sélection type document', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    const select = page.locator('#docType');
    await expect(select).toBeVisible({ timeout: 15000 });
    await select.selectOption('devis');
    // L'événement change met à jour le numéro
    await expect(page.locator('#docNumero')).not.toHaveValue('', { timeout: 5000 });
  });

  test('ajout ligne facture', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    const addBtn = page.locator('[data-action="add-line"]');
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();
    await expect(page.locator('#linesBody tr').first()).toBeVisible({ timeout: 5000 });
  });

  test('logo entreprise visible', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#brandLogo')).toBeVisible({ timeout: 15000 });
  });

  test('année footer correcte', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#footerYear')).toHaveText(new Date().getFullYear().toString(), { timeout: 15000 });
  });
});

// Test de déconnexion isolé en dernier (ne doit pas invalider les autres tests)
test.describe('Déconnexion', () => {
  test('logout redirige vers /', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    const logoutBtn = page.locator('#authLogout');
    await expect(logoutBtn).toBeVisible({ timeout: 15000 });
    // Sauvegarder l'URL d'origine
    await logoutBtn.click();
    await page.waitForURL('**/', { timeout: 15000 });
    expect(page.url()).not.toContain('/app');
  });
});
