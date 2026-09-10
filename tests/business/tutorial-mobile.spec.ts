import { test, expect } from '@playwright/test';

/*
  Tutoriel vidéo — mobile navigation regression.

  Verifies that the #navTutorial button works correctly when opened
  from the mobile hamburger menu at small viewport widths (320-412px).

  Scenario: hamburger → menu opens → tap Tutorial → modal opens → close → repeat.

  Tests at 5 mobile widths, dark+light, FR+AR/RTL.
*/

const USER = { id: 'mob-tut-id', email: 'mob@tut.test' };

function makeScenario(mode = 'success') {
  return {
    mode,
    user: USER,
    profile: { role: 'user', status: 'active', full_name: 'Mob Tut' },
    expiresAt: null,
  };
}

async function installStub(page, scenario) {
  await page.addInitScript((sc) => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    async function resolveTable(table) {
      if (sc.mode === 'slow') await delay(2500);
      if (table === 'profiles') {
        return { data: { id: sc.user.id, full_name: sc.profile.full_name, email: sc.user.email, role: sc.profile.role, status: sc.profile.status }, error: null };
      }
      if (table === 'subscriptions') {
        return { data: { id: 'sub-m', user_id: sc.user.id, status: 'active', expires_at: sc.expiresAt }, error: null };
      }
      return { data: null, error: { status: 404, message: 'not found' } };
    }
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => {
            if (sc.mode === 'slow') await delay(2500);
            return { data: { session: { user: sc.user } }, error: null };
          },
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: () => {
          const chain = { select: () => chain, eq: () => chain, single: () => resolveTable('profiles'), maybeSingle: () => resolveTable('subscriptions') };
          return chain;
        },
      }),
    };
  }, scenario);
}

async function seedSnapshot(page) {
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('fb_auth_snapshot', JSON.stringify({
      v: 1, userId, email: 'mob@tut.test', role: 'user', fullName: 'Mob Tut',
      status: 'active', hasAccess: true, expiresAt: null, validatedAt: '2026-01-01T00:00:00.000Z',
    }));
  }, { userId: USER.id });
}

async function blockSupabaseCdn(page) {
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
}

async function waitBootDone(page) {
  await expect(page.locator('#appLoading')).toHaveClass(/hidden/, { timeout: 20000 });
}

async function openHamburgerMenu(page) {
  const hamburger = page.locator('#appHamburgerToggle');
  await expect(hamburger).toBeVisible();
  await hamburger.click();
  await expect(page.locator('#appNav')).toHaveClass(/open/);
}

async function clickTutorialFromMenu(page) {
  const tut = page.locator('#navTutorial');
  await expect(tut).toBeVisible();
  await tut.click();
  await expect(page.locator('#tutorialModalOverlay')).toHaveClass(/open/);
  await expect(page.locator('#tutorialModalOverlay')).toBeVisible();
}

async function closeTutorialModal(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
}

async function assertModalInsideViewport(page) {
  const box = await page.locator('.tutorial-modal').boundingBox();
  expect(box, 'tutorial modal should have a bounding box').not.toBeNull();
  const vw = page.viewportSize()!.width;
  const vh = page.viewportSize()!.height;
  expect(box!.x, 'modal left >= 0').toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, 'modal right <= vw + 1').toBeLessThanOrEqual(vw + 1);
  expect(box!.y, 'modal top >= 0').toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, 'modal bottom <= vh + 1').toBeLessThanOrEqual(vh + 1);
}

async function assertNoPageOverflow(page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  });
  expect(overflow, 'no horizontal page overflow').toBe(false);
}

async function assertTutorialButtonNotCovered(page) {
  const covered = await page.evaluate(() => {
    const btn = document.getElementById('navTutorial');
    if (!btn) return 'button not found';
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 'button has zero size';
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top) return 'elementFromPoint returned null';
    if (top === btn || btn.contains(top)) return 'ok';
    return `elementFromPoint(${Math.round(cx)},${Math.round(cy)}) = <${top.tagName}#${top.id || ''}${top.className ? '.' + (top.className as string).split(' ')[0] : ''}> instead of #navTutorial`;
  });
  expect(covered, 'navTutorial not covered by another element').toBe('ok');
}

const MOBILE_WIDTHS = [320, 360, 375, 390, 412];

test.describe('Tutorial — mobile navigation (hamburger → tutorial → modal)', () => {

  for (const vw of MOBILE_WIDTHS) {
    test(`T-MOB-${vw}px — dark FR: hamburger → tutoriel → modal ouvre + viewport check`, async ({ page }) => {
      await page.setViewportSize({ width: vw, height: 800 });
      await blockSupabaseCdn(page);
      await installStub(page, makeScenario());
      await seedSnapshot(page);
      await page.goto('/app', { waitUntil: 'domcontentloaded' });
      await waitBootDone(page);

      await assertNoPageOverflow(page);
      await openHamburgerMenu(page);
      await assertTutorialButtonNotCovered(page);
      await clickTutorialFromMenu(page);
      await assertModalInsideViewport(page);

      // Close and reopen — verify no double-listener or state issue
      await closeTutorialModal(page);
      await openHamburgerMenu(page);
      await clickTutorialFromMenu(page);
      await assertModalInsideViewport(page);
      await closeTutorialModal(page);

      await assertNoPageOverflow(page);
    });
  }

  for (const vw of MOBILE_WIDTHS) {
    test(`T-MOB-${vw}px — light FR: hamburger → tutoriel → modal`, async ({ page }) => {
      await page.setViewportSize({ width: vw, height: 800 });
      await blockSupabaseCdn(page);
      await page.addInitScript(() => { localStorage.setItem('fb_theme', 'light'); });
      await installStub(page, makeScenario());
      await seedSnapshot(page);
      await page.goto('/app', { waitUntil: 'domcontentloaded' });
      await waitBootDone(page);

      await openHamburgerMenu(page);
      await clickTutorialFromMenu(page);
      await assertModalInsideViewport(page);
      await closeTutorialModal(page);
      await assertNoPageOverflow(page);
    });
  }

  test('T-MOB-320px — dark AR/RTL: hamburger → tutoriel → modal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await blockSupabaseCdn(page);
    await page.addInitScript(() => { localStorage.setItem('fb_lang', 'ar'); });
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    await expect(page.locator('#docType')).toBeVisible();

    await openHamburgerMenu(page);
    await clickTutorialFromMenu(page);
    await assertModalInsideViewport(page);
    await closeTutorialModal(page);
  });

  test('T-MOB-360px — backdrop click closes tutorial modal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    await openHamburgerMenu(page);
    await clickTutorialFromMenu(page);
    // Click backdrop (top-left corner of overlay, outside the modal)
    await page.locator('#tutorialModalOverlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });

  test('T-MOB-375px — close button works inside modal on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    await openHamburgerMenu(page);
    await clickTutorialFromMenu(page);
    const closeBtn = page.locator('#tutorialCloseBtn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });

  test('T-MOB-390px — focus restored to hamburger after closing modal (navTutorial hidden)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    await openHamburgerMenu(page);
    await clickTutorialFromMenu(page);
    // Focus should be on tutorialCloseBtn (setTimeout 50ms)
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('tutorialCloseBtn');

    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();

    // On mobile, #navTutorial is hidden (inside closed menu) — focus falls back to hamburger
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('appHamburgerToggle');
  });

  test('T-MOB-320px — repeated open/close cycle (3x) — no listener leak', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    for (let i = 0; i < 3; i++) {
      await openHamburgerMenu(page);
      await clickTutorialFromMenu(page);
      await assertModalInsideViewport(page);
      await closeTutorialModal(page);
    }
    await assertNoPageOverflow(page);
  });

  test('T-MOB-412px — no horizontal overflow during entire tutorial flow', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    await assertNoPageOverflow(page);
    await openHamburgerMenu(page);
    await assertNoPageOverflow(page);
    await clickTutorialFromMenu(page);
    await assertNoPageOverflow(page);
    await assertModalInsideViewport(page);
    await closeTutorialModal(page);
    await assertNoPageOverflow(page);
  });

  test('T-DESKTOP-1280 — desktop still works (regression guard)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await blockSupabaseCdn(page);
    await installStub(page, makeScenario());
    await seedSnapshot(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitBootDone(page);

    // Desktop: nav is horizontal, no hamburger needed
    const tut = page.locator('#navTutorial');
    await expect(tut).toBeVisible();
    await tut.click();
    await expect(page.locator('#tutorialModalOverlay')).toHaveClass(/open/);
    await expect(page.locator('#tutorialModalOverlay')).toBeVisible();
    await assertModalInsideViewport(page);

    await closeTutorialModal(page);
    // Reopen
    await tut.click();
    await expect(page.locator('#tutorialModalOverlay')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorialModalOverlay')).toBeHidden();
  });
});
