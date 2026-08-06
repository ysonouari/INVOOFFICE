import { test, expect } from '@playwright/test';

// Helper : attend que l'app soit prête
async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  // Attendre que l'auth check + init modules soient terminés
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

test.describe('Clients', () => {
  test('ouverture modale ajout client', async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('[data-action="add-client"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-action="add-client"]').click();
    await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 5000 });
  });

  test('ouverture gestion clients', async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('[data-action="manage-clients"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-action="manage-clients"]').click();
    await expect(page.locator('#clientManagerOverlay')).toBeAttached({ timeout: 5000 });
  });

  test('client select visible', async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('#clientSelect')).toBeVisible({ timeout: 5000 });
  });
});
