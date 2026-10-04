import { test, expect } from '@playwright/test';

// Suite publique (aucune authentification requise) : enregistrée dans le projet
// `chromium-guest` de tests/playwright.config.ts.

const BLOG_PAGES = [
  '/blog/',
  '/blog/facturation/',
  '/blog/tva/',
  '/blog/devis/',
  '/blog/auto-entrepreneur/',
  '/blog/guides/',
  '/blog/facturation/comment-creer-facture-conforme-maroc.html',
  '/blog/facturation/comment-creer-bon-livraison.html',
  '/blog/facturation/erreurs-facturation-auto-entrepreneur.html',
  '/blog/tva/taux-tva-maroc.html',
  '/blog/tva/exoneration-tva-auto-entrepreneur.html',
  '/blog/devis/devis-ou-facture-differences.html',
  '/blog/auto-entrepreneur/facturation-auto-entrepreneur-guide.html',
  '/blog/auto-entrepreneur/statut-auto-entrepreneur-maroc.html',
  '/blog/guides/pourquoi-application-facturation-donnees-locales.html',
  '/blog/template-article.html',
];

const PAGE_CLASS = /content-page (blog-page|cat-page|article-page)/;

const MOJIBAKE = '\uFFFD';

// Conteneurs de composants (liens décoratifs / boutons) à exclure des assertions
// portant sur les liens de lecture et les listes de corps.
const COMPONENT_SEL = '.toc, .cta-box, .related, .related-grid, .prev-next, .back-blog, .faq-item, .article-item, .cat-card, .cat-grid, .cat-head, .blog-page .btn';

// Éléments connus en débordement AVANT la mission. Vérifié par comparaison A/B sur
// la version HEAD (fichier temporaire, même dossier ⇒ mêmes chemins CSS relatifs) :
// scrollWidth et source du débordement strictement identiques avant/après.
//
// HISTORIQUE — `table.compare-table` avait une largeur min-content de 319 px >
// boîte utile de 288 px à 320 px, sur 2 pages. Le PO avait alors explicitement
// exclu l'ajout d'un conteneur de défilement mobile, et le défaut était documenté
// ici en exception (`PRE_EXISTING_320_OVERFLOW`).
//
// CORRIGÉ depuis, sans exception : css/blog.css applique désormais une règle
// générique `.article-page table` + `display: block; overflow-x: auto` sous
// 480 px (`overflow-x` seul est ignoré sur une boîte `display: table`). AC-7
// exige de nouveau zéro débordement sur TOUTES les pages et TOUTES les largeur.

test.describe('Blog — convergence vers le design system (css/blog.css)', () => {
  for (const p of BLOG_PAGES) {
    test(`AC-3/AC-4 — héritage .content-page + a11y — ${p}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(p, { waitUntil: 'load' });

      // AC-4 — plus aucun bloc <style> inline, plus aucun mojibake
      expect(await page.locator('style').count(), 'blocs <style> inline').toBe(0);
      const html = await page.content();
      expect(html.includes(MOJIBAKE), 'caractère U+FFFD').toBe(false);

      // AC-3 — la classe partagée est co-appliquée, la classe de page est conservée
      const main = page.locator('main');
      expect(await main.getAttribute('class')).toMatch(PAGE_CLASS);

      // AC-3 — géométrie héritée du composant public partagé
      const box = await main.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { maxWidth: cs.maxWidth, paddingTop: cs.paddingTop, paddingLeft: cs.paddingLeft };
      });
      expect(box.maxWidth, 'largeur max héritée').toBe('800px');
      expect(box.paddingTop, 'padding-top hérité').toBe('60px');
      expect(box.paddingLeft, 'padding latéral').toBe('20px');

      // AC-3 — h2 : marge du composant + bordure (absente du bloc .content-page,
      // présente sur les pages sœurs) et padding-bottom 8px.
      // Le template est un squelette sans <h2> : la géométrie est vérifiée seulement
      // s'il en contient (les 15 pages publiées en contiennent).
      const h2Count = await page.locator('main h2').count();
      if (h2Count > 0) {
        const h2 = await page.locator('main h2').first().evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingBottom: cs.paddingBottom,
            borderBottomWidth: cs.borderBottomWidth, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
          };
        });
        expect(h2.marginTop, 'marge haute h2').toBe('40px');
        expect(h2.marginBottom, 'marge basse h2').toBe('12px');
        expect(h2.paddingBottom, 'padding-bas h2').toBe('8px');
        expect(h2.borderBottomWidth, 'bordure h2').toBe('1px');
        expect(h2.fontSize, 'taille h2').toBe('20px');
        expect(h2.fontWeight, 'graisse h2').toBe('600');
      } else {
        expect(p, 'seul le template peut être dépourvu de h2').toBe('/blog/template-article.html');
      }

      // AC-4 — hiérarchie éditoriale : un seul h1, et aucun saut de niveau dans le
      // flux du contenu. Sont exclus les libellés de widgets (`.toc` « Sommaire »,
      // `.related` « Articles similaires », `.faq-item`, `.article-item`) : ce sont
      // des en-têtes de composant, pas des sections du document.
      // Le h3 « Sommaire » qui suit directement le h1 dans `<nav class="toc">` est
      // un défaut PRÉEXISTANT (présent dans HEAD) : le corriger = modification de
      // balisage, interdite par le §5.5 du plan.
      const headings = await page.evaluate(() =>
        [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')]
          .filter((el) => !el.closest('.toc, .related, .related-grid, .faq-item, .article-item'))
          .map((el) => Number(el.tagName[1]))
      );
      expect(headings.filter((l) => l === 1).length, 'nombre de h1').toBe(1);
      expect(headings[0], 'le premier titre éditorial est le h1').toBe(1);
      for (let i = 1; i < headings.length; i++) {
        expect(headings[i] - headings[i - 1], `saut de niveau h${headings[i - 1]}→h${headings[i]}`).toBeLessThanOrEqual(1);
      }

      // Le seul saut toléré reste le h3 du sommaire, et il est inchangé
      const tocLevels = await page.evaluate(() =>
        [...document.querySelectorAll('main .toc h1, main .toc h2, main .toc h3, main .toc h4, main .toc h5, main .toc h6')]
          .map((el) => `${el.tagName} ${el.textContent.trim()}`)
      );
      for (const t of tocLevels) expect(t, 'le sommaire conserve son balisage d’origine').toBe('H3 Sommaire');

      // AC-4 — chaque <nav> possède un nom accessible
      const navs = await page.evaluate(() =>
        [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label'))
      );
      expect(navs.length).toBeGreaterThan(0);
      expect(navs.filter((l) => !l || l.trim() === '').length, '<nav> sans aria-label').toBe(0);

      expect(errors, 'erreurs JS').toEqual([]);
    });
  }

  test('AC-3 — css/blog.css est chargé après css/landing.css sur les 16 pages', async ({ request }) => {
    for (const p of BLOG_PAGES) {
      const res = await request.get(p);
      expect(res.ok(), p).toBe(true);
      const html = await res.text();
      const iLanding = html.indexOf('css/landing.css');
      const iBlog = html.indexOf('css/blog.css');
      expect(iBlog, `${p} — lien css/blog.css`).toBeGreaterThan(-1);
      expect(iBlog, `${p} — ordre landing.css < blog.css`).toBeGreaterThan(iLanding);
    }
    const css = await (await request.get('/css/blog.css')).text();
    expect(css.length).toBeGreaterThan(0);
  });

  test('AC-3 — blog.css ne duplique aucune valeur du bloc .content-page', async ({ request }) => {
    const blog = await (await request.get('/css/blog.css')).text();
    const landing = await (await request.get('/css/landing.css')).text();
    const contentPageBlock = landing.slice(landing.indexOf('.content-page {'));
    // Propriétés de layout/typographie du composant partagé qui ne doivent pas être
    // redéclarées par blog.css (elles sont héritées).
    const forbidden = ['max-width: 800px', 'font-size: 28px', 'line-height: 1.75', 'padding: 60px'];
    for (const decl of forbidden) {
      expect(blog.includes(decl), `blog.css ne doit pas redéclarer « ${decl} »`).toBe(false);
    }
    expect(contentPageBlock.length).toBeGreaterThan(0);
  });

  test('AC-5 — tous les h3 éditoriaux sont stylés (défaut P2 corrigé)', async ({ page }) => {
    // Invariant vérifié sur les 10 articles : tout h3 hors composants_widget
    // (.toc, .faq-item, .article-item) est stylé par `.article-page h3`.
    // Le h3 « Articles similaires » porte un style INLINE préexistant
    // (`margin:0 0 12px`) : sa marge haute est donc volontairement 0.
    let checked = 0;
    for (const p of BLOG_PAGES.filter((u) => u.endsWith('.html'))) {
      await page.goto(p, { waitUntil: 'load' });
      const res = await page.evaluate(() =>
        [...document.querySelectorAll('main h3')]
          .filter((h) => !h.closest('.toc') && !h.closest('.faq-item') && !h.closest('.article-item'))
        .map((h) => {
          const c = getComputedStyle(h);
          return {
            text: h.textContent.trim().slice(0, 28),
            // h3 de widget (« Articles similaires ») : 12px via style inline
            // préexistant sur les 10 articles, via `.related h3` sur le template.
            isWidget: !!h.closest('.related, .related-grid'),
            fontSize: c.fontSize, fontWeight: c.fontWeight, marginBottom: c.marginBottom,
          };
        })
      );
      for (const h of res) {
        expect(h.fontSize, `${p} — taille h3 « ${h.text} »`).toBe('16px');
        expect(h.fontWeight, `${p} — graisse h3 « ${h.text} »`).toBe('600');
        // 8px = token partagé pour les h3 éditoriaux ; 12px pour les h3 de widget
        expect(h.marginBottom, `${p} — marge basse h3 « ${h.text} »`).toBe(h.isWidget ? '12px' : '8px');
        checked++;
      }
    }
    expect(checked, 'h3 inspectés').toBeGreaterThan(10);
  });

  test('AC-5 — les listes de corps héritent du composant partagé (14.5px / retrait 20px)', async ({ page }) => {
    // Listes de corps = <ul>/<ol> hors composants (notamment hors nav.toc à 13.5px).
    for (const p of [
      '/blog/auto-entrepreneur/statut-auto-entrepreneur-maroc.html',
      '/blog/facturation/comment-creer-facture-conforme-maroc.html',
      '/blog/tva/taux-tva-maroc.html',
      '/blog/devis/devis-ou-facture-differences.html',
    ]) {
      await page.goto(p, { waitUntil: 'load' });
      const res = await page.evaluate((comp) =>
        [...document.querySelectorAll('main ul, main ol')]
          .filter((el) => !el.closest(comp))
          .map((el) => {
            const c = getComputedStyle(el);
            return { tag: el.tagName, fontSize: c.fontSize, paddingLeft: c.paddingLeft };
          }), COMPONENT_SEL);
      expect(res.length, `${p} — listes de corps`).toBeGreaterThan(0);
      for (const l of res) {
        expect(l.fontSize, `${p} — ${l.tag} de corps`).toBe('14.5px');
        expect(l.paddingLeft, `${p} — retrait ${l.tag}`).toBe('20px');
      }
    }
  });

  test('AC-5 — le sommaire conserve sa taille dédiée de 13.5px (non régressé)', async ({ page }) => {
    await page.goto('/blog/auto-entrepreneur/statut-auto-entrepreneur-maroc.html', { waitUntil: 'load' });
    const toc = await page.evaluate(() => {
      const ol = document.querySelector('main nav.toc ol');
      return ol ? getComputedStyle(ol).fontSize : null;
    });
    expect(toc, 'liste du sommaire').toBe('13.5px');
  });

  test('AC-5 — liens de lecture soulignés et à la couleur du composant (défaut P4 corrigé)', async ({ page }) => {
    let checked = 0;
    for (const p of BLOG_PAGES) {
      await page.goto(p, { waitUntil: 'load' });
      const links = await page.evaluate((comp) =>
        [...document.querySelectorAll('main p a, main li a')]
          .filter((a) => !a.closest(comp))
          .slice(0, 3)
          .map((a) => {
            const c = getComputedStyle(a);
            return { text: a.textContent.trim().slice(0, 28), deco: c.textDecorationLine, color: c.color };
          }), COMPONENT_SEL);
      for (const l of links) {
        expect(l.deco, `${p} — lien « ${l.text} »`).toContain('underline');
        expect(l.color, `${p} — couleur du lien « ${l.text} »`).toBe('rgb(47, 95, 199)');
        checked++;
      }
    }
    expect(checked, 'aucun lien de lecture trouvé').toBeGreaterThan(10);
  });

  test('AC-5 — les liens de composants ne sont jamais soulignés', async ({ page }) => {
    await page.goto('/blog/', { waitUntil: 'load' });
    const res = await page.evaluate(() => {
      const out = {};
      for (const sel of ['.cat-card a', '.cta-box a', '.article-item h3 a', '.secondary-nav a', '.theme-btn']) {
        const el = document.querySelector(`main ${sel}, header ${sel}`);
        if (el) out[sel] = getComputedStyle(el).textDecorationLine;
      }
      return out;
    });
    expect(Object.keys(res).length, 'composants inspectés').toBeGreaterThan(2);
    for (const [sel, deco] of Object.entries(res)) {
      expect(deco, `${sel} — pas de soulignement`).toBe('none');
    }
  });

  test('AC-7 — aucun débordement horizontal de 320 à 768 px', async ({ page }) => {
    for (const p of BLOG_PAGES) {
      for (const w of [320, 375, 430, 768]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(p, { waitUntil: 'load' });
        const o = await page.evaluate((comp) => {
          const vw = document.documentElement.clientWidth;
          // Un élément situé dans un conteneur de défilement horizontal légitime
          // (ici : le tableau d'article sous 480 px) a le droit d'être plus large
          // que la fenêtre — c'est le conteneur qui défile, pas la page.
          const inScroller = (el) => {
            for (let n = el; n && n !== document.body; n = n.parentElement) {
              const ox = getComputedStyle(n).overflowX;
              if (ox === 'auto' || ox === 'scroll') return true;
            }
            return false;
          };
          const offenders = [...document.querySelectorAll('body *')]
            .filter((el) => !el.closest(comp) && !inScroller(el) && el.getBoundingClientRect().right > vw + 1)
            .map((el) => ({ el, r: el.getBoundingClientRect() }));
          return {
            scroll: document.documentElement.scrollWidth,
            client: vw,
            offenders: offenders.map(({ el, r }) => `${el.tagName.toLowerCase()}.${(el.className || '-').toString().slice(0, 30)} right=${Math.round(r.right)}`),
          };
        }, COMPONENT_SEL);
        // Seul invariant réel : le DÉFILEMENT HORIZONTAL DE LA PAGE EST INTERDIT.
        // Un tableau large confine son débordement dans sa propre boîte.
        expect(o.offenders.join(' | '), `${p} @${w}px — éléments en débordement hors conteneur`).toBe('');
        expect(o.scroll, `${p} @${w}px — scrollWidth`).toBeLessThanOrEqual(o.client);
      }
    }
  });

  test('AC-7b — le tableau d’article est stylé et scrollable, sans débordement de page', async ({ page }) => {
    // Page representative d’un tableau « compare-table » (3 colonnes, texte long).
    const withTable = '/blog/devis/devis-ou-facture-differences.html';
    // Page dont la colonne CONTENT contient un <table> SANS classe (bug d’origine).
    const bareTable = '/blog/facturation/facture-acompte-maroc-avance-reste-a-payer.html';

    for (const p of [withTable, bareTable]) {
      await page.goto(p, { waitUntil: 'load' });
      const t = page.locator('.article-page table').first();
      await expect(t, `${p} — tableau présent`).toHaveCount(1);

      const cs = await t.evaluate((el) => {
        const th = el.querySelector('thead th');
        const td = el.querySelector('tbody td');
        const even = el.querySelector('tbody tr:nth-child(even)');
        const g = (n) => getComputedStyle(n);
        return {
          width: g(el).width,
          borderCollapse: g(el).borderCollapse,
          marginBottom: g(el).marginBottom,
          thPadding: g(th).padding,
          thBg: g(th).backgroundColor,
          thWeight: g(th).fontWeight,
          thBorder: g(th).borderBottomWidth,
          tdPadding: g(td).padding,
          tdColor: g(td).color,
          evenBg: even ? g(even).backgroundColor : null,
        };
      });

      // Design unique, désormais générique : aucun style en dur ne subsiste.
      expect(cs.borderCollapse, `${p} — border-collapse`).toBe('collapse');
      expect(cs.marginBottom, `${p} — marge verticale`).toBe('20px');
      expect(cs.thPadding, `${p} — padding th`).toBe('8px 10px');
      expect(cs.tdPadding, `${p} — padding td`).toBe('8px 10px');
      expect(cs.thWeight, `${p} — th en gras`).toBe('600');
      expect(cs.thBorder, `${p} — bordure sous l’en-tête`).toBe('1px');
      expect(cs.evenBg, `${p} — fond des lignes paires`).not.toBe('rgba(0, 0, 0, 0)');

      // Les deux thèmes doivent rester distingués par les tokens existants.
      for (const theme of ['dark', 'light']) {
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
        const colors = await t.evaluate((el) => ({
          thBg: getComputedStyle(el.querySelector('thead th')).backgroundColor,
          tdColor: getComputedStyle(el.querySelector('tbody td')).color,
        }));
        expect(colors.thBg, `${p} @${theme} — fond d’en-tête`).not.toBe('rgba(0, 0, 0, 0)');
        expect(colors.tdColor, `${p} @${theme} — couleur de cellule`).not.toBe(colors.thBg);
      }
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });

      // Mobile : le conteneur de défilement existe, et la PAGE ne défile plus.
      // Un tableau qui tient n’a pas besoin de défiler — l’invariant réel est
      // « jamais de contenu rogné sans moyen d’y accéder », vérifié plus bas.
      await page.setViewportSize({ width: 320, height: 900 });
      const mob = await page.evaluate(() => {
        const el = document.querySelector('.article-page table');
        return {
          display: getComputedStyle(el).display,
          overflowX: getComputedStyle(el).overflowX,
          tableScrollable: el.scrollWidth > el.clientWidth,
          pageScroll: document.documentElement.scrollWidth,
          pageClient: document.documentElement.clientWidth,
        };
      });
      expect(mob.display, `${p} @320 — display block (requis pour overflow-x)`).toBe('block');
      expect(mob.overflowX, `${p} @320 — overflow-x`).toBe('auto');
      expect(mob.pageScroll, `${p} @320 — page sans débordement`).toBeLessThanOrEqual(mob.pageClient);
    }

    // Le tableau « compare-table » (3 colonnes, min-content 319 px > 288 px utile)
    // DOIT défiler dans sa boîte à 320 px : c’est le défaut mobile corrigé.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(withTable, { waitUntil: 'load' });
    const scroll = await page.locator('.article-page table').first().evaluate((el) => ({
      scrollW: el.scrollWidth, clientW: el.clientWidth,
    }));
    expect(scroll.scrollW, 'contenu plus large que la boîte').toBeGreaterThan(scroll.clientW);
    // La barre de défilement est réellement atteignable (le contenu long n’est pas rogné).
    const reach = await page.locator('.article-page table').first().evaluate((el) => {
      el.scrollLeft = 9999;
      const atEnd = el.scrollLeft;
      el.scrollLeft = 0;
      return { atEnd, backToStart: el.scrollLeft };
    });
    expect(reach.atEnd, 'le tableau défile réellement').toBeGreaterThan(0);
    expect(reach.backToStart, 'retour au début possible').toBe(0);

    // Au-delà du breakpoint, le tableau doit rester une boîte `table` : c'est la
    // seule façon de garantir un rendu identique aux 9 tableaux historiques.
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(withTable, { waitUntil: 'load' });
    const wide = await page.locator('.article-page table').first().evaluate((el) => getComputedStyle(el).display);
    expect(wide, 'au-dessus de 480px — display table inchangé').toBe('table');
  });

  test('AC-4 — focus clavier visible sur un lien de lecture', async ({ page }) => {
    await page.goto('/blog/facturation/comment-creer-facture-conforme-maroc.html', { waitUntil: 'load' });
    const link = page.locator('main p a').first();
    await link.focus();
    const outline = await link.evaluate((el) => {
      const c = getComputedStyle(el);
      return { width: c.outlineWidth, style: c.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
  });

  test('AC-9 — css/blog.css est dans le precache du Service Worker', async ({ request }) => {
    const sw = await (await request.get('/sw.js')).text();
    expect(sw).toContain("'css/blog.css'");
    expect(sw).toContain("const CACHE_NAME = 'facturation-v7'");
  });

  test('AC-8 — le template reste noindex et hors sitemap (Q3)', async ({ request }) => {
    const res = await request.get('/blog/template-article.html');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/name="robots" content="noindex, nofollow"/);
    expect(html).toContain('{{PLACEHOLDER}}');
    const sitemap = await (await request.get('/sitemap-fr.xml')).text();
    expect(sitemap).not.toContain('template-article');
  });
});
