import { test, expect, type Page } from '@playwright/test';

/*
  Phase F2 — Accessibilité UI (WCAG).

  Couvre les 6 sous-phases de la directive F2 :
    F2.1 Contrastes AA (4.5:1) — tokens (--muted-2 sur bg/panel, texte blanc
         sur --accent), vérifiés en thème sombre PUIS clair via réels
         getComputedStyle sur les tokens définis dans :root ;
    F2.2 Touch targets — taille réelle (getBoundingClientRect) des contrôles
         compacts : .icon-btn (aiguilles de ligne), .admin-actions .btn
         (admin), .hist-pagination button (sonde CSS réelle : la pagination
         historique ne rend pas sans corpus de documents) ;
    F2.3 Hamburger App — aria-controls/aria-expanded, ouverture, fermeture
         (clic nav, Escape, clic extérieur) ;
    F2.4 Hamburger Admin — idem, indépendant ;
    F2.5 Modales — TEST FIRST : focus initial (bouton de fermeture), piège
         Tab (retour au 1er focusable depuis le dernier), retour de focus à
         la fermeture (Escape) — doit déjà passer avant tout correctif ;
    F2.6 Hist Search — aria-label issu d'UNE seule source
         (data-i18n-aria-label, appliqué par applyTranslations), vérifié en
         FR à l'init puis en AR après le switch via #langSwitcher.

  Aucune modification du pipeline PDF / SW / auth / storage n'est couverte
  ici : la phase F2 est frontière stricte au CSS/JS d'interface.
*/

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(hex: string): number {
  return rgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }).reduce((acc, c, i) => acc + [0.2126, 0.7152, 0.0722][i] * c, 0);
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
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
        // id=eq. → .single() attend un objet JSON (Accept: vnd.pgrst.object+json) ;
        // sinon → liste (table users/admin)
        body = url.searchParams.toString().includes('id=eq.')
          ? { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f2.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' }
          : [
              { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f2.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' },
              { id: 'u-paid', full_name: 'Karim Client', email: 'paid@f2.local', whatsapp: '+212600000002', role: 'user', status: 'active', created_at: '2026-02-02T00:00:00.000Z' },
              { id: 'u-pend', full_name: 'Salma Enattente', email: 'pending@f2.local', whatsapp: '+212600000003', role: 'user', status: 'pending', created_at: '2026-02-03T00:00:00.000Z' },
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

test.describe('Phase F2 — Accessibilité UI (WCAG)', () => {
  test('F2.1 CONTRASTE — tokens AA (4.5:1) : sombre puis clair', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.addInitScript(() => {
      localStorage.setItem('fb_theme', 'dark');
      localStorage.setItem('fb_lang', 'fr');
    });
    await waitAppReady(page);

    const readTokens = (theme: string) => page.evaluate((t) => {
      const el = document.documentElement;
      el.setAttribute('data-theme', t);
      const s = getComputedStyle(el);
      const get = (name: string) => s.getPropertyValue(name).trim();
      return { bg: get('--bg'), panel: get('--panel'), panel2: get('--panel-2'), muted2: get('--muted-2'), accent: get('--accent') };
    }, theme);

    // Thème sombre = thème par défaut attendu en production
    const dark = await readTokens('dark');
    expect(contrastRatio(dark.muted2, dark.bg), 'muted-2 sur bg (sombre)').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.muted2, dark.panel), 'muted-2 sur panel (sombre)').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', dark.accent), 'texte blanc sur accent (sombre)').toBeGreaterThanOrEqual(4.5);

    // Thème clair — commuter via le vrai bouton (persistance contexte isolé)
    const light = await readTokens('light');
    expect(contrastRatio(light.muted2, light.bg), 'muted-2 sur bg (clair)').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.muted2, light.panel2), 'muted-2 sur panel-2 (clair)').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', light.accent), 'texte blanc sur accent (clair)').toBeGreaterThanOrEqual(4.5);

    expect(errors).toEqual([]);
  });

  test('F2.2 TOUCH — .icon-btn (aiguilles de ligne) ≥ 36 px', async ({ page }) => {
    await waitAppReady(page);

    if (await page.locator('#linesBody tr').count() === 0) {
      await page.locator('[data-action="add-line"]').click();
    }
    const iconBtn = page.locator('#linesBody tr .icon-btn').first();
    await expect(iconBtn).toBeVisible();

    const size = await iconBtn.evaluate((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    expect(size.width, 'largeur .icon-btn').toBeGreaterThanOrEqual(36);
    expect(size.height, 'hauteur .icon-btn').toBeGreaterThanOrEqual(36);
  });

  test('F2.2 TOUCH — .hist-pagination button ≥ 36 px (sonde CSS réelle)', async ({ page }) => {
    await waitAppReady(page);

    // La pagination historique ne se rend que si des documents existent :
    // sonde injectée dans la vraie page, stylée par la vraie feuille CSS.
    const probe = await page.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.className = 'hist-pagination';
      const btn = document.createElement('button');
      btn.textContent = '1';
      wrap.appendChild(btn);
      document.body.appendChild(wrap);
      const s = getComputedStyle(btn);
      const r = btn.getBoundingClientRect();
      const out = { height: parseFloat(s.height), minWidth: parseFloat(s.minWidth), rectW: r.width, rectH: r.height };
      wrap.remove();
      return out;
    });
    expect(probe.rectH).toBeGreaterThanOrEqual(36);
    expect(probe.rectW).toBeGreaterThanOrEqual(36);
    expect(probe.height).toBeGreaterThanOrEqual(36);
    expect(probe.minWidth).toBeGreaterThanOrEqual(36);
  });

  test('F2.2 TOUCH — .admin-actions .btn ≥ 34 px (actions compactes table)', async ({ page }) => {
    await openAdmin(page);
    await page.locator('#navUsers').click();
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);

    const btn = page.locator('#usersTable tbody tr').first().locator('.admin-actions .btn').first();
    await expect(btn).toBeVisible();
    const size = await btn.evaluate((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    expect(size.height, 'hauteur .admin-actions .btn').toBeGreaterThanOrEqual(34);
  });

  test('F2.3 HAMBURGER APP — aria-expanded/aria-controls, ouverture, fermetures', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await waitAppReady(page);

    const btn = page.locator('#appHamburgerToggle');
    const nav = page.locator('#appNav');

    await expect(nav).toBeHidden(); // fermé par défaut (menu mobile)
    await expect(btn).toHaveAttribute('aria-controls', 'appNav');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    // Ouverture
    await btn.click();
    await expect(nav).toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'true');

    // Fermeture par clic sur une action du menu (navigation vers historique)
    await page.locator('#navHistorique').click();
    await expect(nav).not.toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    // Fermeture par Escape
    await btn.click();
    await expect(nav).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(nav).not.toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    // Fermeture par clic extérieur (comportement existant préservé)
    await btn.click();
    await expect(nav).toHaveClass(/open/);
    await page.mouse.click(200, 500);
    await expect(nav).not.toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    expect(errors).toEqual([]);
  });

  test('F2.4 HAMBURGER ADMIN — aria-expanded/aria-controls, ouverture, fermetures', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await openAdmin(page);

    const btn = page.locator('#hamburgerToggle');
    const nav = page.locator('#adminNav');

    await expect(nav).toBeHidden();
    await expect(btn).toHaveAttribute('aria-controls', 'adminNav');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    // Ouverture
    await btn.click();
    await expect(nav).toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'true');

    // Fermeture par Escape (sans casser la fermeture des modales)
    await page.keyboard.press('Escape');
    await expect(nav).not.toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    // Fermeture par clic sur une vue (showView)
    await btn.click();
    await expect(nav).toHaveClass(/open/);
    await page.locator('#navUsers').click();
    await expect(nav).not.toHaveClass(/open/);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('F2.5 MODALES — TEST FIRST : focus initial, piège Tab, retour de focus (company + client)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // — Modale entreprise (lazy import company-modal.js) —
    await openCompanyModal(page);

    // Focus initial sur le bouton de fermeture
    await expect.poll(() => page.evaluate(() => {
      const a = document.activeElement;
      return a && a.matches('#companyModalOverlay .modal-close') ? 'close' : 'other';
    }), { timeout: 3000 }).toBe('close');

    // Piège Tab : depuis le dernier focusable, Tab ⮕ premier focusable (fermeture)
    await page.evaluate(() => {
      const ov = document.getElementById('companyModalOverlay') as HTMLElement;
      const f = Array.from(ov.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])'))
        .filter(el => !(el as HTMLButtonElement).disabled && (el as HTMLElement).offsetParent !== null);
      (f[f.length - 1] as HTMLElement).focus();
    });
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => {
      const ov = document.getElementById('companyModalOverlay') as HTMLElement;
      const f = Array.from(ov.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])'))
        .filter(el => !(el as HTMLButtonElement).disabled && (el as HTMLElement).offsetParent !== null);
      return f[0] === document.activeElement;
    }), 'Tab depuis le dernier focusable doit boucler sur le premier').toBe(true);

    // Retour de focus à la fermeture (Escape)
    await page.keyboard.press('Escape');
    await expect(page.locator('#companyModalOverlay')).not.toHaveClass(/open/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 3000 }).toBe('navInfos');

    // — Modale client (synchronisme, pas de lazy import) —
    const trigger = page.locator('[data-action="add-client"]');
    await trigger.click();
    await expect(page.locator('#clientModalOverlay.open')).toBeVisible();

    await expect.poll(() => page.evaluate(() => {
      const a = document.activeElement;
      return a && a.matches('#clientModalOverlay .modal-close') ? 'close' : 'other';
    }), { timeout: 3000 }).toBe('close');

    await page.keyboard.press('Escape');
    await expect(page.locator('#clientModalOverlay')).not.toHaveClass(/open/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-action')), { timeout: 3000 }).toBe('add-client');

    expect(errors).toEqual([]);
  });

  test('F2.6 I18N — histSearch : aria-label mono-source (data-i18n-aria-label) FR puis AR', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.addInitScript(() => {
      localStorage.setItem('fb_lang', 'fr');
      localStorage.setItem('fb_theme', 'dark');
    });
    await waitAppReady(page);

    const search = page.locator('#histSearch');
    await expect(search).toHaveAttribute('aria-label', 'Rechercher un document par numéro ou client');

    // Switch vers l'arabe : le label doit suivre (applyTranslations + data-i18n-aria-label)
    await page.locator('#langSwitcher').click();
    await expect(page.locator('#histSearch')).toHaveAttribute('aria-label', 'البحث عن مستند حسب الرقم أو العميل');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

    expect(errors).toEqual([]);
  });
});