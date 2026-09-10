import { test, expect, Page } from '@playwright/test';

/*
  Correctif ciblé : select « 10 par page » (`.hist-page-size`) en thème clair.
  Cause : `.hist-page-size` utilisait le raccourci `background:var(--panel-2)`
  qui RESET image/repeat/size/position du chevron de base `select{}`. En clair,
  la règle de thème `:root[data-theme="light"] select` (spécificité supérieure)
  restaure l'image seule → chevron répété (background-repeat:repeat).
  Correctif : `background` → `background-color` (une propriété, un sélecteur).
  Gardes : .hist-page-size = UNE flèche, no-repeat, 16px, positionnée ;
  dark/heme clair/RTL/responsive/fonctionnel intacts.
*/

const SEED_COUNT = 25;

function seedDocs(count: number) {
  const docs: any[] = [];
  for (let i = 1; i <= count; i++) {
    const num = 'FAC-2026-' + String(i).padStart(4, '0');
    docs.push({
      id: 'doc_' + i, type: 'facture', numero: num, date: '05/0' + (1 + (i % 9)) + '/2026',
      client: 'Client ' + i, totalTTC: i * 1000, createdAt: new Date(2026, 7 - (i % 12), i % 28 + 1).toISOString(),
      filename: num + '.pdf', payload: null,
    });
  }
  return docs;
}

async function openHistory(page: Page, theme: 'dark' | 'light', lang = 'fr', width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(([t, l, docs]) => {
    localStorage.setItem('fb_lang', l);
    localStorage.setItem('fb_theme', t);
    localStorage.setItem('fb_history', JSON.stringify(docs));
  }, [theme, lang, seedDocs(SEED_COUNT)]);
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #brandLogo').first()).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#docType')).toBeVisible();
  if (width <= 640 && await page.locator('#appHamburgerToggle').isVisible()) {
    await page.click('#appHamburgerToggle');
    await page.waitForTimeout(200);
  }
  await page.locator('#navHistorique').click();
  await expect(page.locator('#histTableWrap .hist-page-size')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(300);
}

function chevronProbe(page: Page) {
  return page.locator('.hist-page-size').evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      dir: document.documentElement.dir,
      appearance: s.appearance,
      bgImage: s.backgroundImage,
      repeat: s.backgroundRepeat,
      size: s.backgroundSize,
      pos: s.backgroundPosition,
      padL: s.paddingLeft,
      padR: s.paddingRight,
    };
  });
}

test.describe('Select « 10 par page » — chevron unique (Light/Dark/RTL/Responsive)', () => {
  test.setTimeout(120000);

  test('dark ET light : chevron unique (no-repeat, 16px, positionné), appearance none', async ({ page }) => {
    for (const theme of ['dark', 'light'] as const) {
      await openHistory(page, theme);

      const css = await chevronProbe(page);
      const label = `[${theme}]`;
      expect(css.appearance, label + ' appearance').toBe('none');
      expect(css.bgImage, label + ' chevron présent').toContain('data:image/svg+xml');
      expect(css.bgImage, label + ' une seule image de fond').not.toContain(',url(');
      expect(css.repeat, label + ' PAS de chevron répété').toBe('no-repeat');
      expect(css.size, label + ' taille 16px').toBe('16px 16px');
      expect(css.pos, label + ' positionné (pas 0% 0%)').toContain('10px');
    }
  });

  test('fonctionnel : 10 par page par défaut, sélection 25 → 25 lignes', async ({ page }) => {
    await openHistory(page, 'light');

    const rows = page.locator('#histTableWrap table.hist tbody tr');
    await expect(rows).toHaveCount(10);

    await page.locator('.hist-page-size').selectOption('25');
    await expect(rows).toHaveCount(25);
  });

  test('responsive : 320 et 428 px — select visible, zéro overflow de page', async ({ page }) => {
    for (const width of [320, 428]) {
      await openHistory(page, 'light', 'fr', width);

      const elVisible = await page.locator('.hist-page-size').isVisible();
      expect(elVisible, `[${width}px] select visible`).toBe(true);

      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(ov.sw, `[${width}px] document.scrollWidth <= innerWidth (pas d'overflow)`).toBeLessThanOrEqual(ov.iw);
    }
  });

  test('RTL (arabe) : chevron miroré à gauche (background-position left), padding RTL, chevron unique', async ({ page }) => {
    await openHistory(page, 'light', 'ar', 428);

    const css = await chevronProbe(page);
    expect(css.dir).toBe('rtl');
    expect(css.pos, 'chevron à gauche en RTL').toBe('10px 50%');
    expect(css.padL, 'padding-left RTL (espace pour la flèche)').toBe('32px');
    expect(css.padR).toBe('12px');
    expect(css.repeat, 'chevron unique en RTL').toBe('no-repeat');
  });
});