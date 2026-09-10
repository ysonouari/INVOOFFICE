import { test, expect, Page } from '@playwright/test';

/*
  B3 — durcissement persistance du stockage (PWA_B3_STORAGE_PERSISTENCE.md).
  `navigator.storage.persist()` est demandé de façon OPPORTUNISTE, SILENCIEUSE et
  NON BLOQUANTE, sous la 1re interaction utilisateur (jamais de prompt au chargement).
  L'app doit fonctionner identiquement quelle que soit l'issue :

    - T1 : API dispo + déjà persisté → persisted()=true, persist() JAMAIS appelé.
    - T2 : API dispo + non persisté → persist() appelé une fois, réussit.
    - T3 : persist() retourne false → aucun crash, boot intact.
    - T4 : persist() rejette → aucun crash, boot intact.
    - T5 : API absente (navigator.storage sans persist) → aucun crash, aucune requête.
    - T6 : avant la 1re interaction, AUCUNE requête (pas de prompt au chargement).

  Stub de `navigator.storage` injecté via addInitScript (déterministe, sans réseau hostile).
*/

function stubNavigatorStorage(
  page: Page,
  opts: { persisted?: boolean; persistResult?: boolean; reject?: boolean } = {}
) {
  const { persisted = false, persistResult = true, reject = false } = opts;
  return page.addInitScript(
    ({ persisted, persistResult, reject }) => {
      const log = { persisted: 0, persist: 0 };
      (window as any).__b3 = log;
      const storageStub = {
        persisted: async () => {
          log.persisted++;
          return persisted;
        },
        persist: async () => {
          log.persist++;
          if (reject) throw new Error('Persist refused by browser');
          return persistResult;
        },
      };
      Object.defineProperty(navigator, 'storage', {
        value: storageStub,
        configurable: true,
      });
    },
    { persisted, persistResult, reject }
  );
}

async function gotoAppReady(page: Page) {
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#docType')).toBeVisible({ timeout: 15000 });
}

function readLog(page: Page) {
  return page.evaluate(() => (window as any).__b3);
}

test.describe('B3 — persistance du stockage (navigator.storage.persist)', () => {
  test('T1 — déjà persisté : persisted() consulte, persist() JAMAIS appelé', async ({ page }) => {
    await stubNavigatorStorage(page, { persisted: true });
    await gotoAppReady(page);

    expect(await readLog(page)).toEqual({ persisted: 0, persist: 0 });

    await page.click('#themeToggle');

    const log = await readLog(page);
    expect(log.persisted).toBe(1);
    expect(log.persist).toBe(0);
    await expect(page.locator('#docType')).toBeVisible();
  });

  test('T2 — non persisté : persist() appelé une fois et réussit', async ({ page }) => {
    await stubNavigatorStorage(page, { persisted: false, persistResult: true });
    await gotoAppReady(page);

    await page.click('#themeToggle');

    const log = await readLog(page);
    expect(log.persisted).toBe(1);
    expect(log.persist).toBe(1);
    await expect(page.locator('#docType')).toBeVisible();
  });

  test('T3 — persist() retourne false : app intacte, aucun blocage', async ({ page }) => {
    await stubNavigatorStorage(page, { persisted: false, persistResult: false });
    await gotoAppReady(page);

    await page.click('#themeToggle');

    const log = await readLog(page);
    expect(log.persist).toBe(1);
    await expect(page.locator('#docType')).toBeVisible();
  });

  test('T4 — persist() rejette : app intacte, aucun blocage', async ({ page }) => {
    await stubNavigatorStorage(page, { persisted: false, reject: true });
    await gotoAppReady(page);

    await page.click('#themeToggle');

    const log = await readLog(page);
    expect(log.persist).toBe(1);
    await expect(page.locator('#docType')).toBeVisible();
  });

  test('T5 — API absente (storage sans persist) : continuer, aucune requête', async ({ page }) => {
    await page.addInitScript(() => {
      const log = { persisted: 0, persist: 0 };
      (window as any).__b3 = log;
      Object.defineProperty(navigator, 'storage', {
        value: {},
        configurable: true,
      });
    });
    await gotoAppReady(page);

    await page.click('#themeToggle');

    expect(await readLog(page)).toEqual({ persisted: 0, persist: 0 });
    await expect(page.locator('#docType')).toBeVisible();
  });

  test('T6 — aucune requête au chargement ; 1re interaction déclenche ; jamais deux fois', async ({ page }) => {
    await stubNavigatorStorage(page, { persisted: false });
    await gotoAppReady(page);

    expect(await readLog(page)).toEqual({ persisted: 0, persist: 0 });
    await expect(page.locator('#docType')).toBeVisible();

    await page.keyboard.press('Tab');
    expect(await readLog(page)).toEqual({ persisted: 1, persist: 1 });

    await page.locator('body').click({ position: { x: 80, y: 80 } });
    expect(await readLog(page)).toEqual({ persisted: 1, persist: 1 });
  });
});