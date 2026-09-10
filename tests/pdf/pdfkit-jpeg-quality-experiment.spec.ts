import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PDFJS_ESM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_ESM = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const TEST_NUM = 'FAC-BGQ-0001';
const RUNS_RECO = 3;
const ART_DIR = path.join(__dirname, '..', '..', '..', 'test-results', 'bg-quality');

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

function mkPayload(overrides: any = {}): any {
  const n = overrides.n || 3;
  return {
    type: 'facture',
    numero: TEST_NUM,
    date: '08/09/2026',
    client: {
      id: 'x',
      nom: 'Entreprise Validation JPEG',
      tel: '0612345678',
      ice: '001234567890123',
      adresse: '12 Rue des Normes\nTanger\nMaroc',
      ref: '',
    },
    conditions: 'Paiement sous 30 jours — garantie de qualité',
    modeReglement: 'Virement bancaire',
    notes: 'Note validation fond JPEG.',
    company: overrides.company,
    totals: {
      showPrices: true,
      lines: Array.from({ length: n }, (_, i) => ({
        desig: i === 0 ? 'Article validation fond' : 'Ligne ' + (i + 1),
        prix: 100,
        qte: 1,
        total: 100,
      })),
      totalHT_brut: n * 100, remisePct: 0, remiseMontant: 0,
      tvaTaux: 20, tva: n * 20, totalTTC: n * 120, avance: 0, reste: n * 120,
    },
  };
}

function zoneMetrics(ref: any, cmp: any, r: { x: number; y: number; w: number; h: number }) {
  let max = 0, sum = 0, n = 0, d8 = 0, d32 = 0;
  for (let yy = r.y; yy < r.y + r.h; yy++) {
    const base = yy * ref.width;
    for (let xx = r.x; xx < r.x + r.w; xx++) {
      const k = (base + xx) * 4;
      let m = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(ref.data[k + c] - cmp.data[k + c]);
        if (d > m) m = d;
      }
      sum += m; n++;
      if (m > 8) d8++;
      if (m > 32) d32++;
      if (m > max) max = m;
    }
  }
  return { max, meanAbs: sum / n, pctDelta8: (d8 / n) * 100, pctDelta32: (d32 / n) * 100 };
}

test.describe('Validation — qualité JPEG fond entit (PDFKit, hors production)', () => {
  test.setTimeout(900000);

  async function renderPages(page: any, payload: any, bgDataUri: string): Promise<{ wallMs: number; metrics: any; data: string }> {
    return page.evaluate(
      async ({ payload, bgDataUri }) => {
        localStorage.setItem('fb_pdf_bg', bgDataUri);
        localStorage.setItem('fb_pdf_bg_mode', 'full');
        localStorage.setItem('fb_pdf_bg_fmt', 'png');
        const mod = await import('/js/pdf.js');
        mod.setPdfEngine('pdfkit');
        while (!window.i18next || !window.i18next.isInitialized) await new Promise((r) => setTimeout(r, 40));
        await (await import('/js/pdfkit-engine.js')).ensurePdfKit();
        const t0 = performance.now();
        const pdf = await mod.renderPagesToPdf(payload, null);
        const wallMs = performance.now() - t0;
        return {
          wallMs,
          metrics: window.__pdfkitEngineMetrics || null,
          data: pdf.output('datauristring'),
        };
      },
      { payload, bgDataUri },
    );
  }

  test('01 — balayage qualité JPEG (0.80→0.95) : métriques pixels par zone sur l\'image source', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fb_lang', 'fr'));
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const result = await page.evaluate(async () => {
      const zoneMetrics = (ref: any, cmp: any, r: { x: number; y: number; w: number; h: number }) => {
        let max = 0, sum = 0, n = 0, d8 = 0, d32 = 0;
        for (let yy = r.y; yy < r.y + r.h; yy++) {
          const base = yy * ref.width;
          for (let xx = r.x; xx < r.x + r.w; xx++) {
            const k = (base + xx) * 4;
            let m = 0;
            for (let c = 0; c < 3; c++) {
              const d = Math.abs(ref.data[k + c] - cmp.data[k + c]);
              if (d > m) m = d;
            }
            sum += m; n++;
            if (m > 8) d8++;
            if (m > 32) d32++;
            if (m > max) max = m;
          }
        }
        return { max, meanAbs: sum / n, pctDelta8: (d8 / n) * 100, pctDelta32: (d32 / n) * 100 };
      };
      const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
      const orig = await (await fetch('/entit.png')).blob();
      const origUri = await new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.readAsDataURL(orig);
      });
      const img = await loadImg(origUri);
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const ref = ctx.getImageData(0, 0, W, H);

      const bbox = (pred: (r: number, g: number, b: number) => boolean) => {
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
          const base = y * W;
          for (let x = 0; x < W; x++) {
            const k = (base + x) * 4;
            if (pred(ref.data[k], ref.data[k + 1], ref.data[k + 2])) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      };
      const orange = bbox((r, g, b) => r > 210 && g > 60 && g < 220 && b < 90);
      const dark = bbox((r, g, b) => r < 45 && g < 45 && b < 45);
      const zones: any = {
        full: { x: 0, y: 0, w: W, h: H },
        centre: { x: Math.floor(W * 0.25), y: Math.floor(H * 0.3), w: Math.floor(W * 0.5), h: Math.floor(H * 0.4) },
        bordHaut: { x: 0, y: 0, w: W, h: Math.floor(H * 0.08) },
        bordBas: { x: 0, y: Math.floor(H * 0.92), w: W, h: H - Math.floor(H * 0.92) },
        bordGauche: { x: 0, y: 0, w: Math.floor(W * 0.04), h: H },
        bordDroit: { x: Math.floor(W * 0.96), y: 0, w: W - Math.floor(W * 0.96), h: H },
      };
      if (orange) zones.orange = orange;
      if (dark) zones.dark = dark;

      const zNames = Object.keys(zones);
      const rows: any[] = [];
      for (const q of [0.8, 0.85, 0.88, 0.9, 0.95]) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0);
        let jpe;
        let attempts = 0;
        do { jpe = c.toDataURL('image/jpeg', q); attempts++; } while (attempts < 2);
        const jimg = await loadImg(jpe);
        c.getContext('2d')!.fillRect(0, 0, W, H);
        c.getContext('2d')!.drawImage(jimg, 0, 0);
        const cmp = c.getContext('2d')!.getImageData(0, 0, W, H);
        const jpegBytes = Math.floor(jpe.length * 3 / 4);
        const zonesOut: any = {};
        for (const zn of zNames) {
          const m = zoneMetrics(ref, cmp, zones[zn]);
          zonesOut[zn] = { max: m.max, meanAbs: +m.meanAbs.toFixed(3), pct8: +m.pctDelta8.toFixed(2), pct32: +m.pctDelta32.toFixed(2) };
        }
        rows.push({ q, jpegKB: +(jpegBytes / 1024).toFixed(1), zones: zonesOut });
      }
      return { W, H, orange, dark, rows };
    });

    console.log(`\n  entit.png ${result.W}x${result.H} — bbox orange=${JSON.stringify(result.orange)} dark=${JSON.stringify(result.dark)}`);
    for (const r of result.rows) {
      const zAll = Object.entries(r.zones)
        .map(([k, v]: any) => `${k}(Δmax=${v.max}, m=${v.meanAbs}, 8=).`)
        .join('');
      console.log(
        `  JPEG q${r.q.toFixed(2)} → ${r.jpegKB} KB | full max=${r.zones.full.max} mean=${r.zones.full.meanAbs} %>8=${r.zones.full.pct8}% %>32=${r.zones.full.pct32}%`,
      );
      for (const zn of ['orange', 'dark', 'bordHaut', 'bordBas', 'bordGauche', 'bordDroit', 'centre']) {
        if (r.zones[zn]) {
          console.log(`        ${zn}: Δmax=${r.zones[zn].max} Δmoy=${r.zones[zn].meanAbs} pct8=${r.zones[zn].pct8}% pct32=${r.zones[zn].pct32}%`);
        }
      }
    }
  });

  test('02 — vrais PDF multi-pages (2p) par qualité + 3 runs qualité recommandée', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société Valid JPEG', headerActive: false, pdfQuality: 2 };
    });
    const payload = mkPayload({ company, n: 45 });

    if (!fs.existsSync(ART_DIR)) fs.mkdirSync(ART_DIR, { recursive: true });

    const recTable: any = {};
    const qs = [0.8, 0.85, 0.88, 0.9, 0.95];
    for (const q of qs) {
      const jpe = await page.evaluate(async (q) => {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = '/entit.png';
        });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        return c.toDataURL('image/jpeg', q);
      }, q);

      const runs = q === 0.88 ? RUNS_RECO : 1;
      const times: number[] = [];
      let last: any = null;
      for (let i = 0; i < runs; i++) {
        const r = await renderPages(page, payload, jpe);
        times.push(r.wallMs);
        last = r;
      }
      const p = await last;
      const sizeBytes = Math.floor(Buffer.from(p.data.split(',')[1], 'base64').length);
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      recTable[q] = { avg, sizeBytes, pages: p.metrics.pages, steps: p.metrics.steps };
      console.log(
        `  PDF q${q.toFixed(2)} → génération (avg ${runs}x) = ${(avg / 1000).toFixed(2)} s, taille = ${(sizeBytes / 1024).toFixed(1)} KB, pages = ${p.metrics.pages} (images/page=${(await imagesPerPage(p.data)).join(',')})`,
      );
      const pngArt = await page.evaluate(
        async ({ dataUri, pdfjsEsm, workerEsm }) => {
          const api: any = await import(pdfjsEsm);
          api.GlobalWorkerOptions.workerSrc = workerEsm;
          const bytes = Uint8Array.from(atob(dataUri.split(',')[1]), (x) => x.charCodeAt(0));
          const pdf = await api.getDocument({ data: bytes }).promise;
          const pg = await pdf.getPage(1);
          const vp = pg.getViewport({ scale: 2 });
          const cv = document.createElement('canvas');
          cv.width = vp.width;
          cv.height = vp.height;
          await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          return cv.toDataURL('image/png');
        },
        { dataUri: p.data, pdfjsEsm: PDFJS_ESM, workerEsm: PDFJS_WORKER_ESM },
      );
      fs.writeFileSync(path.join(ART_DIR, `pdf-page1-q${q.toFixed(2)}.png`), Buffer.from(pngArt.split(',')[1], 'base64'));

      const txt = await extractText(p.data);
      expect(p.metrics.pages).toBeGreaterThanOrEqual(2);
      expect(txt.toLowerCase()).toContain('facture');
      expect(txt).toContain(TEST_NUM);
    }

    const r88 = recTable[0.88];
    const r80 = recTable[0.8];
    expect(r88.sizeBytes).toBeGreaterThan(r80.sizeBytes);
    console.log(`  → artefacts : test-results/bg-quality/pdf-page1-q*.png`);
  });

  test('03 — rendu pdf.js scale 1/1.5/2/3 : PNG vs JPEG 0.88 (zones + position, pas de déformation)', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    const company = await page.evaluate(async () => {
      const { loadCompany } = await import('/js/storage.js');
      return { ...loadCompany(), nom: 'Société Valid Scale', headerActive: false, pdfQuality: 2 };
    });
    const payload = mkPayload({ company });

    const origUri = await page.evaluate(async () => {
      const b = await (await fetch('/entit.png')).blob();
      return await new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.readAsDataURL(b);
      });
    });
    const jpeUri = await page.evaluate(async () => {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = '/entit.png';
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.88);
    });

    const pdfPng = await renderPages(page, payload, origUri);
    const pdfJpg = await renderPages(page, payload, jpeUri);

    const comp = await page.evaluate(
      async ({ pngData, jpgData, pdfjsEsm, workerEsm }) => {
        const zoneMetrics = (ref: any, cmp: any, r: { x: number; y: number; w: number; h: number }) => {
          let max = 0, sum = 0, n = 0, d8 = 0, d32 = 0;
          for (let yy = r.y; yy < r.y + r.h; yy++) {
            const base = yy * ref.width;
            for (let xx = r.x; xx < r.x + r.w; xx++) {
              const k = (base + xx) * 4;
              let m = 0;
              for (let c = 0; c < 3; c++) {
                const d = Math.abs(ref.data[k + c] - cmp.data[k + c]);
                if (d > m) m = d;
              }
              sum += m; n++;
              if (m > 8) d8++;
              if (m > 32) d32++;
              if (m > max) max = m;
            }
          }
          return { max, meanAbs: sum / n, pctDelta8: (d8 / n) * 100, pctDelta32: (d32 / n) * 100 };
        };
        const api: any = await import(pdfjsEsm);
        api.GlobalWorkerOptions.workerSrc = workerEsm;
        const loadElectron = async (dataUri: string) => {
          const bytes = Uint8Array.from(atob(dataUri.split(',')[1]), (x) => x.charCodeAt(0));
          const pdf = await api.getDocument({ data: bytes }).promise;
          return pdf;
        };
        const pdfP = await loadElectron(pngData);
        const pdfJ = await loadElectron(jpgData);
        const render = async (pdf: any) => {
          const pg = await pdf.getPage(1);
          const vp = pg.getViewport({ scale: 1 });
          const base = { width: vp.width, height: vp.height };
          const out: any = {};
          for (const s of [1, 1.5, 2, 3]) {
            const v = pg.getViewport({ scale: s });
            const cv = document.createElement('canvas');
            cv.width = Math.round(v.width);
            cv.height = Math.round(v.height);
            await pg.render({ canvasContext: cv.getContext('2d'), viewport: v, renderInteractiveForms: false }).promise;
            out[s] = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
          }
          return { base, out };
        };
        const rP = await render(pdfP);
        const rJ = await render(pdfJ);

        const zoneOf = (z: any, s: number, base: any) => ({
          x: Math.floor(z.x * (base.width * s / 1055)),
          y: Math.floor(z.y * (base.height * s / 1491)),
          w: Math.max(1, Math.floor(z.w * (base.width * s / 1055))),
          h: Math.max(1, Math.floor(z.h * (base.height * s / 1491))),
        });

        const zones = { full: { x: 0, y: 0, w: 1055, h: 1491 } };
        const res: any = {};
        for (const s of [1, 1.5, 2, 3]) {
          const r = zoneOf(zones.full, s, rP.base);
          const m = zoneMetrics(rP.out[s], rJ.out[s], r);
          res[s] = { max: m.max, meanAbs: +m.meanAbs.toFixed(3), pct8: +m.pctDelta8.toFixed(2) };
        }

        const s2 = zoneOf(zones.full, 2, rP.base);
        const mm2 = zoneMetrics(rP.out[2], rJ.out[2], s2);

        const orange = (() => {
          let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
          const d = rP.out[2].data, W = rP.out[2].width, H = rP.out[2].height;
          for (let y = 0; y < H; y++) {
            const b = y * W;
            for (let x = 0; x < W; x++) {
              const k = (b + x) * 4;
              if (d[k] > 210 && d[k + 1] > 60 && d[k + 1] < 220 && d[k + 2] < 90) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }
          return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        })();
        const zO = orange && zoneOf(orange, 2, rP.base);
        const mOr = zO ? zoneMetrics(rP.out[2], rJ.out[2], zO) : null;

        const sample = (d0: any, fx: number, fy: number) => {
          const W = d0.width, H = d0.height;
          const x = Math.min(W - 1, Math.floor(fx * W));
          const y = Math.min(H - 1, Math.floor(fy * H));
          const k = (y * W + x) * 4;
          return [d0.data[k], d0.data[k + 1], d0.data[k + 2]];
        };
        const pts: any = {};
        for (const [name, fx, fy] of [['hautG', 0.1, 0.02], ['hautD', 0.92, 0.02], ['centre', 0.5, 0.5], ['basG', 0.06, 0.98]]) {
          pts[name] = { png: sample(rP.out[1], fx, fy), jpg: sample(rJ.out[1], fx, fy) };
        }
        return { res, zone2: mm2, orangeZone: zO, orangeDiff: mOr, pts };
      },
      { pngData: pdfPng.data, jpgData: pdfJpg.data, pdfjsEsm: PDFJS_ESM, workerEsm: PDFJS_WORKER_ESM },
    );

    for (const s of [1, 1.5, 2, 3]) {
      const v = comp.res[s];
      console.log(`  scale ${s} → PNG vs JPEG0.88: Δmax=${v.max} Δmoy=${v.meanAbs} %>8=${v.pct8}%`);
    }
    if (comp.orangeDiff) {
      console.log(`  zone ORANGE (scale2, bbox ${JSON.stringify(comp.orangeZone)}) → Δmax=${comp.orangeDiff.max} Δmoy=${comp.orangeDiff.meanAbs} %>8=${comp.orangeDiff.pct8}%`);
    }
    for (const [name, v] of Object.entries(comp.pts)) {
      const p = (v as any).png, j = (v as any).jpg;
      console.log(`  point ${name}: PNG=${p.join(',')} JPEG=${j.join(',')} → Δ=${Math.max(Math.abs(p[0] - j[0]), Math.abs(p[1] - j[1]), Math.abs(p[2] - j[2]))}`);
    }

    expect(comp.res[1].max).toBeLessThan(80);
    expect(comp.res[1].meanAbs).toBeLessThan(4);
    const c = comp.pts.hautD;
    expect(Math.max(...c.png.map((v: number, i: number) => Math.abs(v - c.jpg[i])))).toBeLessThan(40);
    expect(Math.abs(comp.res[1].pct8 - comp.res[3].pct8)).toBeLessThan(25);
  });
});