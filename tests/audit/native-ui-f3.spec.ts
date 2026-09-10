import { test, expect, type Page } from '@playwright/test';

/*
  Phase F3.5 — Validation du correctif CSS « Native Safe » (spin buttons).

  Constat F3.5 (audit read-only) : les 9 inputs[type=number] de l'app/admin
  affichaient les flèches d'incrément natives (appearance:auto). Correctif
  minimal approuvé, CSS uniquement, inséré dans « Browser-native elements
  theming » de styles.css :

    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;appearance:none;margin:0;}
    input[type="number"]{-moz-appearance:textfield;}

  Ce spec vérifie :
    1. la présence EXACTE des règles dans la feuille servie (source de vérité
       pour Chromium ET Firefox, -moz non testable en runtime Chromium) ;
    2. l'immutabilité des éléments réels : legend l'appearance au niveau
       ÉLÉMENT reste `auto` (seul le pseudo est ciblé), apparence intacte en
       dark et light ;
    3. la non-régression des autres surfaces natives (selects dropdown natifs,
       input date, input color, checkbox custom, option themé) — aucune autre
       modification apportée.

  Zone non couverte : le popup natif d'un <select> (hors DOM, non inspectable
  par Playwright — documenté dans NATIVE_BROWSER_UI_AUDIT.md).
*/

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
          ? { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f3.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' }
          : [
              { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f3.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' },
              { id: 'u-paid', full_name: 'Karim Client', email: 'paid@f3.local', whatsapp: '+212600000002', role: 'user', status: 'active', created_at: '2026-02-02T00:00:00.000Z' },
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

test.describe('Phase F3.5 — Correctif CSS spin buttons (Native Safe)', () => {
  test('F3.5.1 STYLESHEET — règles spin masquées présentes (exactes, sans altération)', async ({ page }) => {
    const css = await (await page.request.get('/css/styles.css')).text();
    // Normalisation des espaces : la feuille est servie telle quelle (sans minifier).
    const norm = css.replace(/\s+/g, '');

    expect(norm, 'règle spin buttons WebKit (appearance none + margin 0)').toContain(
      'input[type="number"]::-webkit-outer-spin-button,input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;appearance:none;margin:0;}',
    );
    expect(norm, 'règle -moz-appearance:textfield (Firefox)').toContain(
      'input[type="number"]{-moz-appearance:textfield;}',
    );

    // Garde-fous : le bloc est inséré dans « Browser-native elements theming »
    // sans toucher aux règles natives voisines (search-cancel, a color).
    expect(norm, 'règle search-cancel conservée').toContain(
      'input[type="search"]::-webkit-search-cancel-button{filter:invert(1);}',
    );
    expect(norm, 'a{color:inherit} conservé').toContain('a{color:inherit;}');
    expect(norm, 'select appearance:none conservé').toContain('select{-webkit-appearance:none;-moz-appearance:none;appearance:none;');
    expect(norm, 'select option{} conservé').toContain('select option{background:var(--panel);color:var(--text);}'.replace(/\s+/g, ''));
  });

  test('F3.5.2 APP — number inputs réels (éléments ET ~pseudo), dark & light', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // thème clair (défaut headless)
    await waitAppReady(page);
    const light = await page.locator('#remise').evaluate((el) => {
      const s = getComputedStyle(el);
      return { appearance: s.appearance, color: s.color, bg: s.backgroundColor, border: s.borderTopColor };
    });
    expect(light.appearance, '#remise appearance (niveau élément)').toBe('auto');
    expect(light.color, '#remise color clair').not.toBe('');
    expect(light.bg, '#remise bg clair').not.toBe('rgba(0, 0, 0, 0)');

    // thème sombre
    const darkPage = await page.context().newPage();
    try {
      await darkPage.addInitScript(() => localStorage.setItem('fb_theme', 'dark'));
      await darkPage.goto('/app');
      await expect(darkPage.locator('#docType')).toBeVisible();
      await expect(darkPage.locator('#remise')).toBeVisible();
      const dark = await darkPage.locator('#remise').evaluate((el) => {
        const s = getComputedStyle(el);
        return { appearance: s.appearance, color: s.color, bg: s.backgroundColor, border: s.borderTopColor };
      });
      expect(dark.appearance, '#remise appearance dark (niveau élément)').toBe('auto');
      expect(dark.bg, '#remise bg sombre').toBe('rgb(18, 26, 46)');
      expect(dark.color, '#remise color sombre').toBe('rgb(231, 236, 245)');
    } finally {
      await darkPage.close();
    }

    expect(errors).toEqual([]);
  });

  test('F3.5.3 APP — modale entreprise : champs nombre, restants voulus', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.addInitScript(() => localStorage.setItem('fb_theme', 'dark'));
    await openCompanyModal(page);

    for (const sel of ['#cTvaTaux', '#cMargeHaut', '#cFontSizeOffset']) {
      const st = await page.locator(sel).evaluate((el) => {
        const s = getComputedStyle(el);
        return { appearance: s.appearance, type: (el as HTMLInputElement).type };
      });
      expect(st.type, `${sel} type`).toBe('number');
      expect(st.appearance, `${sel} appearance (niveau élément)`).toBe('auto');
    }

    const color = await page.locator('input[type="color"]').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { type: (el as HTMLInputElement).type, height: s.height, display: s.display };
    });
    expect(color.type, 'input[type=color] type').toBe('color');
    expect(color.height, 'input[type=color] hauteur (règle .color-row)').toBe('38px');
    expect(color.display, 'input[type=color] non masqué (picker natif conservé)').not.toBe('none');

    const toggle = await page.locator('label.toggle input[type="checkbox"]').first().evaluate((el) => getComputedStyle(el).clip);
    expect(toggle, 'checkbox custom (clip)').toBe('rect(0px, 0px, 0px, 0px)');

    const sel = await page.locator('#cRegimeTva').evaluate((el) => {
      const s = getComputedStyle(el);
      return { appearance: s.appearance, colorScheme: s.colorScheme };
    });
    expect(sel.appearance, '#cRegimeTva appearance (dropdown natif conservé)').toBe('none');
    expect(sel.colorScheme, 'color-scheme sélecteur').toContain('dark');

    expect(errors).toEqual([]);
  });

  test('F3.5.4 APP — surfaces natives non régressées (date, select, option)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.addInitScript(() => localStorage.setItem('fb_theme', 'dark'));
    await waitAppReady(page);

    const date = await page.locator('#docDate').evaluate((el) => getComputedStyle(el).appearance);
    expect(date, '#docDate appearance (picker natif conservé)').toBe('auto');

    const docType = await page.locator('#docType').evaluate((el) => {
      const s = getComputedStyle(el);
      return { appearance: s.appearance, bg: s.backgroundColor };
    });
    expect(docType.appearance, '#docType appearance (dropdown natif conservé)').toBe('none');
    expect(docType.bg, '#docType bg (option thématisée)').toBe('rgb(15, 22, 38)');

    const option = await page.locator('#docType option').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color };
    });
    expect(option.bg, 'option bg = var(--menu-bg)').toBe('rgb(18, 26, 46)');
    expect(option.color, 'option color = var(--text)').toBe('rgb(231, 236, 245)');

    expect(errors).toEqual([]);
  });

  test('F3.5.5 ADMIN — settings : number et select natifs intacts', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openAdmin(page);
    await page.locator('#navSettings').click();
    await expect(page.locator('#sCurrency')).toBeVisible({ timeout: 5000 });

    const price = await page.locator('#sLifetimePrice').evaluate((el) => {
      const s = getComputedStyle(el);
      return { appearance: s.appearance, type: (el as HTMLInputElement).type };
    });
    expect(price.type, '#sLifetimePrice type').toBe('number');
    expect(price.appearance, '#sLifetimePrice appearance (niveau élément, pseudo ciblé seul)').toBe('auto');

    const currency = await page.locator('#sCurrency').evaluate((el) => getComputedStyle(el).appearance);
    expect(currency, '#sCurrency appearance (dropdown natif conservé)').toBe('none');

    expect(errors).toEqual([]);
  });
});