import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

const CLIENT = { id: 'c_calc_qa', nom: 'Client Calc QA', tel: '', ice: '', adresse: '' };

const COMPANY = {
  nom: 'Calc QA SARL', contact: '', adresse: 'Casablanca',
  devise: 'DH', regimeTva: 'normal', tvaTaux: 20,
  ice: '', if_: '', rc: '', tp: '', cnss: '',
  tableColor: '#eef1f6', tableTextColor: '#333333', margeHaut: 3,
  fontSizeOffset: 0, pdfQuality: 2, headerImage: '', headerActive: false,
};

// Normalise les espaces insécables (grouping fr-FR) pour des assertions stables.
function norm(s: string) {
  return s.replace(/[\u00a0\u202f\u2009]/g, ' ');
}

async function readText(page: Page, selector: string) {
  return norm(await page.locator(selector).textContent() ?? '');
}

// Document v0 : aucune notion de mode → tout doit repartir en forfait.
function legacyNoModePayload() {
  return {
    type: 'facture',
    numero: 'FAC-OLD-0001',
    date: '01/01/2026',
    client: { id: CLIENT.id, nom: CLIENT.nom, tel: '', ice: '', adresse: '', ref: '' },
    conditions: '', modeReglement: '', notes: '',
    company: COMPANY,
    totals: {
      showPrices: true,
      lines: [{ desig: 'Ancienne prestation', prix: 120, qte: 3, total: 360 }],
      totalHT_brut: 360, remisePct: 0, remiseMontant: 0,
      isExoneree: false, tvaTaux: 20, tva: 72, totalTTC: 432,
      avance: 0, reste: 432,
    },
  };
}

// Document v1 : mode global totals.calcMode → appliqué aux lignes sans mode propre.
function legacyGlobalModePayload() {
  return {
    type: 'facture',
    numero: 'FAC-V1-0001',
    date: '02/01/2026',
    client: { id: CLIENT.id, nom: CLIENT.nom, tel: '', ice: '', adresse: '', ref: '' },
    conditions: '', modeReglement: '', notes: '',
    company: COMPANY,
    totals: {
      showPrices: true,
      calcMode: 'm2',
      lines: [
        { desig: 'Surface historique', prix: 100, qte: 2, largeurCm: 200, hauteurCm: 150 },
        { desig: 'Ligne forfait explicite', prix: 50, qte: 2, calcMode: 'forfait' },
      ],
      totalHT_brut: 650, remisePct: 0, remiseMontant: 0,
      isExoneree: false, tvaTaux: 20, tva: 130, totalTTC: 780,
      avance: 0, reste: 780,
    },
  };
}

// Document v2 (mixte) : mode porté par chaque ligne.
function mixedPayload(numero: string, type: 'devis' | 'facture' = 'devis') {
  return {
    type,
    numero,
    date: '11/11/2026',
    client: { id: CLIENT.id, nom: CLIENT.nom, tel: '', ice: '', adresse: '', ref: '' },
    conditions: '', modeReglement: '', notes: '',
    company: COMPANY,
    totals: {
      showPrices: true,
      lines: [
        { desig: 'Pose', prix: 500, qte: 1, calcMode: 'forfait', total: 500 },
        { desig: 'Carrelage', prix: 600, qte: 1, largeurCm: 100, hauteurCm: 100, calcMode: 'm2', total: 600 },
        { desig: 'Plinthes', prix: 200, qte: 1, longueurCm: 100, calcMode: 'ml', total: 200 },
      ],
      totalHT_brut: 1300, remisePct: 0, remiseMontant: 0,
      isExoneree: false, tvaTaux: 20, tva: 260, totalTTC: 1560,
      avance: 0, reste: 1560,
    },
  };
}

function toHistoryDoc(payload: any, id: string, createdAt: string) {
  return {
    id,
    type: payload.type,
    numero: payload.numero,
    date: payload.date,
    client: CLIENT.nom,
    totalTTC: payload.totals.totalTTC,
    createdAt,
    filename: payload.numero + '.pdf',
    payload,
  };
}

async function openApp(page: Page, history: any[] | null = null) {
  await page.addInitScript(({ company, client }) => {
    localStorage.setItem('fb_company', JSON.stringify(company));
    localStorage.setItem('fb_clients', JSON.stringify([client]));
  }, { company: COMPANY, client: CLIENT });

  if (history) {
    await page.addInitScript((docs) => {
      localStorage.setItem('fb_history', JSON.stringify(docs));
    }, history);
  }

  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#linesBody tr').first()).toBeVisible({ timeout: 15000 });
}

function headers(page: Page) {
  return page.locator('#linesHeadRow th');
}

async function fillMixedDocument(page: Page) {
  // Ligne 1 : pose en forfait
  const pose = page.locator('#linesBody tr').nth(0);
  await pose.locator('.line-desig').fill('Pose');
  await pose.locator('.line-prix').fill('500');
  await pose.locator('.line-qte').fill('1');

  // Ligne 2 : carrelage au m² (100×100 cm → 1 m²)
  const carrelage = page.locator('#linesBody tr').nth(1);
  await carrelage.locator('.line-desig').fill('Carrelage');
  await carrelage.locator('.line-prix').fill('600');
  await carrelage.locator('.line-qte').fill('1');
  await carrelage.locator('.line-mode').selectOption('m2');
  await expect(carrelage.locator('.line-larg')).toBeVisible();
  await carrelage.locator('.line-larg').fill('100');
  await carrelage.locator('.line-haut').fill('100');

  // Ligne 3 : plinthes au m linéaire (100 cm → 1 m)
  const plinthes = page.locator('#linesBody tr').nth(2);
  await plinthes.locator('.line-desig').fill('Plinthes');
  await plinthes.locator('.line-prix').fill('200');
  await plinthes.locator('.line-qte').fill('1');
  await plinthes.locator('.line-mode').selectOption('ml');
  await expect(plinthes.locator('.line-long')).toBeVisible();
  await plinthes.locator('.line-long').fill('100');

  return { pose, carrelage, plinthes };
}

test.describe('Modes de calcul par ligne — éditeur', () => {
  test.setTimeout(90000);

  test('nouvelle ligne : forfait par défaut, en-têtes communes, pas de sélecteur global', async ({ page }) => {
    await openApp(page);

    // Le sélecteur global a disparu
    await expect(page.locator('#calcMode')).toHaveCount(0);

    // En-têtes communes inchangées
    await expect(headers(page)).toHaveCount(5);
    await expect(headers(page).nth(0)).toHaveText('Désignation');
    await expect(headers(page).nth(1)).toHaveText('Prix U.');
    await expect(headers(page).nth(2)).toHaveText('Qté');
    await expect(headers(page).nth(3)).toHaveText('Total');

    const row = page.locator('#linesBody tr').first();
    await expect(row.locator('.line-mode')).toHaveValue('forfait');
    await expect(row.locator('.line-dims')).toHaveCount(0);
    await expect(row.locator('.line-prix-unit')).toHaveCount(0);

    // Forfait = prix × quantité
    await row.locator('.line-desig').fill('Prestation forfait');
    await row.locator('.line-prix').fill('120');
    await row.locator('.line-qte').fill('3');
    await expect(row.locator('.line-total')).toHaveText('360,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('360,00 DH');

    // Une nouvelle ligne démarre aussi en forfait
    await page.locator('[data-action="add-line"]').click();
    const row2 = page.locator('#linesBody tr').nth(1);
    await expect(row2.locator('.line-mode')).toHaveValue('forfait');
    await expect(row2.locator('.line-dims')).toHaveCount(0);
  });

  test('document mixte : pose forfait 500 + carrelage m² 600 + plinthes ml 200 = 1 300 DH', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="add-line"]').click();
    await page.locator('[data-action="add-line"]').click();
    const { pose, carrelage, plinthes } = await fillMixedDocument(page);

    // Mesures et unités par ligne
    await expect(carrelage.locator('.line-mesure')).toHaveText('1,00 m²');
    await expect(carrelage.locator('.line-prix-unit')).toHaveText('DH/m²');
    await expect(plinthes.locator('.line-mesure')).toHaveText('1,00 m');
    await expect(plinthes.locator('.line-prix-unit')).toHaveText('DH/m');
    await expect(pose.locator('.line-prix-unit')).toHaveCount(0);

    // Totaux par ligne + document
    await expect(pose.locator('.line-total')).toHaveText('500,00 DH');
    await expect(carrelage.locator('.line-total')).toHaveText('600,00 DH');
    await expect(plinthes.locator('.line-total')).toHaveText('200,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('1 300,00 DH');
    await expect(await readText(page, '#sumTTC')).toBe('1 560,00 DH');
    await expect(await readText(page, '#sumTva')).toBe('260,00 DH');
  });

  test('changement de mode d\'une seule ligne : les autres lignes gardent champs, mode et montant', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="add-line"]').click();
    await page.locator('[data-action="add-line"]').click();
    const { pose, carrelage, plinthes } = await fillMixedDocument(page);
    await expect(await readText(page, '#sumHT')).toBe('1 300,00 DH');

    // Modifie UNIQUEMENT le mode du carrelage : m² → m³
    await carrelage.locator('.line-mode').selectOption('m3');

    // La pose et les plinthes sont intactes
    await expect(pose.locator('.line-mode')).toHaveValue('forfait');
    await expect(pose.locator('.line-prix')).toHaveValue('500');
    await expect(pose.locator('.line-total')).toHaveText('500,00 DH');
    await expect(plinthes.locator('.line-mode')).toHaveValue('ml');
    await expect(plinthes.locator('.line-long')).toHaveValue('100');
    await expect(plinthes.locator('.line-total')).toHaveText('200,00 DH');

    // Le carrelage affiche ses nouveaux champs m³ ; largeur/hauteur conservées, longueur manquante
    await expect(carrelage.locator('.line-long')).toHaveCount(1);
    await expect(carrelage.locator('.line-larg')).toHaveValue('100');
    await expect(carrelage.locator('.line-haut')).toHaveValue('100');
    await expect(carrelage.locator('.line-prix-unit')).toHaveText('DH/m³');
    await expect(carrelage.locator('.line-mesure')).toHaveText('—');
    await expect(carrelage.locator('.line-total')).toHaveText('—');
    await expect(await readText(page, '#sumHT')).toBe('700,00 DH');

    // Complète la longueur : 50×100×100 cm → 0,5 m³ × 600 DH = 300 DH
    await carrelage.locator('.line-long').fill('50');
    await expect(carrelage.locator('.line-mesure')).toHaveText('0,500 m³');
    await expect(carrelage.locator('.line-total')).toHaveText('300,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('1 000,00 DH');
  });

  test('m², ml, m³ sur une même ligne : champs, mesures et valeurs conservées au changement de mode', async ({ page }) => {
    await openApp(page);

    const row = page.locator('#linesBody tr').first();
    await row.locator('.line-desig').fill('Prestation mesurée');
    await row.locator('.line-prix').fill('100');
    await row.locator('.line-qte').fill('2');

    // m²
    await row.locator('.line-mode').selectOption('m2');
    await expect(row.locator('.line-larg')).toHaveCount(1);
    await expect(row.locator('.line-haut')).toHaveCount(1);
    await expect(row.locator('.line-long')).toHaveCount(0);
    await expect(row.locator('.line-prix-unit')).toHaveText('DH/m²');
    await row.locator('.line-larg').fill('200');
    await row.locator('.line-haut').fill('150');
    await expect(row.locator('.line-mesure')).toHaveText('3,00 m²');
    await expect(row.locator('.line-total')).toHaveText('600,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('600,00 DH');

    // ml : valeurs de désignation/prix/qté conservées, dimensions de l'autre mode conservées en mémoire
    await row.locator('.line-mode').selectOption('ml');
    await expect(row.locator('.line-desig')).toHaveValue('Prestation mesurée');
    await expect(row.locator('.line-prix')).toHaveValue('100');
    await expect(row.locator('.line-qte')).toHaveValue('2');
    await expect(row.locator('.line-long')).toHaveCount(1);
    await expect(row.locator('.line-larg')).toHaveCount(0);
    await row.locator('.line-long').fill('250');
    await row.locator('.line-prix').fill('80');
    await row.locator('.line-qte').fill('3');
    await expect(row.locator('.line-mesure')).toHaveText('2,50 m');
    await expect(row.locator('.line-prix-unit')).toHaveText('DH/m');
    await expect(row.locator('.line-total')).toHaveText('600,00 DH');

    // m³ : longueur conservée du mode ml, larg/haut conservées du mode m²
    await row.locator('.line-mode').selectOption('m3');
    await expect(row.locator('.line-long')).toHaveValue('250');
    await expect(row.locator('.line-larg')).toHaveValue('200');
    await expect(row.locator('.line-haut')).toHaveValue('150');
    await row.locator('.line-long').fill('200');
    await row.locator('.line-larg').fill('100');
    await row.locator('.line-haut').fill('50');
    await row.locator('.line-prix').fill('350');
    await row.locator('.line-qte').fill('2');
    await expect(row.locator('.line-mesure')).toHaveText('1,000 m³');
    await expect(row.locator('.line-prix-unit')).toHaveText('DH/m³');
    await expect(row.locator('.line-total')).toHaveText('700,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('700,00 DH');

    // retour forfait : plus de dimensions ni d'unité
    await row.locator('.line-mode').selectOption('forfait');
    await expect(row.locator('.line-dims')).toHaveCount(0);
    await expect(row.locator('.line-prix-unit')).toHaveCount(0);
    await expect(row.locator('.line-total')).toHaveText('700,00 DH');

    // retour m³ : les dimensions sont toujours là
    await row.locator('.line-mode').selectOption('m3');
    await expect(row.locator('.line-long')).toHaveValue('200');
    await expect(row.locator('.line-larg')).toHaveValue('100');
    await expect(row.locator('.line-haut')).toHaveValue('50');
  });

  test('ligne dimensionnelle vide : mesure 0,00 sans erreur ; dimension manquante : champ signalé et export bloqué', async ({ page }) => {
    await openApp(page);
    await page.locator('#clientSelect').selectOption(CLIENT.id);

    const row = page.locator('#linesBody tr').first();

    // Ligne vide en mode m² : non facturable → 0,00 sans erreur
    await row.locator('.line-mode').selectOption('m2');
    await expect(row.locator('.line-mesure')).toHaveText('0,00 m²');
    await expect(row.locator('.line-total')).toHaveText('0,00 DH');
    await expect(row.locator('.line-larg')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(await readText(page, '#sumHT')).toBe('0,00 DH');

    // Ligne renseignée mais dimension manquante : ligne facturable invalide
    await row.locator('.line-desig').fill('Menuiserie');
    await row.locator('.line-prix').fill('100');
    await row.locator('.line-qte').fill('1');
    await row.locator('.line-larg').fill('200');
    await expect(row.locator('.line-haut')).toHaveAttribute('aria-invalid', 'true');
    await expect(row.locator('.line-mesure')).toHaveText('—');
    await expect(row.locator('.line-total')).toHaveText('—');
    await expect(await readText(page, '#sumHT')).toBe('0,00 DH');

    // La 2e ligne forfait reste valide et comptée
    await page.locator('[data-action="add-line"]').click();
    const row2 = page.locator('#linesBody tr').nth(1);
    await row2.locator('.line-desig').fill('Pose');
    await row2.locator('.line-prix').fill('500');
    await row2.locator('.line-qte').fill('1');
    await expect(row2.locator('.line-mode')).toHaveValue('forfait');
    await expect(row2.locator('.line-total')).toHaveText('500,00 DH');

    // Export bloqué par la ligne m² invalide
    await page.locator('[data-action="generate-pdf"]').click();
    const dialog = page.locator('.dialog-overlay');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText('Dimensions manquantes ou invalides');
    await dialog.locator('button').last().click();

    // Correction → tout repasse
    await row.locator('.line-haut').fill('150');
    await expect(row.locator('.line-haut')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(row.locator('.line-mesure')).toHaveText('3,00 m²');
    await expect(row.locator('.line-total')).toHaveText('300,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('800,00 DH');
  });

  test('ancien document sans calcMode : tout repart en forfait à la réouverture', async ({ page }) => {
    const payload = legacyNoModePayload();
    const doc = toHistoryDoc(payload, 'old_calc_1', '2026-01-01T00:00:00.000Z');

    await openApp(page, [doc]);
    await page.locator('#navHistorique').click();
    const historyRow = page.locator('#histTableWrap table tbody tr').filter({ hasText: payload.numero });
    await expect(historyRow).toBeVisible({ timeout: 10000 });
    await historyRow.locator('button[data-action="edit"]').click();

    await expect(page.locator('#editingBanner')).toBeVisible();
    const row = page.locator('#linesBody tr').first();
    await expect(row.locator('.line-mode')).toHaveValue('forfait');
    await expect(row.locator('.line-dims')).toHaveCount(0);
    await expect(row.locator('.line-desig')).toHaveValue('Ancienne prestation');
    await expect(row.locator('.line-prix')).toHaveValue('120');
    await expect(row.locator('.line-qte')).toHaveValue('3');
    await expect(row.locator('.line-total')).toHaveText('360,00 DH');
    await expect(await readText(page, '#sumHT')).toBe('360,00 DH');
  });

  test('document v1 à mode global : mode appliqué aux lignes sans mode propre à la réouverture', async ({ page }) => {
    const payload = legacyGlobalModePayload();
    const doc = toHistoryDoc(payload, 'v1_calc_1', '2026-01-02T00:00:00.000Z');

    await openApp(page, [doc]);
    await page.locator('#navHistorique').click();
    const historyRow = page.locator('#histTableWrap table tbody tr').filter({ hasText: payload.numero });
    await expect(historyRow).toBeVisible({ timeout: 10000 });
    await historyRow.locator('button[data-action="edit"]').click();

    await expect(page.locator('#editingBanner')).toBeVisible();

    // Ligne héritant du mode global m²
    const m2Row = page.locator('#linesBody tr').nth(0);
    await expect(m2Row.locator('.line-mode')).toHaveValue('m2');
    await expect(m2Row.locator('.line-larg')).toHaveValue('200');
    await expect(m2Row.locator('.line-haut')).toHaveValue('150');
    await expect(m2Row.locator('.line-mesure')).toHaveText('3,00 m²');
    await expect(m2Row.locator('.line-total')).toHaveText('600,00 DH');

    // Ligne avec mode propre forfait : le mode global ne l'écrase pas
    const forfaitRow = page.locator('#linesBody tr').nth(1);
    await expect(forfaitRow.locator('.line-mode')).toHaveValue('forfait');
    await expect(forfaitRow.locator('.line-dims')).toHaveCount(0);
    await expect(forfaitRow.locator('.line-total')).toHaveText('100,00 DH');

    await expect(await readText(page, '#sumHT')).toBe('700,00 DH');
  });

  test('duplication et conversion devis → facture conservent les modes et dimensions par ligne', async ({ page }) => {
    const payload = mixedPayload('DEV-CALC-0001');
    const doc = toHistoryDoc(payload, 'dev_calc_1', '2026-11-11T00:00:00.000Z');

    await openApp(page, [doc]);
    await page.locator('#navHistorique').click();
    const originalRow = page.locator('#histTableWrap table tbody tr').filter({ hasText: 'DEV-CALC-0001' });
    await expect(originalRow).toBeVisible({ timeout: 10000 });

    await originalRow.locator('button[data-action="duplicate"]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('fb_history') || '[]').length === 2, null, { timeout: 60000 });

    const afterDuplicate = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]'));
    const duplicate = afterDuplicate.find((d: any) => d.numero !== 'DEV-CALC-0001');
    expect(duplicate).toBeTruthy();
    expect(duplicate.type).toBe('devis');
    const dupLines = duplicate.payload.totals.lines;
    expect(dupLines.map((l: any) => l.calcMode)).toEqual(['forfait', 'm2', 'ml']);
    expect(dupLines[1].largeurCm).toBe(100);
    expect(dupLines[1].hauteurCm).toBe(100);
    expect(dupLines[2].longueurCm).toBe(100);
    expect(duplicate.payload.totals.totalHT_brut).toBe(1300);

    const convertRow = page.locator('#histTableWrap table tbody tr').filter({ hasText: 'DEV-CALC-0001' });
    await expect(convertRow).toBeVisible({ timeout: 10000 });
    await convertRow.locator('button[data-action="convert"]').click();
    const confirmDialog = page.locator('.dialog-overlay');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.locator('button').last().click();

    await page.waitForFunction(() => {
      const docs = JSON.parse(localStorage.getItem('fb_history') || '[]');
      return docs.some((d: any) => d.type === 'facture');
    }, null, { timeout: 60000 });

    const afterConvert = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]'));
    const invoice = afterConvert.find((d: any) => d.type === 'facture');
    expect(invoice).toBeTruthy();
    const invLines = invoice.payload.totals.lines;
    expect(invLines.map((l: any) => l.calcMode)).toEqual(['forfait', 'm2', 'ml']);
    expect(invLines[1].largeurCm).toBe(100);
    expect(invLines[2].longueurCm).toBe(100);
    expect(invoice.payload.totals.totalHT_brut).toBe(1300);
  });

  test('export/import backup conserve les modes et dimensions par ligne', async ({ page }) => {
    await openApp(page);
    const payload = mixedPayload('FAC-BACKUP-0001', 'facture');
    const doc = toHistoryDoc(payload, 'backup_calc_1', '2026-11-11T00:00:00.000Z');

    await page.evaluate(async (d) => {
      const { saveHistory } = await import('/js/storage.js');
      saveHistory([d]);
    }, doc);

    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-action="export-backup"]')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="export-backup"]').click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();

    const backup = JSON.parse(fs.readFileSync(backupPath as string, 'utf8'));
    expect(backup.history).toHaveLength(1);
    const backupLines = backup.history[0].payload.totals.lines;
    expect(backupLines.map((l: any) => l.calcMode)).toEqual(['forfait', 'm2', 'ml']);
    expect(backupLines[1].largeurCm).toBe(100);
    expect(backupLines[2].longueurCm).toBe(100);

    await page.evaluate(async () => {
      const { saveHistory } = await import('/js/storage.js');
      saveHistory([]);
    });

    await page.locator('#backupFileInput').setInputFiles(backupPath as string);
    const confirmDialog = page.locator('.dialog-overlay');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.locator('button').last().click();

    await page.waitForFunction(() => {
      try {
        return JSON.parse(localStorage.getItem('fb_history') || '[]').length === 1;
      } catch (_) {
        return false;
      }
    }, null, { timeout: 20000 });

    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]'));
    expect(restored).toHaveLength(1);
    const restoredLines = restored[0].payload.totals.lines;
    expect(restoredLines.map((l: any) => l.calcMode)).toEqual(['forfait', 'm2', 'ml']);
    expect(restoredLines[1].largeurCm).toBe(100);
    expect(restoredLines[2].longueurCm).toBe(100);
  });

  test('mobile et RTL : document mixte sans overflow, labels i18n, mesure LTR', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="add-line"]').click();
    await page.locator('[data-action="add-line"]').click();
    await fillMixedDocument(page);

    // Vue mobile
    await page.setViewportSize({ width: 375, height: 900 });
    const carrelage = page.locator('#linesBody tr').nth(1);
    await expect(carrelage.locator('.line-mode')).toBeVisible();
    await expect(carrelage.locator('.line-larg')).toBeVisible();
    await expect(carrelage.locator('.line-mesure')).toHaveText('1,00 m²');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    // Passage en arabe (RTL) : re-rendu des lignes avec labels AR
    await page.evaluate(async () => {
      const { setLang } = await import('/js/i18n.js');
      await setLang('ar');
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
      const { refreshLinesUI } = await import('/js/lines.js');
      refreshLinesUI();
    });
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');

    const arCarrelage = page.locator('#linesBody tr').nth(1);
    await expect(arCarrelage.locator('.line-mode')).toHaveAttribute('aria-label', 'طريقة الحساب');
    await expect(arCarrelage.locator('.line-larg')).toHaveAttribute('aria-label', 'العرض (سم)');
    await expect(arCarrelage.locator('.line-mesure')).toHaveText('1,00 m²');
    const mesureStyle = await arCarrelage.locator('.line-mesure').evaluate((el) => {
      const s = getComputedStyle(el);
      return { direction: s.direction, textAlign: s.textAlign };
    });
    expect(mesureStyle.direction).toBe('ltr');
    expect(mesureStyle.textAlign).toBe('right');

    // Zéro overflow en RTL mobile, puis desktop
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(headers(page)).toHaveCount(5);
  });
});
