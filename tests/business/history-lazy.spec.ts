import { test, expect, Page } from '@playwright/test';

/*
  Groupe D3.2 — découpage sécurisé de history.js (Option D de HISTORY_ARCHITECTURE_AUDIT).
  Vérifie :
    - core eager (état d'édition disponible au boot), history-view / history-actions ABSENTS au boot ;
    - l'ouverture de l'historique charge la vue (et SEULEMENT la vue) ;
    - recherche + pagination fonctionnent à la 1re ouverture ;
    - actions (duplicate / convert / delete / edit / reprint) chargées dynamiquement au 1er déclencheur, comportement identique ;
    - édition : editingDocId eager, unicité du n° excluant le doc en cours ;
    - offline : reload hors-ligne, historique + reprint (blob OPFS) fonctionnent via precache SW.
*/

const PREVIEW_DEFAULTS = {
  nom: 'INVOOFFICE', ice: '001234567890123', adresse: 'Casa', tel: '0660000000', email: 'contact@invooffice.ma',
  ville: 'Casablanca', activite: 'Services', patente: '', rc: '', if: '', cnss: '',
  headerImage: '', headerActive: false, margeHaut: 3, fontSizeOffset: 0, pdfQuality: 2,
  tableColor: '#eef1f6', tableTextColor: '#333333', tvaTaux: 20, showTotalsDefault: true,
};

function seedDoc(overrides: Record<string, any> = {}) {
  const type = overrides.type || 'facture';
  const numero = overrides.numero || 'FAC-2026-0101';
  const id = overrides.id || 'doc_lazy_1';
  return {
    id,
    type,
    numero,
    date: '05/08/2026',
    client: 'Client Lazy',
    totalTTC: 120,
    createdAt: '2026-08-05T00:00:00.000Z',
    filename: numero + '.pdf',
    payload: {
      type,
      numero,
      date: '05/08/2026',
      client: { id: 'c_lazy', nom: 'Client Lazy', tel: '', ice: '', adresse: '', ref: '' },
      conditions: '', modeReglement: '', notes: '',
      company: PREVIEW_DEFAULTS,
      totals: {
        showPrices: true,
        lines: [{ desig: 'Prestation', prix: 40, qte: 3, total: 120 }],
        totalHT_brut: 100, remisePct: 0, remiseMontant: 0, tvaTaux: 20, tva: 20, totalTTC: 120, avance: 0, reste: 120,
      },
    },
    ...overrides,
  };
}

function seedDocs(count: number) {
  const docs: any[] = [];
  for (let i = 1; i <= count; i++) {
    docs.push({
      id: 'qa_' + i,
      type: 'facture',
      numero: 'FAC-2026-' + String(i).padStart(4, '0'),
      date: '05/0' + (1 + (i % 9)) + '/2026',
      client: 'Client ' + i,
      totalTTC: i * 1000,
      createdAt: new Date(2026, 7 - (i % 12), i % 28 + 1).toISOString(),
      filename: 'qa_' + i + '.pdf',
      payload: null,
    });
  }
  return docs;
}

test.describe('Historique lazy loading (D3.2)', () => {
  test.setTimeout(180000);

  async function waitAppReady(page: Page) {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#docType')).toBeVisible();
  }

  async function seedHistoryAndReload(page: Page, docs: any[]) {
    await page.evaluate((d) => localStorage.setItem('fb_history', JSON.stringify(d)), docs);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#docType')).toBeVisible();
  }

  function loadedHistoryModules(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      performance.getEntriesByType('resource')
        .map((r: any) => r.name)
        .filter((n: string) => n.includes('/js/history-'))
        .map((n: string) => n.substring(n.lastIndexOf('/') + 1))
        .filter((n: string) => n !== 'history.js')
    );
  }

  async function waitViewLoaded(page: Page) {
    await page.waitForFunction(
      () => performance.getEntriesByType('resource').some((r: any) => r.name.includes('/js/history-view.js')),
      null,
      { timeout: 15000 }
    );
  }

  test('01 — boot : noyau eager, history-view et history-actions ABSENTS', async ({ page }) => {
    await waitAppReady(page);

    const mods = await loadedHistoryModules(page);
    expect(mods).toEqual([]);

    const state = await page.evaluate(async () => {
      const m = await import('/js/history.js');
      return {
        hasGetEditingDocId: typeof m.getEditingDocId === 'function',
        hasSetEditingDocId: typeof m.setEditingDocId === 'function',
        hasSaveToHistory: typeof m.saveToHistory === 'function',
        editingId: m.getEditingDocId(),
        hasViewHere: typeof (window as any).__historyViewLoaded === 'boolean',
      };
    });
    expect(state.hasGetEditingDocId).toBe(true);
    expect(state.hasSetEditingDocId).toBe(true);
    expect(state.hasSaveToHistory).toBe(true);
    expect(state.editingId).toBeNull();
  });

  test('02 — 1re ouverture : charge UNIQUEMENT la vue, l\'historique se rend', async ({ page }) => {
    await waitAppReady(page);
    await seedHistoryAndReload(page, [seedDoc()]);

    const before = await loadedHistoryModules(page);
    expect(before).toEqual([]);

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.hist-summary')).toBeVisible();
    await waitViewLoaded(page);

    const after = await loadedHistoryModules(page);
    expect(after).toContain('history-view.js');
    expect(after).not.toContain('history-actions.js');
  });

  test('03 — recherche et pagination à la 1re ouverture', async ({ page }) => {
    await waitAppReady(page);
    await seedHistoryAndReload(page, seedDocs(25));

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
    await waitViewLoaded(page);

    const rows = page.locator('#histTableWrap table tbody tr');
    await expect(rows).toHaveCount(10);

    await page.locator('#histSearch').fill('Client 24');
    await page.waitForTimeout(400);
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td').nth(2)).toContainText('Client 24');

    await page.locator('#histSearch').fill('');
    await page.waitForTimeout(400);
    await expect(rows).toHaveCount(10);

    await page.locator('.hist-pagination button[data-page="3"]').click();
    await page.waitForTimeout(400);
    await expect(rows).toHaveCount(5);
  });

  test('04 — duplicate : history-actions chargé au 1er déclencheur, doc dupliqué', async ({ page }) => {
    await waitAppReady(page);
    await seedHistoryAndReload(page, [seedDoc()]);

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
    await waitViewLoaded(page);

    let mods = await loadedHistoryModules(page);
    expect(mods).not.toContain('history-actions.js');

    await page.locator('#histTableWrap [data-action="duplicate"]').first().click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('fb_history') || '[]').length === 2,
      null,
      { timeout: 120000 }
    );
    await page.waitForTimeout(500);

    mods = await loadedHistoryModules(page);
    expect(mods).toContain('history-actions.js');

    const state = await page.evaluate(() => {
      const h = JSON.parse(localStorage.getItem('fb_history') || '[]');
      return {
        count: h.length,
        numeros: h.map((d: any) => d.numero),
        types: h.map((d: any) => d.type),
        clients: h.map((d: any) => d.client),
      };
    });
    expect(state.count).toBe(2);
    expect(new Set(state.numeros).size).toBe(2);
    expect(state.numeros.some((n: string) => n.startsWith('FAC-2026-') && n !== 'FAC-2026-0101')).toBe(true);
    expect(state.types).toEqual(['facture', 'facture']);
    expect(state.clients.every((c: string) => c === 'Client Lazy')).toBe(true);
  });

  test('05 — convert : devis → facture (confirm), actions lazy', async ({ page }) => {
    await waitAppReady(page);
    const devis = seedDoc({ type: 'devis', numero: 'DEV-2026-0101', id: 'doc_devis_1' });
    await seedHistoryAndReload(page, [devis]);

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
    await waitViewLoaded(page);

    let mods = await loadedHistoryModules(page);
    expect(mods).not.toContain('history-actions.js');

    await page.locator('#histTableWrap [data-action="convert"]').first().click();
    await expect(page.locator('.dialog-overlay')).toBeVisible({ timeout: 5000 });
    const confirmBtn = page.locator('.dialog-overlay button').last();
    await confirmBtn.click();

    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('fb_history') || '[]').some((d: any) => d.type === 'facture'),
      null,
      { timeout: 120000 }
    );
    await page.waitForTimeout(500);

    mods = await loadedHistoryModules(page);
    expect(mods).toContain('history-actions.js');

    const types = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('fb_history') || '[]').map((d: any) => d.type)
    );
    expect(types.sort()).toEqual(['devis', 'facture']);
  });

  test('06 — delete : suppression avec confirmation, vue déjà chargée', async ({ page }) => {
    await waitAppReady(page);
    await seedHistoryAndReload(page, [seedDoc({ id: 'doc_del_1' })]);

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
    await waitViewLoaded(page);

    await page.locator('#histTableWrap [data-action="delete"]').first().click();
    await expect(page.locator('.dialog-overlay')).toBeVisible({ timeout: 5000 });
    await page.locator('.dialog-overlay button').last().click();

    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('fb_history') || '[]').length === 0,
      null,
      { timeout: 15000 }
    );
    await expect(page.locator('.hist-empty')).toBeVisible({ timeout: 5000 });
  });

  test('07 — édition : editingDocId eager, unicité excluant le doc en cours', async ({ page }) => {
    await waitAppReady(page);
    const editDoc = seedDoc({ id: 'doc_edit_1', numero: 'FAC-ED-0001' });
    await seedHistoryAndReload(page, [editDoc]);

    const bootState = await page.evaluate(async () => {
      const m = await import('/js/history.js');
      return { editingId: m.getEditingDocId() };
    });
    expect(bootState.editingId).toBeNull();
    expect(await loadedHistoryModules(page)).toEqual([]);

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 10000 });
    await waitViewLoaded(page);

    await page.locator('#histTableWrap [data-action="edit"]').first().click();
    await expect(page.locator('#view-nouveau')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#editingBanner')).toBeVisible();

    const editingId = await page.evaluate(async () => (await import('/js/history.js')).getEditingDocId());
    expect(editingId).toBe('doc_edit_1');

    await expect(page.locator('#docNumero')).toHaveValue('FAC-ED-0001');
    await expect(page.locator('#docNumeroError')).not.toBeVisible();

    await page.locator('#docNumero').fill('FAC-AUTRE-0001');
    await page.waitForTimeout(200);
    await expect(page.locator('#docNumeroError')).not.toBeVisible();

    expect(await loadedHistoryModules(page)).toContain('history-actions.js');
  });

  test('08 — offline : vue + actions chargées depuis le precache SW (aucune requête réseau)', async ({ page }) => {
    await waitAppReady(page);
    await seedHistoryAndReload(page, [seedDoc({ id: 'doc_off_1' })]);

    await page.evaluate(async () => {
      const m = await import('/js/opfs-storage.js');
      const fake = new Blob(['%PDF-1.4\n%INVOOFFICE-OFFLINE'], { type: 'application/pdf' });
      await m.savePdfFile('FAC-2026-0101.pdf', fake);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    await page.waitForFunction(async () => {
      const cache = await caches.open('facturation-v7');
      const urls = ['/js/history-view.js', '/js/history-actions.js'].map((p) => new URL(p, location.origin).href);
      const hits = await Promise.all(urls.map((u) => cache.match(u)));
      return hits.every((h) => !!h);
    }, null, { timeout: 20000 });

    const modsBefore = await loadedHistoryModules(page);
    expect(modsBefore).toEqual([]);

    await page.context().setOffline(true);

    await page.locator('#navHistorique').click();
    await expect(page.locator('#histTableWrap table.hist')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(
      () => performance.getEntriesByType('resource').some((r: any) => r.name.includes('/js/history-view.js')),
      null,
      { timeout: 15000 }
    );

    let mods = await loadedHistoryModules(page);
    expect(mods).toContain('history-view.js');
    expect(mods).not.toContain('history-actions.js');

    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('#histTableWrap [data-action="reprint"]').first().click(),
    ]);
    expect(dl.suggestedFilename()).toBe('FAC-2026-0101.pdf');

    await page.waitForFunction(
      () => performance.getEntriesByType('resource').some((r: any) => r.name.includes('/js/history-actions.js')),
      null,
      { timeout: 15000 }
    );
    mods = await loadedHistoryModules(page);
    expect(mods).toContain('history-actions.js');
  });
});