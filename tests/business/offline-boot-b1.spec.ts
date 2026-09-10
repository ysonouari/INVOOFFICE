import { test, expect } from '@playwright/test';

/**
 * B1 — Offline-tolerant boot (PWA_BROWSER_ARCHITECTURE_AUDIT → B1).
 *
 * Déterministe : stub de window.supabase injecté AVANT le boot (le script CDN
 * supabase-js est bloqué par route), aucun appel réseau externe sur le chemin.
 * Les 3 modes simulent :
 *   success  → validation en ligne OK (profiles + subscriptions retournent des lignes)
 *   offline  → échec de TRANSPORT (erreur SANS statut HTTP => snapshot autorisé)
 *   deny     → REFUS SERVEUR explicite (401 => statut HTTP => snapshot JAMAIS utilisé)
 *
 * Le snapshot « fb_auth_snapshot » (userId 'b1-user-id') est présemé via addInitScript.
 */

const SNAPSHOT_KEY = 'fb_auth_snapshot';
const USER = { id: 'b1-user-id', email: 'b1@example.com' };

function makeScenario(mode, overrides = {}) {
  return {
    mode,
    user: USER,
    profile: { role: 'user', status: 'active', full_name: 'B1 User' },
    expiresAt: null,
    ...overrides,
  };
}

async function installStub(page, scenario) {
  await page.addInitScript((sc) => {
    function resolveTable(table) {
      if (table === 'profiles') {
        if (sc.mode === 'offline') return { data: null, error: { message: 'fetch failed', type: 'fetch' } };
        if (sc.mode === 'deny') return { data: null, error: { status: 401, message: 'Unauthorized' } };
        return { data: { id: sc.user.id, full_name: sc.profile.full_name, email: sc.user.email, role: sc.profile.role, status: sc.profile.status }, error: null };
      }
      if (table === 'subscriptions') {
        if (sc.mode === 'offline') return { data: null, error: { message: 'fetch failed', type: 'fetch' } };
        if (sc.mode === 'deny') return { data: null, error: { status: 401, message: 'Unauthorized' } };
        return { data: { id: 'sub-b1', user_id: sc.user.id, status: 'active', expires_at: sc.expiresAt }, error: null };
      }
      return { data: null, error: { status: 404, message: 'not found' } };
    }

    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: { user: sc.user } }, error: null }),
          signOut: async () => ({ error: null }),
        },
        from: () => {
          const chain = {
            select: () => chain,
            eq: () => chain,
            single: () => resolveTable('profiles'),
            maybeSingle: () => resolveTable('subscriptions'),
          };
          return chain;
        },
      }),
    };
  }, scenario);
}

async function seedSnapshot(page, overrides = {}) {
  await page.addInitScript(({ userId, over }) => {
    const snap = {
      v: 1,
      userId,
      email: 'old@example.com',
      role: 'user',
      fullName: 'Old Name',
      status: 'active',
      hasAccess: true,
      expiresAt: null,
      validatedAt: '2026-01-01T00:00:00.000Z',
      ...over,
    };
    localStorage.setItem('fb_auth_snapshot', JSON.stringify(snap));
  }, { userId: USER.id, over: overrides });
}

function blockSupabaseCdn(page) {
  return page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
}

function snapshotValue(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }, SNAPSHOT_KEY);
}

async function bootApp(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
}

test.describe('B1 — offline-tolerant boot', () => {
  test('T1 — ONLINE SUCCESS : boot normal + snapshot créé', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('success'));
    await bootApp(page);

    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const snap = await snapshotValue(page);
    expect(snap).not.toBeNull();
    expect(snap.v).toBe(1);
    expect(snap.userId).toBe(USER.id);
    expect(snap.status).toBe('active');
    expect(snap.role).toBe('user');
    expect(snap.hasAccess).toBe(true);
    expect(snap.fullName).toBe('B1 User');
    expect(snap.expiresAt).toBeNull();
    expect(Date.parse(snap.validatedAt)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  test('T2 — COLD OFFLINE avec snapshot valide : boot sans redirect', async ({ page }) => {
    await blockSupabaseCdn(page);
    await seedSnapshot(page);
    await installStub(page, makeScenario('offline'));
    await bootApp(page);

    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const snap = await snapshotValue(page);
    expect(snap).not.toBeNull();
    expect(snap.userId).toBe(USER.id);
    expect(snap.validatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('T3 — OFFLINE sans snapshot : accès refusé, redirect / conservé', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('offline'));
    await bootApp(page);

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 });
    expect(await snapshotValue(page)).toBeNull();
  });

  test('T4 — REFUS SERVEUR (401) malgré snapshot : le snapshot ne surpasse jamais', async ({ page }) => {
    await blockSupabaseCdn(page);
    await seedSnapshot(page);
    await installStub(page, makeScenario('deny'));
    await bootApp(page);

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 });
  });

  test('T5 — SNAPSHOT EXPIRÉ (expires_at passé) : accès offline refusé', async ({ page }) => {
    await blockSupabaseCdn(page);
    await seedSnapshot(page, { expiresAt: '2020-01-01T00:00:00.000Z' });
    await installStub(page, makeScenario('offline'));
    await bootApp(page);

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 });
  });

  test('T6 — ONLINE REFRESH : le snapshot est remplacé par la nouvelle validation', async ({ page }) => {
    await blockSupabaseCdn(page);
    await seedSnapshot(page);
    await installStub(
      page,
      makeScenario('success', {
        profile: { role: 'user', status: 'active', full_name: 'Refreshed User' },
        expiresAt: '2099-12-31T00:00:00.000Z',
      })
    );
    await bootApp(page);

    await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });

    const snap = await snapshotValue(page);
    expect(snap.fullName).toBe('Refreshed User');
    expect(snap.expiresAt).toBe('2099-12-31T00:00:00.000Z');
    expect(Date.parse(snap.validatedAt)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
  });
});