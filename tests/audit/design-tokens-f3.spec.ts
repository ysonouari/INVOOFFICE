import { test, expect, type Page } from '@playwright/test';

/*
  Phase F3 — Consolidation des Design Tokens CSS.

  Contrainte forte : AUCUNE valeur calculée ne doit changer. Les tokens
  introduits (--space-*, --fs-*, --radius-sm/md/pill, --shadow-lg, --z-*)
  reprennent EXACTEMENT les valeurs littérales de l'existant, et leur
  application est vérifiée ici par :

    1. lecture des valeurs de tokens dans :root (styles.css) ;
    2. getComputedStyle sur des éléments RÉELS de l'app / admin / landing
       (jamais la simple existence de la variable : on vérifie la valeur
       résolue = l'ancien littéral) ;
    3. sondes injectées pour les composants dont le rendu nécessite un
       corpus de données (badges, pagination historique…), stylées par les
       vraies feuilles.

  Zones NON couvertes (volontairement intactes) : bloc PDF de styles.css
  (#pdf-stage, .pdf-*) et blocs PDF de rtl.css — vérifiés à part par les
  suites PDF existantes (25 tests de non-régression).
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

// Lit les valeurs résolues des tokens F3 dans :root (styles.css).
async function readTokens(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const names = [
      '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
      '--space-7', '--space-8', '--space-9', '--space-10', '--space-11', '--space-12',
      '--fs-xs', '--fs-sm', '--fs-sm-2', '--fs-md', '--fs-md-2', '--fs-base', '--fs-base-2',
      '--fs-lg', '--fs-xl', '--fs-2xl',
      '--radius-sm', '--radius-md', '--radius-pill',
      '--shadow-lg',
      '--z-base', '--z-content', '--z-nav', '--z-modal', '--z-toast',
    ];
    const out: Record<string, string> = {};
    for (const n of names) out[n] = s.getPropertyValue(n).trim();
    return out;
  });
}

// Sonde : injecte du HTML dans la vraie page (stylé par la vraie feuille),
// lit les valeurs calculées d'un élément, puis retire le nœud.
async function probe(page: Page, html: string, selector: string, props: string[]): Promise<Record<string, string>> {
  return page.evaluate(({ html, selector, props }) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    const el = wrap.querySelector(selector) as HTMLElement;
    const s = getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const p of props) out[p] = s.getPropertyValue(p);
    wrap.remove();
    return out;
  }, { html, selector, props });
}

test.describe('Phase F3 — Design Tokens CSS (consolidation, valeurs identiques)', () => {
  test('F3.1-F3.5 TOKENS — valeurs exactes des nouvelles variables (:root)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await waitAppReady(page);
    const t = await readTokens(page);

    const spacing = ['4px', '6px', '8px', '10px', '12px', '14px', '16px', '20px', '24px', '32px', '40px', '48px'];
    spacing.forEach((v, i) => expect(t[`--space-${i + 1}`], `--space-${i + 1}`).toBe(v));

    const fs = ['11px', '12px', '12.5px', '13px', '13.5px', '14px', '15px', '16px', '18px', '20px'];
    const fsNames = ['--fs-xs', '--fs-sm', '--fs-sm-2', '--fs-md', '--fs-md-2', '--fs-base', '--fs-base-2', '--fs-lg', '--fs-xl', '--fs-2xl'];
    fsNames.forEach((n, i) => expect(t[n], n).toBe(fs[i]));

    expect(t['--radius-sm'], '--radius-sm').toBe('6px');
    expect(t['--radius-md'], '--radius-md').toBe('8px');
    expect(t['--radius-pill'], '--radius-pill').toBe('20px');
    expect(t['--shadow-lg'], '--shadow-lg').toBe('0 8px 24px rgba(0,0,0,.3)');
    expect(t['--z-base'], '--z-base').toBe('0');
    expect(t['--z-content'], '--z-content').toBe('1');
    expect(t['--z-nav'], '--z-nav').toBe('100');
    expect(t['--z-modal'], '--z-modal').toBe('110');
    expect(t['--z-toast'], '--z-toast').toBe('9999');

    expect(errors).toEqual([]);
  });

  test('F3.1/F3.2 APP — éléments réels : gap, padding, font-size, radius', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await waitAppReady(page);

    const nav = await page.locator('.nav-actions').evaluate((el) => getComputedStyle(el).getPropertyValue('gap'));
    expect(nav, 'gap .nav-actions').toBe('10px');

    const btn = await page.locator('.add-line-btn').evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, padding: s.padding };
    });
    expect(btn.radius, 'border-radius .btn').toBe('10px');
    expect(btn.padding, 'padding .btn').toBe('10px 16px');

    const th = await page.locator('table.lines th').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, padding: s.padding };
    });
    expect(th.size, 'font-size table.lines th').toBe('11px');
    expect(th.padding, 'padding table.lines th').toBe('8px');

    const summary = await page.locator('.summary-row').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(summary, 'font-size .summary-row').toBe('13.5px');

    const footer = await page.locator('.app-footer').evaluate((el) => getComputedStyle(el).fontSize);
    expect(footer, 'font-size .app-footer').toBe('12px');

    expect(errors).toEqual([]);
  });

  test('F3.3-F3.5 APP — modale entreprise : z-index overlay, toggle pill, modal-close', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openCompanyModal(page);

    const z = await page.locator('#companyModalOverlay').evaluate((el) => getComputedStyle(el).zIndex);
    expect(z, 'z-index .modal-overlay').toBe('110');

    const track = await page.locator('label.toggle .track').first().evaluate((el) => getComputedStyle(el).borderRadius);
    expect(track, 'border-radius toggle track').toBe('20px');

    const close = await page.locator('#companyModalOverlay .modal-close').evaluate((el) => getComputedStyle(el).fontSize);
    expect(close, 'font-size .modal-close').toBe('20px');

    expect(errors).toEqual([]);
  });

  test('F3.3 RADIUS — sondes (badge, pagination, stat-card, hist-card, icon-btn)', async ({ page }) => {
    await waitAppReady(page);

    const badge = await probe(page, '<span class="badge">x</span>', '.badge', ['border-radius']);
    expect(badge['border-radius'], 'radius .badge').toBe('20px');

    const pagBtn = await probe(page, '<div class="hist-pagination"><button>1</button></div>', '.hist-pagination button', ['border-radius', 'font-size', 'padding']);
    expect(pagBtn['border-radius'], 'radius .hist-pagination button').toBe('6px');
    expect(pagBtn['font-size'], 'font-size .hist-pagination button').toBe('13px');
    expect(pagBtn['padding'], 'padding .hist-pagination button').toBe('0px 8px');

    const card = await probe(page, '<div class="hist-stat-card">x</div>', '.hist-stat-card', ['border-radius']);
    expect(card['border-radius'], 'radius .hist-stat-card').toBe('10px');

    const hcard = await probe(page, '<div class="hist-card">x</div>', '.hist-card', ['border-radius']);
    expect(hcard['border-radius'], 'radius .hist-card').toBe('14px');

    const iconBtn = await probe(page, '<button class="icon-btn">x</button>', '.icon-btn', ['border-radius', 'width']);
    expect(iconBtn['border-radius'], 'radius .icon-btn').toBe('8px');

    const pageSize = await probe(page, '<select class="hist-page-size"></select>', '.hist-page-size', ['border-radius']);
    expect(pageSize['border-radius'], 'radius .hist-page-size').toBe('6px');
  });

  test('F3.3-F3.5 ADMIN — éléments réels : filter-pill, actions .btn', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openAdmin(page);

    const pill = await probe(page, '<button class="admin-filter-pill">x</button>', '.admin-filter-pill', ['border-radius', 'padding', 'font-size']);
    expect(pill['border-radius'], 'radius .admin-filter-pill').toBe('20px');
    expect(pill['padding'], 'padding .admin-filter-pill').toBe('6px 14px');
    expect(pill['font-size'], 'font-size .admin-filter-pill').toBe('12.5px');

    await page.locator('#navUsers').click();
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);
    const abtn = await page.locator('#usersTable tbody tr').first().locator('.admin-actions .btn').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, minHeight: s.minHeight };
    });
    expect(abtn.radius, 'radius .admin-actions .btn').toBe('6px');
    expect(abtn.minHeight, 'min-height .admin-actions .btn').toBe('34px');

    expect(errors).toEqual([]);
  });

  test('F3.4/F3.5 LANDING — éléments réels : header, toast, trust-badge, premium-card', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page.locator('.lp-header')).toBeVisible({ timeout: 10000 });

    const header = await page.locator('.lp-header').evaluate((el) => getComputedStyle(el).zIndex);
    expect(header, 'z-index .lp-header').toBe('100');

    const toast = await probe(page, '<div class="lp-toast">x</div>', '.lp-toast', ['z-index', 'box-shadow']);
    expect(toast['z-index'], 'z-index .lp-toast').toBe('9999');
    expect(toast['box-shadow'], 'box-shadow .lp-toast').toContain('0px 8px 24px');

    const badge = await page.locator('.lp-trust-badge').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, padding: s.padding };
    });
    expect(badge.radius, 'radius .lp-trust-badge').toBe('20px');
    expect(badge.padding, 'padding .lp-trust-badge').toBe('7px 16px');

    const card = await page.locator('.lp-premium-card').first().evaluate((el) => getComputedStyle(el).padding);
    expect(card, 'padding .lp-premium-card (mixte token + littéral)').toBe('40px 36px');

    expect(errors).toEqual([]);
  });

  test('F3.1 RTL — appel .rtl.css : flèche select (padding invariants), FR puis AR', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.addInitScript(() => {
      localStorage.setItem('fb_lang', 'fr');
      localStorage.setItem('fb_theme', 'dark');
    });
    await waitAppReady(page);

    const frLtr = await page.locator('#docType').evaluate((el) => {
      const s = getComputedStyle(el);
      return { pr: s.paddingRight, pl: s.paddingLeft };
    });
    expect(frLtr.pr, 'padding-right select LTR').toBe('12px');
    expect(frLtr.pl, 'padding-left select LTR').toBe('12px');

    await page.locator('#langSwitcher').click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl', { timeout: 5000 });
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

    const arRtl = await page.locator('#docType').evaluate((el) => {
      const s = getComputedStyle(el);
      return { pr: s.paddingRight, pl: s.paddingLeft };
    });
    expect(arRtl.pr, 'padding-right select RTL (var(--space-5))').toBe('12px');
    expect(arRtl.pl, 'padding-left select RTL (var(--space-10))').toBe('32px');

    expect(errors).toEqual([]);
  });
});