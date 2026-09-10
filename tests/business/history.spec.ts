import { test, expect } from '@playwright/test';

async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

test.describe('Historique', () => {
  test('vue historique accessible', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#navHistorique').click();
    await expect(page.locator('#view-historique')).toBeVisible({ timeout: 5000 });
  });

  test('recherche dans historique', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#navHistorique').click();
    await expect(page.locator('#histSearch')).toBeVisible({ timeout: 5000 });
    await page.locator('#histSearch').fill('test');
  });

  test('retour vue création', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#navHistorique').click();
    await expect(page.locator('#view-historique')).toBeVisible({ timeout: 5000 });
    await page.locator('#navNouveau').click();
    await expect(page.locator('#view-nouveau')).toBeVisible({ timeout: 5000 });
  });
});
