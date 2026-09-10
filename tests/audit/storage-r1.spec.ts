import { test, expect, Page } from '@playwright/test';

/*
  R1 — durcissement minimal du stockage (STORAGE_R1_HARDENING.md).
  Protège la donnée la plus récente quand localStorage et le miroir IndexedDB divergent :
  si localStorage.setItem échoue (quota) à la sauvegarde, le miroir IDB reçoit la version
  neuve et un marqueur `__ls_stale_<key>` (même transaction). Au boot suivant, initStorage
  restaure localStorage depuis le miroir et efface le marqueur.

  Tests (déterministes, sans remplir le quota ni réseau/Supabase) :
    - A : sauvegarde normale → localStorage + miroir + absence de marqueur, reload OK.
    - B : échec localStorage (patch setItem) → miroir neuve + marqueur posé, localStorage intact.
    - C : redémarrage (reload sans patch) → localStorage restauré depuis le miroir, marqueur effacé.
    - D : IndexedDB indisponible → mode localStorage seul, l'app démarre sans crash.
*/

const MARKER_PREFIX = '__ls_stale_';

function seedDoc(id: string, numero: string) {
  return {
    id,
    type: 'facture',
    numero,
    date: '05/08/2026',
    client: 'Client ' + id,
    totalTTC: 120,
    createdAt: '2026-08-05T00:00:00.000Z',
    filename: numero + '.pdf',
    payload: null,
  };
}

const OLD = [seedDoc('r1_old', 'FAC-2026-0001')];
const NEW = [seedDoc('r1_old', 'FAC-2026-0001'), seedDoc('r1_new', 'FAC-2026-0002')];

async function gotoAppReady(page: Page) {
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#docType')).toBeVisible({ timeout: 15000 });
}

async function reloadReady(page: Page) {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#docType')).toBeVisible({ timeout: 15000 });
}

function seedHistoryLocalStorage(page: Page, docs: any[]) {
  return page.evaluate((d) => localStorage.setItem('fb_history', JSON.stringify(d)), docs);
}

function saveHistoryInApp(page: Page, docs: any[]) {
  return page.evaluate((d) => {
    import('/js/storage.js').then(m => m.saveHistory(d));
  }, docs);
}

function patchHistorySetItemToFail(page: Page) {
  return page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'fb_history') throw new DOMException('QuotaExceededError', 'quota');
      return orig.call(this, k, v);
    };
  });
}

function readStore(page: Page, key: string): Promise<any> {
  return page.evaluate((k) => new Promise((resolve) => {
    const req = indexedDB.open('fb_app', 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv_store', 'readonly');
      const r = tx.objectStore('kv_store').get(k);
      r.onerror = () => { req.result.close(); resolve(null); };
      r.onsuccess = () => { req.result.close(); resolve(r.result); };
    };
  }), key);
}

function waitStore(page: Page, key: string, expected: any, present: boolean) {
  const exp = JSON.stringify(expected);
  return page.waitForFunction(({ k, e, p }) => new Promise((resolve) => {
    const req = indexedDB.open('fb_app', 1);
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv_store', 'readonly');
      const r = tx.objectStore('kv_store').get(k);
      r.onerror = () => { req.result.close(); resolve(false); };
      r.onsuccess = () => {
        req.result.close();
        resolve(p ? JSON.stringify(r.result) === e : r.result === undefined);
      };
    };
  }), { k: key, e: exp, p: present });
}

function waitMarker(page: Page, key: string, present: boolean) {
  return waitStore(page, MARKER_PREFIX + key, true, present);
}

function localStorageValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

function loadHistoryString(page: Page): Promise<string> {
  return page.evaluate(async () => JSON.stringify((await import('/js/storage.js')).loadHistory()));
}

test.describe('R1 — divergence localStorage / miroir IndexedDB', () => {
  test.setTimeout(180000);

  test('A : sauvegarde normale → localStorage + miroir + absence de marqueur, reload OK', async ({ page }) => {
    await gotoAppReady(page);
    await seedHistoryLocalStorage(page, OLD);
    await reloadReady(page);

    await page.waitForFunction(() => true);
    await expect.poll(async () => JSON.stringify(await readStore(page, 'history'))).toEqual(JSON.stringify(OLD));

    await saveHistoryInApp(page, NEW);
    await waitStore(page, 'history', NEW, true);

    expect(await localStorageValue(page, 'fb_history')).toEqual(JSON.stringify(NEW));
    await waitMarker(page, 'history', false);

    await reloadReady(page);
    expect(await localStorageValue(page, 'fb_history')).toEqual(JSON.stringify(NEW));
    expect(await loadHistoryString(page)).toEqual(JSON.stringify(NEW));
  });

  test('B : échec localStorage → la version neuve n\'est QUE dans le miroir + marqueur posé', async ({ page }) => {
    await gotoAppReady(page);
    await seedHistoryLocalStorage(page, OLD);
    await reloadReady(page);
    await expect.poll(async () => JSON.stringify(await readStore(page, 'history'))).toEqual(JSON.stringify(OLD));

    await patchHistorySetItemToFail(page);
    await saveHistoryInApp(page, NEW);
    await waitStore(page, 'history', NEW, true);

    expect(await localStorageValue(page, 'fb_history')).toEqual(JSON.stringify(OLD));
    await waitMarker(page, 'history', true);
  });

  test('C : redémarrage → localStorage restauré depuis le miroir, marqueur effacé', async ({ page }) => {
    await gotoAppReady(page);
    await seedHistoryLocalStorage(page, OLD);
    await reloadReady(page);
    await expect.poll(async () => JSON.stringify(await readStore(page, 'history'))).toEqual(JSON.stringify(OLD));

    await patchHistorySetItemToFail(page);
    await saveHistoryInApp(page, NEW);
    await waitStore(page, 'history', NEW, true);
    await waitMarker(page, 'history', true);

    await reloadReady(page);
    expect(await localStorageValue(page, 'fb_history')).toEqual(JSON.stringify(NEW));
    expect(await loadHistoryString(page)).toEqual(JSON.stringify(NEW));
    await waitMarker(page, 'history', false);
  });

  test('D : IndexedDB indisponible → mode localStorage seul, l\'app démarre sans crash', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await page.addInitScript((company) => {
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open() { throw new Error('IDB disabled'); } } });
      localStorage.setItem('fb_company', JSON.stringify(company));
    }, { nom: 'R1 Degraded SARL' });

    await gotoAppReady(page);
    expect(pageErrors.filter(e => !String(e.message).includes('favicon'))).toEqual([]);

    const company = await page.evaluate(async () => (await import('/js/storage.js')).loadCompany());
    expect(company.nom).toEqual('R1 Degraded SARL');

    await saveHistoryInApp(page, NEW);
    await expect.poll(async () => await localStorageValue(page, 'fb_history')).toEqual(JSON.stringify(NEW));

    await reloadReady(page);
    expect(await localStorageValue(page, 'fb_history')).toEqual(JSON.stringify(NEW));
    expect(await loadHistoryString(page)).toEqual(JSON.stringify(NEW));
  });
});