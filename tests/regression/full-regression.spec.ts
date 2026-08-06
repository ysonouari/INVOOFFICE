import { test, expect } from '@playwright/test';

test.describe('Régression — Flux métier complets', () => {
  test.setTimeout(180000);

  test('parcours complet: facture → historique → déconnexion', async ({ page }) => {
    console.log('\n▶ Régression : parcours complet');
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    // Vérifier l'interface principale
    await expect(page.locator('#docType')).toBeVisible();
    await expect(page.locator('#clientSelect')).toBeVisible();
    await expect(page.locator('[data-action="add-line"]')).toBeVisible();
    console.log('   ✓ Interface OK');

    // Créer un client si absent
    if (await page.locator('#clientSelect option').filter({ hasText: 'Reg QC' }).count() === 0) {
      console.log('   Création client Reg QC...');
      await page.locator('[data-action="add-client"]').click();
      await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 3000 });
      await page.locator('#cClientNom').fill('Reg QC');
      await page.locator('#cClientTel').fill('0600000000');
      await page.locator('[data-action="save-client"]').click();
      await page.waitForTimeout(800);
    }

    // Sélectionner
    await page.locator('#clientSelect').selectOption({ label: 'Reg QC' });
    await page.evaluate(() => document.getElementById('clientSelect')!.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForTimeout(500);

    // Tester tous les types de document
    const types = ['facture', 'devis', 'bl', 'avoir'];
    for (const type of types) {
      await page.locator('#docType').selectOption(type);
      await page.waitForTimeout(400);
      const num = await page.locator('#docNumero').inputValue();
      const prefix = type === 'facture' ? 'FAC' : type === 'devis' ? 'DEV' : type === 'bl' ? 'BL' : 'AV';
      expect(num).toMatch(new RegExp(`^${prefix}-`));
      console.log(`   ✓ Type ${type} → ${num}`);
    }

    // Historique
    await page.locator('#navHistorique').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#histTableWrap, #view-historique').first()).toBeVisible({ timeout: 5000 });
    console.log('   ✓ Historique accessible');

    // Retour création
    await page.locator('#navNouveau').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-action="add-line"]')).toBeVisible();
    console.log('   ✓ Retour création OK');

    // Infos entreprise
    await page.locator('#navInfos').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#companyModalOverlay')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-action="close-modal"]').first().click();
    await page.waitForTimeout(300);
    console.log('   ✓ Infos entreprise OK');

    // Thème
    await page.locator('#themeToggle').click();
    await page.waitForTimeout(300);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(theme).toBeDefined();
    console.log(`   ✓ Thème: ${theme}`);

    // Déconnexion
    const logoutBtn = page.locator('#authLogout');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL('**/', { timeout: 10000 });
      console.log('   ✓ Déconnexion OK');
    }

    console.log('✅ Régression OK');
  });
});
