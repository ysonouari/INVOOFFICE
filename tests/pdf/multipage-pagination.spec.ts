import { test, expect } from '@playwright/test';

const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
          return {
            footerText: footer ? footer.textContent.trim() : null,
            rowCount: el.querySelectorAll('.pdf-table tbody tr').length,
            hasFooter: !!footer,
            bgImage: getComputedStyle(el).backgroundImage,
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

      // Scénario 2 : avec fond (header actif), 45 lignes
      const company2 = { ...loadCompany(), nom: 'Société QA Fond', adresse: 'Casablanca', headerActive: true, headerImage: redPng, margeHaut: 3 };
      const pdf2 = await mod.renderPagesToPdf(mkPayload(company2, 45), null);
      const res2 = inspect(document.getElementById('pdf-stage'), 45);
      const numPages2 = pdf2.internal.getNumberOfPages();

      return { numPages1, res1, numPages2, res2 };
    }, RED_PNG);

    // --- Scénario 1 : sans fond ---
    expect(result.numPages1).toBeGreaterThanOrEqual(3);
    expect(result.res1.totalRows).toBe(60);
    for (const p of result.res1.pages) {
      expect(p.hasFooter).toBe(true);
      expect(p.footerText).toContain('Société QA MultiPages');
    }

    // --- Scénario 2 : fond présent sur chaque page ---
    expect(result.numPages2).toBeGreaterThanOrEqual(2);
    expect(result.res2.totalRows).toBe(45);
    for (const p of result.res2.pages) {
      expect(p.hasFooter).toBe(true);
      expect(p.footerText).toContain('Société QA Fond');
      expect(p.bgImage).not.toBe('none');
    }
  });
});
