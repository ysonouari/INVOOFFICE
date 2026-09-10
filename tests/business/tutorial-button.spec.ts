import { test, expect } from '@playwright/test';

/*
  Tutoriel vidéo (#navTutorial) — Option F (correctif boot lent).

  Bug corrigé : le listener #navTutorial était attaché SEULEMENT APRÈS
  `await withTimeout(Promise.all([checkAccessAndInit(), initStorage(), initI18n()]),
  15000)` dans js/main.js, et #appLoading (overlay fixed plein écran opaque)
  interceptait les clics pendant tout le boot réseau. Réseau lent ⇒ 1er clic mort,
  le bouton ne répondant qu'après un refresh (boot devenu rapide).

  Correctif : la modale Tutoriel (UI 100% statique dans app.html) est pré-câblée
  AVANT l'await de boot + #appLoading est rendu non-bloquant (pointer-events:none)
  et discret. Aucune dépendance Supabase / session / i18next / storage.

  Scénario reproduit de façon déterministe : stub de window.supabase dont
  getSession() et les requêtes profiles/subscriptions répondent après ~2,5 s
  (mode "slow"). Les clics PENDANT le boot utilisent page.dispatchEvent (le
  page.click attend l'actionnabilité et masquerait le bug).
*/

const USER = { id: 'tut-user-id', email: 'tut@example.com' };
const SLOW_MS = 2500;

function makeScenario(mode, overrides = {}) {
  return {
    mode,
    user: USER,
    profile: { role: 'user', status: 'active', full_name: 'Tut User' },
    expiresAt: null,
    slowMs: SLOW_MS,
    ...overrides,
  };
}

async function installStub(page, scenario) {
  await page.addInitScript((sc) => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    async function resolveTable(table) {
      if (sc.mode === 'slow') await delay(sc.slowMs);
      if (table === 'profiles') {
        if (sc.mode === 'offline') return { data: null, error: { message: 'fetch failed', type: 'fetch' } };
        if (sc.mode === 'deny') return { data: null, error: { status: 401, message: 'Unauthorized' } };
        return {
          data: {
            id: sc.user.id,
            full_name: sc.profile.full_name,
            email: sc.user.email,
            role: sc.profile.role,
            status: sc.profile.status,
          },
          error: null,
        };
      }
      if (table === 'subscriptions') {
        if (sc.mode === 'offline') return { data: null, error: { message: 'fetch failed', type: 'fetch' } };
        if (sc.mode === 'deny') return { data: null, error: { status: 401, message: 'Unauthorized' } };
        return { data: { id: 'sub-tut', user_id: sc.user.id, status: 'active', expires_at: sc.expiresAt }, error: null };
      }
      return { data: null, error: { status: 404, message: 'not found' } };
    }

    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => {
            if (sc.mode === 'slow') await delay(sc.slowMs);
            return { data: { session: { user: sc.user } }, error: null };
          },
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
      email: 'tut@example.com',
      role: 'user',
      fullName: 'Tut User',
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

async function waitBootDone(page) {
  await expect(page.locator('#appLoading')).toHaveClass(/hidden/, { timeout: 15000 });
}

async function openAndAssertModal(page) {
  await page.click('#navTutorial');
  await expect(page.locator('#tutorialModalOverlay')).toHaveClass(/open/);
  await expect(page.locator('#tutorialModalOverlay')).toBeVisible();
}

test.describe('Tutoral — Option F (boot lent + premier clic sans refresh)', () => {
  test('T1 — boot lent : #appLoading visible non-bloquant + clic tutoriel AVANT la fin du boot', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('slow'));
    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    // 1/2. #appLoading encore visible pendant le boot + pointer-events:none
    await expect(page.locator('#appLoading')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.getElementById('appLoading')).pointerEvents))
      .toBe('none');

    // 3/4. Le listener #navTutorial est DÉJÀ câblé : le premier clic ouvre la modale
    // AVANT la fin du boot (dispatchEvent = vérifie le câblage, sans attendre
    // l'actionnabilité que page.click impose).
    await page.dispatchEvent('#navTutorial', 'click');

    // 5. La modale est ouverte/visible pendant que le boot est encore en cours.
    await expect(page.locator('#tutorialModalOverlay')).toHaveClass(/open/);
    await expect(page.locator('#tutorialModalOverlay')).toBeVisible();
    await expect(page.locator('#appLoading')).toBeVisible();

    // Fin du boot → l'app passe à l'état prêt.
    await waitBootDone(page);
    await expect(page.locator('#docType')).toBeVisible();

    // Fermeture de la modale ouverte pendant le boot (Échap) → clic réel post-boot réutilisable.
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();

    // Après le boot, un clic réel (sans refresh) fonctionne toujours : ouverture + X.
    await page.click('#navTutorial');
    await expect(page.locator('#tutorialModalOverlay')).toHaveClass(/open/);
    await page.click('#tutorialCloseBtn');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });

  test('T2 — fermeture par la touche Échap', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('success'));
    await page.goto('/app');
    await waitBootDone(page);

    await openAndAssertModal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });

  test('T3 — fermeture par clic extérieur (backdrop)', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('success'));
    await page.goto('/app');
    await waitBootDone(page);

    await openAndAssertModal(page);
    await page.locator('#tutorialModalOverlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });

  test('T4 — restauration du focus vers #navTutorial après fermeture', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('success'));
    await page.goto('/app');
    await waitBootDone(page);

    await openAndAssertModal(page);

    // Le focus se déplace sur le bouton de fermeture (setTimeout 50 ms).
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('tutorialCloseBtn');

    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('navTutorial');
  });

  test('T5 — refresh : aucun double listener, le bouton reste fonctionnel', async ({ page }) => {
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario('success'));
    await page.goto('/app');
    await waitBootDone(page);

    await openAndAssertModal(page);
    await page.click('#tutorialCloseBtn');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();

    await page.reload();
    await waitBootDone(page);

    await openAndAssertModal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });

  test('T6 — B1 offline (snapshot) : boot tolérant intact + tutoriel fonctionnel', async ({ page }) => {
    await blockSupabaseCdn(page);
    await seedSnapshot(page);
    await installStub(page, makeScenario('offline'));
    await page.goto('/app');
    await waitBootDone(page);

    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator('#docType')).toBeVisible();

    await openAndAssertModal(page);
    await page.click('#tutorialCloseBtn');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });
});