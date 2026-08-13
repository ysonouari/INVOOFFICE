import { test, expect } from '@playwright/test';

const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

function legacyDoc(overrides: Record<string, any> = {}) {
  return {
    id: 'doc_legacy_1',
    type: 'facture',
    numero: 'FAC-LEG-0001',
    date: '13/08/2026',
    client: 'Client Legacy',
    totalTTC: 1200,
    createdAt: '2026-08-13T00:00:00.000Z',
    filename: 'FAC-LEG-0001.pdf',
    payload: {
      type: 'facture',
      numero: 'FAC-LEG-0001',
      date: '13/08/2026',
      client: { id: 'c1', nom: 'Client Legacy', tel: '', ice: '', adresse: '', ref: '' },
      conditions: '',
      modeReglement: '',
      notes: '',
      company: {
        nom: 'Société Legacy',
        ice: '001234567890123',
        headerActive: true,
        headerImage: RED_PNG,
      },
      totals: { showPrices: true, lines: [{ desig: 'A', prix: 100, qte: 1, total: 100 }], totalHT_brut: 1000, remisePct: 0, remiseMontant: 0, tvaTaux: 20, tva: 200, totalTTC: 1200, avance: 0, reste: 1200 },
    },
    ...overrides,
  };
}

async function writeOpfsHeader(page, dataUri: string) {
  await page.evaluate(async (dataUri) => {
    const { saveHeaderImage } = await import('/js/opfs-storage.js');
    const base64 = dataUri.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await saveHeaderImage(new Blob([bytes], { type: 'image/png' }));
  }, dataUri);
}

test.describe('Stockage header — historique sans duplication', () => {
  test.setTimeout(120000);

  test('nouveau document : headerImage non persisté dans l\'historique', async ({ page }) => {
    await waitAppReady(page);

    const result = await page.evaluate(async () => {
      const { saveToHistory } = await import('/js/history.js');
      localStorage.setItem('fb_history', '[]');
      const payload = {
        type: 'facture',
        numero: 'FAC-HDR-0001',
        date: '13/08/2026',
        client: { id: 'c1', nom: 'Client HDR', tel: '', ice: '', adresse: '', ref: '' },
        conditions: '',
        modeReglement: '',
        notes: '',
        company: { nom: 'Société HDR', ice: '001234567890123', headerActive: true, headerImage: 'data:image/png;base64,AAAA' },
        totals: { showPrices: true, lines: [{ desig: 'A', prix: 10, qte: 1, total: 10 }], totalHT_brut: 10, remisePct: 0, remiseMontant: 0, tvaTaux: 20, tva: 2, totalTTC: 12, avance: 0, reste: 12 },
      };
      await saveToHistory(payload, 'FAC-HDR-0001.pdf');
      const history = JSON.parse(localStorage.getItem('fb_history') || '[]');
      return history.map((d) => ({
        numero: d.numero,
        hasHeader: !!(d.payload && d.payload.company && d.payload.company.headerImage),
        nom: d.payload && d.payload.company ? d.payload.company.nom : null,
      }));
    });

    expect(result).toHaveLength(1);
    expect(result[0].hasHeader).toBe(false);
    expect(result[0].nom).toBe('Société HDR');
  });

  test('migration : headerImage strippé quand le header OPFS est confirmé', async ({ page }) => {
    await waitAppReady(page);
    await writeOpfsHeader(page, RED_PNG);
    await page.evaluate((doc) => { localStorage.setItem('fb_history', JSON.stringify([doc])); }, legacyDoc());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    await page.waitForFunction(() => {
      const h = JSON.parse(localStorage.getItem('fb_history') || '[]');
      return h.length === 0 || !(h[0] && h[0].payload && h[0].payload.company && h[0].payload.company.headerImage);
    }, { timeout: 15000 });

    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]'));
    expect(after).toHaveLength(1);
    expect(after[0].payload.company.headerImage).toBeUndefined();
    expect(after[0].payload.company.nom).toBe('Société Legacy');
    expect(after[0].payload.company.ice).toBe('001234567890123');
    expect(after[0].numero).toBe('FAC-LEG-0001');
    expect(after[0].payload.totals.totalTTC).toBe(1200);
  });

  test('migration : aucune destruction quand le header OPFS n\'est pas confirmé', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate((doc) => { localStorage.setItem('fb_history', JSON.stringify([doc])); }, legacyDoc());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    await page.waitForTimeout(2000);

    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]'));
    expect(after).toHaveLength(1);
    expect(after[0].payload.company.headerImage).toBe(RED_PNG);
    expect(after[0].numero).toBe('FAC-LEG-0001');
  });

  test('migration : sans legacy header, aucun changement (idempotent)', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate(() => {
      const doc = {
        id: 'doc_clean_1', type: 'devis', numero: 'DEV-CLEAN-0001', date: '13/08/2026', client: 'Client Clean',
        totalTTC: 500, createdAt: '2026-08-13T00:00:00.000Z', filename: 'DEV-CLEAN-0001.pdf',
        payload: { company: { nom: 'Société Clean', headerActive: true } },
      };
      localStorage.setItem('fb_history', JSON.stringify([doc]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    await page.waitForTimeout(2000);

    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fb_history') || '[]'));
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('doc_clean_1');
    expect(after[0].payload.company.nom).toBe('Société Clean');
  });
});
