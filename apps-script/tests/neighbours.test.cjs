/**
 * INVOOFFICE — Tests du voisinage éditorial (ArticleNeighbours.gs)
 * ---------------------------------------------------------------------------
 * Exécution : `npm run test:apps-script`
 *
 * Aucun réseau, aucune écriture GitHub, aucun accès à un vrai tableur.
 *
 * Le module est PUR : il ne lit que le HTML d'un index de catégorie déjà
 * disponible. Les tests couvrent les décisions validées :
 *   - E2  : bloc « Articles similaires » absent, TITRE COMPRIS, sans carte ;
 *   - E3  : côté absent de la navigation = `<span></span>` (pas un lien vide) ;
 *   - E4  : libellé « ← Retour à la catégorie {Nom} » échappé ;
 *   - A+  : le nouvel article pointe vers un voisin ANCIEN, jamais modifié ;
 *   - tri : date décroissante puis position croissante (déterminisme) ;
 *   - 3 similaires maximum, même catégorie d'abord, soi-même exclu ;
 *   - échec fermé sur un lien mort, sans rendu dégradé silencieux.
 */

const fs = require('fs');
const path = require('path');

const { createContext, call, indexPageFixture } = require('./harness.cjs');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE = fs.readFileSync(path.join(REPO_ROOT, 'blog', 'template-article.html'), 'utf8');

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

function eqList(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((label || 'liste') + ' : attendu ' + b + ', obtenu ' + a);
}

function ok(value, label) {
  if (!value) throw new Error((label || 'condition') + ' : falsy (' + JSON.stringify(value) + ')');
}

function notOk(value, label) {
  if (value) throw new Error((label || 'condition') + ' : truthy (' + JSON.stringify(value) + ')');
}

function includes(haystack, needle, label) {
  if (String(haystack).indexOf(needle) === -1) {
    throw new Error((label || 'inclusion') + ' : ' + JSON.stringify(needle) + ' absent');
  }
}

function absent(haystack, needle, label) {
  if (String(haystack).indexOf(needle) !== -1) {
    throw new Error((label || 'absence') + ' : ' + JSON.stringify(needle) + ' présent');
  }
}

const { ctx } = createContext({});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Une entrée d'index, à la forme attendue par `indexPageFixture()` : le href
 *  est le chemin web réel (`/blog/<cat>/<slug>.html`) et le meta porte la date
 *  en toutes lettres, comme dans les index de production. */
function indexItem(href, title, isoDate, excerpt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  const meta = m
    ? parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1] + ' · 5 min'
    : '5 min';
  return { meta: meta, href: href, title: title, excerpt: excerpt || 'Extrait de test.' };
}

/** Page d'index de catégorie à partir d'une liste d'articles. */
function indexPage(items) {
  return indexPageFixture({ items: items });
}

function hrefs(list) {
  return list.map((a) => a.href);
}

function titles(list) {
  return list.map((a) => a.title);
}

/* -------------------------------------------------------------------------- */
/* 1. Lecture d'un index de catégorie                                          */
/* -------------------------------------------------------------------------- */

suite('Lecture d\'index');

test('les entrées d\'un index réel sont lues : href, titre, extrait, date', () => {
  const page = indexPage([
    indexItem('/blog/tva/f-1.html', 'Facture un', '2026-05-02'),
    indexItem('/blog/tva/f-2.html', 'Facture deux', '2026-05-03')
  ]);
  const parsed = call(ctx, 'parseIndexArticles', page);
  eq(parsed.length, 2, 'deux entrées');
  eq(parsed[0].href, '/blog/tva/f-1.html', 'href');
  eq(parsed[0].title, 'Facture un', 'titre');
  eq(parsed[0].dateIso, '2026-05-02', 'date ISO');
  eq(parsed[1].dateIso, '2026-05-03', 'date ISO du second');
});

test('une date en toutes lettres est convertie, accents et abréviations inclus', () => {
  eq(call(ctx, 'frenchDateToIso', '2 mai 2026'), '2026-05-02', 'date simple');
  eq(call(ctx, 'frenchDateToIso', '14 juillet 2026'), '2026-07-14', 'mois accentué');
  eq(call(ctx, 'frenchDateToIso', '3 août 2025'), '2025-08-03', 'mois août');
  eq(call(ctx, 'frenchDateToIso', '1 décembre 2026'), '2026-12-01', 'mois décembre');
  eq(call(ctx, 'frenchDateToIso', 'pas une date'), '', 'illisible → chaîne vide');
});

test('les entités HTML sont déséchappées dans les titres', () => {
  const page = indexPage([
    indexItem('/blog/tva/x.html', 'La TVA & les "exonérations"', '2026-05-02')
  ]);
  const parsed = call(ctx, 'parseIndexArticles', page);
  includes(parsed[0].title, '& les', '& décodé');
  absent(parsed[0].title, '&amp;', 'plus de &amp;');
});

test('un index vide ou sans liste rend une liste vide, sans exception', () => {
  eq(call(ctx, 'parseIndexArticles', indexPage([])).length, 0, 'index vide');
  eq(call(ctx, 'parseIndexArticles', '<html><body>Rien</body></html>').length, 0, 'pas de liste');
  eq(call(ctx, 'parseIndexArticles', '').length, 0, 'chaîne vide');
});

/* -------------------------------------------------------------------------- */
/* 2. Tri déterministe                                                         */
/* -------------------------------------------------------------------------- */

suite('Tri');

test('date décroissante, puis position croissante à date égale', () => {
  const list = [
    { href: '/blog/tva/a.html', title: 'A', excerpt: '', dateIso: '2026-01-01', position: 2 },
    { href: '/blog/tva/b.html', title: 'B', excerpt: '', dateIso: '2026-03-01', position: 1 },
    { href: '/blog/tva/c.html', title: 'C', excerpt: '', dateIso: '2026-01-01', position: 0 }
  ];
  const sorted = call(ctx, 'sortArticlesByRecency', list.slice());
  eqList(hrefs(sorted), ['/blog/tva/b.html', '/blog/tva/c.html', '/blog/tva/a.html'],
    'plus récent d\'abord, puis ordre du fichier à date égale');
});

test('une date illisible passe en dernier, sans NaN ni exception', () => {
  const list = [
    { href: '/blog/tva/inconnu.html', title: 'X', excerpt: '', dateIso: '', position: 0 },
    { href: '/blog/tva/ok.html', title: 'Y', excerpt: '', dateIso: '2026-02-02', position: 1 }
  ];
  const sorted = call(ctx, 'sortArticlesByRecency', list.slice());
  eqList(hrefs(sorted), ['/blog/tva/ok.html', '/blog/tva/inconnu.html'], 'date valide d\'abord');
});

/* -------------------------------------------------------------------------- */
/* 3. Précédent / suivant (A+)                                                  */
/* -------------------------------------------------------------------------- */

suite('Précédent / suivant');

test('article intercalé : précédent = plus récent, suivant = plus ancien', () => {
  const page = indexPage([
    indexItem('/blog/tva/ancien.html', 'Ancien', '2026-01-05'),
    indexItem('/blog/tva/recent.html', 'Récent', '2026-06-10')
  ]);
  const own = call(ctx, 'parseIndexArticles', page);
  const self = { href: '/blog/tva/cible.html', title: 'Cible', excerpt: '', dateIso: '2026-03-01', position: -1 };
  const n = call(ctx, 'pickNeighbours', own.concat([self]), self.href);
  eq(n.previous && n.previous.href, '/blog/tva/recent.html', 'précédent = le plus récent');
  eq(n.next && n.next.href, '/blog/tva/ancien.html', 'suivant = le plus ancien');
});

test('article le plus RÉCENT : aucun précédent, le suivant est l\'article immédiatement plus ancien', () => {
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem('/blog/tva/ancien.html', 'Ancien', '2026-01-05'),
    indexItem('/blog/tva/recent.html', 'Récent', '2026-06-10')
  ]));
  const self = { href: '/blog/tva/cible.html', title: 'Cible', excerpt: '', dateIso: '2026-07-01', position: -1 };
  const n = call(ctx, 'pickNeighbours', own.concat([self]), self.href);
  eq(n.previous, null, 'aucun précédent');
  eq(n.next.href, '/blog/tva/recent.html', 'suivant = l\'article immédiatement plus ancien');
});

test('article le plus ANCIEN : aucun suivant, le précédent est l\'article immédiatement plus récent', () => {
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem('/blog/tva/a.html', 'A', '2026-01-05'),
    indexItem('/blog/tva/b.html', 'B', '2026-02-05')
  ]));
  const self = { href: '/blog/tva/cible.html', title: 'Cible', excerpt: '', dateIso: '2025-12-01', position: -1 };
  const n = call(ctx, 'pickNeighbours', own.concat([self]), self.href);
  eq(n.previous.href, '/blog/tva/a.html', 'précédent = l\'article immédiatement plus récent');
  eq(n.next, null, 'aucun suivant');
});

test('catégorie à un seul autre article : exactement UN côté renseigné', () => {
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem('/blog/tva/seul.html', 'Le seul', '2026-01-05')
  ]));
  const self = { href: '/blog/tva/cible.html', title: 'Cible', excerpt: '', dateIso: '2026-06-01', position: -1 };
  const n = call(ctx, 'pickNeighbours', own.concat([self]), self.href);
  eq(n.previous, null, 'rien de plus récent que soi');
  eq(n.next.href, '/blog/tva/seul.html', 'le seul article existant est le suivant');
});

test('catégorie vide : ni précédent ni suivant, et rang introuvable', () => {
  const self = { href: '/blog/tva/cible.html', title: 'Cible', excerpt: '', dateIso: '2026-06-01', position: -1 };
  const n = call(ctx, 'pickNeighbours', [self], self.href);
  eq(n.previous, null, 'aucun précédent');
  eq(n.next, null, 'aucun suivant');
});

test('jamais de lien vers soi-même, même si l\'index contient déjà l\'article', () => {
  const selfHref = '/blog/tva/cible.html';
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem('/blog/tva/ancien.html', 'Ancien', '2026-01-05'),
    indexItem(selfHref, 'Cible', '2026-03-01'),
    indexItem('/blog/tva/recent.html', 'Récent', '2026-06-10')
  ]));
  const n = call(ctx, 'pickNeighbours', own, selfHref);
  ok(n.previous.href !== selfHref, 'le précédent n\'est pas soi');
  ok(!n.next || n.next.href !== selfHref, 'le suivant n\'est pas soi');
  eq(n.previous.href, '/blog/tva/recent.html', 'précédent = le plus récent des AUTRES');
  eq(n.next.href, '/blog/tva/ancien.html', 'suivant = le plus ancien des AUTRES');
});

/* -------------------------------------------------------------------------- */
/* 4. Articles similaires                                                      */
/* -------------------------------------------------------------------------- */

suite('Articles similaires');

test('3 maximum, même catégorie d\'abord', () => {
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem('/blog/tva/1.html', 'Un', '2026-01-01'),
    indexItem('/blog/tva/2.html', 'Deux', '2026-01-02'),
    indexItem('/blog/tva/3.html', 'Trois', '2026-01-03'),
    indexItem('/blog/tva/4.html', 'Quatre', '2026-01-04')
  ]));
  const other = [
    { href: '/blog/guides/x.html', title: 'X', excerpt: 'e', dateIso: '2026-09-09', position: 0 },
    { href: '/blog/guides/y.html', title: 'Y', excerpt: 'e', dateIso: '2026-09-08', position: 1 }
  ];
  const rel = call(ctx, 'pickRelated', own, [other], '/blog/tva/cible.html', 3);
  eq(rel.length, 3, 'plafonné à 3');
  eqList(titles(rel), ['Quatre', 'Trois', 'Deux'], 'les plus récents de MA catégorie');
});

test('complément par les autres catégories quand la catégorie est pauvre', () => {
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem('/blog/tva/1.html', 'Seul', '2026-01-01')
  ]));
  const others = [
    [{ href: '/blog/guides/x.html', title: 'X', excerpt: 'e', dateIso: '2026-09-09', position: 0 }],
    [{ href: '/blog/devis/y.html', title: 'Y', excerpt: 'e', dateIso: '2026-09-08', position: 0 }]
  ];
  const rel = call(ctx, 'pickRelated', own, others, '/blog/tva/cible.html', 3);
  eqList(titles(rel), ['Seul', 'X', 'Y'], 'même catégorie d\'abord, puis les autres');
});

test('l\'article lui-même est toujours exclu', () => {
  const selfHref = '/blog/tva/cible.html';
  const own = call(ctx, 'parseIndexArticles', indexPage([
    indexItem(selfHref, 'Cible', '2026-06-01'),
    indexItem('/blog/tva/1.html', 'Un', '2026-01-01')
  ]));
  const rel = call(ctx, 'pickRelated', own, [], selfHref, 3);
  eq(rel.length, 1, 'un seul candidat');
  ok(rel.every((r) => r.href !== selfHref), 'soi-même absent');
});

test('aucun doublon quand deux listes contiennent le même article', () => {
  const selfHref = '/blog/tva/cible.html';
  const dupe = { href: '/blog/tva/1.html', title: 'Un', excerpt: 'e', dateIso: '2026-01-01', position: 0 };
  const rel = call(ctx, 'pickRelated', [dupe], [[dupe]], selfHref, 3);
  eq(rel.length, 1, 'pas de doublon');
});

test('catégorie sans aucun autre article : liste vide, le bloc sera omis', () => {
  eq(call(ctx, 'pickRelated', [], [], '/blog/tva/cible.html', 3).length, 0, 'vide');
});

/* -------------------------------------------------------------------------- */
/* 5. Rendu des trois blocs de bas de page                                     */
/* -------------------------------------------------------------------------- */

suite('Rendu des blocs');

/** Rendu l'article avec un contexte calculé à la main (aucun réseau). */
function renderWith(context, article) {
  const art = Object.assign({
    ID: 'A-1',
    TITLE: 'Facture TVA : le guide complet',
    CONTENT: '<h2 id="a">Section</h2>\n<p>Un paragraphe de contenu suffisamment long pour la validation.</p>',
    CATEGORY: 'TVA Maroc',
    SLUG: 'cible',
    SEO_TITLE: 'Facture TVA',
    META_DESCRIPTION: 'Tout sur la TVA facturée au Maroc : taux, déclaration, cas particuliers.',
    IMAGE_URL: '',
    PUBLISHED_AT: '2026-03-01',
    SOCIAL_DESCRIPTION: 'Description sociale distincte.',
    ARTICLE_EXCERPT: 'Extrait distinct.',
    CARD_EXCERPT: 'Carte distincte.',
    READING_TIME: '6'
  }, article || {});
  return call(ctx, 'renderArticleHtml', art, {
    templateHtml: TEMPLATE,
    publishedAt: '2026-03-01',
    related: (context && context.related) || [],
    previous: (context && context.previous) || null,
    next: (context && context.next) || null
  });
}

/** Un voisin au format du RENDREUR (`path`), comme le produit le module. */
function nb(href, title, isoDate, position, excerpt) {
  return {
    title: title,
    path: href,
    href: href,
    excerpt: excerpt || 'Extrait.',
    dateIso: isoDate,
    position: position
  };
}

const NEIGHBOURS = [
  nb('/blog/tva/ancien.html', 'Ancien', '2026-01-05', 0, 'Extrait ancien.'),
  nb('/blog/tva/recent.html', 'Récent', '2026-06-10', 1, 'Extrait récent.')
];

test('voisinage complet : les trois blocs sont présents et cohérents', () => {
  const r = renderWith({ related: NEIGHBOURS, previous: NEIGHBOURS[1], next: NEIGHBOURS[0] });
  ok(r.ok, 'rendu accepté');
  includes(r.html, 'related-grid', 'grille des similaires');
  includes(r.html, '/blog/tva/ancien.html', 'lien de l\'article similaire');
  includes(r.html, 'Ancien', 'titre de l\'article similaire');
  includes(r.html, 'Article précédent', 'libellé précédent');
  includes(r.html, '/blog/tva/recent.html', 'lien précédent');
  includes(r.html, '→', 'sens de la flèche suivante');
});

test('E4 : « ← Retour à la catégorie TVA Maroc », et nom de catégorie échappé', () => {
  const r = renderWith({ related: NEIGHBOURS });
  ok(r.ok, 'rendu accepté');
  includes(r.html, '← Retour à la catégorie TVA Maroc', 'libellé du lien final');
  includes(r.html, 'href="/blog/tva/"', 'cible du lien final');
  absent(r.html, 'Retour au blog', 'ancien libellé éliminé');

  // Le nom vient de CATEGORY_MAP : il doit être échappé comme n'importe quelle
  // donnée issue d'une feuille. Le fragment est celui du gabarit réel.
  const hostile = call(ctx, 'backLinkToCategory',
    '<div class="back-blog"><a href="/blog/"> Retour au blog</a></div>',
    { slug: 'tva', name: 'TVA <script>alert(1)</script> & "co"' });
  absent(hostile, '<script>alert(1)</script>', 'balises non interprétables');
  includes(hostile, '&lt;script&gt;', 'balises échappées');
  includes(hostile, 'href="/blog/tva/"', 'cible intacte');
});

test('E3 : côté absent = <span></span>, jamais un lien vide', () => {
  const r = renderWith({ related: NEIGHBOURS, previous: null, next: NEIGHBOURS[0] });
  ok(r.ok, 'rendu accepté');
  includes(r.html, '<span></span>', 'emplacement vide présent');
  absent(r.html, 'Article précédent</a>', 'pas de lien précédent fantôme');
  notOk(r.html.indexOf('<a href="#"') !== -1, 'aucun href vide');
});

test('E2 : aucun voisin → bloc similar wholly absent, TITRE INCLUS', () => {
  const r = renderWith({ related: [], previous: null, next: null });
  ok(r.ok, 'rendu accepté');
  absent(r.html, 'related-grid', 'grille absente');
  absent(r.html, 'Articles similaires', 'titre orphelin absent');
  absent(r.html, 'Article précédent', 'pas de précédent');
  absent(r.html, 'Article suivant', 'pas de suivant');
});

test('une seule carte suffit à garder le bloc et son titre', () => {
  const r = renderWith({ related: [NEIGHBOURS[0]], previous: null, next: null });
  ok(r.ok, 'rendu accepté');
  includes(r.html, 'related-grid', 'grille présente');
  includes(r.html, 'Articles similaires', 'titre présent');
  includes(r.html, '/blog/tva/ancien.html', 'la carte est là');
});

/* -------------------------------------------------------------------------- */
/* 6. Contrôle des liens morts (échec fermé)                                   */
/* -------------------------------------------------------------------------- */

suite('Liens morts');

test('TOUTES les cartes sont inspectées, pas seulement la première', () => {
  // Régression : un regex non gloutonne s'arrêtait au premier `</div>` de la
  // grille et la 2e et 3e carte n'étaient jamais vérifiées — un lien mort y
  // passait inaperçu.
  const html =
    '<div class="related-grid">' +
    '<div class="related-card"><a href="/blog/tva/1.html">Un</a><p>e</p></div>' +
    '<div class="related-card"><a href="/blog/tva/2.html">Deux</a><p>e</p></div>' +
    '<div class="related-card"><a href="/blog/tva/3.html">Trois</a><p>e</p></div>' +
    '</div>';
  eqList(call(ctx, 'extractFooterBlockLinks', html),
    ['blog/tva/1.html', 'blog/tva/2.html', 'blog/tva/3.html'],
    'les trois liens sont extraits');
});

test('les deux côtés de la navigation sont inspectés', () => {
  const html =
    '<div class="related-grid"><div class="related-card"><a href="/blog/tva/1.html">Un</a></div></div>' +
    '<nav class="prev-next"><a href="/blog/tva/avant.html">Précédent</a>' +
    '<a href="/blog/tva/apres.html">Suivant</a></nav>';
  eqList(call(ctx, 'extractFooterBlockLinks', html),
    ['blog/tva/1.html', 'blog/tva/avant.html', 'blog/tva/apres.html'],
    'grille + navigation');
});

test('liens hors des trois blocs (gabarit, header) sont IGNORÉS', () => {
  const html =
    '<header><a href="/blog/tva/ailleurs.html">Nav</a></header>' +
    '<div class="related-grid"></div>' +
    '<nav class="prev-next"></nav>';
  eqList(call(ctx, 'extractFooterBlockLinks', html), [], 'rien à vérifier');
});

test('un lien mort dans la DEUXIÈME carte est détecté', () => {
  const rendered = renderWith({ related: [
    nb('/blog/tva/1.html', 'Un', '2026-01-01', 0),
    nb('/blog/tva/2.html', 'Deux', '2026-01-02', 1),
    nb('/blog/tva/3.html', 'Trois', '2026-01-03', 2)
  ] });
  ok(rendered.ok, 'rendu accepté');

  // Dépôt SANS la 3e carte : la grille en contient une, le dépôt non.
  const ref = call(ctx, 'verifyFooterBlockLinks', rendered.html, {
    exists: (p) => p !== 'blog/tva/3.html'
  });
  notOk(ref.ok, 'publication refusée');
  includes(ref.error, '3.html', 'le lien mort est nommé dans le message');
});

test('un lien mort dans la navigation est détecté', () => {
  const rendered = renderWith({ related: NEIGHBOURS, previous: NEIGHBOURS[1], next: NEIGHBOURS[0] });
  ok(rendered.ok, 'rendu accepté');
  const ref = call(ctx, 'verifyFooterBlockLinks', rendered.html, {
    exists: (p) => p !== 'blog/tva/ancien.html'
  });
  notOk(ref.ok, 'publication refusée');
  includes(ref.error, 'ancien.html', 'le lien mort est nommé');
});

test('tous les liens présents → aucune objection', () => {
  const rendered = renderWith({ related: NEIGHBOURS, previous: NEIGHBOURS[1], next: NEIGHBOURS[0] });
  ok(rendered.ok, 'rendu accepté');
  const seen = [];
  const ref = call(ctx, 'verifyFooterBlockLinks', rendered.html, {
    exists: (p) => { seen.push(p); return true; }
  });
  ok(ref.ok, 'aucun lien mort');
  // 2 cartes + 2 voisins, mais les voisins SONT les cartes : un seul passage
  // par chemin, donc 2 vérifications et non 4.
  eqList(seen, ['blog/tva/ancien.html', 'blog/tva/recent.html'], 'chaque lien unique vérifié une fois');
});

test('une grille mal fermée est refusée plutôt que d\'être analysée à moitié', () => {
  let thrown = null;
  try {
    call(ctx, 'extractFooterBlockLinks', '<div class="related-grid"><div class="related-card"><a href="/blog/tva/1.html">Un</a></div>');
  } catch (e) {
    thrown = e;
  }
  ok(thrown !== null, 'une erreur est levée, pas un silence');
  includes(thrown.message, 'related-grid', 'le bloc fautif est nommé');
});

/* -------------------------------------------------------------------------- */

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write('ECHEC : ' + failures.length + ' test(s) en échec, ' + passed + ' réussi(s)\n');
  failures.forEach((f) => process.stdout.write('  [' + f.suite + '] ' + f.name + '\n    ' + f.message + '\n'));
  process.exit(1);
}
process.stdout.write('OK : ' + passed + ' tests réussis (Voisinage)\n');
