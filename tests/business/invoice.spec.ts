import { test, expect } from '@playwright/test';

async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

test.describe('Documents', () => {
  test('sélecteur type document visible', async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('#docType')).toBeVisible();
  });

  test('numérotation initiale non vide', async ({ page }) => {
    await waitAppReady(page);
    const numero = await page.locator('#docNumero').inputValue();
    expect(numero).toBeTruthy();
  });

  test('sélection facture opérationnelle', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#docType').selectOption('facture');
    // Laisse le temps à onDocTypeChange de générer le numéro
    await page.waitForFunction(() => {
      const el = document.getElementById('docNumero') as HTMLInputElement;
      return el && el.value.startsWith('FAC-');
    }, { timeout: 5000 });
    const val = await page.locator('#docNumero').inputValue();
    expect(val).toMatch(/^FAC-/);
  });

  test('sélection devis opérationnelle', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#docType').selectOption('devis');
    await page.waitForFunction(() => {
      const el = document.getElementById('docNumero') as HTMLInputElement;
      return el && el.value.startsWith('DEV-');
    }, { timeout: 5000 });
    const val = await page.locator('#docNumero').inputValue();
    expect(val).toMatch(/^DEV-/);
  });

  test('sélection BL opérationnelle', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#docType').selectOption('bl');
    await page.waitForFunction(() => {
      const el = document.getElementById('docNumero') as HTMLInputElement;
      return el && el.value.startsWith('BL-');
    }, { timeout: 5000 });
    const val = await page.locator('#docNumero').inputValue();
    expect(val).toMatch(/^BL-/);
  });

  test('sélection avoir opérationnelle', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('#docType').selectOption('avoir');
    await page.waitForFunction(() => {
      const el = document.getElementById('docNumero') as HTMLInputElement;
      return el && el.value.startsWith('AV-');
    }, { timeout: 5000 });
    const val = await page.locator('#docNumero').inputValue();
    expect(val).toMatch(/^AV-/);
  });

  test('ajout ligne de document', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('[data-action="add-line"]').click();
    const row = page.locator('#linesBody tr').first();
    await expect(row).toBeVisible({ timeout: 5000 });
  });
});
