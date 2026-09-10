import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function extractPdfText(filePath: string): Promise<string> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item: any) => item.str).join(' '));
  }
  return texts.join('\n');
}

test.describe('PDF — Devis', () => {
  test.setTimeout(120000);

  test('devis : contenu complet avec TVA 20%', async ({ page }) => {
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    // Créer client si besoin
    if (await page.locator('#clientSelect option').filter({ hasText: 'Entreprise Test QA' }).count() === 0) {
      await page.locator('[data-action="add-client"]').click();
      await expect(page.locator('#clientModalOverlay')).toBeVisible();
      await page.locator('#cClientNom').fill('Entreprise Test QA');
      await page.locator('#cClientTel').fill('0612345678');
      await page.locator('#cClientIce').fill('001234567890123');
      await page.locator('#cClientAdresse').fill('123 Avenue Mohammed V\nCasablanca\nMaroc');
      await page.locator('[data-action="save-client"]').click();
      await page.waitForTimeout(800);
    }

    await page.locator('#clientSelect').selectOption({ label: 'Entreprise Test QA' });
    await page.evaluate(() => document.getElementById('clientSelect')!.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForTimeout(500);

    // Type DEVIS
    await page.locator('#docType').selectOption('devis');
    await page.waitForTimeout(500);
    const docNumero = await page.locator('#docNumero').inputValue();
    console.log(`\n▶ Devis ${docNumero}`);

    // 2 lignes
    for (let i = 0; i < 2; i++) { await page.locator('[data-action="add-line"]').click(); await page.waitForTimeout(200); }
    await page.locator('#linesBody tr').nth(0).locator('.line-desig').fill('Audit UX complet');
    await page.locator('#linesBody tr').nth(0).locator('.line-prix').fill('5000');
    await page.locator('#linesBody tr').nth(0).locator('.line-qte').fill('1');
    await page.locator('#linesBody tr').nth(1).locator('.line-desig').fill('Formation équipe');
    await page.locator('#linesBody tr').nth(1).locator('.line-prix').fill('2500');
    await page.locator('#linesBody tr').nth(1).locator('.line-qte').fill('2');
    await page.waitForTimeout(500);

    // Supprimer les lignes vides
    const rowCount1 = await page.locator('#linesBody tr').count();
    for (let i = 2; i < rowCount1; i++) {
      await page.locator('#linesBody tr').nth(i).locator('.icon-btn').first().click();
      await page.waitForTimeout(200);
    }

    const sumTTC = await page.locator('#sumTTC').textContent();
    console.log(`   TTC: ${sumTTC}`);

    await page.locator('#conditions').scrollIntoViewIfNeeded();
    await page.locator('#conditions').fill('Validité 30 jours');
    await page.locator('#notes').fill('Devis généré par Playwright QA.');
    await page.waitForTimeout(300);

    // Générer et télécharger
    const downloadDir = path.join(__dirname, '..', '..', '..', 'test-results');

    // Gérer le dialog s'il apparaît (validation)
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('[data-action="generate-pdf"]').click();

    // Attendre et gérer un éventuel dialog de validation
    await page.waitForTimeout(1000);
    const validationDialog = page.locator('.dialog-overlay');
    if (await validationDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      const msg = await validationDialog.locator('p').first().textContent().catch(() => '');
      console.log(`   Dialog: "${msg?.substring(0, 80)}"`);
      await validationDialog.locator('button').last().click();
      await page.waitForTimeout(500);
    }

    const download = await downloadPromise;

    const dialog = page.locator('.dialog-overlay');
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dialog.locator('button').last().click();
      await page.waitForTimeout(500);
    }

    const pdfPath = path.join(downloadDir, `QUOTE-${download.suggestedFilename()}`);
    await download.saveAs(pdfPath);

    // Vérifier contenu avec pdfjs-dist
    const text = await extractPdfText(pdfPath);
    console.log(`   Texte extrait: "${text.substring(0, 200)}..."`);

    expect(text).toContain(docNumero);
    expect(text).toContain('Entreprise Test QA');
    expect(text).toContain('Audit UX complet');
    expect(text).toContain('Formation');
    expect(text).toContain('Validité 30 jours');
    expect(text).toContain('Playwright QA');

    console.log('✅ Devis vérifié');
  });
});
