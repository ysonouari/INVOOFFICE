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

test.describe('PDF — Vérification du contenu', () => {
  test.setTimeout(120000);

  test('facture : contenu complet vérifié', async ({ page }) => {
    console.log('\n▶ Génération de la facture');
    await page.goto('/app', { waitUntil: 'networkidle' });
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    // ── Créer un client si nécessaire ──
    const existingClient = page.locator('#clientSelect option').filter({ hasText: 'Entreprise Test QA' });
    if (await existingClient.count() === 0) {
      await page.locator('[data-action="add-client"]').click();
      await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 3000 });
      await page.locator('#cClientNom').fill('Entreprise Test QA');
      await page.locator('#cClientTel').fill('0612345678');
      await page.locator('#cClientIce').fill('001234567890123');
      await page.locator('#cClientAdresse').fill('123 Avenue Mohammed V\nCasablanca\nMaroc');
      await page.locator('[data-action="save-client"]').click();
      await page.waitForTimeout(800);
    }

    // ── Sélectionner le client ──
    await page.locator('#clientSelect').selectOption({ label: 'Entreprise Test QA' });
    await page.evaluate(() => {
      document.getElementById('clientSelect')!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(800);

    // ── S'assurer qu'on est en type "facture" ──
    await page.locator('#docType').selectOption('facture');
    await page.waitForTimeout(500);
    const docNumero = await page.locator('#docNumero').inputValue();
    console.log(`   N° document: ${docNumero}`);

    // ── Ajouter 3 lignes ──
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="add-line"]').click();
      await page.waitForTimeout(200);
    }

    const lignes = [
      { desig: 'Développement Web', prix: '3500', qte: '2' },
      { desig: 'SEO', prix: '1200', qte: '3' },
      { desig: 'Maintenance', prix: '800', qte: '5' },
    ];

    for (let i = 0; i < 3; i++) {
      const row = page.locator('#linesBody tr').nth(i);
      await row.locator('.line-desig').fill(lignes[i].desig);
      await row.locator('.line-prix').fill(lignes[i].prix);
      await row.locator('.line-qte').fill(lignes[i].qte);
      await page.waitForTimeout(300);
    }

    // Supprimer les lignes vides restantes
    const rowCount = await page.locator('#linesBody tr').count();
    for (let i = 3; i < rowCount; i++) {
      await page.locator('#linesBody tr').nth(i).locator('.icon-btn').first().click();
      await page.waitForTimeout(200);
    }

    // ── Remplir conditions / mode / notes ──
    await page.locator('#conditions').scrollIntoViewIfNeeded();
    await page.locator('#conditions').fill('Paiement sous 30 jours');
    await page.locator('#modeReglement').fill('Virement bancaire');
    await page.locator('#notes').fill('Document généré automatiquement par Playwright QA.');
    await page.waitForTimeout(300);

    // ── Avance 1000 + Remise 10% ──
    await page.locator('#remise').fill('10');
    await page.locator('#avance').fill('1000');
    await page.waitForTimeout(800);

    // Récupérer les valeurs calculées
    const sumHT = await page.locator('#sumHT').textContent();
    const sumTva = await page.locator('#sumTva').textContent();
    const sumTTC = await page.locator('#sumTTC').textContent();
    const sumReste = await page.locator('#sumReste').textContent();
    console.log(`   HT: ${sumHT} | TVA: ${sumTva} | TTC: ${sumTTC} | Reste: ${sumReste}`);

    // ── Générer le PDF et le télécharger ──
    const downloadDir = path.join(__dirname, '..', '..', '..', 'test-results');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('[data-action="generate-pdf"]').click();

    // Gérer un éventuel dialog de validation avant le download
    await page.waitForTimeout(1000);
    const validationDialog = page.locator('.dialog-overlay');
    if (await validationDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      const msg = await validationDialog.locator('p').first().textContent().catch(() => '');
      console.log(`   Dialog validation: "${msg?.substring(0, 80)}"`);
      await validationDialog.locator('button').last().click();
      await page.waitForTimeout(500);
    }

    const download = await downloadPromise;

    // Fermer le dialog de succès après download
    const dialog = page.locator('.dialog-overlay');
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dialog.locator('button').last().click();
      await page.waitForTimeout(500);
    }

    const pdfPath = path.join(downloadDir, download.suggestedFilename());
    await download.saveAs(pdfPath);
    console.log(`   PDF sauvegardé: ${pdfPath}`);

    // ── Lire le contenu du PDF avec pdfjs-dist ──
    await test.step('Analyse du contenu PDF', async () => {
      const text = await extractPdfText(pdfPath);
      console.log(`   PDF: ${text.length} caractères extraits`);
      console.log(`   Texte: "${text.substring(0, 200)}..."`);

      await test.step('✓ Numéro de facture', async () => {
        expect(text).toContain(docNumero);
        console.log(`      Numéro "${docNumero}" trouvé`);
      });

      await test.step('✓ Client', async () => {
        expect(text).toContain('Entreprise Test QA');
        console.log('      Client trouvé');
      });

      await test.step('✓ Adresse', async () => {
        expect(text).toContain('123 Avenue Mohammed V');
        console.log('      Adresse trouvée');
      });

      await test.step('✓ ICE', async () => {
        expect(text).toContain('001234567890123');
        console.log('      ICE trouvé');
      });

      await test.step('✓ 3 lignes de désignation', async () => {
        expect(text).toContain('Développement Web');
        expect(text).toContain('SEO');
        expect(text).toContain('Maintenance');
        console.log('      3 désignations trouvées');
      });

      await test.step('✓ Conditions et mode', async () => {
        expect(text).toContain('Paiement sous 30 jours');
        expect(text).toContain('Virement bancaire');
        console.log('      Conditions et mode trouvés');
      });

      await test.step('✓ Notes', async () => {
        expect(text).toContain('Playwright QA');
        console.log('      Notes trouvées');
      });
    });

    console.log('\n✅ Vérification du contenu PDF réussie');
  });
});
