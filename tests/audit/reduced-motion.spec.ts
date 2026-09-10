import { test, expect, Page } from '@playwright/test';

/*
  Phase F1 — Motion & prefers-reduced-motion.

  Vérifie :
    - Préférence normale (no-preference) : les animations/transitions
      conservent leurs durées réelles et les tokens motion F1
      (--dur-micro/--dur-fast/--dur-normal/--dur-slow/--dur-slower/
      --dur-spin/--ease-out) sont correctement appliqués ;
    - prefers-reduced-motion: reduce : les durées d'animation et de
      transition passent à ~0.01ms (animation-iteration-count: 1) sur
      plusieurs composants réels (overlay + modale + boutons) ;
    - reduced motion : le contenu de la modale reste visible et
      accessible (display:flex, dimensions non nulles, champ éditable) ;
    - reduced motion : les composants animés de la landing sont réduits
      et les tokens F1 restent définis.

  Les assertions portent sur des valeurs calculées réelles
  (getComputedStyle) — pas sur l'existence de règles CSS. Les durées
  sont comparées numériquement (parseFloat) pour absorber la
  sérialisation du moteur (ex. 0.01ms → 1e-05s).
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

test('PRÉFÉRENCE NORMALE — animations conservées, tokens F1 appliqués, modale visible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await openCompanyModal(page);

  const overlay = page.locator('#companyModalOverlay');
  const modal = page.locator('#companyModalOverlay .modal');

  await expect(overlay).toHaveCSS('animation-name', 'modal-overlay-in');
  await expect(modal).toHaveCSS('animation-name', 'modal-in');

  const css = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const overlayEl = document.getElementById('companyModalOverlay') as HTMLElement;
    const modalEl = overlayEl.querySelector('.modal') as HTMLElement;
    const btn = getComputedStyle(document.getElementById('navNouveau') as HTMLElement);
    return {
      overlayAnimDur: parseFloat(getComputedStyle(overlayEl).animationDuration),
      modalAnimDur: parseFloat(getComputedStyle(modalEl).animationDuration),
      durMicro: parseFloat(root.getPropertyValue('--dur-micro')),
      durFast: parseFloat(root.getPropertyValue('--dur-fast')),
      durNormal: parseFloat(root.getPropertyValue('--dur-normal')),
      durSlow: parseFloat(root.getPropertyValue('--dur-slow')),
      durSlower: parseFloat(root.getPropertyValue('--dur-slower')),
      durSpin: parseFloat(root.getPropertyValue('--dur-spin')),
      easeOut: root.getPropertyValue('--ease-out').trim(),
      btnTransition: parseFloat(btn.transitionDuration),
    };
  });
  expect(css.overlayAnimDur).toBe(0.2);
  expect(css.modalAnimDur).toBe(0.25);
  expect(css.durMicro).toBe(0.12);
  expect(css.durFast).toBe(0.15);
  expect(css.durNormal).toBe(0.2);
  expect(css.durSlow).toBe(0.25);
  expect(css.durSlower).toBe(0.3);
  expect(css.durSpin).toBe(0.6);
  expect(css.easeOut).toBe('cubic-bezier(0.4,0,0.2,1)');
  expect(css.btnTransition).toBe(0.15);

  await expect(modal).toBeVisible();
  expect(errors).toEqual([]);
});

test('REDUCED MOTION — overlay, modale et boutons : durées réduites à ~0.01ms (itération unique)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await openCompanyModal(page);

  const css = await page.evaluate(() => {
    const read = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      return {
        animDur: parseFloat(s.animationDuration),
        animCount: s.animationIterationCount,
        transDur: parseFloat(s.transitionDuration),
      };
    };
    const overlay = document.getElementById('companyModalOverlay') as HTMLElement;
    const modal = overlay.querySelector('.modal') as HTMLElement;
    return {
      overlay: read(overlay),
      modal: read(modal),
      navNouveau: read(document.getElementById('navNouveau') as HTMLElement),
      navInfos: read(document.getElementById('navInfos') as HTMLElement),
    };
  });
  expect(css.overlay.animDur).toBeLessThanOrEqual(0.0002);
  expect(css.overlay.animCount).toBe('1');
  expect(css.modal.animDur).toBeLessThanOrEqual(0.0002);
  expect(css.modal.animCount).toBe('1');
  expect(css.navNouveau.transDur).toBeLessThanOrEqual(0.0002);
  expect(css.navInfos.transDur).toBeLessThanOrEqual(0.0002);
});

test('REDUCED MOTION — contenu de la modale visible et accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await openCompanyModal(page);

  const overlay = page.locator('#companyModalOverlay');
  const modal = page.locator('#companyModalOverlay .modal');

  await expect(overlay).toBeVisible();
  await expect(modal).toBeVisible();

  const checks = await page.evaluate(() => {
    const overlayEl = document.getElementById('companyModalOverlay') as HTMLElement;
    const modalEl = overlayEl.querySelector('.modal') as HTMLElement;
    const input = document.getElementById('cNom') as HTMLInputElement;
    const title = document.getElementById('companyModalTitle') as HTMLElement;
    const oRect = overlayEl.getBoundingClientRect();
    const mRect = modalEl.getBoundingClientRect();
    return {
      overlayDisplay: getComputedStyle(overlayEl).display,
      overlayHasSize: oRect.width > 0 && oRect.height > 0,
      modalHasSize: mRect.width > 0 && mRect.height > 0,
      inputVisible: input.offsetParent !== null,
      inputDisabled: input.disabled,
      titleText: (title?.textContent || '').trim(),
    };
  });
  expect(checks.overlayDisplay).toBe('flex');
  expect(checks.overlayHasSize).toBe(true);
  expect(checks.modalHasSize).toBe(true);
  expect(checks.inputVisible).toBe(true);
  expect(checks.inputDisabled).toBe(false);
  expect(checks.titleText.length).toBeGreaterThan(0);
});

test('REDUCED MOTION — composants animés de la landing réduits, tokens F1 présents', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.lp-faq-question').first()).toBeAttached();

  const css = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const faqIcon = getComputedStyle(document.querySelector('.lp-faq-icon') as HTMLElement);
    const faqQuestion = getComputedStyle(document.querySelector('.lp-faq-question') as HTMLElement);
    return {
      faqIconTransDur: parseFloat(faqIcon.transitionDuration),
      faqQuestionTransDur: parseFloat(faqQuestion.transitionDuration),
      durNormal: parseFloat(root.getPropertyValue('--dur-normal')),
      durSlower: parseFloat(root.getPropertyValue('--dur-slower')),
      durSpin: parseFloat(root.getPropertyValue('--dur-spin')),
      easeOut: root.getPropertyValue('--ease-out').trim(),
    };
  });
  expect(css.faqIconTransDur).toBeLessThanOrEqual(0.0002);
  expect(css.faqQuestionTransDur).toBeLessThanOrEqual(0.0002);
  expect(css.durNormal).toBe(0.2);
  expect(css.durSlower).toBe(0.3);
  expect(css.durSpin).toBe(0.6);
  expect(css.easeOut).toBe('cubic-bezier(0.4,0,0.2,1)');
});