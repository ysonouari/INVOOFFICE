import { test, expect } from '@playwright/test';

async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

test.describe('Régression', () => {
  test('app se charge correctement', async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('#brandLogo, #authUser').first()).toBeVisible();
  });

  test('tous les types changent le numéro', async ({ page }) => {
    await waitAppReady(page);
    const select = page.locator('#docType');
    await expect(select).toBeVisible({ timeout: 5000 });

    // Teste facture → devis → facture
    await select.selectOption('devis');
    await page.waitForFunction(() => {
      const el = document.getElementById('docNumero') as HTMLInputElement;
      return el && el.value.startsWith('DEV-');
    }, { timeout: 5000 });

    await select.selectOption('facture');
    await page.waitForFunction(() => {
      const el = document.getElementById('docNumero') as HTMLInputElement;
      return el && el.value.startsWith('FAC-');
    }, { timeout: 5000 });

    const val = await page.locator('#docNumero').inputValue();
    expect(val).toMatch(/^FAC-/);
  });
});
