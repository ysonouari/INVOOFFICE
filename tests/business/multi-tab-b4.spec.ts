import { test, expect } from '@playwright/test';

/*
  B4 — réactivité multi-onglet / multi-session (cf. docs/audit/PWA_B4_MULTI_TAB.md).
  supabase-js synchronise déjà les onglets et remonte `SIGNED_OUT` à
  `onAuthStateChange` (BroadcastChannel + storage signal de gotrue) ; le projet s'y
  abonne désormais (modules/auth/auth-events.js) :
    - SIGNED_OUT (logout ailleurs / session invalidée / refresh rejeté)
      → purge snapshot B1 + redirect "/" si on est sur /app ou /admin.

  Tests réels multi-pages (même contexte Playwright = même storage + BroadcastChannel) :
    - T1 : deux onglets même session — AUCUN faux logout ; B2 (SRI) + B3 (precache) intacts.
    - T2 : logout via l'UI dans A → B re-dirige "/" + snapshot B1 purgé (mécanisme réel).
    - T3 : session devenue invalide (token expiré + refresh → 401) → l'onglet B ne reste
           pas dans un état obsolète et re-dirige "/".
    - T4 : nouvel onglet pendant une session valide → boot normal (/app).
    - T5 : session invalidée → un NOUVEL onglet suit le guard (redirect "/", snapshot nul).
*/

const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1';
const SUPABASE_SRI =
  'sha384-ZM8CwwQOJp5puchJk/gzqVbkGOUMVxHQPIY7mDCclfX3C8u6+ZyCjOcwaMC8hbnQ';

async function bootApp(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#docType')).toBeVisible({ timeout: 15000 });
}

async function pathnameOf(page) {
  return page.evaluate(() => window.location.pathname);
}

test.describe('B4 — multi-onglet / multi-session', () => {
  test('T1 — deux onglets même session : aucun faux logout, B2/B3 intacts', async ({ context, page, request }) => {
    const pageA = page;
    const pageB = await context.newPage();
    await bootApp(pageA);
    await bootApp(pageB);

    await pageB.waitForTimeout(1500);
    expect(await pathnameOf(pageA)).toBe('/app');
    expect(await pathnameOf(pageB)).toBe('/app');

    const html = await (await request.get('/app')).text();
    expect(html).toContain(`integrity="${SUPABASE_SRI}"`);
    expect(html).toContain(`src="${SUPABASE_CDN_URL}"`);

    const sw = await (await request.get('/sw.js')).text();
    expect(sw).toContain("'js/storage-persistence.js'");
    expect(sw).toContain("'modules/auth/auth-events.js'");
  });

  test('T2 — logout dans l\'onglet A → l\'onglet B re-dirige / et purge le snapshot B1', async ({ context, page }) => {
    const pageA = page;
    const pageB = await context.newPage();
    await bootApp(pageA);
    await bootApp(pageB);

    await expect(pageA.locator('#authLogout')).toBeVisible();
    await pageA.click('#authLogout');

    await expect(pageA).toHaveURL(/\/$/, { timeout: 20000 });
    await expect(pageB).toHaveURL(/\/$/, { timeout: 20000 });

    const snap = await pageB.evaluate(() => localStorage.getItem('fb_auth_snapshot'));
    expect(snap).toBeNull();
  });

  test('T3 — session invalidée (refresh → 401) : l\'onglet B re-dirige /', async ({ context, page }) => {
    const pageB = page;
    await bootApp(pageB);

    await pageB.route('**/auth/v1/token**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"msg":"token_expired"}' })
    );

    await pageB.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!key) return;
      const obj = JSON.parse(localStorage.getItem(key));
      obj.expires_at = Math.floor(Date.now() / 1000) - 3600;
      localStorage.setItem(key, JSON.stringify(obj));
    });

    await pageB.reload({ waitUntil: 'domcontentloaded' });
    await expect(pageB).toHaveURL(/\/$/, { timeout: 30000 });
  });

  test('T4 — nouvel onglet pendant une session valide → boot normal', async ({ context, page }) => {
    await bootApp(page);
    const pageC = await context.newPage();
    await bootApp(pageC);
    expect(await pathnameOf(pageC)).toBe('/app');
  });

  test('T5 — session invalidée → un nouveau onglet suit le guard (pas d\'état obsolète)', async ({ context, page }) => {
    const pageA = page;
    const pageB = await context.newPage();
    await bootApp(pageA);
    await bootApp(pageB);

    await expect(pageA.locator('#authLogout')).toBeVisible();
    await pageA.click('#authLogout');
    await expect(pageA).toHaveURL(/\/$/, { timeout: 20000 });
    await expect(pageB).toHaveURL(/\/$/, { timeout: 20000 });

    const pageC = await context.newPage();
    await pageC.goto('/app');
    await pageC.waitForLoadState('networkidle');
    expect(await pathnameOf(pageC)).toBe('/');
    expect(await pageC.evaluate(() => localStorage.getItem('fb_auth_snapshot'))).toBeNull();
  });
});