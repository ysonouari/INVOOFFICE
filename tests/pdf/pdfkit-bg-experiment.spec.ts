import { test, expect } from '@playwright/test';

const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ENTIT_SRC = '/entit.png';
const PDFJS_ESM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_ESM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const TEST_NUM = 'FAC-BG-0001';
const RUNS = 3;

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
    date: '08/09/2026',
    client: {
      id: 'x',
      nom: overrides.clientNom || 'Entreprise Fond Exp',
      tel: '0612345678',
      ice: '001234567890123',
      adresse: '45 Boulevard Zerktouni\nCasablanca\nMaroc',
      ref: '',
    },
    conditions: 'Paiement sous 30 jours',
    modeReglement: 'Virement bancaire',
    notes: 'Note expérience fond de page entit.',
    company: overrides.company,
    totals: {
      showPrices: true,
      lines: Array.from({ length: n }, (_, i) => ({
        desig: i === 0 ? (overrides.firstDesig ?? 'Article background 1') : 'Ligne ' + (i + 1),
        prix: 100,
        qte: 1,
        total: 100,
      })),
      totalHT_brut: n * 100, remisePct: 0, remiseMontant: 0,
      tvaTaux: 20, tva: n * 20, totalTTC: n * 120, avance: 0, reste: n * 120,
    },
  };
}

interface Variant {
  label: string;
  engine: string;
  headerSrc: string | null;
  bg: { src: string; mode: string; fmt: string } | null;
}

interface RunResult {
  wallMs: number;
  sizeBytes: number;
  numPages: number;
  steps: Record<string, number>;
  bg: any;
  data: string;
}

test.describe('Expérience — fond de page entit.png (PDFKit), hors production', () => {
  test.setTimeout(600000);

  async function renderInPage(page: any, payload: any, v: Variant): Promise<{ wallMs: number; steps: any; bg: any; data: string; numPages: number; sizeBytes: number }> {
    return page.evaluate(
      async ({ payload, engine, headerSrc, bg }) => {
        if (bg) {
          localStorage.setItem('fb_pdf_bg', bg.src);
          localStorage.setItem('fb_pdf_bg_mode', bg.mode);
          localStorage.setItem('fb_pdf_bg_fmt', bg.fmt);
        } else {
          localStorage.removeItem('fb_pdf_bg');
          localStorage.removeItem('fb_pdf_bg_mode');
          localStorage.removeItem('fb_pdf_bg_fmt');
        }
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
        const out: any = {
          wallMs,
          engine,
          data: pdf.output('datauristring'),
        };
        if (engine === 'jspdf') {
          out.numPages = pdf.internal.getNumberOfPages();
        } else if (engine === 'pdfkit') {
          out.metrics = window.__pdfkitEngineMetrics || null;
        }
        return out;
      },
      { payload, engine: v.engine, headerSrc: v.headerSrc, bg: v.bg },
    );
  }

  async function bench(page: any, payload: any, v: Variant): Promise<RunResult> {
    const runs: RunResult[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await renderInPage(page, payload, v);
      const sizeBytes = r.data ? Math.floor(Buffer.from(String(r.data.split(',')[1] || ''), 'base64').length) : 0;
      runs.push({
        wallMs: r.wallMs,
        sizeBytes,
        numPages: r.engine === 'jspdf' ? r.numPages : r.metrics.pages,
        steps: (r.metrics && r.metrics.steps) || {},
        bg: (r.metrics && r.metrics.bg) || null,
        data: r.data,
      });
    }
    const mean = (key: string, from: (r: RunResult) => number) => {
      const vals = runs.map(from);
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    };
    const last = runs[runs.length - 1];
    const summary: RunResult = {
      wallMs: mean('wall', (r) => r.wallMs),
      sizeBytes: mean('size', (r) => r.sizeBytes),
      numPages: last.numPages,
      steps: {
        bgResolveMs: mean('bgResolve', (r) => r.steps.bgResolveMs || 0),
        bgEmbedMs: mean('bgEmbed', (r) => r.steps.bgEmbedMs || 0),
        captureMs: mean('capture', (r) => r.steps.captureMs || 0),
        embedMs: mean('embed', (r) => r.steps.embedMs || 0),
        overlayMs: mean('overlay', (r) => r.steps.overlayMs || 0),
        outputMs: mean('output', (r) => r.steps.outputMs || 0),
        totalMs: mean('total', (r) => r.steps.totalMs || r.wallMs),
      },
      bg: last.bg,
      data: last.data,
    };
    return summary;
  }

  function fmtMs(ms: number) {
    return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
  }

  function printRow(v: Variant, s: RunResult) {
    const st = s.steps;
    const part = Object.keys(st)
      .map((k) => `${k}=${fmtMs(st[k])}`)
      .join(', ');
    console.log(
      `\n  [${v.label}] avg wall=${fmtMs(s.wallMs)}  size=${(s.sizeBytes / 1024).toFixed(1)} KB  pages=${s.numPages}`,
    );
    if (v.engine === 'pdfkit') console.log('      steps: ' + part);
    if (s.bg) console.log(`      bg: ${s.bg.src} mode=${s.bg.mode} fmt=${s.bg.fmt}/${s.bg.actualFmt} ${s.bg.width}x${s.bg.height}`);
  }

  test('01 — facture courte : répartition temps, taille, images/page, overlay', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société Fond Courte', headerActive: false, pdfQuality: 2 };
    });
    const payload = mkPayload({ company });

    const variants: Variant[] = [
      { label: 'A. jsPDF (actuel, sans header)', engine: 'jspdf', headerSrc: null, bg: null },
      { label: 'B. PDFKit + header actuel (rouge 1px)', engine: 'pdfkit', headerSrc: RED_PNG, bg: null },
      { label: 'C1. PDFKit + entit.png fond PLEIN (mode full)', engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'full', fmt: 'png' } },
      { label: 'C2. PDFKit + entit.png en HEADER (mode header)', engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'header', fmt: 'png' } },
      { label: 'C3. PDFKit + entit.png JPEG aplati (mode full)', engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'full', fmt: 'jpeg' } },
    ];

    const results: Record<string, RunResult> = {};
    for (const v of [...variants]) {
      const company = await page.evaluate(
        async (hasHeader) => {
          const { loadCompany } = await import('/js/storage.js');
          return { ...loadCompany(), nom: 'Société Fond Courte', headerActive: hasHeader, margeHaut: 1, pdfQuality: 2 };
        },
        v.headerSrc === RED_PNG,
      );
      results[v.label] = await bench(page, mkPayload({ company }), v);
      printRow(v, results[v.label]);
    }

    const pkC1 = results['C1. PDFKit + entit.png fond PLEIN (mode full)'];
    const pkC3 = results['C3. PDFKit + entit.png JPEG aplati (mode full)'];

    const imgsC1 = await imagesPerPage(pkC1.data);
    expect(imgsC1.length).toBe(pkC1.numPages);
    for (const c of imgsC1) expect(c).toBe(2);

    const textC1 = await extractText(pkC1.data);
    for (const needle of [TEST_NUM, 'FACTURE', 'Article background 1']) {
      expect(textC1.toLowerCase(), `needle ${needle}`).toContain(needle.toLowerCase());
    }
    expect(pkC1.sizeBytes).toBeLessThan(200 * 1024);
    expect(pkC3.sizeBytes).toBeLessThan(200 * 1024);
  });

  test('02 — fidélité géométrique : mode full vs mode header (même image A4) pixel diff', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société Fidélité Fond', headerActive: false, pdfQuality: 2 };
    });
    const payload = mkPayload({ company });

    const full = await renderInPage(page, payload, { engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'full', fmt: 'png' } });
    const hdr = await renderInPage(page, payload, { engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'header', fmt: 'png' } });

    const bgFull = (full as any).metrics.bg;
    const bgHdr = (hdr as any).metrics.bg;
    expect(bgFull.width).toBe(1240);
    expect(bgFull.height).toBe(1748);
    const ratioFull = bgFull.width / bgFull.height;
    const ratioA4 = 210 / 297;
    expect(Math.abs(ratioFull - ratioA4)).toBeLessThan(0.01);

    const diff = await page.evaluate(
      async ({ d1, d2, pdfjsEsm, workerEsm }) => {
        const pdfjsApi: any = await import(pdfjsEsm);
        pdfjsApi.GlobalWorkerOptions.workerSrc = workerEsm;
        const loadPage = async (dataUri: string) => {
          const b64 = dataUri.split(',')[1];
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const pdf = await pdfjsApi.getDocument({ data: bytes }).promise;
          const pg = await pdf.getPage(1);
          const vp = pg.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const a = (await loadPage(d1));
        const b = (await loadPage(d2));
        let maxDiff = 0;
        let diffCount = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          if (d) { diffCount++; if (d > maxDiff) maxDiff = d; }
        }
        return { maxDiff, diffCount, total: a.length };
      },
      { d1: full.data, d2: hdr.data, pdfjsEsm: PDFJS_ESM, workerEsm: PDFJS_WORKER_ESM },
    );
    console.log(`\n  pixel A4: mode full vs mode header → maxDiff=${diff.maxDiff}, diffCount=${diff.diffCount}/${diff.total}`);
    expect(diff.maxDiff).toBeLessThanOrEqual(1);
  });

  test('03 — facture multi-pages (45 lignes) : timings + même fond sur chaque page', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const variants: Variant[] = [
      { label: 'A. jsPDF multi', engine: 'jspdf', headerSrc: null, bg: null },
      { label: 'B. PDFKit + header actuel (multi)', engine: 'pdfkit', headerSrc: RED_PNG, bg: null },
      { label: 'C1. PDFKit + entit fond full (multi)', engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'full', fmt: 'png' } },
      { label: 'C3. PDFKit + entit fond jpeg (multi)', engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'full', fmt: 'jpeg' } },
    ];

    const results: Record<string, RunResult> = {};
    for (const v of variants) {
      const company = await page.evaluate(
        async (hasHeader) => {
          const { loadCompany } = await import('/js/storage.js');
          return { ...loadCompany(), nom: 'Société Fond Multi', headerActive: hasHeader, margeHaut: 1, pdfQuality: 2 };
        },
        v.headerSrc === RED_PNG,
      );
      results[v.label] = await bench(page, mkPayload({ company, n: 45 }), v);
      printRow(v, results[v.label]);
    }

    const c1 = results['C1. PDFKit + entit fond full (multi)'];
    expect(c1.numPages).toBeGreaterThanOrEqual(2);
    const imgs = await imagesPerPage(c1.data);
    expect(imgs.length).toBe(c1.numPages);
    for (const c of imgs) expect(c).toBe(2);
  });

  test('04 — facture arabe RTL avec fond entit : extraction + pagination', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fb_lang', 'ar'));
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const variants: Variant[] = [
      { label: 'A. jsPDF arabe', engine: 'jspdf', headerSrc: null, bg: null },
      { label: 'C1. PDFKit + entit fond full (arabe)', engine: 'pdfkit', headerSrc: null, bg: { src: ENTIT_SRC, mode: 'full', fmt: 'png' } },
    ];

    const results: Record<string, RunResult> = {};
    for (const v of variants) {
      const company = await page.evaluate(async () => {
        const { loadCompany } = await import('/js/storage.js');
        return { ...loadCompany(), nom: 'Société Fond AR', headerActive: false, pdfQuality: 2 };
      });
      results[v.label] = await bench(page, mkPayload({ company, firstDesig: 'فاتورة الخلفية', clientNom: 'زبون تجريبي' }), v);
      printRow(v, results[v.label]);
    }

    const c1 = results['C1. PDFKit + entit fond full (arabe)'];
    const text = await extractText(c1.data);
    expect(/[\u0600-\u06FF]/.test(text)).toBe(true);
    expect(text).toContain('فاتورة');
    const imgs = await imagesPerPage(c1.data);
    expect(imgs.length).toBe(c1.numPages);
    for (const c of imgs) expect(c).toBe(2);
  });
});