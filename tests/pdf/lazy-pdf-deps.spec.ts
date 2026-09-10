import { test, expect, Page, Download } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/*
  Groupe C — lazy loading sécurisé de html2canvas / jsPDF.
  Vérifie : absence au boot, chargement à la première génération, aucun
  double téléchargement (y compris en appel concurrent), fallback automatique
  (échec PDFKit → jsPDF chargé à la demande), et reprint.
*/

const specTimeout = 180000;

test.describe('PDF dependencies lazy loading', () => {
  test.setTimeout(specTimeout);

  async function gotoApp(page: Page) {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#docType')).toBeVisible();
  }

  async function defaultEngine(page: Page) {
    await page.addInitScript(() => localStorage.removeItem('fb_pdf_engine'));
  }

  async function fillDoc(page: Page, clientNom: string) {
    await page.locator('[data-action="add-client"]').click();
    await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 3000 });
    await page.locator('#cClientNom').fill(clientNom);
    await page.locator('[data-action="save-client"]').click();
    await page.waitForTimeout(600);
    await page.locator('#clientSelect').selectOption({ label: clientNom });
    await page.evaluate(() => {
      (document.getElementById('clientSelect') as HTMLSelectElement).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(400);

    for (let i = 0; i < 3; i++) await page.locator('[data-action="add-line"]').click();
    await page.waitForTimeout(300);

    const rows = page.locator('#linesBody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      await row.locator('.line-desig').fill('Article ' + (i + 1));
      await row.locator('.line-prix').fill(String(100 + i));
      await row.locator('.line-qte').fill('2');
    }
    await page.waitForTimeout(200);
  }

  async function generateDownload(page: Page): Promise<Download> {
    const dlg = page.locator('.dialog-overlay:visible');
    if (await dlg.count() > 0) {
      await dlg.locator('button').last().click();
      await page.waitForTimeout(300);
    }
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }).catch(() => null),
      page.locator('[data-action="generate-pdf"]').click(),
    ]);
    expect(dl).toBeTruthy();
    return dl!;
  }

  async function firstBytes(dl: Download): Promise<string> {
    const dir = path.join(__dirname, '..', '..', '..', 'test-results', 'lazy-pdf');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'lazy-' + dl.suggestedFilename());
    await dl.saveAs(target);
    const buf = fs.readFileSync(target);
    return buf.subarray(0, 5).toString('latin1');
  }

  test('01 — boot : html2canvas et jsPDF ne sont PAS chargés', async ({ page }) => {
    await defaultEngine(page);
    await gotoApp(page);
    const s = await page.evaluate(() => ({
      h2: typeof (window as any).html2canvas,
      jspdf: typeof (window as any).jspdf,
      scripts: Array.from(document.scripts).map(s => s.getAttribute('src')).filter(Boolean),
    }));
    expect(s.h2).toBe('undefined');
    expect(s.jspdf).toBe('undefined');
    expect(s.scripts.some(u => u.includes('html2canvas'))).toBe(false);
    expect(s.scripts.some(u => u.includes('jspdf'))).toBe(false);
  });

  test('02 — PDFKit par défaut : 1re génération charge html2canvas seulement, aucun double', async ({ page }) => {
    await defaultEngine(page);
    const loaded: string[] = [];
    page.on('request', r => {
      const u = r.url();
      if (u.includes('html2canvas') || u.includes('jspdf')) loaded.push(u);
    });

    await gotoApp(page);
    const bootState = await page.evaluate(() => ({
      h2: typeof (window as any).html2canvas,
      jspdf: typeof (window as any).jspdf,
    }));
    expect(bootState.h2).toBe('undefined');

    await fillDoc(page, 'Client Lazy PdfKit');
    const dl = await generateDownload(page);
    expect(await firstBytes(dl)).toBe('%PDF-');

    const h2jsPdfReqIds = loaded.map(u => (u.includes('html2canvas') ? 'html2canvas' : 'jspdf'));
    expect(h2jsPdfReqIds).toEqual(['html2canvas']);

    const after = await page.evaluate(() => ({
      h2: typeof (window as any).html2canvas,
      jspdf: typeof (window as any).jspdf,
      scriptsH2: Array.from(document.scripts).filter(s => (s.getAttribute('src') || '').includes('html2canvas')).length,
    }));
    expect(after.h2).toBe('function');
    expect(after.jspdf).toBe('undefined');
    expect(after.scriptsH2).toBe(1);
  });

  test('03 — jsPDF explicite : 2 générations = 1 seul téléchargement par lib', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fb_pdf_engine', 'jspdf'));
    const loaded: string[] = [];
    page.on('request', r => {
      const u = r.url();
      if (u.includes('html2canvas') || u.includes('jspdf')) loaded.push(u);
    });

    await gotoApp(page);
    await fillDoc(page, 'Client Lazy Jspdf');
    const dl1 = await generateDownload(page);
    expect(await firstBytes(dl1)).toBe('%PDF-');

    const after = await page.evaluate(() => ({
      h2: typeof (window as any).html2canvas,
      jsPdf: typeof (window as any).jspdf,
      scriptsJspdf: Array.from(document.scripts).filter(s => (s.getAttribute('src') || '').includes('jspdf')).length,
      scriptsH2: Array.from(document.scripts).filter(s => (s.getAttribute('src') || '').includes('html2canvas')).length,
    }));
    expect(after.h2).toBe('function');
    expect(after.jsPdf).toBe('object');

    await page.locator('#docNumero').fill('FAC-2026-9999');
    const dl2 = await generateDownload(page);
    expect(await firstBytes(dl2)).toBe('%PDF-');

    const ids = loaded.map(u => (u.includes('html2canvas') ? 'html2canvas' : 'jspdf'));
    expect(ids.filter(x => x === 'html2canvas')).toHaveLength(1);
    expect(ids.filter(x => x === 'jspdf')).toHaveLength(1);
    expect(after.scriptsJspdf).toBe(1);
    expect(after.scriptsH2).toBe(1);
  });

  test('04 — appels simultanés : une seule Promise partagée, un seul <script> par lib', async ({ page }) => {
    await defaultEngine(page);
    await gotoApp(page);
    const res = await page.evaluate(async () => {
      const m = await import('/js/pdf-dependencies.js');
      const p1 = m.ensureHtml2Canvas();
      const p2 = m.ensureHtml2Canvas();
      const j1 = m.ensureJsPdf();
      const j2 = m.ensureJsPdf();
      await Promise.all([p1, p2, j1, j2]);
      const p3 = m.ensureJsPdf();
      await p3;
      return {
        scriptsH2: Array.from(document.scripts).filter(s => (s.getAttribute('src') || '').includes('html2canvas')).length,
        scriptsJspdf: Array.from(document.scripts).filter(s => (s.getAttribute('src') || '').includes('jspdf')).length,
        h2: typeof (window as any).html2canvas,
        jsPdf: typeof (window as any).jspdf,
      };
    });
    expect(res.scriptsH2).toBe(1);
    expect(res.scriptsJspdf).toBe(1);
    expect(res.h2).toBe('function');
    expect(res.jsPdf).toBe('object');
  });

  test('05 — PDFKit en échec simulé : fallback automatique jsPDF chargé à la demande', async ({ page }) => {
    const errors: string[] = [];
    const failedUrls: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error') errors.push('[console] ' + m.text());
    });
    page.on('requestfailed', r => failedUrls.push(r.url()));
    await page.route('**/assets/lib/pdfkit.standalone.js', route => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('fb_pdf_engine', 'pdfkit');
      localStorage.setItem('fb_lang', 'fr');
    });

    await gotoApp(page);
    await fillDoc(page, 'Client Lazy Fallback');
    const dl = await generateDownload(page);
    expect(await firstBytes(dl)).toBe('%PDF-');

    const after = await page.evaluate(() => ({
      h2: typeof (window as any).html2canvas,
      scriptsH2: Array.from(document.scripts).filter(s => (s.getAttribute('src') || '').includes('html2canvas')).length,
    }));
    expect(after.h2).toBe('function');
    expect(after.scriptsH2).toBe(1);

    const unexpectedlyFailed = failedUrls.filter(u => !u.includes('/assets/lib/pdfkit.standalone.js'));
    expect(unexpectedlyFailed).toEqual([]);

    const unexpected = errors.filter(e =>
      !e.includes('[pdf] moteur pdfkit en échec')
      && !e.startsWith('[console] Failed to load resource:')
    );
    expect(unexpected).toEqual([]);
  });

  test('06 — reprint historique (moteur par défaut) : même chemin lazy', async ({ page }) => {
    await defaultEngine(page);
    await gotoApp(page);
    await fillDoc(page, 'Client Lazy Reprint');
    const dl1 = await generateDownload(page);
    expect(await firstBytes(dl1)).toBe('%PDF-');

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 10000 });
    const reprint = page.locator('#histTableWrap [data-action="reprint"]');
    await expect(reprint.first()).toBeVisible({ timeout: 10000 });
    const rpDl = page.waitForEvent('download', { timeout: 120000 });
    await reprint.first().click();
    const rp = await rpDl;
    expect(await firstBytes(rp)).toBe('%PDF-');
  });
});