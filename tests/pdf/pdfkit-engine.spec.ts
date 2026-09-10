import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDFJS_ESM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_ESM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const TEST_NUM = 'FAC-ENG-0001';

async function openPdf(dataUri: string): Promise<any> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const base64 = dataUri.split(',')[1];
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
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

function mkPayload(overrides: any = {}): any {
  const n = overrides.n || 3;
  return {
    type: 'facture',
    numero: overrides.numero || TEST_NUM,
    date: '07/09/2026',
    client: {
      id: 'x',
      nom: overrides.clientNom || 'Entreprise Test Moteur',
      tel: '0612345678',
      ice: '001234567890123',
      adresse: '123 Avenue Mohammed V\nCasablanca\nMaroc',
      ref: '',
    },
    conditions: 'Paiement sous 30 jours',
    modeReglement: 'Virement bancaire',
    notes: 'Note moteur pdfkit QA.',
    company: overrides.company,
    totals: {
      showPrices: true,
      lines: Array.from({ length: n }, (_, i) => ({
        desig: i === 0 ? (overrides.firstDesig ?? 'Article numero 1') : 'Ligne ' + (i + 1),
        prix: 100,
        qte: 1,
        total: 100,
      })),
      totalHT_brut: n * 100, remisePct: 0, remiseMontant: 0,
      tvaTaux: 20, tva: n * 20, totalTTC: n * 120, avance: 0, reste: n * 120,
    },
  };
}

test.describe('PDFKit — moteur expérimental (parallèle à jsPDF)', () => {
  test.setTimeout(180000);

  async function renderInPage(
    page: any,
    engine: string,
    payload: any,
    headerSrc: any,
  ): Promise<any> {
    return page.evaluate(
      async ({ engine, payload, headerSrc }) => {
        const mod = await import('/js/pdf.js');
        mod.setPdfEngine(engine);
        const i18ready = async () => {
          while (!window.i18next) {
            await new Promise<void>((res) => setTimeout(res, 50));
          }
          if (!window.i18next.isInitialized) {
            await new Promise<void>((res) => {
              const timer = setInterval(() => {
                if (window.i18next.isInitialized) { clearInterval(timer); res(); }
              }, 40);
            });
          }
          const want = localStorage.getItem('fb_lang');
          if (want && window.i18next.language !== want) {
            await window.i18next.changeLanguage(want);
          }
          document.documentElement.dir = window.i18next.language === 'ar' ? 'rtl' : 'ltr';
        };
        await i18ready();
        if (engine === 'pdfkit') {
          await (await import('/js/pdfkit-engine.js')).ensurePdfKit();
        }
        const t0 = performance.now();
        const pdf = await mod.renderPagesToPdf(payload, headerSrc);
        const wallMs = performance.now() - t0;
        const result: any = {
          wallMs,
          engine,
          data: pdf.output('datauristring'),
        };
        if (engine === 'jspdf') {
          result.numPages = pdf.internal.getNumberOfPages();
        } else if (engine === 'pdfkit') {
          result.metrics = window.__pdfkitEngineMetrics || null;
        }
        return result;
      },
      { engine, payload, headerSrc },
    );
  }

  test('01 — sans header : contenu extractible + structure identique à jsPDF', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société Moteur QA', headerActive: false, pdfQuality: 2 };
    });
    const payload = mkPayload({ company });

    const js = await renderInPage(page, 'jspdf', payload, null);
    const pk = await renderInPage(page, 'pdfkit', payload, null);

    const jsText = await extractText(js.data);
    const pkText = await extractText(pk.data);

    const jsBytes = Buffer.from(String(js.data.split(',')[1] || ''), 'base64');
    const pkBytes = Buffer.from(String(pk.data.split(',')[1] || ''), 'base64');
    expect(jsBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pkBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pkBytes.length).toBeGreaterThan(1000);
    expect(pk.metrics).not.toBeNull();
    expect(pk.metrics.pages).toBe(1);

    for (const needle of [TEST_NUM, 'FACTURE', 'Entreprise Test Moteur', 'Article numero 1', 'Client']) {
      expect(pkText.toLowerCase(), `needle ${needle}`).toContain(needle.toLowerCase());
      expect(jsText.toLowerCase(), `needle ${needle}`).toContain(needle.toLowerCase());
    }

    const imgsPk = await imagesPerPage(pk.data);
    expect(imgsPk.length).toBe(1);
    for (const c of imgsPk) expect(c).toBe(2); // fond par défaut entit (natif) + contenu PNG transparent
  });

  test('02 — header actif : fond natif + rendu pixel-identique à jsPDF (diff=0)', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société Fond QA', headerActive: true, headerImage: undefined, margeHaut: 1, pdfQuality: 2 };
    });
    const payload = mkPayload({ company });

    const js = await renderInPage(page, 'jspdf', payload, RED_PNG);
    const pk = await renderInPage(page, 'pdfkit', payload, RED_PNG);

    const imgsJs = await imagesPerPage(js.data);
    const imgsPk = await imagesPerPage(pk.data);
    expect(imgsPk.length).toBe((await openPdf(pk.data)).numPages);
    for (const c of imgsPk) expect(c).toBe(2);
    expect(imgsJs).toEqual(imgsPk);

    const diff = await page.evaluate(
      async ({ jsData, pkData, pdfjsEsm, workerEsm }) => {
        const pdfjsApi: any = await import(pdfjsEsm);
        pdfjsApi.GlobalWorkerOptions.workerSrc = workerEsm;
        const loadPage = async (dataUri: string) => {
          const b64 = dataUri.split(',')[1];
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const pdf = await pdfjsApi.getDocument({ data: bytes }).promise;
          const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        };
        const d1 = (await loadPage(jsData)).data;
        const d2 = (await loadPage(pkData)).data;
        let maxDiff = 0;
        let diffCount = 0;
        for (let i = 0; i < d1.length; i++) {
          const d = Math.abs(d1[i] - d2[i]);
          if (d) { diffCount++; if (d > maxDiff) maxDiff = d; }
        }
        return { maxDiff, diffCount, total: d1.length };
      },
      { jsData: js.data, pkData: pk.data, pdfjsEsm: PDFJS_ESM, workerEsm: PDFJS_WORKER_ESM },
    );

    console.log(`   pixel diff header-safe → maxDiff=${diff.maxDiff}, diffCount=${diff.diffCount}/${diff.total}`);
    expect(diff.maxDiff).toBe(0);
  });

  test('03 — arabe RTL : rendu OK + texte extractible, parité jsPDF', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fb_lang', 'ar');
      localStorage.setItem('fb_pdf_engine', 'jspdf');
    });
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société AR QA', headerActive: false, pdfQuality: 2 };
    });
    const payload = mkPayload({ company, firstDesig: 'فاتورة المبيعات', clientNom: 'زبون تجريبي' });

    const js = await renderInPage(page, 'jspdf', payload, null);
    const pk = await renderInPage(page, 'pdfkit', payload, null);

    const jsText = await extractText(js.data);
    const pkText = await extractText(pk.data);
    const arabicRe = /[\u0600-\u06FF]/;

    expect(arabicRe.test(pkText)).toBe(true);
    expect(pkText).toContain('فاتورة');
    expect(arabicRe.test(jsText)).toBe(true);
    expect(jsText).toContain(TEST_NUM);
    expect((await imagesPerPage(pk.data)).length).toBe((await openPdf(pk.data)).numPages);
  });

  test('04 — document multi-pages avec header : pagination et performance vs jsPDF', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société MultiPages Moteur', headerActive: true, margeHaut: 1, pdfQuality: 2 };
    });
    const payload = mkPayload({ company, n: 45 });

    const js = await renderInPage(page, 'jspdf', payload, RED_PNG);
    const pk = await renderInPage(page, 'pdfkit', payload, RED_PNG);

    const pkPdf = await openPdf(pk.data);
    expect(pkPdf.numPages).toBe(js.numPages);
    expect(pkPdf.numPages).toBeGreaterThanOrEqual(2);

    const pkSize = pk.data.length;
    expect(pk.metrics.pages).toBe(js.numPages);
    expect(pk.metrics.steps.totalMs).toBeLessThan(js.wallMs);
    expect(pkSize).toBeGreaterThan(1000);

    for (const c of await imagesPerPage(pk.data)) expect(c).toBe(2);
    expect(await imagesPerPage(js.data)).toEqual(await imagesPerPage(pk.data));

    console.log(
      `   perf (header) → pdfkit=${Math.round(pk.metrics.steps.totalMs)}ms (capture=${Math.round(pk.metrics.steps.captureMs)}ms, embed=${Math.round(pk.metrics.steps.embedMs)}ms, overlay=${Math.round(pk.metrics.steps.overlayMs)}ms) vs jsPDF=${Math.round(js.wallMs)}ms`,
    );
    console.log('   pdfkit vs jsPDF ratio: ' + (js.wallMs / pk.metrics.steps.totalMs).toFixed(2) + '×');
  });

  test('05 — reprint d\'un document généré par pdfkit (OPFS + historique)', async ({ page }) => {
    page.on('console', (m) => { if (m.type() === 'error') console.log('[page.error]', m.text().slice(0, 300)); });
    page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
    await page.addInitScript((redPng) => {
      localStorage.setItem('fb_pdf_engine', 'pdfkit');
      localStorage.setItem(
        'fb_company',
        JSON.stringify({ nom: 'Société Reprint QA', adresse: 'Casablanca', if_: null, rc: null, tp: null, ice: '001234567890123', cnss: null, patente: null, contact: null, tva: null, regimeTva: null, headerActive: true, headerImage: redPng, margeHaut: 1, pdfQuality: 2 }),
      );
    }, RED_PNG);
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const existingClient = page.locator('#clientSelect option').filter({ hasText: 'Client Reprint' });
    if (await existingClient.count() === 0) {
      await page.locator('[data-action="add-client"]').click();
      await expect(page.locator('#clientModalOverlay')).toBeVisible({ timeout: 3000 });
      await page.locator('#cClientNom').fill('Client Reprint');
      await page.locator('#cClientTel').fill('0611111111');
      await page.locator('#cClientAdresse').fill('Rabat');
      await page.locator('[data-action="save-client"]').click();
      await page.waitForTimeout(800);
    }
    await page.locator('#clientSelect').selectOption({ label: 'Client Reprint' });
    await page.evaluate(() => {
      document.getElementById('clientSelect')!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    await page.locator('#docType').selectOption('facture');
    await page.waitForTimeout(300);

    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="add-line"]').click();
      await page.waitForTimeout(150);
    }
    const lignes = ['Développement Web', 'Conception UI', 'Maintenance'];
    for (let i = 0; i < 3; i++) {
      const row = page.locator('#linesBody tr').nth(i);
      await row.locator('.line-desig').fill(lignes[i]);
      await row.locator('.line-prix').fill(String(100));
      await row.locator('.line-qte').fill('1');
      await page.waitForTimeout(150);
    }
    const rowCount = await page.locator('#linesBody tr').count();
    for (let i = 3; i < rowCount; i++) {
      await page.locator('#linesBody tr').nth(i).locator('.icon-btn').first().click();
      await page.waitForTimeout(150);
    }

    const downloadDir = path.join(__dirname, '..', '..', '..', 'test-results');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    const genDownload = page.waitForEvent('download', { timeout: 45000 });
    await page.locator('[data-action="generate-pdf"]').click();
    await page.waitForTimeout(2500);
    const dial = page.locator('.dialog-overlay:visible');
    if (await dial.count() > 0) {
      const msg = await dial.locator('p').first().textContent().catch(() => '');
      console.log('[gen dialog]', msg);
      await dial.locator('button').last().click();
      await page.waitForTimeout(500);
    }
    const gen = await genDownload;
    const genPath = path.join(downloadDir, 'ENG-' + gen.suggestedFilename());
    await gen.saveAs(genPath);
    const genBytes = fs.readFileSync(genPath);
    expect(genBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    let dialog = page.locator('.dialog-overlay');
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dialog.locator('button').last().click();
      await page.waitForTimeout(400);
    }

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 10000 });

    const reprint = page.locator('#histTableWrap [data-action="reprint"]');
    await expect(reprint.first()).toBeVisible({ timeout: 10000 });
    const rpDownload = page.waitForEvent('download', { timeout: 45000 });
    await reprint.first().click();
    const rp = await rpDownload;
    const rpPath = path.join(downloadDir, 'RP-' + rp.suggestedFilename());
    await rp.saveAs(rpPath);
    const rpBytes = fs.readFileSync(rpPath);
    expect(rpBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(rpBytes.length).toBeGreaterThan(1000);

    dialog = page.locator('.dialog-overlay');
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dialog.locator('button').last().click();
    }

    console.log(`   reprint OPFS: ${rp.suggestedFilename()} (${rpBytes.length} octets)`);
  });

  test('06 — défaut = pdfkit (moteur principal), bundle non préchargé au boot', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fb_pdf_engine'));
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const engine = await page.evaluate(async () => (await import('/js/pdf.js')).getPdfEngine());
    expect(engine).toBe('pdfkit');

    const pdfkitLoaded = await page.evaluate(() => Boolean((window as any).PDFDocument));
    expect(pdfkitLoaded).toBe(false);
  });
});