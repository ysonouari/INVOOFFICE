import { test, expect, type Page } from '@playwright/test';

/*
  Phase F6 — Accessibilité renforcée (audit → correctifs validés OPTION A).

  Couvre les correctifs HIGH + MEDIUM approuvés :
    H1  lignes de document : aria-label i18n (Désignation / Prix U. / Qté), FR + AR ;
    H2  formulaire Paramètres admin : chaque <label> lié par for à son champ ;
    M1  tri historique opérable au clavier (Enter sur le <th> colonneheader) ;
    M2  upload en-tête PDF atteignable au clavier depuis #uploadBox (Enter → filechooser) ;
    M3  erreurs landing annoncées : role=alert + aria-invalid + aria-describedby (+ #signupConfirmError restitué) ;
    M4  dialog "Confirmer" admin : aria-labelledby/aria-describedby, focus dans le dialog, retour focus Escape ;
    M5  liens .app-footer/.lp-footer en sombre ≥ 4.5:1 (--footer-link) ;
    M6  tokens --success/--warning distincts en clair ≥ 4.5:1 sur --panel ;
    M7  modales landing : retour de focus vers le déclencheur à la fermeture.

  Périmètre intact (garantie d'absence de régression) : aucune modification du
  pipeline PDF, du Service Worker, de l'auth, du stockage, ni des gardes F1-F5.
*/

function parseRgb(rgb: string): [number, number, number] {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : [0, 0, 0];
}

function luminanceOf(channel: [number, number, number]): number {
  return channel.map((v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }).reduce((acc, c, i) => acc + [0.2126, 0.7152, 0.0722][i] * c, 0);
}

function contrastRatioRgb(a: string, b: string): number {
  const l1 = luminanceOf(parseRgb(a));
  const l2 = luminanceOf(parseRgb(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function contrastRatioHex(a: string, b: string): number {
  const toRgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const l1 = luminanceOf(toRgb(a));
  const l2 = luminanceOf(toRgb(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function waitAppReady(page: Page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#docType')).toBeVisible();
}

async function openCompanyModal(page: Page) {
  await waitAppReady(page);
  await page.locator('#navInfos').click();
  await expect(page.locator('#companyModalOverlay.open')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#cNom')).toBeVisible();
}

async function mockAdminTables(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const match = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    const table = match ? match[1] : '';

    let body: unknown;
    if (req.method() === 'GET') {
      if (table === 'profiles') {
        body = url.searchParams.toString().includes('id=eq.')
          ? { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f6.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' }
          : [
              { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f6.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' },
              { id: 'u-paid', full_name: 'Karim Client', email: 'paid@f6.local', whatsapp: '+212600000002', role: 'user', status: 'active', created_at: '2026-02-02T00:00:00.000Z' },
              { id: 'u-pend', full_name: 'Salma Enattente', email: 'pending@f6.local', whatsapp: '+212600000003', role: 'user', status: 'pending', created_at: '2026-02-03T00:00:00.000Z' },
            ];
      } else if (table === 'subscriptions' || table === 'payments' || table === 'admin_logs'
        || table === 'payment_methods' || table === 'plans' || table === 'platform_settings') {
        body = [];
      } else {
        await route.continue();
        return;
      }
    } else {
      body = [];
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function openAdmin(page: Page): Promise<void> {
  await mockAdminTables(page);
  await page.goto('/admin');
  await expect(page.locator('#adminApp')).toBeVisible({ timeout: 10000 });
}

function seedHistory(page: Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem('fb_lang', 'fr');
      localStorage.setItem('fb_theme', 'dark');
      const docs = [
        { id: 'd0', numero: 'FAC-2026-0001', client: 'Alpha', date: '01/01/2026', type: 'facture', totalHT: 90, tva: 10, totalTTC: 100, createdAt: '2026-01-01T10:00:00.000Z', lines: [] },
        { id: 'd1', numero: 'FAC-2026-0002', client: 'Bravo', date: '02/01/2026', type: 'facture', totalHT: 45, tva: 5, totalTTC: 50, createdAt: '2026-01-02T10:00:00.000Z', lines: [] },
        { id: 'd2', numero: 'FAC-2026-0003', client: 'Charlie', date: '03/01/2026', type: 'devis', totalHT: 180, tva: 20, totalTTC: 200, createdAt: '2026-01-03T10:00:00.000Z', lines: [] },
      ];
      localStorage.setItem('fb_history', JSON.stringify(docs));
    } catch (_) { /* seed failure tolerated */ }
  });
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe('Phase F6 — Accessibilité renforcée (correctifs validés)', () => {
  test('H1 — lignes : aria-label i18n (FR) sur désignation / prix / quantité', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.addInitScript(() => { localStorage.setItem('fb_lang', 'fr'); localStorage.setItem('fb_theme', 'dark'); });
    await waitAppReady(page);

    if (await page.locator('#linesBody tr').count() === 0) {
      await page.locator('[data-action="add-line"]').click();
    }
    await expect(page.locator('.line-desig').first()).toHaveAttribute('aria-label', 'Désignation');
    await expect(page.locator('.line-prix').first()).toHaveAttribute('aria-label', 'Prix U.');
    await expect(page.locator('.line-qte').first()).toHaveAttribute('aria-label', 'Qté');

    // La saisie ne doit plus dépendre du placeholder transitoire
    await page.locator('.line-desig').first().fill('Prestation test');
    await expect(page.locator('.line-desig').first()).toHaveAttribute('aria-label', 'Désignation');

    expect(errors).toEqual([]);
  });

  test('H1 — lignes : aria-label i18n en AR (RTL)', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.addInitScript(() => { localStorage.setItem('fb_lang', 'ar'); localStorage.setItem('fb_theme', 'dark'); });
    await waitAppReady(page);

    if (await page.locator('#linesBody tr').count() === 0) {
      await page.locator('[data-action="add-line"]').click();
    }
    await expect(page.locator('.line-desig').first()).toHaveAttribute('aria-label', 'البيان');
    await expect(page.locator('.line-prix').first()).toHaveAttribute('aria-label', 'ثمن الوحدة');
    await expect(page.locator('.line-qte').first()).toHaveAttribute('aria-label', 'الكمية');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

    expect(errors).toEqual([]);
  });

  test('H2 — Paramètres admin : label for=id sur les 8 champs', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.addInitScript(() => { localStorage.setItem('fb_theme', 'dark'); });
    await openAdmin(page);
    await page.locator('#navSettings').click();
    await expect(page.locator('#settingsForm #sPlatformName')).toBeVisible();

    const linked = await page.evaluate(() => {
      const ctrls = document.querySelectorAll('#settingsForm input, #settingsForm select, #settingsForm textarea');
      return {
        count: ctrls.length,
        all: [...ctrls].every(el => !!el.id && !!document.querySelector(`label[for="${el.id}"]`)),
        names: [...document.querySelectorAll('#settingsForm label')].map(l => l.getAttribute('for')),
      };
    });
    expect(linked.count).toBe(8);
    expect(linked.all).toBe(true);
    expect(linked.names.filter(Boolean).length).toBe(8);

    expect(errors).toEqual([]);
  });

  test('M1 — tri historique opérable au clavier (Enter) avec bascule aria-sort', async ({ page }) => {
    const errors = capturePageErrors(page);
    await seedHistory(page);
    await waitAppReady(page);

    await page.locator('#navHistorique').click();
    const dateTh = page.locator('.hist-sortable[data-sort="date"]');
    await expect(dateTh).toBeVisible({ timeout: 15000 });
    await expect(dateTh).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('.hist-row .hist-cell-numero').first()).toHaveText('FAC-2026-0003');

    await dateTh.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('.hist-sortable[data-sort="date"]')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('.hist-row .hist-cell-numero').first()).toHaveText('FAC-2026-0001');

    // Le clic continue de fonctionner (aucune régression)
    await page.locator('.hist-sortable[data-sort="date"]').click();
    await expect(page.locator('.hist-row .hist-cell-numero').first()).toHaveText('FAC-2026-0003');

    expect(errors).toEqual([]);
  });

  test('M2 — upload en-tête accessible au clavier (#uploadBox + Enter → filechooser)', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.addInitScript(() => { localStorage.setItem('fb_lang', 'fr'); localStorage.setItem('fb_theme', 'dark'); });
    await openCompanyModal(page);

    const uploadBox = page.locator('#uploadBox');
    await expect(uploadBox).toHaveAttribute('role', 'button');
    await expect(uploadBox).toHaveAttribute('tabindex', '0');
    await expect(uploadBox).toHaveAttribute('aria-label', 'Ajouter un en-tête (fond de page)');

    const chooserPromise = page.waitForEvent('filechooser');
    await uploadBox.focus();
    await page.keyboard.press('Enter');
    await chooserPromise;

    expect(errors).toEqual([]);
  });

  test('M3 — erreurs landing : role=alert, aria-invalid, aria-describedby (signup)', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.goto('/');
    await page.locator('[data-action="show-signup"]').first().click();
    await expect(page.locator('#signupOverlay')).toBeVisible();

    await page.locator('#signupSubmit').click();

    await expect(page.locator('#signupNameError')).toBeVisible();
    await expect(page.locator('#signupNameError')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#signupName')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#signupName')).toHaveAttribute('aria-describedby', 'signupNameError');

    // Le conteneur d'erreur du champ "confirmer le mot de passe" existe désormais
    await expect(page.locator('#signupConfirmError')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#signupConfirm')).toHaveAttribute('aria-describedby', 'signupConfirmError');

    expect(errors).toEqual([]);
  });

  test('M4 — dialog Confirmer admin : nom, focus dans le dialog, retour focus Escape', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.addInitScript(() => { localStorage.setItem('fb_theme', 'dark'); });
    await openAdmin(page);
    await page.locator('#navUsers').click();
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);

    const deleteBtn = page.locator('#usersTable tbody tr').first().locator('[data-action="delete"]');
    await deleteBtn.click();

    const overlay = page.locator('#confirmOverlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('aria-labelledby', 'confirmTitle');
    await expect(overlay).toHaveAttribute('aria-describedby', 'confirmMessage');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 3000 }).toBe('confirmOk');

    // Escape : fermeture + retour focus sur le déclencheur
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-action')), { timeout: 3000 }).toBe('delete');

    expect(errors).toEqual([]);
  });

  test('M5 — liens footer sombres ≥ 4.5:1 (app + landing)', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.addInitScript(() => { localStorage.setItem('fb_theme', 'dark'); });

    await waitAppReady(page);
    const appFooter = await page.evaluate(() => {
      const a = document.querySelector('.app-footer a');
      if (!a) return null;
      return { color: getComputedStyle(a).color, bg: getComputedStyle(document.body).backgroundColor };
    });
    expect(appFooter).not.toBeNull();
    expect(contrastRatioRgb(appFooter!.color, appFooter!.bg), 'app-footer a vs body').toBeGreaterThanOrEqual(4.5);

    await page.goto('/');
    await expect(page.locator('.lp-footer a').first()).toBeVisible();
    const lpFooter = await page.evaluate(() => {
      const a = document.querySelector('.lp-footer a');
      if (!a) return null;
      return { color: getComputedStyle(a).color, bg: getComputedStyle(document.body).backgroundColor };
    });
    expect(lpFooter).not.toBeNull();
    expect(contrastRatioRgb(lpFooter!.color, lpFooter!.bg), 'lp-footer a vs body').toBeGreaterThanOrEqual(4.5);

    expect(errors).toEqual([]);
  });

  test('M6 — tokens --success/--warning distincts en clair ≥ 4.5:1 sur --panel', async ({ page }) => {
    const errors = capturePageErrors(page);
    await waitAppReady(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const get = (k: string) => s.getPropertyValue(k).trim();
      return { success: get('--success'), warning: get('--warning'), panel: get('--panel'), bg: get('--bg') };
    });

    expect(tokens.success).toBe('#15803d');
    expect(tokens.warning).toBe('#a16207');
    expect(contrastRatioHex(tokens.success, tokens.panel), '--success vs --panel (clair)').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatioHex(tokens.warning, tokens.panel), '--warning vs --panel (clair)').toBeGreaterThanOrEqual(4.5);

    // Le sombre conserve ses valeurs (aucun chevauchement)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const darkTokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { success: s.getPropertyValue('--success').trim(), warning: s.getPropertyValue('--warning').trim() };
    });
    expect(darkTokens.success).toBe('#22c55e');
    expect(darkTokens.warning).toBe('#eab308');

    expect(errors).toEqual([]);
  });

  test('M7 — modale landing : retour de focus au déclencheur après Escape', async ({ page }) => {
    const errors = capturePageErrors(page);
    await page.goto('/');

    const trigger = page.locator('[data-action="show-signin"]').first();
    await trigger.focus();
    await trigger.click();
    await expect(page.locator('#signinOverlay')).toBeVisible();

    // Focus initial dans la modale (premier champ)
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 3000 }).toBe('signinEmail');

    await page.keyboard.press('Escape');
    await expect(page.locator('#signinOverlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-action')), { timeout: 3000 }).toBe('show-signin');

    expect(errors).toEqual([]);
  });
});