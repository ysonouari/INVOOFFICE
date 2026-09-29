/**
 * INVOOFFICE — Tests du moteur de rendu (Renderer.gs)
 * ---------------------------------------------------------------------------
 * Exécution : `npm run test:apps-script`
 *
 * Aucun réseau, aucune écriture GitHub, aucun accès à un vrai tableur.
 * Le gabarit réel (`blog/template-article.html`) est utilisé tel quel : aucune
 * copie, aucune fixture de gabarit (D3).
 */

const fs = require('fs');
const path = require('path');

const { createContext, call } = require('./harness.cjs');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE_PATH = path.join(REPO_ROOT, 'blog', 'template-article.html');
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');

/* -------------------------------------------------------------------------- */
/* Micro-framework                                                            */
/* -------------------------------------------------------------------------- */

let passed = 0;
const failures = [];
let currentSuite = '';

function suite(name) { currentSuite = name; }

function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write('  \u2713 ' + name + '\n');
  } catch (e) {
    failures.push({ suite: currentSuite, name, message: e.message });
    process.stdout.write('  \u2717 ' + name + '\n      ' + e.message + '\n');
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      (label || 'valeur') + ' : attendu ' + JSON.stringify(expected) +
      ', obtenu ' + JSON.stringify(actual)
    );
  }
}

function ok(value, label) {
  if (!value) throw new Error((label || 'condition') + ' : falsy (' + JSON.stringify(value) + ')');
}

function notOk(value, label) {
  if (value) throw new Error((label || 'condition') + ' : truthy (' + JSON.stringify(value) + ')');
}

function contains(haystack, needle, label) {
  if (String(haystack).indexOf(needle) === -1) {
    throw new Error((label || 'contenu') + ' : « ' + needle + ' » absent');
  }
}

function notContains(haystack, needle, label) {
  if (String(haystack).indexOf(needle) !== -1) {
    throw new Error((label || 'contenu') + ' : « ' + needle + ' » présent (inattendu)');
  }
}

function codes(result) {
  return (result.errors || []).map((e) => e.code);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Article avec des valeursEditorales distinctes pour chacun des 10 slots. */
function makeArticle(overrides) {
  return Object.assign({
    ID: 'A-1',
    TITLE: 'Titre éditorial de l\u2019article',
    KEYWORD: 'facturation',
    CONTENT:
      '<h2 id="alpha">Première section</h2>\n' +
      '<p>Texte <strong>important</strong> &amp; accentué : é à ç.</p>\n' +
      '<div class="callout callout-tip"><strong>Astuce</strong> : ' +
      'v\u00e9rifiez les mentions obligatoires.</div>\n' +
      '<table class="compare-table"><thead><tr><th>Cas</th><th>Consequence</th></tr></thead>' +
      '<tbody><tr><td>HT</td><td>TVA calculée</td></tr></tbody></table>\n' +
      '<h2 id="beta">Deuxième section</h2>\n' +
      '<ul><li>Point un</li><li>Point deux</li></ul>\n' +
      '<p>FIN_NON_ECHAPPE</p>',
    CATEGORY: 'TVA Maroc',
    SLUG: 'article-de-test',
    SEO_TITLE: 'Titre SEO de test',
    META_DESCRIPTION: 'Description meta de test, suffisante et courte.',
    IMAGE_URL: '',
    STATUS: 'READY',
    PUBLISHED_AT: '2026-07-14',
    SOCIAL_DESCRIPTION: 'Description sociale de test.',
    ARTICLE_EXCERPT: 'Extrait d\u2019article de test, très distinct.',
    CARD_EXCERPT: 'Carte de test.',
    ERROR: ''
  }, overrides || {});
}

/** Les 10 valeurs SEO, toutes différentes, pour prouver l'indépendance (PO-1). */
function tenDistinctSeo() {
  return {
    pageTitle: 'SLOT-01-page',
    headline: 'SLOT-02-headline',
    ogTitle: 'SLOT-03-og',
    twitterTitle: 'SLOT-04-twitter',
    jsonLdHeadline: 'SLOT-05-jsonld',
    breadcrumbTitle: 'SLOT-06-breadcrumb',
    metaDescription: 'SLOT-07-meta',
    ogDescription: 'SLOT-08-ogdesc',
    twitterDescription: 'SLOT-09-twdesc',
    jsonLdDescription: 'SLOT-10-jsonlddesc',
    articleExcerpt: 'SLOT-11-excerpt'
  };
}

function render(article, options) {
  const { ctx } = createContext({});
  const opts = Object.assign({ templateHtml: TEMPLATE, readingTime: 6 }, options || {});
  return call(ctx, 'renderArticleHtml', article, opts);
}

function renderOk(article, options) {
  const result = render(article, options);
  if (!result.ok) {
    throw new Error('rendu refusé : ' + JSON.stringify(codes(result)) + ' — ' +
      (result.errors || []).map((e) => e.message).join(' | '));
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* 1. Les 5 catégories représentatives                                         */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  { label: 'Auto-entrepreneur', slug: 'auto-entrepreneur' },
  { label: 'Devis', slug: 'devis' },
  { label: 'Facturation', slug: 'facturation' },
  { label: 'Guides', slug: 'guides' },
  { label: 'TVA Maroc', slug: 'tva' }
];

suite('1. Catégories représentatives (chemin, canonical, escaping)');

CATEGORIES.forEach((cat) => {
  test(cat.label + ' → /blog/' + cat.slug + '/{slug}.html', () => {
    const article = makeArticle({ CATEGORY: cat.label, SLUG: 'mon-article' });
    const result = renderOk(article);
    eq(result.sitePath, '/blog/' + cat.slug + '/mon-article.html', 'sitePath');
    eq(result.path, 'blog/' + cat.slug + '/mon-article.html', 'path dépôt');
    eq(
      result.canonicalUrl,
      'https://www.invooffice.com/blog/' + cat.slug + '/mon-article.html',
      'canonicalUrl'
    );
    contains(result.html, 'content="https://www.invooffice.com/blog/' + cat.slug + '/mon-article.html"',
      'canonical dans le HTML');
    contains(result.html, 'href="/blog/' + cat.slug + '/">', 'fil d\u2019Ariane vers la catégorie');
    contains(result.html, 'href="/blog/' + cat.slug + '/"', 'retour catégorie');
  });
});

test('catégorie inconnue refusée (aucune création automatique)', () => {
  const result = render(makeArticle({ CATEGORY: 'Catégorie Fantôme' }));
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('V3') !== -1, 'code V3 attendu, obtenu ' + JSON.stringify(codes(result)));
});

/* -------------------------------------------------------------------------- */
/* 2. Modèle SEO à 10 champs (PO-1)                                           */
/* -------------------------------------------------------------------------- */

suite('2. Les 10 champs SEO sont indépendants');

test('chaque slot atterrit sur SON site (7× TITLE, 5× DESCRIPTION)', () => {
  const seo = tenDistinctSeo();
  const result = renderOk(makeArticle(), { seo });
  const h = result.html;

  contains(h, '<title>SLOT-01-page \u2014 Blog INVOOFFICE</title>', '<title> = pageTitle');
  contains(h, '<h1>SLOT-02-headline</h1>', 'h1 = headline');
  contains(h, 'property="og:title" content="SLOT-03-og \u2014 Blog INVOOFFICE"', 'og:title');
  contains(h, 'name="twitter:title" content="SLOT-04-twitter"', 'twitter:title');
  contains(h, '"headline": "SLOT-05-jsonld"', 'JSON-LD headline');
  contains(h, '<span>SLOT-06-breadcrumb</span>', 'fil d\u2019Ariane');
  contains(h, '"name": "SLOT-06-breadcrumb"', 'JSON-LD ListItem nom');
  contains(h, 'name="description" content="SLOT-07-meta"', 'meta description');
  contains(h, 'property="og:description" content="SLOT-08-ogdesc"', 'og:description');
  contains(h, 'name="twitter:description" content="SLOT-09-twdesc"', 'twitter:description');
  contains(h, '"description": "SLOT-10-jsonlddesc"', 'JSON-LD description');
  contains(h, '<p class="article-excerpt">SLOT-11-excerpt</p>', 'extrait d\u2019article');
});

test('aucun placeholder résiduel après rendu', () => {
  const result = renderOk(makeArticle(), { seo: tenDistinctSeo() });
  notContains(result.html.replace(/<!--[\s\S]*?-->/g, ''), '{{', 'placeholder résiduel');
});

test('chaîne de sources : colonne dédiée > colonne secondaire', () => {
  const withColumns = makeArticle({ OG_TITLE: 'Titre OG dédié' });
  const result = renderOk(withColumns);
  contains(result.html, 'property="og:title" content="Titre OG dédié \u2014 Blog INVOOFFICE"',
    'og:title depuis la colonne OG_TITLE');
  notContains(result.html, 'og:title" content="Titre SEO de test', 'og:title ne retombe pas sur SEO_TITLE');
});

test('surcharge d\u2019appel prioritaire sur la colonne', () => {
  const article = makeArticle({ META_DESCRIPTION: 'Colonne prioritaire.' });
  const result = renderOk(article, { seo: { metaDescription: 'Surcharge prioritaire.' } });
  contains(result.html, 'name="description" content="Surcharge prioritaire."', 'surcharge appliquée');
});

test('repli déterministe documenté quand aucun slot n\u2019est dédié', () => {
  const result = renderOk(makeArticle());
  const h = result.html;
  // ogTitle retombe sur SEO_TITLE + suffixe
  contains(h, 'property="og:title" content="Titre SEO de test \u2014 Blog INVOOFFICE"', 'og:title repli');
  // ogDescription retombe sur SOCIAL_DESCRIPTION
  contains(h, 'property="og:description" content="Description sociale de test."', 'og:description repli');
  // headline retombe sur TITLE
  contains(h, '<h1>Titre éditorial de l\u2019article</h1>', 'h1 repli');
});

test('emplacement obligatoire vide : buildSeoModel le signale, le moteur refuse (V1/V4)', () => {
  // R2b est un garde-fou du moteur : avec la chaîne de repli, un des six
  // emplacements ne peut être vide que si TITLE et SEO_TITLE le sont — cas
  // que validateArticle refuse d'abord (V1/V4). On teste donc les deux niveaux.
  const { ctx } = createContext({});
  const model = call(ctx, 'buildSeoModel', {}, {});
  ok(model.missing.indexOf('pageTitle') !== -1, 'pageTitle manquant');
  ok(model.missing.indexOf('headline') !== -1, 'headline manquant');
  ok(model.missing.indexOf('jsonLdDescription') !== -1, 'jsonLdDescription manquant');

  const result = render(makeArticle({ TITLE: '', SEO_TITLE: '' }));
  notOk(result.ok, 'rendu');
  const found = codes(result);
  ok(found.indexOf('V1') !== -1 || found.indexOf('V4') !== -1,
    'TITLE/SEO_TITLE vides refusés avant le rendu, obtenu ' + JSON.stringify(found));
});

test('garde-fou R2b : un emplacement obligatoire vide est détecté', () => {
  // Le moteur ne peut pas produire ce cas (chaîne de repli « tout ou rien »),
  // mais le garde-fou doit rester vérifié pour les emplacements futurs.
  // On teste donc le prédicat partagé par le moteur, pas un rendu artificiel.
  const { ctx } = createContext({});
  const full = call(ctx, 'buildSeoModel', makeArticle(), {});
  notOk(full.missing.length, 'modèle nominal complet');
  ok(!call(ctx, 'requiredSlotsMissing', full).length, 'aucun emplacement requis vide');

  const broken = { values: Object.assign({}, full.values) };
  delete broken.values.breadcrumbTitle;
  broken.values.metaDescription = '';
  const missing = call(ctx, 'requiredSlotsMissing', broken);
  ok(missing.indexOf('breadcrumbTitle') !== -1, 'breadcrumbTitle manquant détecté');
  ok(missing.indexOf('metaDescription') !== -1, 'metaDescription vide détecté');
  ok(missing.indexOf('pageTitle') === -1, 'pageTitle toujours présent, non signalé');
});

/* -------------------------------------------------------------------------- */
/* 3. Suffixe de marque (PO-1)                                                */
/* -------------------------------------------------------------------------- */

suite('3. Suffixe de marque — exactement une fois');

test('suffixe ajouté au <title> et à og:title', () => {
  const h = renderOk(makeArticle()).html;
  contains(h, '<title>Titre SEO de test \u2014 Blog INVOOFFICE</title>', '<title> suffixé');
  contains(h, 'og:title" content="Titre SEO de test \u2014 Blog INVOOFFICE"', 'og:title suffixé');
});

test('suffixe JAMAIS dupliqué si la valeur le porte déjà', () => {
  const already = 'Titre déjà suffixé \u2014 Blog INVOOFFICE';
  const h = renderOk(makeArticle(), { seo: { pageTitle: already, ogTitle: already } }).html;
  const title = /<title>([\s\S]*?)<\/title>/.exec(h)[1];
  eq((title.split('Blog INVOOFFICE').length - 1), 1, 'occurrences dans <title>');
  eq(title, already, '<title> inchangé');
  const og = /property="og:title" content="([\s\S]*?)"/.exec(h)[1];
  eq((og.split('Blog INVOOFFICE').length - 1), 1, 'occurrences dans og:title');
});

test('suffixe JAMAIS appliqué aux autres emplacements', () => {
  const h = renderOk(makeArticle()).html;
  ['twitter:title', 'og:description', 'twitter:description'].forEach((key) => {
    const re = new RegExp('<meta (?:name|property)="' + key + '" content="([\\s\\S]*?)"');
    const value = re.exec(h)[1];
    notContains(value, 'Blog INVOOFFICE', 'suffixe dans ' + key);
  });
  notContains(/<h1>([\s\S]*?)<\/h1>/.exec(h)[1], 'Blog INVOOFFICE', 'suffixe dans h1');
  notContains(/<p class="article-excerpt">([\s\S]*?)<\/p>/.exec(h)[1], 'Blog INVOOFFICE', 'suffixe dans l\u2019extrait');
});

/* -------------------------------------------------------------------------- */
/* 4. Image à la une désactivée (PO-3)                                         */
/* -------------------------------------------------------------------------- */

suite('4. Image à la une désactivée');

test('IMAGE_URL ignoré : aucune balise img injectée', () => {
  const h = renderOk(makeArticle({ IMAGE_URL: 'icons/ma-vignette.png' })).html;
  notContains(h, '<img', 'balise img');
  notContains(h, 'ma-vignette.png', 'IMAGE_URL');
});

test('og:image de production conservé tel quel', () => {
  const h = renderOk(makeArticle()).html;
  contains(h, 'property="og:image" content="https://www.invooffice.com/icons/og-image-1200x630.png"', 'og:image');
  contains(h, 'og:image:width" content="1200"', 'og:image:width');
  contains(h, 'og:image:height" content="630"', 'og:image:height');
});

test('défaut de configuration : ENABLE_FEATURED_IMAGE = FALSE', () => {
  const { ctx } = createContext({});
  eq(call(ctx, 'getConfigValue', 'ENABLE_FEATURED_IMAGE'), 'FALSE', 'valeur par défaut');
  eq(call(ctx, 'getConfigBoolean', 'ENABLE_FEATURED_IMAGE'), false, 'getConfigBoolean');
});

/* -------------------------------------------------------------------------- */
/* 5. FAQ présente / absente                                                  */
/* -------------------------------------------------------------------------- */

const FAQ = [
  { q: 'Quel taux appliquer ?', a: 'Le taux normal de votre activité.' },
  { q: 'Et l\u2019exonération ?', a: 'Sous conditions, avec attestation.' }
];

suite('5. FAQ');

test('FAQ présente : bloc, ancre #faq et entrée de sommaire', () => {
  const h = renderOk(makeArticle(), { faq: FAQ }).html;
  contains(h, '<h2 id="faq">Questions fréquentes</h2>', 'titre FAQ');
  contains(h, '<div class="faq-item"><h3>Quel taux appliquer ?</h3>', 'entrée FAQ 1');
  contains(h, 'Sous conditions, avec attestation.', 'réponse FAQ 2 échappée/présente');
  contains(h, '<li><a href="#faq">Questions fréquentes</a></li>', 'entrée de sommaire');
});

test('FAQ absente : aucun bloc, aucun #faq, aucun lien mort', () => {
  const result = renderOk(makeArticle());
  const h = result.html;
  notContains(h, 'id="faq"', 'ancre FAQ');
  notContains(h, 'faq-item', 'entrée FAQ');
  notContains(h, 'href="#faq"', 'lien vers FAQ');
  ok(result.ok, 'validation');
  notOk(codes(result).indexOf('V9') !== -1, 'V9 (ancre sans cible)');
});

test('FAQ vide ou sans réponse utile ⇒ aucun bloc', () => {
  notContains(renderOk(makeArticle(), { faq: [] }).html, 'faq-item', 'faq vide');
  notContains(
    renderOk(makeArticle(), { faq: [{ q: 'Question ?', a: '   ' }] }).html,
    'faq-item',
    'FAQ sans réponse'
  );
});

test('collision id="faq" dans le corps refusée', () => {
  const result = render(makeArticle({ CONTENT: '<h2 id="faq">Déjà là</h2>' }), { faq: FAQ });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R4a') !== -1, 'code R4a attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('intitulé de FAQ surchargeable', () => {
  const h = renderOk(makeArticle(), { faq: FAQ, faqHeading: 'Questions sur la TVA' }).html;
  contains(h, '<h2 id="faq">Questions sur la TVA</h2>', 'intitulé personnalisé');
  contains(h, '<li><a href="#faq">Questions sur la TVA</a></li>', 'sommaire aligné');
});

/* -------------------------------------------------------------------------- */
/* 6. Échappement et HTML de confiance                                         */
/* -------------------------------------------------------------------------- */

suite('6. Échappement et HTML de confiance');

test('métadonnées HTML-sensibles échappées (accent, apostrophe, esperluette)', () => {
  const seo = {
    pageTitle: 'Title & <script>',
    headline: 'L\u2019article « test » & co',
    metaDescription: 'Des "guillemets" & un <balise>',
    articleExcerpt: 'Excerpt \u2018 apostrophe \u2019 & <b>bold</b>'
  };
  const h = renderOk(makeArticle(), { seo }).html;

  contains(h, '<h1>L\u2019article « test » &amp; co</h1>', 'h1 échappé');
  contains(h, 'name="description" content="Des &quot;guillemets&quot; &amp; un &lt;balise&gt;"', 'meta échappée');
  contains(h, '<p class="article-excerpt">Excerpt \u2018 apostrophe \u2019 &amp; &lt;b&gt;bold&lt;/b&gt;</p>', 'extrait échappé');
  notContains(h, '<script>alert', 'injection exécutable');
  notContains(h, 'content="Title & <script>"', 'pageTitle non échappée');
});

test('corps de l\u2019article : HTML de confiance, non double-échappé', () => {
  const result = renderOk(makeArticle());
  contains(result.html, '<div class="callout callout-tip">', 'encadré conservé');
  contains(result.html, '<table class="compare-table">', 'tableau conservé');
  contains(result.html, '<p>FIN_NON_ECHAPPE</p>', 'balise du corps non échappée');
  notContains(result.html, '&lt;div class="callout', 'corps échappé par erreur');
  notContains(result.html, '&amp;lt;', 'double échappement');
});

test('corps contenant un script : rendu refusé (défense en profondeur)', () => {
  const result = render(makeArticle({ CONTENT: '<p>ok</p><script>alert(1)</script>' }));
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R4b') !== -1, 'code R4b attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('JSON-LD échappé en JSON, pas en HTML', () => {
  const h = renderOk(makeArticle(), {
    seo: { jsonLdHeadline: 'Titre "quoted" & <b>gras</b>' }
  }).html;
  contains(h, '\\"quoted\\"', 'guillemets échappés en JSON');
  contains(h, '\\u003cb\\u003egras\\u003c/b\\u003e', 'balises échappées en \\u pour le JSON');
  notContains(h, '"headline": "Titre ""quoted""', 'guillemets HTML dans le JSON-LD');
  notContains(h, '&quot;quoted&quot;', 'échappement HTML appliqué au JSON-LD');
});

test('chaîne vide ne produit pas « undefined »', () => {
  const h = renderOk(makeArticle({ CARD_EXCERPT: '' })).html;
  notContains(h, 'undefined', 'undefined');
  notContains(h, 'null', 'null');
});

/* -------------------------------------------------------------------------- */
/* 7. Sommaire                                                                 */
/* -------------------------------------------------------------------------- */

suite('7. Sommaire');

test('une entrée par titre porteur d\u2019id, dans l\u2019ordre', () => {
  const h = renderOk(makeArticle(), { faq: FAQ }).html;
  const toc = /<nav class="toc"[\s\S]*?<\/nav>/.exec(h)[0];
  const items = toc.match(/<li><a href="#/g) || [];
  eq(items.length, 3, 'entrées de sommaire (alpha, beta, faq)');
  ok(toc.indexOf('#alpha') < toc.indexOf('#beta'), 'ordre alpha avant beta');
  ok(toc.indexOf('#beta') < toc.indexOf('#faq'), 'ordre beta avant faq');
});

test('titres sans id ignorés', () => {
  const article = makeArticle({ CONTENT: '<h2>Sans id</h2><h2 id="oui">Avec id</h2>' });
  const toc = /<nav class="toc"[\s\S]*?<\/nav>/.exec(renderOk(article).html)[0];
  eq((toc.match(/<li>/g) || []).length, 1, 'une seule entrée');
  contains(toc, '#oui', 'entrée « oui »');
});

test('entités décodées dans les libellés du sommaire', () => {
  const article = makeArticle({ CONTENT: '<h2 id="x">A &amp; B &lt;c&gt;</h2>' });
  const toc = /<nav class="toc"[\s\S]*?<\/nav>/.exec(renderOk(article).html)[0];
  contains(toc, '>A &amp; B &lt;c&gt;<', 'libellé échappé mais lisible');
});

/* -------------------------------------------------------------------------- */
/* 8. Related / précédent / suivant / temps de lecture (PO-2, PO-4)          */
/* -------------------------------------------------------------------------- */

suite('8. Blocs éditoriaux');

test('cartes related générées avec excerpt optionnel', () => {
  const h = renderOk(makeArticle(), {
    related: [
      { title: 'Article lié', path: 'blog/tva/autre-article.html', excerpt: 'Résumé court.' },
      { title: 'Sans résumé', path: '/blog/tva/sans-resume.html' }
    ]
  }).html;
  contains(h, '<div class="related-card"><a href="/blog/tva/autre-article.html">Article lié</a><p>Résumé court.</p></div>',
    'carte avec résumé');
  contains(h, '<div class="related-card"><a href="/blog/tva/sans-resume.html">Sans résumé</a></div>',
    'carte sans résumé');
});

test('related vide ⇒ aucun div vide', () => {
  const h = renderOk(makeArticle()).html;
  // Le gabarit INDENTE l'emplacement : « <div class="related-grid">\r\n      \r\n    </div> ».
  ok(/<div class="related-grid">\s*<\/div>/.test(h), 'grille vide assumée');
  notContains(h, '<div class="related-card"></div>', 'carte vide');
  notContains(h, '<p></p>', 'paragraphe vide');
});

test('précédent / suivant : libellés génériques, aucun champ supplémentaire', () => {
  const h = renderOk(makeArticle(), {
    previous: { title: 'Article précédent', path: 'blog/devis/x.html' },
    next: { title: 'Article suivant', path: 'blog/tva/y.html' }
  }).html;
  contains(h, '<a href="/blog/devis/x.html">\u2190 Article précédent</a>', 'lien précédent');
  contains(h, '<a href="/blog/tva/y.html">Article suivant : Article suivant \u2192</a>', 'lien suivant');
});

test('voisin absent ⇒ slot vide, pas de lien cassé', () => {
  const nav = /<nav class="prev-next"[\s\S]*?<\/nav>/.exec(renderOk(makeArticle()).html)[0];
  notContains(nav, '<a', 'lien résiduel');
  notContains(nav, 'Article précédent', 'libellé orphelin');
  notContains(nav, 'Article suivant', 'libellé orphelin');
});

test('origine étrangère refusée dans les liens', () => {
  const h = renderOk(makeArticle(), {
    next: { title: 'Pirate', path: 'https://evil.example/blog/tva/x.html' }
  }).html;
  notContains(h, 'evil.example', 'origine étrangère');
  notContains(h, 'Pirate', 'voisin rejeté');
});

test('temps de lecture : valeur éditoriale, jamais recalculée', () => {
  const h = renderOk(makeArticle({ READING_TIME: 9 }), {}).html;
  contains(h, '9 min de lecture', 'temps de lecture éditorial');
  notContains(h, '1 min de lecture', 'pas de valeur recalculée');
});

test('temps de lecture absent ⇒ erreur R3b (pas de calcul de repli)', () => {
  const { ctx } = createContext({});
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: TEMPLATE });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R3b') !== -1, 'code R3b attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('temps de lecture « 8 min » normalisé en nombre', () => {
  const h = renderOk(makeArticle({ READING_TIME: '8 min' }), {}).html;
  contains(h, '8 min de lecture', 'normalisation');
  notContains(h, '8 min min de lecture', 'doublon d\u2019unité');
});

/* -------------------------------------------------------------------------- */
/* 9. Post-traitement de production                                           */
/* -------------------------------------------------------------------------- */

suite('9. Post-traitement de production (règles 2 à 5)');

test('règle 2 : tous les assets passent à ../../ (9 références)', () => {
  const h = renderOk(makeArticle()).html;
  const roots = ['css/styles.css', 'css/fonts.css', 'css/landing.css', 'css/blog.css',
    'icons/favicon.svg', 'icons/icon-180.png', 'icons/icon-192.png',
    'js/theme.js', 'manifest.json'];
  // Les <link>/<script>/<img> du gabarit sont en guillemets doubles, l'import
  // dynamique de js/theme.js en apostrophes : la recherche doit ignorer le style.
  roots.forEach((r) => ok(new RegExp('\\.\\./\\.\\./' + r.replace(/\./g, '\\.') + '[\'"]').test(h),
    'asset ' + r));
  // Règle 2 : aucun ASSET ne doit rester à un niveau. Les liens de navigation
  // vers le hub (« ../ ») sont eux corrects depuis une page de profondeur 2.
  roots.forEach((r) => ok(h.indexOf('"../' + r) === -1 && h.indexOf("'../" + r) === -1,
    'asset resté à 1 niveau : ' + r));
  notContains(h, '"../../css//', 'double slash après réécriture');
  notContains(h, 'manifest.json/', 'manifest réécrit comme un dossier');
});

test('règle 2 : une profondeur 1 résiduelle est rejetée', () => {
  const h = renderOk(makeArticle()).html.replace('"../../css/blog.css"', '"../css/blog.css"');
  const { ctx } = createContext({});
  const v = call(ctx, 'validateRenderedHtml', h, { canonicalPath: '/blog/tva/article-de-test.html' });
  notOk(v.ok, 'validation');
  ok(v.errors.some((e) => e.code === 'P2'), 'code P2 attendu');
});

test('règle 3 : robots basculés, noindex absent', () => {
  const h = renderOk(makeArticle()).html;
  contains(h, '<meta name="robots" content="index, follow">', 'robots production');
  notContains(h, 'noindex', 'noindex résiduel');
});

test('règle 3 : sortie sans bascule ⇒ P1', () => {
  const raw = TEMPLATE.replace(/<!--[\s\S]*?-->/g, '');
  const { ctx } = createContext({});
  const v = call(ctx, 'validateRenderedHtml', raw, { canonicalPath: '/blog/tva/x.html' });
  notOk(v.ok, 'validation');
  ok(v.errors.some((e) => e.code === 'P1'), 'code P1 attendu');
  ok(v.errors.some((e) => e.code === 'P1b'), 'code P1b attendu');
});

test('règle 4 : commentaire de développement retiré', () => {
  const h = renderOk(makeArticle()).html;
  notContains(h, 'TEMPLATE D', 'commentaire de dev');
  notContains(h, '{{PLACEHOLDER}}', 'illustration du gabarit');
});

test('règle 5 : retour catégorie paramétré, hub préservé', () => {
  const h = renderOk(makeArticle()).html;
  contains(h, '<div class="back-blog"><a href="/blog/tva/">', 'retour catégorie');
  const breadcrumb = /<nav class="breadcrumb"[\s\S]*?<\/nav>/.exec(h)[0];
  contains(breadcrumb, '<a href="/blog/">Blog</a>', 'lien hub du fil d\u2019Ariane intact');
  const footer = /<footer[\s\S]*?<\/footer>/.exec(h)[0];
  contains(footer, '<a href="/blog/">Blog</a>', 'lien hub du pied de page intact');
});

test('règle 5 : gabarit sans .back-blog ⇒ erreur explicite', () => {
  const { ctx } = createContext({});
  const broken = TEMPLATE.replace(/<div class="back-blog">[\s\S]*?<\/div>/, '');
  const result = call(ctx, 'renderArticleHtml', makeArticle(), {
    templateHtml: broken, readingTime: 6
  });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R5b') !== -1, 'code R5b attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('le gabarit n\u2019est jamais modifié sur disque', () => {
  eq(fs.readFileSync(TEMPLATE_PATH, 'utf8'), TEMPLATE, 'gabarit inchangé');
  contains(TEMPLATE, 'noindex, nofollow', 'gabarit toujours noindex');
  contains(TEMPLATE, '"../css/blog.css"', 'gabarit toujours à 1 niveau');
});

/* -------------------------------------------------------------------------- */
/* 10. Contrats d\u2019erreur                                                    */
/* -------------------------------------------------------------------------- */

suite('10. Contrats d\u2019erreur du moteur');

test('gabarit manquant ⇒ erreur', () => {
  const { ctx } = createContext({});
  const result = call(ctx, 'renderArticleHtml', makeArticle(), {});
  notOk(result.ok, 'rendu');
  eq(codes(result)[0], 'R0', 'code R0');
});

test('gabarit avec placeholder non résolu ⇒ V10', () => {
  const { ctx } = createContext({});
  const leaky = TEMPLATE.replace('{{READING_TIME}}', '{{READING_TIME}} {{UNKNOWN_TOKEN}}');
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: leaky, readingTime: 6 });
  // Le moteur refuse la substitution d'un placeholder inconnu (R5) AVANT
  // d'atteindre V10 : c'est le comportement attendu, plus strict que V10.
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R5') !== -1, 'code R5 attendu, obtenu ' + JSON.stringify(codes(result)));
  contains(JSON.stringify(result.errors), 'UNKNOWN_TOKEN', 'token fautif nommé');
});

test('gabarit dont un site TITLE dérive ⇒ R5 avec contexte', () => {
  const { ctx } = createContext({});
  const drifted = TEMPLATE.replace('<h1>{{TITLE}}</h1>', '<h1 class="x">{{TITRE}}</h1>');
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: drifted, readingTime: 6 });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('V10') !== -1 || codes(result).indexOf('R5') !== -1,
    'code V10 ou R5 attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('gabarit dont le suffixe a disparu de <title> ⇒ R5b', () => {
  const { ctx } = createContext({});
  const stripped = TEMPLATE.replace(
    /<title>\{\{TITLE\}\} — Blog INVOOFFICE<\/title>/,
    '<title>{{TITLE}}</title>'
  );
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: stripped, readingTime: 6 });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R5b') !== -1, 'code R5b attendu, obtenu ' + JSON.stringify(codes(result)));
  contains(JSON.stringify(result.errors), 'suffixe de marque', 'motif explicité');
  contains(JSON.stringify(result.errors), 'emplacement title', 'emplacement fautif nommé');
});

test('gabarit dont le suffixe a été remplacé par un autre texte ⇒ R5b', () => {
  // L'ancre correspond mais le littéral absorbé n'est PAS un suffixe de
  // marque : erreur dédiée, pour ne jamais produire « Titre Suffixe ».
  const { ctx } = createContext({});
  const tampered = TEMPLATE.replace(
    /<title>\{\{TITLE\}\} — Blog INVOOFFICE<\/title>/,
    '<title>{{TITLE}} Suffixe</title>'
  );
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: tampered, readingTime: 6 });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R5b') !== -1, 'code R5b attendu, obtenu ' + JSON.stringify(codes(result)));
  contains(JSON.stringify(result.errors), 'Suffixe', 'littéral fautif restitué');
});

test('gabarit dont le site <title> suffixé n’existe plus ⇒ R5b (sites inattendus)', () => {
  // Cas distinct : l'ancre ne correspond plus DU TOUT, le garde de comptage
  // doit s'en apercevoir au lieu de produire une page sans <title>.
  const { ctx } = createContext({});
  const removed = TEMPLATE.replace(
    /<title>\{\{TITLE\}\} — Blog INVOOFFICE<\/title>/,
    '<title data-x>{{TITLE}}</title>'
  );
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: removed, readingTime: 6 });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R5b') !== -1, 'code R5b attendu, obtenu ' + JSON.stringify(codes(result)));
  contains(JSON.stringify(result.errors), 'sites suffixés inattendus', 'comptage des sites nommé');
});

test('canonical absent ⇒ V11a', () => {
  const { ctx } = createContext({});
  const h = renderOk(makeArticle()).html.replace(/<link rel="canonical"[^>]*>/, '');
  const v = call(ctx, 'validateRenderedHtml', h, { canonicalPath: '/blog/tva/article-de-test.html' });
  notOk(v.ok, 'validation');
  ok(v.errors.some((e) => e.code === 'V11a'), 'code V11a attendu');
});

test('canonical invalide ⇒ V11', () => {
  const { ctx } = createContext({});
  const h = renderOk(makeArticle()).html.replace(
    'https://www.invooffice.com/blog/tva/article-de-test.html"',
    'https://invooffice.com/blog/tva/autre.html"'
  );
  const v = call(ctx, 'validateRenderedHtml', h, { canonicalPath: '/blog/tva/article-de-test.html' });
  notOk(v.ok, 'validation');
  ok(v.errors.some((e) => e.code === 'V11'), 'code V11 attendu');
});

test('PUBLISHED_AT invalide ⇒ R3a', () => {
  const result = render(makeArticle({ PUBLISHED_AT: '14/07/2026' }));
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('R3a') !== -1, 'code R3a attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('catégorie résolue par table explicite, jamais par slugify', () => {
  const { ctx } = createContext({});
  eq(call(ctx, 'blogPath', 'tva', 'mon-article'), 'blog/tva/mon-article.html', 'blogPath');
  // « TVA Maroc » n'est pas dérivable par slugify : la table est obligatoire.
  eq(call(ctx, 'slugify', 'TVA Maroc'), 'tva-maroc', 'slugify (non utilisé)');
  eq(call(ctx, 'resolveCategory', 'TVA Maroc').slug, 'tva', 'resolveCategory');
});

/* -------------------------------------------------------------------------- */
/* 11. Conformité de la sortie avec le socle de production                     */
/* -------------------------------------------------------------------------- */

suite('11. Fidélité au socle de production');

const PRODUCTION_ARTICLES = [
  'auto-entrepreneur/facturation-auto-entrepreneur-guide.html',
  'devis/devis-ou-facture-differences.html',
  'facturation/comment-creer-facture-conforme-maroc.html',
  'guides/pourquoi-application-facturation-donnees-locales.html',
  'tva/taux-tva-maroc.html'
];

test('les 5 articles de référence existent bien dans le dépôt', () => {
  PRODUCTION_ARTICLES.forEach((rel) => {
    ok(fs.existsSync(path.join(REPO_ROOT, 'blog', rel)), 'article de référence ' + rel);
  });
});

test('sortie : mêmes invariants structurels que la production', () => {
  const h = renderOk(makeArticle({ CATEGORY: 'TVA Maroc', SLUG: 'taux-tva-maroc' }), {
    faq: FAQ,
    related: [{ title: 'Autre article', path: 'blog/tva/autre.html', excerpt: 'Résumé.' }],
    previous: { title: 'Précédent', path: 'blog/devis/x.html' },
    next: { title: 'Suivant', path: 'blog/tva/y.html' }
  }).html;

  // Ancres attendues par la production : faq-item, related-card, related-grid,
  // prev-next, back-blog, cta-box, breadcrumb, toc, callout, compare-table.
  ['faq-item', 'related-card', 'related-grid', 'prev-next', 'back-blog',
    'cta-box', 'breadcrumb', 'toc', 'callout', 'compare-table',
    'article-excerpt', 'article-meta'].forEach((c) => {
    contains(h, c, 'classe de production « ' + c + ' »');
  });
  contains(h, '<meta name="robots" content="index, follow">', 'robots production');
  contains(h, 'property="og:image" content="https://www.invooffice.com/icons/og-image-1200x630.png"',
    'og:image production');
  contains(h, 'hreflang="fr"', 'hreflang fr');
  contains(h, 'hreflang="x-default"', 'hreflang x-default');
  contains(h, '"@type": "BlogPosting"', 'JSON-LD BlogPosting');
  contains(h, '"@type": "BreadcrumbList"', 'JSON-LD BreadcrumbList');
  contains(h, '"inLanguage": "fr"', 'inLanguage');
  notContains(h, '{{', 'aucun placeholder');
});

test('JSON-LD parsable sur les deux blocs', () => {
  const h = renderOk(makeArticle(), { faq: FAQ }).html;
  const blocks = h.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  eq(blocks.length, 2, 'deux blocs JSON-LD');
  blocks.forEach((b, i) => {
    const json = JSON.parse(b.replace(/<script[^>]*>/, '').replace(/<\/script>/, ''));
    ok(json['@type'], 'type du bloc ' + (i + 1));
  });
});

test('validation du rendu : aucune erreur sur la sortie nominale', () => {
  const result = renderOk(makeArticle(), { faq: FAQ });
  ok(result.validation, 'rapport de validation présent');
  ok(result.validation.ok, 'validation verte');
  eq(result.validation.errors.length, 0, 'zéro erreur');
});

test('aucune écriture GitHub ni appel réseau pendant le rendu', () => {
  let fetchCalls = 0;
  const { ctx } = createContext({
    fetchImpl: { fetch: () => { fetchCalls += 1; throw new Error('réseau interdit'); } }
  });
  const result = call(ctx, 'renderArticleHtml', makeArticle(), { templateHtml: TEMPLATE, readingTime: 6 });
  ok(result.ok, 'rendu');
  eq(fetchCalls, 0, 'appels UrlFetch');
});

test('validateRenderedHtml est appelé par le moteur et verrouille le résultat', () => {
  // Une ancre morte dans le corps ne peut PAS être réparée par le
  // post-traitement : seul le contrôle V9 peut la refuser. Si le moteur
  // n'appelait pas validateRenderedHtml, ce cas serait vert à tort.
  const result = render(makeArticle({ CONTENT: '<h2 id="alpha">A</h2><a href="#fantome">lien mort</a>' }));
  notOk(result.ok, 'rendu');
  ok(result.validation, 'rapport de validation présent');
  ok(codes(result).indexOf('V9') !== -1, 'code V9 attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('un gabarit dont les robots ne sont pas « noindex, nofollow » est refusé (T3)', () => {
  const { ctx } = createContext({});
  const result = call(ctx, 'renderArticleHtml', makeArticle(), {
    templateHtml: TEMPLATE.replace('noindex, nofollow', 'index, follow'),
    readingTime: 6
  });
  notOk(result.ok, 'rendu');
  ok(codes(result).indexOf('T3') !== -1, 'code T3 attendu, obtenu ' + JSON.stringify(codes(result)));
});

test('le jeton {{PLACEHOLDER}} du commentaire de doc n\u2019est pas pris pour un champ', () => {
  contains(TEMPLATE, '{{PLACEHOLDER}}', 'le gabarit documente bien ses placeholders');
  const result = renderOk(makeArticle());
  notContains(result.html, '{{PLACEHOLDER}}', 'commentaire de doc retiré');
});

/* -------------------------------------------------------------------------- */

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write('ÉCHEC : ' + failures.length + ' test(s) en échec, ' + passed + ' réussi(s)\n');
  failures.forEach((f) => process.stdout.write('  [' + f.suite + '] ' + f.name + '\n    ' + f.message + '\n'));
  process.exit(1);
}
process.stdout.write('OK : ' + passed + ' tests réussis\n');
