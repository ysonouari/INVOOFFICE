import { test, expect, type Page } from '@playwright/test';

/*
  Phase F5 — RTL / Arabe : miroir des icônes SVG directionnelles.

  Défaut confirmé (audit + probes, docs/audit/PHASE_F5_RTL_AUDIT.md) :
  les glyphes SVG ne sont PAS mirorés par l'algorithme bidi (contrairement aux
  caractères texte comme ">" ou les parenthèses). En mode RTL (arabe):

    - les chevrons de pagination historique (js/icons.js chevron-left / chevron-right
      / chevrons-left / chevrons-right) pointent à l'envers : « page précédente »
      (côté droite, vers page 1) pointe vers la gauche, « page suivante » (côté
      gauche) pointe vers la droite ;
    - la flèche « convertir devis → facture » (ICONS['arrow-right']) reste
      orientée LTR.

  Correctif approuvé (CSS uniquement, css/rtl.css, LTR intact) :

      [dir="rtl"] .hist-page-first svg, [dir="rtl"] .hist-page-prev svg,
      [dir="rtl"] .hist-page-next svg,  [dir="rtl"] .hist-page-last svg,
      [dir="rtl"] .hist-action-btn[data-action="convert"] svg
      { transform: scaleX(-1); }

  Ce spec vérifie le comportement RÉEL :
    1. la règle est présente dans la feuille servie (source de vérité) ;
    2. en RTL, les 4 chevrons de pagination reçoivent le miroir
       (computed transform = matrix(-1,0,0,1,0,0)) ET l'ordre des boutons reste
       droite→gauche (direction cible cohérente avec le miroir) ;
    3. en LTR (FR), aucun miroir ne fuit (transform == 'none') ;
    4. zéro overflow horizontal de page en RTL (320/428/768, Nouveau + Historique,
       dark) — les scroll-containers internes (#histTableWrap overflow-x:auto)
       restent volontaires, seul document.scrollWidth est contrôlé ;
    5. flèche convertir mirorée en RTL et intacte en LTR.
*/

type ProbeResult = {
  vw: number;
  docSW: number;
  bodySW: number;
  overflow: boolean;
  dir: string;
  lang: string;
};

function probeFn(): ProbeResult {
  const vw = window.innerWidth;
  const docSW = document.documentElement.scrollWidth;
  const bodySW = document.body ? document.body.scrollWidth : 0;
  return {
    vw,
    docSW,
    bodySW,
    overflow: docSW > vw + 1 || bodySW > vw + 1,
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
  };
}

async function assertClean(page: Page, label: string): Promise<ProbeResult> {
  const res = await page.evaluate(probeFn);
  expect(res.overflow, `${label} (vw=${res.vw}) docSW=${res.docSW}/bodySW=${res.bodySW}`).toBe(false);
  return res;
}

async function gotoAppSeeded(page: Page, opts: { lang: string; theme: string }): Promise<void> {
  await page.addInitScript((cfg) => {
    localStorage.setItem('fb_lang', cfg.lang);
    localStorage.setItem('fb_theme', cfg.theme);
    const types = ['facture','devis','avoir','bl','facture','devis','avoir','facture','bl','facture','devis','facture','avoir','facture','bl'];
    const clients = [
      'شركة النور للتجارة', 'Société El Amrani Import Export', 'شركة الأطلس SARL',
      'English Client Trading Ltd', 'بقالة الحي الشعبي', 'SARL Atlas Digital Conception',
      'مكتب الاستشارات الهندسية', 'Karim Bennani', 'دكان رحال', 'Darty Style',
      'شركة المغرب الكبير', 'Auto-Entrepreneur Salma Idrissi', 'متجر الأندلس',
      'Etablissement Atlas Solutions', 'تازة للبناء',
    ];
    const docs = types.map((t, i) => ({
      id: 'f5-doc-' + (i + 1),
      type: t,
      numero: (t === 'facture' ? 'INV' : t === 'devis' ? 'DEV' : t === 'avoir' ? 'AVR' : 'BL') + '-2026-' + String(i + 1).padStart(3, '0'),
      date: '2026-09-' + String((i % 9) + 1).padStart(2, '0'),
      createdAt: '2026-09-' + String((i % 9) + 1).padStart(2, '0') + 'T09:00:00.000Z',
      client: clients[i],
      totalTTC: 1250.5 + i * 317.25,
      filename: 'f5-doc-' + (i + 1) + '.pdf',
    }));
    localStorage.setItem('fb_history', JSON.stringify(docs));
  }, { lang: opts.lang, theme: opts.theme });
  await page.goto('/app');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#docType', { timeout: 25000 });
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

async function openHistoryPaged(page: Page): Promise<void> {
  await openAppView(page, '#navHistorique', '#view-historique');
  await page.waitForFunction(() => {
    const wEl = document.getElementById('histTableWrap');
    return !!wEl && !!wEl.querySelector('.hist-table-wrap, .hist-card') && !!wEl.querySelector('.hist-pagination');
  }, null, { timeout: 10000 });
}

async function paginationTransforms(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return ['.hist-page-first', '.hist-page-prev', '.hist-page-next', '.hist-page-last'].map((sel) => {
      const btn = document.querySelector<HTMLElement>(sel + ' svg');
      return btn ? getComputedStyle(btn).transform : 'MISSING';
    });
  });
}

async function paginationOrder(page: Page): Promise<{ firstLeft: number; lastLeft: number; prevLeft: number; nextLeft: number }> {
  return page.evaluate(() => {
    const r = (sel: string) => Math.round(document.querySelector<HTMLElement>(sel)!.getBoundingClientRect().left);
    return { firstLeft: r('.hist-page-first'), prevLeft: r('.hist-page-prev'), nextLeft: r('.hist-page-next'), lastLeft: r('.hist-page-last') };
  });
}

test.describe('Phase F5 — RTL / Arabe : miroir des icônes SVG directionnelles', () => {

  test('F5.1 source de vérité — règle présente dans css/rtl.css (servie)', async ({ page }) => {
    const css = await page.request.get('/css/rtl.css');
    expect(css.ok()).toBe(true);
    const norm = (await css.text()).replace(/\s+/g, '');
    expect(norm, 'chevrons pagination mirorés en RTL').toContain(
      '[dir="rtl"].hist-page-firstsvg,[dir="rtl"].hist-page-prevsvg,[dir="rtl"].hist-page-nextsvg,[dir="rtl"].hist-page-lastsvg{transform:scaleX(-1);}'
    );
    expect(norm, 'flèche convertir mirorée en RTL').toContain(
      '[dir="rtl"].hist-action-btn[data-action="convert"]svg{transform:scaleX(-1);}'
    );
  });

  test('F5.2 T1 RTL — les 4 chevrons de pagination sont mirorés (computed) + ordre droite→gauche', async ({ page }) => {
    test.setTimeout(60000);
    await gotoAppSeeded(page, { lang: 'ar', theme: 'dark' });
    expect(await page.evaluate(() => document.documentElement.dir), 'dir=rtl en arabe').toBe('rtl');

    await openHistoryPaged(page);

    const transforms = await paginationTransforms(page);
    for (let i = 0; i < transforms.length; i++) {
      expect(transforms[i], `bouton pagination index ${i} miroré en RTL`).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    }

    const order = await paginationOrder(page);
    expect(order.firstLeft, 'first à droite (RTL)').toBeGreaterThan(order.lastLeft);
    expect(order.prevLeft, 'prev à droite de next (RTL)').toBeGreaterThan(order.nextLeft);
  });

  test('F5.3 T2 LTR — aucun miroir en français (régression anti sur-correction)', async ({ page }) => {
    test.setTimeout(60000);
    await gotoAppSeeded(page, { lang: 'fr', theme: 'light' });
    expect(await page.evaluate(() => document.documentElement.dir), 'dir=ltr en français').toBe('ltr');

    await openHistoryPaged(page);

    const transforms = await paginationTransforms(page);
    for (let i = 0; i < transforms.length; i++) {
      expect(transforms[i], `bouton pagination index ${i} non miroré en LTR`).toBe('none');
    }

    const order = await paginationOrder(page);
    expect(order.firstLeft, 'first à gauche (LTR)').toBeLessThan(order.lastLeft);
    expect(order.prevLeft, 'prev à gauche de next (LTR)').toBeLessThan(order.nextLeft);
  });

  test('F5.4 T3 RTL — zéro overflow page (Nouveau + Historique, dark), 320/428/768', async ({ page }) => {
    test.setTimeout(120000);
    for (const w of [320, 428, 768]) {
      await page.setViewportSize({ width: w, height: 800 });
      await gotoAppSeeded(page, { lang: 'ar', theme: 'dark' });
      const resN = await assertClean(page, `app-ar/nouveau@${w}`);
      expect(resN.dir, `dir rtl @${w}`).toBe('rtl');

      await openHistoryPaged(page);
      const resH = await assertClean(page, `app-ar/historique@${w}`);
      expect(resH.dir, `dir rtl historique @${w}`).toBe('rtl');

      const pag = await page.locator('.hist-pagination').isVisible();
      expect(pag, `pagination visible @${w}`).toBe(true);
    }
  });

  test('F5.5 T4 RTL — flèche convertir mirorée (devis → facture)', async ({ page }) => {
    test.setTimeout(60000);
    await setViewportDesktop(page);
    await gotoAppSeeded(page, { lang: 'ar', theme: 'dark' });
    await openHistoryPaged(page);

    const convertSvg = page.locator('.hist-action-btn[data-action="convert"] svg');
    await expect(convertSvg.first()).toBeVisible();
    const t = await convertSvg.first().evaluate(el => getComputedStyle(el).transform);
    expect(t, 'flèche convertir mirorée en RTL').toBe('matrix(-1, 0, 0, 1, 0, 0)');
  });

  test('F5.6 T4 LTR — flèche convertir intacte en français', async ({ page }) => {
    test.setTimeout(60000);
    await setViewportDesktop(page);
    await gotoAppSeeded(page, { lang: 'fr', theme: 'light' });
    await openHistoryPaged(page);

    const convertSvg = page.locator('.hist-action-btn[data-action="convert"] svg');
    await expect(convertSvg.first()).toBeVisible();
    const t = await convertSvg.first().evaluate(el => getComputedStyle(el).transform);
    expect(t, 'flèche convertir intacte en LTR').toBe('none');
  });
});

async function setViewportDesktop(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
}