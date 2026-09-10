import { test, expect, Page } from '@playwright/test';

/*
  Phase E2 — lazy loading de company-modal.js.
  Vérifie :
    - au boot : company-modal.js + storage-quota.js ABSENTS, brand-logo.js (eager) présent et fonctionnel ;
    - 1re interaction : ouverture de la modale charge company-modal.js (dépendance storage-quota incluse), la modale fonctionne, pas d'erreur JS ;
    - interactions suivantes : fermeture/réouverture OK, PAS de re-import ni de double-ouverture (cache de promesse + garde ré-entrance) ;
    - logo de marque au boot : textContent correct même sans que company-modal.js ne soit chargé ;
    - offline : modale ouverte depuis le precache SW (aucune requête réseau), entreprise toujours modifiable.
*/

const MODALS = ['/js/company-modal.js', '/js/storage-quota.js'];

function loadedModules(page: Page, needles: string[]): Promise<string[]> {
  return page.evaluate(
    (needlePaths) =>
      performance.getEntriesByType('resource')
        .map((r) => r.name)
        .filter((n) => needlePaths.some((p) => n.includes(p)))
        .map((n) => n.substring(n.lastIndexOf('/') + 1)),
    needles
  );
}

async function waitAppReady(page: Page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#docType')).toBeVisible();
}

async function waitCompanyModalLoaded(page: Page) {
  await page.waitForFunction(
    () => performance.getEntriesByType('resource').some((r: any) => r.name.includes('/js/company-modal.js')),
    null,
    { timeout: 15000 }
  );
}

test.describe('Company modal lazy loading (E2)', () => {
  test('01 — boot : company-modal ABSENT, brand-logo egal PRÉSENT et fonctionnel sans modale', async ({ page }) => {
    await waitAppReady(page);

    const mods = await loadedModules(page, MODALS);
    expect(mods).toEqual([]);

    const logo = await page.evaluate(async () => {
      const m = await import('/js/brand-logo.js');
      return {
        hasUpdateBrandLogo: typeof m.updateBrandLogo === 'function',
        bootText: document.getElementById('brandLogo')?.textContent || '',
        moduleLoaded: performance.getEntriesByType('resource').some((r: any) => r.name.includes('/js/company-modal.js')),
      };
    });
    expect(logo.hasUpdateBrandLogo).toBe(true);
    expect(logo.bootText).toBe('SF');
    expect(logo.moduleLoaded).toBe(false);
  });

  test('02 — 1re interaction : ouverture charge company-modal, modale fonctionne, pas d\'erreur JS', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await waitAppReady(page);
    expect(await loadedModules(page, MODALS)).toEqual([]);

    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay.open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cNom')).toBeVisible();
    await waitCompanyModalLoaded(page);

    const mods = await loadedModules(page, MODALS);
    expect(mods).toContain('company-modal.js');
    expect(mods).toContain('storage-quota.js');

    expect(errors).toEqual([]);
  });

  test('03 — interactions suivantes : fermeture/réouverture OK, pas de double-ouverture ni d\'erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await waitAppReady(page);

    await page.evaluate(() => {
      const b = document.getElementById('navInfos');
      b.click();
      b.click();
    });
    await expect(page.locator('#companyModalOverlay.open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cNom')).toBeVisible();
    const loadedOnce = await page.evaluate(
      () => performance.getEntriesByType('resource').filter((r: any) => r.name.includes('/js/company-modal.js')).length
    );
    expect(loadedOnce).toBe(1);

    await page.locator('[data-action="close-modal"]').first().click();
    await expect(page.locator('#companyModalOverlay.open')).toBeHidden({ timeout: 5000 });

    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay.open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cNom')).toBeVisible();

    await page.locator('[data-action="close-modal"]').first().click();
    await expect(page.locator('#companyModalOverlay.open')).toBeHidden({ timeout: 5000 });

    expect(errors).toEqual([]);
    expect(await loadedModules(page, MODALS)).toContain('company-modal.js');
  });

  test('04 — logo de marque au boot : nom de l\'entreprise affiché, sans company-modal chargé', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fb_company', JSON.stringify({ nom: 'ACME' }));
    });
    await waitAppReady(page);

    await expect(page.locator('#brandLogo')).toHaveText('AC');
    expect(await loadedModules(page, MODALS)).toEqual([]);

    const eager = await page.evaluate(async () => {
      const m = await import('/js/brand-logo.js');
      m.updateBrandLogo();
      return document.getElementById('brandLogo')?.textContent || '';
    });
    expect(eager).toBe('AC');
  });

  test('05 — offline : modale ouverte depuis le precache SW (aucune requête réseau)', async ({ page }) => {
    await waitAppReady(page);

    await page.waitForFunction(async () => {
      const cache = await caches.open('facturation-v7');
      const urls = ['/js/company-modal.js', '/js/storage-quota.js', '/js/brand-logo.js'].map((p) => new URL(p, location.origin).href);
      const hits = await Promise.all(urls.map((u) => cache.match(u)));
      return hits.every((h) => !!h);
    }, null, { timeout: 20000 });

    expect(await loadedModules(page, MODALS)).toEqual([]);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.context().setOffline(true);

    await page.locator('#navInfos').click();
    await expect(page.locator('#companyModalOverlay.open')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#cNom')).toBeVisible();
    await expect(page.locator('#cDevise')).toHaveValue('DH');
    await waitCompanyModalLoaded(page);

    expect(await loadedModules(page, MODALS)).toContain('company-modal.js');
    expect(errors).toEqual([]);
  });
});