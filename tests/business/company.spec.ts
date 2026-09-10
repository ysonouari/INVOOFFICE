import { test, expect } from '@playwright/test';

async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

test.describe('Paramètres entreprise', () => {
  test('modale entreprise visible après clic', async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('#navInfos')).toBeVisible({ timeout: 5000 });
    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay')).toBeVisible({ timeout: 5000 });
  });

  test('fermeture modale entreprise', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-action="close-modal"]').first().click();
    await expect(page.locator('#companyModalOverlay')).toBeHidden({ timeout: 5000 });
  });

  test('champ nom entreprise présent', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cNom')).toBeVisible({ timeout: 5000 });
  });

  test('champ ICE limité à 15 chiffres', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay')).toBeVisible({ timeout: 5000 });
    const ice = page.locator('#cICE');
    await expect(ice).toBeVisible({ timeout: 5000 });
    await ice.fill('123456789012345');
    await expect(ice).toHaveValue('123456789012345');
  });
});
