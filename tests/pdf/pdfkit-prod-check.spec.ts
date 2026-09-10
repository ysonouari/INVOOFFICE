import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const FLAGS = {
  fb_pdf_engine: 'pdfkit',
  fb_pdf_bg: '/entit.png',
  fb_pdf_bg_mode: 'full',
  fb_pdf_bg_fmt: 'jpeg',
};

async function openPdf(dataUri: string): Promise<any> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = Uint8Array.from(Buffer.from(dataUri.split(',')[1], 'base64'));
  return pdfjsLib.getDocument({ data: bytes }).promise;
}

async function extractText(dataUri: string): Promise<string> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await openPdf(dataUri);
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item: any) => item.str).join(' '));
  }
  return texts.join('\n');
}

async function imagesPerPage(dataUri: string): Promise<number[]> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await openPdf(dataUri);
  const counts: number[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const ops = await page.getOperatorList();
    counts.push(ops.fnArray.filter((fn: number) => fn === pdfjsLib.OPS.paintImageXObject).length);
  }
  return counts;
}

function pdfSize(bytes: Buffer) {
  return Math.round(bytes.length / 1024);
}

test.describe('Vérification finale — intégration contrôlée (UI réelle, fond entit JPEG 0.88)', () => {
  test.setTimeout(300000);

  async function seedClient(page: any, nom: string) {
    const existing = page.locator('#clientSelect option').filter({ hasText: nom });
    if (await existing.count() === 0) {
      await page.locator('[data-action="add-client"]').click();
      await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 3000 });
      await page.locator('#cClientNom').fill(nom);
      await page.locator('#cClientTel').fill('0600000000');
      await page.locator('#cClientAdresse').fill('Casablanca');
      await page.locator('[data-action="save-client"]').click();
      await page.waitForTimeout(600);
    }
    await page.locator('#clientSelect').selectOption({ label: nom });
    await page.evaluate(() => {
      document.getElementById('clientSelect')!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(400);
  }

  async function fillLines(page: any, count: number, startPrice = 100) {
    for (let i = 0; i < count; i++) {
      await page.locator('[data-action="add-line"]').click();
      await page.waitForTimeout(120);
    }
    for (let i = 0; i < count; i++) {
      const row = page.locator('#linesBody tr').nth(i);
      await row.locator('.line-desig').fill('Article réel ' + (i + 1));
      await row.locator('.line-prix').fill(String(startPrice + i));
      await row.locator('.line-qte').fill('1');
    }
    await page.waitForTimeout(300);
    const totalRows = await page.locator('#linesBody tr').count();
    for (let i = count; i < totalRows; i++) {
      await page.locator('#linesBody tr').nth(i).locator('.icon-btn').first().click();
      await page.waitForTimeout(60);
    }
  }

  async function generateAndRead(page: any, downloadDir: string): Promise<{ bytes: Buffer; wallMs: number; filename: string }> {
    const dlg = page.locator('.dialog-overlay:visible');
    if (await dlg.count() > 0) {
      const msg = await dlg.locator('p').first().textContent().catch(() => '');
      console.log('[gen dialog]', msg);
      await dlg.locator('button').last().click();
      await page.waitForTimeout(400);
    }
    const dl = page.waitForEvent('download', { timeout: 60000 });
    const t0 = Date.now();
    await page.locator('[data-action="generate-pdf"]').click();
    const download = await dl;
    const wallMs = Date.now() - t0;
    const savePath = path.join(downloadDir, download.suggestedFilename());
    await download.saveAs(savePath);
    return { bytes: fs.readFileSync(savePath), wallMs, filename: download.suggestedFilename() };
  }

  test('verif-01 — facture courte FR : PDF fond+overlay, 1 page, léger', async ({ page }) => {
    await page.addInitScript((flags) => {
      for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v as string);
      localStorage.setItem('fb_lang', 'fr');
    }, FLAGS);
    const dlDir = path.join(__dirname, '..', '..', '..', 'test-results', 'prod-check');
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await seedClient(page, 'Client Courte');
    await page.waitForTimeout(300);
    await fillLines(page, 3);
    const r = await generateAndRead(page, dlDir);
    const dataUri = 'data:application/pdf;base64,' + r.bytes.toString('base64');
    const pdf = await openPdf(dataUri);
    const imgs = await imagesPerPage(dataUri);
    const txt = await extractText(dataUri);

    expect(r.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.numPages).toBe(1);
    expect(imgs).toEqual([2]);
    expect(pdfSize(r.bytes)).toBeLessThan(200);
    expect(txt.toLowerCase()).toContain('facture');
    expect(txt).toContain('Article réel');
    console.log(`  corta FR → ${r.wallMs} ms, ${pdfSize(r.bytes)} KB, 1 page, 2 img/page, texte OK`);
  });

  test('verif-02 — facture longue (≥2 pages) : fond sur chaque page + overlay', async ({ page }) => {
    await page.addInitScript((flags) => {
      for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v as string);
      localStorage.setItem('fb_lang', 'fr');
    }, FLAGS);
    const dlDir = path.join(__dirname, '..', '..', '..', 'test-results', 'prod-check');
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await seedClient(page, 'Client Longue');
    await fillLines(page, 40, 50);
    const r = await generateAndRead(page, dlDir);
    const dataUri = 'data:application/pdf;base64,' + r.bytes.toString('base64');
    const pdf = await openPdf(dataUri);
    const imgs = await imagesPerPage(dataUri);
    const txt = await extractText(dataUri);

    expect(pdf.numPages).toBeGreaterThanOrEqual(2);
    for (const c of imgs) expect(c).toBe(2);
    expect(pdfSize(r.bytes)).toBeLessThan(400);
    expect(txt.toLowerCase()).toContain('facture');
    console.log(`  longue → ${r.wallMs} ms, ${pdfSize(r.bytes)} KB, ${pdf.numPages} pages, 2 img/page, texte OK`);
  });

  test('verif-03 — facture arabe RTL : fond + extraction arabe', async ({ page }) => {
    await page.addInitScript((flags) => {
      for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v as string);
      localStorage.setItem('fb_lang', 'ar');
    }, FLAGS);
    const dlDir = path.join(__dirname, '..', '..', '..', 'test-results', 'prod-check');
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await seedClient(page, 'زبون تجريبي');
    await fillLines(page, 3);
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#linesBody tr');
      if (rows[0]) (rows[0].querySelector('.line-desig') as HTMLInputElement).value = 'فاتورة الخلفية';
      rows[0].querySelector('.line-desig')!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const r = await generateAndRead(page, dlDir);
    const dataUri = 'data:application/pdf;base64,' + r.bytes.toString('base64');
    const pdf = await openPdf(dataUri);
    const imgs = await imagesPerPage(dataUri);
    const txt = await extractText(dataUri);

    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    for (const c of imgs) expect(c).toBe(2);
    expect(/[\u0600-\u06FF]/.test(txt)).toBe(true);
    console.log(`  arabe → ${r.wallMs} ms, ${pdfSize(r.bytes)} KB, texte arabe OK, 2 img/page`);
  });

  test('verif-04 — reprint OPFS (moteur pdfkit+fond)', async ({ page }) => {
    await page.addInitScript((flags) => {
      for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v as string);
      localStorage.setItem('fb_lang', 'fr');
      localStorage.setItem('fb_company', JSON.stringify({
        nom: 'Société Reprint Final', adresse: 'Rabat', if_: null, rc: null, tp: null,
        ice: '001234567890123', cnss: null, patente: null, contact: null, tva: null,
        regimeTva: null, headerActive: false, margeHaut: 1, pdfQuality: 2,
      }));
    }, FLAGS);
    const dlDir = path.join(__dirname, '..', '..', '..', 'test-results', 'prod-check');
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await seedClient(page, 'Client Reprint Final', false);
    await fillLines(page, 3);
    const gen = await generateAndRead(page, dlDir);
    expect(gen.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    let dialog = page.locator('.dialog-overlay');
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dialog.locator('button').last().click();
      await page.waitForTimeout(300);
    }
    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 10000 });
    const reprint = page.locator('#histTableWrap [data-action="reprint"]');
    await expect(reprint.first()).toBeVisible({ timeout: 10000 });
    const rpDl = page.waitForEvent('download', { timeout: 60000 });
    await reprint.first().click();
    const rp = await rpDl;
    const rpPath = path.join(dlDir, 'RP-' + rp.suggestedFilename());
    await rp.saveAs(rpPath);
    const rpBytes = fs.readFileSync(rpPath);
    expect(rpBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(rpBytes.length).toBeGreaterThan(1000);
    console.log(`  reprint OPFS → ${pdfSize(rpBytes)} KB, %PDF- OK`);
  });

  test('verif-05 — fallback : moteur jsPDF explicite (fb_pdf_engine=jspdf) intact', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fb_pdf_engine', 'jspdf');
      localStorage.setItem('fb_lang', 'fr');
    });
    const dlDir = path.join(__dirname, '..', '..', '..', 'test-results', 'prod-check');
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await seedClient(page, 'Client Fallback');
    await fillLines(page, 3);
    const fb = await generateAndRead(page, dlDir);
    const fbUri = 'data:application/pdf;base64,' + fb.bytes.toString('base64');
    expect(fb.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(await imagesPerPage(fbUri)).toEqual(expect.arrayContaining([1]));
    console.log(`  fallback jsPDF → ${fb.wallMs} ms, ${pdfSize(fb.bytes)} KB, 1 img/page OK`);
  });
});