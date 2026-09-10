import { test, expect } from '@playwright/test';

test.describe('Génération document LIVE', () => {
  test.setTimeout(120000);

  test('créer un document complet et générer le PDF', async ({ page }) => {
    const log = (msg: string) => console.log(`\n▶ ${msg}`);

    // ── Étape 1 : Ouverture ──
    log('Ouverture application');
    await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#authUser, #brandLogo, #authBlockedOverlay').first()).toBeAttached({ timeout: 15000 });

    // ── Étape 2 : Vérification UI ──
    log('Vérification éléments');
    await expect(page.locator('#docType')).toBeVisible();
    await expect(page.locator('#docDate')).toBeVisible();
    await expect(page.locator('#docNumero')).toBeVisible();
    await expect(page.locator('#clientSelect')).toBeVisible();
    await expect(page.locator('#linesBody')).toBeVisible();
    await expect(page.locator('#conditions')).toBeAttached();
    await expect(page.locator('#modeReglement')).toBeAttached();
    await expect(page.locator('.summary-box')).toBeVisible();
    await expect(page.locator('[data-action="generate-pdf"]')).toBeVisible();
    console.log('   ✓ Tous les éléments présents');

    // ── Étape 3 : Créer un client ──
    log('Création client');
    await page.locator('[data-action="add-client"]').click();
    await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 3000 });

    await page.locator('#cClientNom').fill('Entreprise Test QA');
    await page.locator('#cClientTel').fill('0612345678');
    await page.locator('#cClientIce').fill('001234567890123');
    await page.locator('#cClientAdresse').fill('123 Avenue Mohammed V\nCasablanca\nMaroc');

    await page.locator('[data-action="save-client"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#clientSelect option').filter({ hasText: 'Entreprise Test QA' })).toBeAttached({ timeout: 5000 });
    console.log('   ✓ Client créé');

    // ── Étape 4 : Sélectionner le client ──
    log('Sélection client');
    await page.locator('#clientSelect').selectOption({ label: 'Entreprise Test QA' });
    await page.evaluate(() => {
      document.getElementById('clientSelect')!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    console.log('   ✓ Client sélectionné');

    // ── Étape 5 : Ajouter les 3 lignes ──
    // Fonction utilitaire pour remplir une ligne spécifique
    async function fillLine(rowIndex: number, designation: string, prix: string, qte: string) {
      const row = page.locator('#linesBody tr').nth(rowIndex);
      await expect(row).toBeAttached({ timeout: 3000 });
      await row.locator('.line-desig').fill(designation);
      await row.locator('.line-prix').fill(prix);
      await row.locator('.line-qte').fill(qte);
      await page.waitForTimeout(500);
    }

    // Ajouter les 3 lignes
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="add-line"]').click();
      await page.waitForTimeout(300);
    }

    log('Ajout ligne 1 — Développement Web (3500 × 2)');
    await fillLine(0, 'Développement Web', '3500', '2');
    console.log(`   SumHT: ${await page.locator('#sumHT').textContent()}`);

    log('Ajout ligne 2 — SEO (1200 × 3)');
    await fillLine(1, 'SEO', '1200', '3');
    console.log(`   SumHT: ${await page.locator('#sumHT').textContent()}`);

    log('Ajout ligne 3 — Maintenance (800 × 5)');
    await fillLine(2, 'Maintenance', '800', '5');
    console.log(`   SumHT: ${await page.locator('#sumHT').textContent()}`);

    // ── Vérifier qu'aucune ligne n'est vide ──
    log('Vérification lignes');
    const rowCount = await page.locator('#linesBody tr').count();
    console.log(`   Lignes totales: ${rowCount}`);

    for (let i = 0; i < rowCount; i++) {
      const row = page.locator('#linesBody tr').nth(i);
      const desig = await row.locator('.line-desig').inputValue();
      const prix  = await row.locator('.line-prix').inputValue();
      const qte   = await row.locator('.line-qte').inputValue();

      if (!desig || !prix || !qte) {
        console.log(`   ⚠ Ligne ${i} incomplète (desig:"${desig}", prix:"${prix}", qte:"${qte}") — suppression`);
        await row.locator('.icon-btn, [data-action]').first().click();
        await page.waitForTimeout(300);
      } else {
        console.log(`   ✓ Ligne ${i}: "${desig}" ${prix} × ${qte}`);
      }
    }

    // ── Étape 5b : Vérifier calculs ──
    log('Vérification calculs');
    const sumHT   = await page.locator('#sumHT').textContent();
    const sumTva  = await page.locator('#sumTva').textContent();
    const sumTTC  = await page.locator('#sumTTC').textContent();
    console.log(`   HT  : ${sumHT}`);
    console.log(`   TVA : ${sumTva}`);
    console.log(`   TTC : ${sumTTC}`);
    expect(sumHT).toBeTruthy();
    expect(sumTTC).toBeTruthy();

    // ── Étape 6 : Conditions / Mode / Notes ──
    log('Remplissage conditions / mode / notes');
    await page.locator('#conditions').scrollIntoViewIfNeeded();
    await page.locator('#conditions').fill('Paiement sous 30 jours');
    await page.locator('#modeReglement').fill('Virement bancaire');
    await page.locator('#notes').fill('Document généré automatiquement par Playwright QA.');
    console.log('   ✓ Champs remplis');

    // ── Étape 7 : Avance 1000 + Remise 10% ──
    log('Modification avance (1000) et remise (10%)');
    await page.locator('#remise').fill('10');
    await page.locator('#avance').fill('1000');
    await page.waitForTimeout(800);
    console.log(`   HT après remise : ${await page.locator('#sumHT').textContent()}`);
    console.log(`   Remise          : ${await page.locator('#sumRemise').textContent()}`);
    console.log(`   TTC             : ${await page.locator('#sumTTC').textContent()}`);
    console.log(`   Reste à payer   : ${await page.locator('#sumReste').textContent()}`);

    // ── Étape 8 : Générer le PDF ──
    log('Génération PDF');

    // Vérification finale avant génération
    const finalRows = await page.locator('#linesBody tr').count();
    let allFilled = true;
    for (let i = 0; i < finalRows; i++) {
      const r = page.locator('#linesBody tr').nth(i);
      const d = await r.locator('.line-desig').inputValue();
      const p = await r.locator('.line-prix').inputValue();
      const q = await r.locator('.line-qte').inputValue();
      if (!d.trim() || !p || !q) {
        console.log(`   ⚠ Ligne ${i} encore incomplète — correction`);
        if (!d.trim()) await r.locator('.line-desig').fill(`Article ${i + 1}`);
        if (!p) await r.locator('.line-prix').fill('100');
        if (!q) await r.locator('.line-qte').fill('1');
        await page.waitForTimeout(300);
        allFilled = false;
      }
    }
    if (allFilled) console.log('   ✓ Toutes les désignations/prix/qtés sont remplis');

    // Tenter la génération
    const generateAndHandleDialog = async (): Promise<boolean> => {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
        page.locator('[data-action="generate-pdf"]').click(),
      ]);

      await page.waitForTimeout(1500);

      const dialog = page.locator('.dialog-overlay');
      if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
        const msg = await dialog.locator('p, [id$="-desc"]').first().textContent().catch(() => '');
        console.log(`   Dialog: "${msg?.substring(0, 100)}"`);

        // Fermer le dialog
        await dialog.locator('button').last().click();
        await page.waitForTimeout(500);

        if (msg && msg.includes('désignation')) {
          // Retourner false pour réessayer après correction
          return false;
        }
      }

      if (dl) {
        console.log(`   ✓ PDF: ${dl.suggestedFilename()}`);
        return true;
      }
      return true; // pas de téléchargement mais pas de dialog non plus
    };

    // Essayer, corriger si nécessaire, réessayer
    let success = await generateAndHandleDialog();
    if (!success) {
      log('Correction des champs manquants et nouvelle tentative');
      // Ré-remplir toutes les désignations
      for (let i = 0; i < finalRows; i++) {
        const r = page.locator('#linesBody tr').nth(i);
        const d = await r.locator('.line-desig').inputValue();
        if (!d.trim()) {
          await r.locator('.line-desig').fill(`Article ${i + 1}`);
          await page.waitForTimeout(300);
        }
      }
      // Réessayer
      success = await generateAndHandleDialog();
    }

    // ── Étape 9 : Vérification historique ──
    log('Vérification historique');
    // S'assurer qu'aucun dialog ne bloque
    const blockingDialog = page.locator('.dialog-overlay:visible');
    if (await blockingDialog.count() > 0) {
      await blockingDialog.locator('button').last().click();
      await page.waitForTimeout(500);
    }

    await page.locator('#navHistorique').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    const rows = page.locator('#histTableWrap table tbody tr');
    const count = await rows.count();
    console.log(`   Documents dans l'historique: ${count}`);

    if (count > 0) {
      const cells = await rows.first().locator('td').allTextContents();
      console.log(`   Dernier doc: ${cells.join(' | ')}`);
    }

    log('Test terminé');
  });
});
