import { test, expect } from '@playwright/test';

const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function countImagesPerPage(dataUri: string): Promise<number[]> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const base64 = dataUri.split(',')[1];
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const counts: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    const n = ops.fnArray.filter((fn: number) => fn === pdfjsLib.OPS.paintImageXObject).length;
    counts.push(n);
  }
  return counts;
}

test.describe('PDF — Pagination multi-pages', () => {
  test('footer sur chaque page, aucune ligne perdue/dupliquée, fond sur chaque page', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/app');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const result = await page.evaluate(async (redPng) => {
      const mod = await import('/js/pdf.js');
      const { loadCompany } = await import('/js/storage.js');

      const mkPayload = (company, n) => ({
        type: 'facture',
        numero: 'FAC-TEST-0001',
        date: '13/08/2026',
        client: { id: 'x', nom: 'Client Test', tel: '0600000000', ice: '001234567890123', adresse: 'Casablanca', ref: '' },
        conditions: 'Paiement sous 30 jours',
        modeReglement: 'Virement',
        notes: 'Note de test multi-pages',
        company,
        totals: {
          showPrices: true,
          lines: Array.from({ length: n }, (_, i) => ({ desig: 'Article numéro ' + (i + 1), prix: 100, qte: 1, total: 100 })),
          totalHT_brut: n * 100, remisePct: 0, remiseMontant: 0,
          tvaTaux: 20, tva: n * 20, totalTTC: n * 120, avance: 0, reste: n * 120,
        },
      });

      const inspect = (stage, expectedRows) => {
        const pageEls = stage.querySelectorAll('.pdf-page');
        const pages = Array.from(pageEls).map((el) => {
          const footer = el.querySelector('.pdf-footer');
          const cs = getComputedStyle(el);
          return {
            footerText: footer ? footer.textContent.trim() : null,
            rowCount: el.querySelectorAll('.pdf-table tbody tr').length,
            hasFooter: !!footer,
            bgImage: cs.backgroundImage,
            bgColor: cs.backgroundColor,
          };
        });
        const totalRows = stage.querySelectorAll('.pdf-table tbody tr').length;
        return { pages, totalRows, expectedRows };
      };

      // Scénario 1 : sans fond, 60 lignes → plusieurs pages
      const company1 = { ...loadCompany(), nom: 'Société QA MultiPages', adresse: 'Casablanca', headerActive: false };
      const pdf1 = await mod.renderPagesToPdf(mkPayload(company1, 60), null);
      const res1 = inspect(document.getElementById('pdf-stage'), 60);
      const numPages1 = pdf1.internal.getNumberOfPages();
      const pdf1Data = pdf1.output('datauristring');

      // Scénario 2 : avec fond (header actif), 45 lignes
      const company2 = { ...loadCompany(), nom: 'Société QA Fond', adresse: 'Casablanca', headerActive: true, headerImage: redPng, margeHaut: 3 };
      const pdf2 = await mod.renderPagesToPdf(mkPayload(company2, 45), null);
      const res2 = inspect(document.getElementById('pdf-stage'), 45);
      const numPages2 = pdf2.internal.getNumberOfPages();
      const pdf2Data = pdf2.output('datauristring');

      return { numPages1, res1, pdf1Data, numPages2, res2, pdf2Data };
    }, RED_PNG);

    // --- Scénario 1 : sans fond ---
    expect(result.numPages1).toBeGreaterThanOrEqual(3);
    expect(result.res1.totalRows).toBe(60);
    for (const p of result.res1.pages) {
      expect(p.hasFooter).toBe(true);
      expect(p.footerText).toContain('Société QA MultiPages');
      expect(p.bgImage).toBe('none');
    }

    // --- Scénario 2 : fond actif ---
    expect(result.numPages2).toBeGreaterThanOrEqual(2);
    expect(result.res2.totalRows).toBe(45);
    for (const p of result.res2.pages) {
      expect(p.hasFooter).toBe(true);
      expect(p.footerText).toContain('Société QA Fond');
      expect(p.bgImage).toBe('none'); // fond extrait du DOM, injecté nativement
      expect(p.bgColor).toBe('rgba(0, 0, 0, 0)'); // fond transparent = mode en-tête
    }

    // --- Vérification des images par page (fond natif + contenu) ---
    const imgs1 = await countImagesPerPage(result.pdf1Data);
    const imgs2 = await countImagesPerPage(result.pdf2Data);
    expect(imgs1.length).toBe(result.numPages1);
    expect(imgs2.length).toBe(result.numPages2);
    for (const n of imgs1) expect(n).toBe(1); // contenu seul
    for (const n of imgs2) expect(n).toBe(2); // fond natif + contenu
  });
});
