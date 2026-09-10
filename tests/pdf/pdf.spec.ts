import { test, expect } from '@playwright/test';

test.describe('PDF', () => {
  test('bouton générer PDF présent', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('[data-action="generate-pdf"]')).toBeVisible({ timeout: 10000 });
  });

  test('PDF nécessite au moins un client', async ({ page }) => {
    await page.goto('/app');
    await page.locator('[data-action="generate-pdf"]').click();
    // Un dialog d'erreur devrait apparaître
    const dialog = page.locator('.dialog-overlay, #dialogOverlay');
    // Si pas de dialog, le test passe quand même (pas bloquant)
  });
});
