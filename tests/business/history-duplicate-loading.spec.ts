import { test, expect, Page } from '@playwright/test';

/*
  Chargement du bouton « Dupliquer » de l'Historique (correctif ciblé).
  Réutilise le système de loading existant du bouton PDF (js/pdf.js:620) :
  spinner inline `appspin` + disabled + aria-busy, posés SYNCHRONIQUEMENT avant
  l'import lazy de history-actions → pas de double-clic possible.
  Vérifie :
    - état normal avant clic (icône svg, bouton enabled, pas d'aria-busy) ;
    - clic → spinner + disabled + aria-busy immédiats ;
    - clics multiples (2× supplémentaires) → UNE seule duplication ;
    - fin d'opération → bouton restauré (re-render), jamais bloqué ;
    - comportement métier inchangé (1 doc -> 2 docs, numéros distincts) ;
    - fonctionne en thème sombre ET clair.
*/

const PREVIEW_DEFAULTS = {
  nom: 'INVOOFFICE', ice: '001234567890123', adresse: 'Casa', tel: '0660000000', email: 'contact@invooffice.ma',
  ville: 'Casablanca', activite: 'Services', patente: '', rc: '', if: '', cnss: '',
  headerImage: '', headerActive: false, margeHaut: 3, fontSizeOffset: 0, pdfQuality: 2,
  tableColor: '#eef1f6', tableTextColor: '#333333', tvaTaux: 20, showTotalsDefault: true,
};

function seedDoc() {
  const numero = 'FAC-2026-0101';
  return {
    id: 'doc_dup_loading_1',
    type: 'facture',
    numero,
    date: '05/08/2026',
    client: 'Client Duplicate',
    totalTTC: 120,
    createdAt: '2026-08-05T00:00:00.000Z',
    filename: numero + '.pdf',
    payload: {
      type: 'facture',
      numero,
      date: '05/08/2026',
      client: { id: 'c_dup', nom: 'Client Duplicate', tel: '', ice: '', adresse: '', ref: '' },
      conditions: '', modeReglement: '', notes: '',
      company: PREVIEW_DEFAULTS,
      totals: {
        showPrices: true,
        lines: [{ desig: 'Prestation', prix: 40, qte: 3, total: 120 }],
        totalHT_brut: 100, remisePct: 0, remiseMontant: 0, tvaTaux: 20, tva: 20, totalTTC: 120, avance: 0, reste: 120,
      },
    },
  };
}

test.describe('Historique — loading bouton Dupliquer', () => {
  test.setTimeout(180000);

  async function openHistoryWithOneDoc(page: Page, theme: 'dark' | 'light') {
    await page.addInitScript((t) => { localStorage.setItem('fb_lang', 'fr'); localStorage.setItem('fb_theme', t); }, theme);
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#docType')).toBeVisible();

    await page.evaluate((d) => localStorage.setItem('fb_history', JSON.stringify([d])), seedDoc());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#docType')).toBeVisible();

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
  }

  async function clickDuplicateSynchronously(page: Page) {
    return page.evaluate(() => {
      const btn = document.querySelector('#histTableWrap [data-action="duplicate"]') as HTMLButtonElement;
      if (!btn) throw new Error('bouton duplicate absent');
      const normalState = {
        hasSvg: !!btn.querySelector('svg'),
        disabled: btn.disabled,
        ariaBusy: btn.getAttribute('aria-busy'),
      };
      btn.click();
      const loadingState = {
        disabled: btn.disabled,
        ariaBusy: btn.getAttribute('aria-busy'),
        hasSpinner: !!btn.querySelector('span[style*="appspin"]'),
      };
      btn.click();
      btn.click();
      return { normalState, loadingState };
    });
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`clic Dupliquer : loading immédiat + pas de double — thème ${theme}`, async ({ page }) => {
      await openHistoryWithOneDoc(page, theme);

      const dupBtn = page.locator('#histTableWrap [data-action="duplicate"]').first();
      await expect(dupBtn).toBeEnabled();
      await expect(dupBtn.locator('svg')).toBeVisible();
      await expect(dupBtn).not.toHaveAttribute('aria-busy', 'true');

      const { normalState, loadingState } = await clickDuplicateSynchronously(page);

      expect(normalState.hasSvg).toBe(true);
      expect(normalState.disabled).toBe(false);
      expect(normalState.ariaBusy).toBeNull();

      expect(loadingState.disabled).toBe(true);
      expect(loadingState.ariaBusy).toBe('true');
      expect(loadingState.hasSpinner).toBe(true);

      await page.waitForFunction(
        () => JSON.parse(localStorage.getItem('fb_history') || '[]').length === 2,
        null,
        { timeout: 120000 }
      );

      const state = await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('fb_history') || '[]');
        return { numeros: h.map((d: any) => d.numero), clients: h.map((d: any) => d.client) };
      });
      expect(state.numeros.length).toBe(2);
      expect(new Set(state.numeros).size).toBe(2);
      expect(state.clients.every((c: string) => c === 'Client Duplicate')).toBe(true);

      await page.waitForTimeout(500);

      const freshBtn = page.locator('#histTableWrap [data-action="duplicate"]').first();
      await expect(freshBtn).toBeEnabled();
      await expect(freshBtn.locator('svg')).toBeVisible();
      await expect(freshBtn).not.toHaveAttribute('aria-busy', 'true');
    });
  }
});