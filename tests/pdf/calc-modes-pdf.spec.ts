import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT = { id: 'c_calc_pdf', nom: 'Client PDF Calc', tel: '', ice: '', adresse: '' };

const COMPANY = {
  nom: 'Calc PDF SARL', contact: '', adresse: 'Casablanca',
  devise: 'DH', regimeTva: 'normal', tvaTaux: 20,
  ice: '', if_: '', rc: '', tp: '', cnss: '',
  tableColor: '#eef1f6', tableTextColor: '#333333', margeHaut: 3,
  fontSizeOffset: 0, pdfQuality: 2, headerImage: '', headerActive: false,
};

function totalsFor(totalHT: number, lines: any[]) {
  const tva = Math.round(totalHT * 0.2 * 100) / 100;
  return {
    showPrices: true,
    lines,
    totalHT_brut: totalHT,
    remisePct: 0,
    remiseMontant: 0,
    isExoneree: false,
    tvaTaux: 20,
    tva,
    totalTTC: totalHT + tva,
    avance: 0,
    reste: totalHT + tva,
  };
}

// Document v2 : le mode est porté par chaque ligne.
function linePayload(mode: 'forfait' | 'm2' | 'ml' | 'm3') {
  const line = mode === 'forfait'
    ? { desig: 'Prestation forfait', prix: 120, qte: 3, calcMode: 'forfait', total: 360 }
    : mode === 'm2'
      ? { desig: 'Surface mesurée', prix: 100, qte: 2, largeurCm: 200, hauteurCm: 150, calcMode: 'm2' }
      : mode === 'ml'
        ? { desig: 'Longueur mesurée', prix: 80, qte: 3, longueurCm: 250, calcMode: 'ml' }
        : { desig: 'Volume mesuré', prix: 350, qte: 2, longueurCm: 200, largeurCm: 100, hauteurCm: 50, calcMode: 'm3' };

  const totalHT = mode === 'forfait' ? 360 : mode === 'm2' || mode === 'ml' ? 600 : 700;
  return {
    type: 'facture',
    numero: `FAC-CALC-${mode.toUpperCase()}`,
    date: '11/11/2026',
    client: { id: CLIENT.id, nom: CLIENT.nom, tel: '', ice: '', adresse: '', ref: '' },
    conditions: '',
    modeReglement: '',
    notes: '',
    company: COMPANY,
    totals: totalsFor(totalHT, [line]),
  };
}

// Document v1 : mode global totals.calcMode (migration à la volée au rendu).
function legacyGlobalM2Payload() {
  const payload = linePayload('m2');
  payload.numero = 'FAC-CALC-V1';
  payload.totals.calcMode = 'm2';
  // lignes sans calcMode propre → héritent du mode global
  payload.totals.lines = [{ desig: 'Surface historique', prix: 100, qte: 2, largeurCm: 200, hauteurCm: 150 }];
  payload.totals.totalHT_brut = 600;
  const tva = 120;
  payload.totals.tva = tva;
  payload.totals.totalTTC = 720;
  payload.totals.reste = 720;
  return payload;
}

// Document mixte : forfait + m² + m linéaire dans le même document.
function mixedPayload() {
  const lines = [
    { desig: 'Pose', prix: 500, qte: 1, calcMode: 'forfait' },
    { desig: 'Carrelage', prix: 600, qte: 1, largeurCm: 100, hauteurCm: 100, calcMode: 'm2' },
    { desig: 'Plinthes', prix: 200, qte: 1, longueurCm: 100, calcMode: 'ml' },
  ];
  return {
    type: 'facture',
    numero: 'FAC-CALC-MIXTE',
    date: '11/11/2026',
    client: { id: CLIENT.id, nom: CLIENT.nom, tel: '', ice: '', adresse: '', ref: '' },
    conditions: '',
    modeReglement: '',
    notes: '',
    company: COMPANY,
    totals: totalsFor(1300, lines),
  };
}

async function extractText(dataUri: string): Promise<{ text: string; pages: number }> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const base64 = dataUri.split(',')[1];
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item: any) => item.str).join(' '));
  }
  return { text: texts.join('\n'), pages: pdf.numPages };
}

async function extractPdfFileText(filePath: string): Promise<string> {
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

async function openApp(page: Page, history: any[] | null = null) {
  await page.addInitScript(({ company, client }) => {
    localStorage.setItem('fb_company', JSON.stringify(company));
    localStorage.setItem('fb_clients', JSON.stringify([client]));
    localStorage.setItem('fb_lang', 'fr');
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

async function renderPdf(page: Page, payload: any): Promise<string> {
  return page.evaluate(async (p) => {
    const mod = await import('/js/pdf.js');
    mod.setPdfEngine('pdfkit');
    const pdf = await mod.renderPagesToPdf(p, null);
    return pdf.output('datauristring');
  }, payload);
}

test.describe('Modes de calcul par ligne — PDF', () => {
  test.setTimeout(120000);

  test('forfait : tableau classique, sans dimensions ni unité', async ({ page }) => {
    await openApp(page);
    const { text, pages } = await extractText(await renderPdf(page, linePayload('forfait')));

    expect(pages).toBe(1);
    expect(text).toContain('FAC-CALC-FORFAIT');
    expect(text).toContain('Prestation forfait');
    expect(text).toContain('360.00');
    expect(text).toContain('432.00');
    expect(text).not.toContain('Mode de calcul');
    expect(text).not.toContain('DH/m');
    expect(text).not.toContain('Surface (m');
    expect(text).not.toContain('Longueur (m)');
    expect(text).not.toContain('Volume (m');
  });

  test('m² : dimensions et surface sous la désignation, unité DH/m² à côté du prix', async ({ page }) => {
    await openApp(page);
    const { text } = await extractText(await renderPdf(page, linePayload('m2')));

    expect(text).not.toContain('Mode de calcul');
    expect(text).toContain('Surface mesurée');
    expect(text).toContain('Larg. (cm) 200');
    expect(text).toContain('Haut. (cm) 150');
    expect(text).toContain('Surface (m²) 3,00');
    expect(text).toContain('DH/m²');
    expect(text).toContain('600.00');
    expect(text).toContain('720.00');
  });

  test('m linéaire : longueur en cm et en m sous la désignation, unité DH/m', async ({ page }) => {
    await openApp(page);
    const { text } = await extractText(await renderPdf(page, linePayload('ml')));

    expect(text).not.toContain('Mode de calcul');
    expect(text).toContain('Longueur mesurée');
    expect(text).toContain('Long. (cm) 250');
    expect(text).toContain('Longueur (m) 2,50');
    expect(text).toContain('DH/m');
    expect(text).toContain('600.00');
  });

  test('m³ : dimensions et volume sous la désignation, unité DH/m³', async ({ page }) => {
    await openApp(page);
    const { text } = await extractText(await renderPdf(page, linePayload('m3')));

    expect(text).not.toContain('Mode de calcul');
    expect(text).toContain('Volume mesuré');
    expect(text).toContain('Long. (cm) 200');
    expect(text).toContain('Larg. (cm) 100');
    expect(text).toContain('Haut. (cm) 50');
    expect(text).toContain('Volume (m³) 1,000');
    expect(text).toContain('DH/m³');
    expect(text).toContain('700.00');
  });

  test('document mixte : chaque article affiche ses dimensions et son unité, totaux 1 300 DH', async ({ page }) => {
    await openApp(page);
    const { text, pages } = await extractText(await renderPdf(page, mixedPayload()));

    expect(pages).toBe(1);
    // Pose (forfait) : rendu standard, pas d'unité ni de dimensions
    expect(text).toContain('Pose');
    expect(text).toContain('500.00');
    // Carrelage (m²) : dimensions + surface + DH/m²
    expect(text).toContain('Carrelage');
    expect(text).toContain('Larg. (cm) 100');
    expect(text).toContain('Haut. (cm) 100');
    expect(text).toContain('Surface (m²) 1,00');
    expect(text).toContain('DH/m²');
    expect(text).toContain('600.00');
    // Plinthes (m linéaire) : longueur + DH/m
    expect(text).toContain('Plinthes');
    expect(text).toContain('Long. (cm) 100');
    expect(text).toContain('Longueur (m) 1,00');
    expect(text).toContain('DH/m');
    expect(text).toContain('200.00');
    // Totaux du document
    expect(text).toContain('1300.00');
    expect(text).toContain('1560.00');
    expect(text).not.toContain('Mode de calcul');
  });

  test('buildPdfHtml : tableau commun quel que soit le mode, sous-ligne et unité uniquement pour les lignes mesurées', async ({ page }) => {
    await openApp(page);
    const result = await page.evaluate(async (payloads) => {
      const mod = await import('/js/pdf.js');
      return payloads.map((p: any) => {
        const f = mod.buildPdfHtml(p, null);
        return { tableStartHtml: f.tableStartHtml, rowsHtml: f.rowsHtml.join('') };
      });
    }, [linePayload('forfait'), linePayload('m2'), linePayload('m3'), mixedPayload()]);

    // Tableau commun aux 4 documents (mêmes en-têtes, aucune mention de mode)
    for (const r of result) {
      expect(r.tableStartHtml).toContain('Désignation');
      expect(r.tableStartHtml).toContain('Prix U.');
      expect(r.tableStartHtml).toContain('Qté');
      expect(r.tableStartHtml).toContain('Total');
      expect(r.tableStartHtml).not.toContain('Mode de calcul');
      expect(r.tableStartHtml).toContain('width:46%');
      expect(r.tableStartHtml).toContain('width:21%');
    }

    // Forfait : pas de sous-ligne ni d'unité
    expect(result[0].rowsHtml).not.toContain('pdf-line-sub');
    expect(result[0].rowsHtml).not.toContain('pdf-price-unit');

    // m² : sous-ligne + unité
    expect(result[1].rowsHtml).toContain('pdf-line-sub');
    expect(result[1].rowsHtml).toContain('pdf-price-unit');
    expect(result[1].rowsHtml).toContain('DH/m²');

    // m³ : sous-ligne + unité
    expect(result[2].rowsHtml).toContain('pdf-line-sub');
    expect(result[2].rowsHtml).toContain('DH/m³');

    // Mixte : la ligne forfait reste standard, les deux lignes mesurées portent sous-ligne + unité
    expect(result[3].rowsHtml).toContain('Pose');
    expect(result[3].rowsHtml).toContain('Carrelage');
    expect(result[3].rowsHtml).toContain('Plinthes');
    expect((result[3].rowsHtml.match(/pdf-line-sub/g) || []).length).toBe(2);
    expect((result[3].rowsHtml.match(/pdf-price-unit/g) || []).length).toBe(2);
  });

  test('m² : ligne vide dimensionnelle à zéro, sans erreur de rendu', async ({ page }) => {
    await openApp(page);
    const payload = linePayload('m2');
    payload.totals.lines.push({ desig: '', prix: 0, qte: 1, largeurCm: '', hauteurCm: '', calcMode: 'm2' } as any);

    const rows = await page.evaluate(async (p) => {
      const mod = await import('/js/pdf.js');
      return mod.buildPdfHtml(p, null).rowsHtml.join('');
    }, payload);

    expect(rows).toContain('Surface (m²) 0,00');
    expect(rows).toContain('<td class="num">0.00</td>');
  });

  test('document v1 à mode global m² : migration par ligne au rendu, réouverture puis régénération', async ({ page }) => {
    const payload = legacyGlobalM2Payload();
    const doc = {
      id: 'pdf_calc_v1',
      type: 'facture',
      numero: payload.numero,
      date: payload.date,
      client: CLIENT.nom,
      totalTTC: payload.totals.totalTTC,
      createdAt: '2026-11-11T00:00:00.000Z',
      filename: payload.numero + '.pdf',
      payload,
    };

    await openApp(page, [doc]);

    // Rendu direct depuis le payload historique (reprint) : le mode global s'applique
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]')[0].payload);
    const { text } = await extractText(await renderPdf(page, stored));
    expect(text).toContain('Surface historique');
    expect(text).toContain('Larg. (cm) 200');
    expect(text).toContain('Surface (m²) 3,00');
    expect(text).toContain('DH/m²');
    expect(text).toContain('600.00');

    // Réouverture dans l'éditeur : migration en mode par ligne
    await page.locator('#navHistorique').click();
    const row = page.locator('#histTableWrap table tbody tr').filter({ hasText: payload.numero });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[data-action="edit"]').click();

    await expect(page.locator('#linesBody tr').first().locator('.line-mode')).toHaveValue('m2');
    await expect(page.locator('#linesBody tr').first().locator('.line-larg')).toHaveValue('200');
    await expect(page.locator('#linesBody tr').first().locator('.line-haut')).toHaveValue('150');
    await expect(page.locator('#linesBody tr').first().locator('.line-mesure')).toHaveText('3,00 m²');

    // Régénération depuis le payload migré
    const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]')[0].payload);
    const { text: text2 } = await extractText(await renderPdf(page, migrated));
    expect(text2).toContain('Surface (m²) 3,00');
    expect(text2).toContain('DH/m²');
    expect(text2).toContain('600.00');
  });

  test('document mixte exporté depuis l\'éditeur : PDF complet vérifié article par article', async ({ page }) => {
    await openApp(page);
    await page.locator('#clientSelect').selectOption(CLIENT.id);
    await page.locator('[data-action="add-line"]').click();
    await page.locator('[data-action="add-line"]').click();

    // Pose (forfait)
    const pose = page.locator('#linesBody tr').nth(0);
    await pose.locator('.line-desig').fill('Pose');
    await pose.locator('.line-prix').fill('500');
    await pose.locator('.line-qte').fill('1');

    // Carrelage (m²)
    const carrelage = page.locator('#linesBody tr').nth(1);
    await carrelage.locator('.line-desig').fill('Carrelage');
    await carrelage.locator('.line-prix').fill('600');
    await carrelage.locator('.line-qte').fill('1');
    await carrelage.locator('.line-mode').selectOption('m2');
    await carrelage.locator('.line-larg').fill('100');
    await carrelage.locator('.line-haut').fill('100');

    // Plinthes (m linéaire)
    const plinthes = page.locator('#linesBody tr').nth(2);
    await plinthes.locator('.line-desig').fill('Plinthes');
    await plinthes.locator('.line-prix').fill('200');
    await plinthes.locator('.line-qte').fill('1');
    await plinthes.locator('.line-mode').selectOption('ml');
    await plinthes.locator('.line-long').fill('100');

    await expect(await page.locator('#sumHT').textContent()).toContain('300,00 DH');

    // Export complet
    const downloadDir = path.join(__dirname, '..', '..', 'test-results');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('[data-action="generate-pdf"]').click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const text = await extractPdfFileText(filePath as string);
    expect(text).toContain('Pose');
    expect(text).toContain('500.00');
    expect(text).toContain('Carrelage');
    expect(text).toContain('Larg. (cm) 100');
    expect(text).toContain('Haut. (cm) 100');
    expect(text).toContain('Surface (m²) 1,00');
    expect(text).toContain('DH/m²');
    expect(text).toContain('600.00');
    expect(text).toContain('Plinthes');
    expect(text).toContain('Long. (cm) 100');
    expect(text).toContain('Longueur (m) 1,00');
    expect(text).toContain('200.00');
    expect(text).toContain('1300.00');
    expect(text).toContain('1560.00');
    expect(text).not.toContain('Mode de calcul');
  });
});
