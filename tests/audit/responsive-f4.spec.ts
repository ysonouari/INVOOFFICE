import { test, expect, type Page } from '@playwright/test';

/*
  Phase F4 — Responsive / Mobile : garde-fous anti-débordement horizontal.

  Constat (audit read-only + probes runtime, docs/audit/PHASE_F4_RESPONSIVE_AUDIT.md) :
  un SEUL défaut responsive identifié — le header admin débordait horizontalement
  à ≤360 px (#hamburgerToggle dr=-347-367 pour vw=320/360). Cause : admin.css
  forçait .app-header{flex-wrap:nowrap} à ≤768 px alors que sa règle de base est
  flex-wrap:wrap ; à 320 px .brand (« Administration ») + .admin-nav-mobile
  dépassent la largeur utile (~272 px) → scroll horizontal de la page entière.

  Correctif minimal (Phase E, css/admin.css, bloc @media (max-width:768px)) :

      .admin-nav-mobile { display: flex; margin-left: auto; }
      .app-header { flex-wrap: wrap; align-items: center; }

  Comportement : une seule rangée tant que ça tient (412 px+ = rendu identique),
  encore une 2e rangée dans la bande étroite où ça débordait (≤390 px).

  Ce spec vérifie au niveau RÉEL :
    1. la règle défensive présente dans la feuille servie (source de vérité) ;
    2. .app-header admin = flex-wrap:wrap ET .admin-nav-mobile margin-left:auto
       à 320/390/768 px (computed style) ;
    3. zéro overflow horizontal de page à 320/360/375/390/412/768 px sur
       landing, app (Nouveau + Historique seed, FR dark + RTL ar) et admin
       (dashboard/users/méthodes, light + dark).
  Les scroll containers internes (#histTableWrap overflow-x:auto, .admin-table-wrap)
  sont voulus — seul l'overflow de PAGE est testé (document.scrollWidth).
*/

const WIDTHS_LANDING = [320, 360, 375, 390, 412, 768];
const WIDTHS_APP = [320, 360, 390, 412, 768];
const WIDTHS_ADMIN = [320, 360, 375, 390, 412, 768];

type ProbeResult = {
  vw: number;
  docSW: number;
  bodySW: number;
  overflow: boolean;
  offenders: { sel: string; o: number; left: number; right: number }[];
  dir: string;
  lang: string;
};

function probeFn(): ProbeResult {
  const vw = window.innerWidth;
  const docSW = document.documentElement.scrollWidth;
  const bodySW = document.body ? document.body.scrollWidth : 0;
  const overflow = docSW > vw + 1 || bodySW > vw + 1;
  const tag = (el: Element): string => {
    const id = el.getAttribute && el.getAttribute('id');
    if (id) return '#' + id;
    const cls = el.classList && el.classList.length ? '.' + Array.from(el.classList).join('.') : '';
    return (el.tagName || '').toLowerCase() + cls;
  };
  const offenders = (() => {
    const hits: { el: Element; o: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0.5 || r.height <= 0.5) continue;
      let o = 0;
      if (r.right > vw + 1) o = Math.max(o, r.right - vw - 1);
      if (r.left < -1) o = Math.max(o, -1 - r.left);
      if (o > 0) hits.push({ el, o });
    }
    const leaves = hits.filter(h => !hits.some(o2 => o2 !== h && h.el.contains(o2.el)));
    return leaves.sort((a, b) => b.o - a.o).slice(0, 6).map(h => {
      const r = h.el.getBoundingClientRect();
      return { sel: tag(h.el), o: Math.round(h.o), left: Math.round(r.left), right: Math.round(r.right) };
    });
  })();
  return { vw, docSW, bodySW, overflow, offenders, dir: document.documentElement.dir, lang: document.documentElement.lang };
}

async function assertClean(page: Page, label: string): Promise<ProbeResult> {
  const res = await page.evaluate(probeFn);
  const detail = res.offenders.length
    ? 'DRV ' + res.offenders.map(f => `${f.sel} o=${f.o} l=${f.left} r=${f.right}`).join(' | ')
    : '';
  expect(res.overflow, `${label} (vw=${res.vw}) overflow docSW=${res.docSW}/bodySW=${res.bodySW} ${detail}`).toBe(false);
  return res;
}

async function gotoApp(page: Page, opts?: { lang?: string; theme?: string }): Promise<void> {
  if (opts) {
    await page.addInitScript((cfg) => {
      if (cfg.lang) localStorage.setItem('fb_lang', cfg.lang);
      if (cfg.theme) localStorage.setItem('fb_theme', cfg.theme);
    }, opts);
  }
  await page.goto('/app');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#docType', { timeout: 25000 });
}

async function seedHistory(page: Page): Promise<void> {
  const types = ['facture', 'devis', 'avoir', 'bl', 'facture', 'devis', 'avoir', 'facture'];
  const clients = [
    'Société El Amrani Import Export Casablanca', 'Boutique Al Andalous Marrakech',
    'Monsieur Karim Bennani Fès', 'Auto-Entrepreneur Salma Idrissi Rabat',
    'SARL Atlas Digital Conception Oujda', 'Etablissement Atlas Solutions Tanger',
    'Madame Fatima Zahra Laâbi Agadir', 'Coopérative Tanger Med Services Tanger',
  ];
  const docs = types.map((t, i) => ({
    id: 'doc-' + (i + 1),
    type: t,
    numero: (t === 'facture' ? 'FAC' : t === 'devis' ? 'DEV' : t === 'avoir' ? 'AVR' : 'BL') + '-2026-' + String(i + 1).padStart(3, '0'),
    date: '2026-09-0' + (i + 1),
    createdAt: '2026-09-0' + (i + 1) + 'T09:00:00.000Z',
    client: clients[i],
    totalTTC: 1250.5 + i * 317.25,
    filename: 'doc-' + (i + 1) + '.pdf',
  }));
  await page.evaluate((d) => localStorage.setItem('fb_history', JSON.stringify(d)), docs);
}

async function openAppView(page: Page, navTarget: string, viewId: string): Promise<void> {
  const hamb = page.locator('#appHamburgerToggle');
  if (await hamb.isVisible().catch(() => false)) {
    await hamb.click();
    await expect(page.locator('#appNav')).toHaveClass(/open/);
  }
  await page.locator(navTarget).click();
  await expect(page.locator(viewId)).toHaveClass(/active/);
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
          ? { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f4.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' }
          : [
              { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@f4.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' },
              { id: 'u-paid', full_name: 'Karim Client Paiement régulier', email: 'paid@f4.local', whatsapp: '+212600000002', role: 'user', status: 'active', created_at: '2026-02-02T00:00:00.000Z' },
              { id: 'u-pend', full_name: 'Nadia Pendante En Attente De Paiement', email: 'pend@f4.local', whatsapp: '+212600000003', role: 'user', status: 'pending', created_at: '2026-02-03T00:00:00.000Z' },
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

async function gotoAdmin(page: Page, opts?: { theme?: string }): Promise<void> {
  if (opts) {
    await page.addInitScript((cfg) => { if (cfg.theme) localStorage.setItem('fb_theme', cfg.theme); }, opts);
  }
  await mockAdminTables(page);
  await page.goto('/admin');
  await expect(page.locator('#adminApp')).toBeVisible({ timeout: 10000 });
}

async function openAdminView(page: Page, navTarget: string, viewId: string): Promise<void> {
  const hamb = page.locator('#hamburgerToggle');
  if (await hamb.isVisible().catch(() => false)) {
    await hamb.click();
    await expect(page.locator('#adminNav')).toHaveClass(/open/);
  }
  await page.locator(navTarget).click();
  await expect(page.locator(viewId)).toHaveClass(/active/);
}

test.describe('Phase F4 — Responsive / Mobile (anti-débordement horizontal)', () => {

  test('F4.1 admin — règle défensive présente + computed style (wrap + margin auto)', async ({ page }) => {
    const css = await page.request.get('/css/admin.css');
    expect(css.ok()).toBe(true);
    const norm = (await css.text()).replace(/\s+/g, '');
    expect(norm, '.admin-nav-mobile margin-left:auto').toContain('.admin-nav-mobile{display:flex;margin-left:auto;}');
    expect(norm, '.app-header flex-wrap:wrap défensif').toContain('.app-header{flex-wrap:wrap;align-items:center;}');

    for (const w of [320, 390, 768]) {
      await page.setViewportSize({ width: w, height: 800 });
      await gotoAdmin(page);
      await assertClean(page, `admin/dashboard@${w} (règle)`);
      expect(await page.locator('.app-header').evaluate(el => getComputedStyle(el).flexWrap), `.app-header flex-wrap @${w}`).toBe('wrap');
      if (w === 320) {
        const ml = await page.locator('.admin-nav-mobile').evaluate(el => parseFloat(getComputedStyle(el).marginLeft));
        expect(ml, `.admin-nav-mobile margin-left:auto appliqué @${w}`).toBeGreaterThan(0);
      }
      await openAdminView(page, '#navMethods', '#view-methods');
      await assertClean(page, `admin/methods@${w} (règle)`);
    }
  });

  test('F4.2 admin — zéro overflow page (dashboard/users/méthodes, light), 320→768', async ({ page }) => {
    test.setTimeout(90000);
    for (const w of WIDTHS_ADMIN) {
      await page.setViewportSize({ width: w, height: 800 });
      await gotoAdmin(page);
      await assertClean(page, `admin/dashboard@${w}`);
      await openAdminView(page, '#navUsers', '#view-users');
      await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);
      await assertClean(page, `admin/users@${w}`);
      await openAdminView(page, '#navMethods', '#view-methods');
      await assertClean(page, `admin/methods@${w}`);
    }
  });

  test('F4.3 admin — zéro overflow dark (dashboard + méthodes)', async ({ page }) => {
    for (const w of [320, 768]) {
      await page.setViewportSize({ width: w, height: 800 });
      await gotoAdmin(page, { theme: 'dark' });
      await assertClean(page, `admin(dark)/dashboard@${w}`);
      await openAdminView(page, '#navMethods', '#view-methods');
      await assertClean(page, `admin(dark)/methods@${w}`);
    }
  });

  test('F4.4 app — zéro overflow (Nouveau + Historique seed, dark), 320→768', async ({ page }) => {
    test.setTimeout(120000);
    for (const w of WIDTHS_APP) {
      await page.setViewportSize({ width: w, height: 800 });
      await gotoApp(page, { theme: 'dark' });
      await expect(page.locator('#view-nouveau')).toHaveClass(/active/);
      await assertClean(page, `app/nouveau@${w}`);
      await seedHistory(page);
      await openAppView(page, '#navHistorique', '#view-historique');
      await page.waitForFunction(() => {
        const wEl = document.getElementById('histTableWrap');
        return !!wEl && !!wEl.querySelector('.hist-table-wrap, .hist-card, .hist-empty, .hist-summary, .hist-topbar');
      }, { timeout: 10000 });
      await assertClean(page, `app/historique@${w}`);
    }
  });

  test('F4.5 app RTL (ar) + landing — zéro overflow', async ({ page }) => {
    test.setTimeout(90000);
    for (const w of [320, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await gotoApp(page, { lang: 'ar', theme: 'dark' });
      const res = await assertClean(page, `app-ar/nouveau@${w}`);
      expect(res.dir, `dir rtl @${w}`).toBe('rtl');
      await openAppView(page, '#navHistorique', '#view-historique');
      await assertClean(page, `app-ar/historique@${w}`);
    }
    for (const w of WIDTHS_LANDING) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/');
      await expect(page.locator('.lp-header')).toBeVisible({ timeout: 10000 });
      await assertClean(page, `landing@${w}`);
    }
  });
});