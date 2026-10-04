/**
 * INVOOFFICE — Tests du moteur de publication (Publisher.gs)
 * ---------------------------------------------------------------------------
 * Exécution : `npm run test:apps-script`
 *
 * AUCUN réseau, AUCUNE écriture GitHub réelle, AUCUN vrai tableur : toutes les
 * réponses HTTP sont mockées route par route et toute route non déclarée fait
 * échouer le test. Le gabarit réel (`blog/template-article.html`) est lu tel
 * quel depuis le dépôt (D3) — aucune copie, aucune fixture.
 *
 * Ces tests prouvent le comportement OBSERVABLE :
 *   - la ligne sélectionnée / le prochain READY sont bien choisis ;
 *   - le verrou est acquired en tryLock et relâché même en cas d'échec ;
 *   - les transitions READY → PUBLISHING → PUBLISHED | ERROR sont observées ;
 *   - TEST_MODE et GITHUB_WRITE_ENABLED bloquent TOUTE écriture ;
 *   - 404 → create, fichier présent → update avec SHA, 409 → re-read + retry ;
 *   - 422 / 401 / 403 deviennent ERROR avec message, jamais PUBLISHED ;
 *   - 429 / 500 / 502 / 503 sont retentés (et seulement eux) ;
 *   - republier un contenu identique ne crée aucun nouveau commit.
 */

const fs = require('fs');
const path = require('path');

const {
  createContext,
  call,
  articlesSheet,
  configSheet,
  logsSheet,
  makeFetchMock,
  makeRepoMock,
  makeGitMock,
  contentsResponse,
  putResponse,
  articleListItem,
  indexPageFixture,
  sitemapFixture
} = require('./harness.cjs');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE_PATH = path.join(REPO_ROOT, 'blog', 'template-article.html');
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');

const TEMPLATE_ROUTE = '/contents/blog/template-article.html';
const ARTICLE_PATH = 'blog/tva/article-de-test.html';
const ARTICLE_ROUTE = '/contents/' + ARTICLE_PATH;
const TOKEN = 'ghp_test0000000000000000000000000000';

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

function includes(list, value, label) {
  if (list.indexOf(value) === -1) {
    throw new Error((label || 'liste') + ' : ' + JSON.stringify(value) +
      ' absent de ' + JSON.stringify(list));
  }
}

/** Comparaison structurelle : `eq` compare des références, pas des tableaux. */
function eqList(actual, expected, label) {
  eq(JSON.stringify(actual), JSON.stringify(expected), label);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeArticle(overrides) {
  return Object.assign({
    ID: 'A-1',
    TITLE: 'Facture TVA : le guide complet',
    KEYWORD: 'facturation',
    CONTENT:
      '<h2 id="alpha">Déclaration de TVA</h2>\n' +
      '<p>La TVA se déclare chaque mois, en sixteen lignes.</p>\n' +
      '<h2 id="beta">Erreurs fréquentes</h2>\n' +
      '<ul><li>Oublier le taux réduit</li><li>Confondre HT et TTC</li></ul>',
    CATEGORY: 'TVA Maroc',
    SLUG: 'article-de-test',
    SEO_TITLE: 'Facture TVA',
    META_DESCRIPTION: 'Tout sur la TVA facturée au Maroc : taux, déclaration, cas particuliers.',
    IMAGE_URL: '',
    STATUS: 'READY',
    PUBLISHED_AT: '2026-07-14',
    SOCIAL_DESCRIPTION: 'Description sociale de test, distincte.',
    ARTICLE_EXCERPT: 'Extrait d’article distinct de la description.',
    CARD_EXCERPT: 'Texte de carte distinct.',
    READING_TIME: '6',
    ERROR: '',
    GITHUB_PATH: '',
    GITHUB_SHA: '',
    GITHUB_COMMIT: ''
  }, overrides || {});
}

/** Route GET du gabarit, réutilisée par tous les scénarios. */
function templateRoute(times) {
  return { method: 'get', path: TEMPLATE_ROUTE, body: contentsResponse('blog/template-article.html', TEMPLATE), times: times || 1 };
}

/* ------------------------------------------------------------------------ */
/* Fixtures des index statiques du Blog                                       */
/* ------------------------------------------------------------------------ */

const HUB_PATH = 'blog/index.html';
const SITEMAP_FILE = 'sitemap-fr.xml';
const SITE = 'https://www.invooffice.com';

/** Les 5 slug de CATEGORY_MAP, dans l'ordre de la configuration. */
const CATEGORY_SLUGS = ['auto-entrepreneur', 'devis', 'facturation', 'guides', 'tva'];
const CATEGORY_NAMES = {
  'auto-entrepreneur': 'Auto-entrepreneur',
  devis: 'Devis',
  facturation: 'Facturation',
  guides: 'Guides',
  tva: 'TVA Maroc'
};

/**
 * Chemin GitHub d'un article, via la même logique que `blogPath()` (Config.gs)
 * : `blog/<catégorie>/<slug>.html`. Le href web est ce chemin préfixé de `/`.
 */
function slugOf(article) {
  const map = {
    'Auto-entrepreneur': 'auto-entrepreneur',
    Devis: 'devis',
    Facturation: 'facturation',
    Guides: 'guides',
    'TVA Maroc': 'tva'
  };
  return 'blog/' + map[article.CATEGORY] + '/' + article.SLUG;
}

/** Date « 14 juillet 2026 » : évite de duplic frenchDate() dans les fixtures. */
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function frenchDateOf(article) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(article.PUBLISHED_AT || ''));
  return m ? parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1] : '';
}

/** Extrait d'une ligne `.article-list` d'une page d'index. */
function listItems(html) {
  return String(html).match(/<li class="article-item">[\s\S]*?<\/li>/g) || [];
}

/** Compteur affiché pour un slug dans le `.cat-grid` du hub. */
function hubCount(html, slug) {
  const i = String(html).indexOf('<div class="cat-card"><a href="/blog/' + slug + '/">');
  if (i === -1) return null;
  const m = /<div class="count">([^<]*)<\/div>/.exec(String(html).slice(i));
  return m ? m[1] : null;
}

/** <loc> présents dans un sitemap. */
function sitemapLocs(xml) {
  return (String(xml).match(/<loc>[^<]*<\/loc>/g) || []).map((l) => l.replace(/<\/?loc>/g, ''));
}

/**
 * Dépôt mocké des 7 fichiers d'index.
 *
 * Par défaut les index sont DÉJÀ réconciliés pour les articles sous test : les
 * tests historiques publient donc tous contre des index corrects, ce qui
 * exerce l'idempotence sur toute la suite (0 écriture d'index attendue).
 *
 * `includeArticle: false` reproduit un index EN RETARD (article absent de la
 * catégorie, du hub et du sitemap) : c'est le cas du bug à couvrir.
 * `omit: [chemin]` retire en plus un fichier du dépôt (index manquant).
 * `hubLimit: n` tronque la liste « Derniers articles » du hub à n entrées,
 * comme en production où le hub montre une sélection (6 sur 9) alors que les
 * index de catégorie, eux, sont exhaustifs.
 *
 * Les articles marqués `__seeded` représentent les 9 articles de production
 * déjà listés ; ils ne sont retirés par `includeArticle: false`.
 */
function indexRepo(articles, options) {
  const o = options || {};
  const list = (Array.isArray(articles) ? articles : [articles]).filter(Boolean);
  const omit = o.omit || [];

  // Ce qui est DÉJÀ dans les index : les seeds, plus l'article sous test sauf
  // si l'on simule un index en retard.
  const indexed = list.filter((a) => a.__seeded || o.includeArticle !== false);
  const files = [];
  const locs = [SITE + '/', SITE + '/blog/'];

  // Le dépôt mocké contient AUSSI les fichiers des articles DÉJÀ PUBLIÉS, c'est-à-dire
  // de tous les articles listés dans les index SAUF celui en cours de publication.
  // Le contrôle de liens morts du Publisher (`verifyFooterBlockLinks`) exige
  // qu'un index ne puisse pointer que vers un fichier RÉELLEMENT présent : sans
  // ces fichiers, la fixture produirait des liens morts et toute publication
  // serait refusée. La cible est volontairement ABSENTE du dépôt — c'est ce qui
  // exerce le chemin de création (404) plutôt que celui de mise à jour.
  const targetId = o.targetId !== undefined && o.targetId !== null
    ? o.targetId
    : (o.activeCellRow !== undefined && o.activeCellRow !== null
      ? (list[o.activeCellRow - 2] || {}).ID
      : undefined);
  indexed.filter((a) => a.ID !== targetId).forEach((a) => {
    files.push({
      path: slugOf(a) + '.html',
      content: '<!DOCTYPE html><html lang="fr"><head><title>' + a.TITLE +
        '</title></head><body><p>Article deja publie.</p></body></html>'
    });
  });

  const itemsFor = (predicate, withCategory) => indexed
    .filter(predicate)
    .map((a) => ({
      meta: (withCategory ? a.CATEGORY + ' · ' : '') +
        frenchDateOf(a) + ' · ' + a.READING_TIME + ' min',
      href: '/' + slugOf(a) + '.html',
      title: a.TITLE,
      excerpt: a.ARTICLE_EXCERPT
    }));

  const cards = [];
  CATEGORY_SLUGS.forEach((slug) => {
    const items = itemsFor((a) => slugOf(a).indexOf('blog/' + slug + '/') === 0, false);
    files.push({ path: 'blog/' + slug + '/index.html', content: indexPageFixture({ items: items }) });
    locs.push(SITE + '/blog/' + slug + '/');
    cards.push({ slug: slug, name: CATEGORY_NAMES[slug], count: items.length + (items.length > 1 ? ' articles' : ' article') });
  });

  // Le hub ne montre qu'une SÉLECTION d'articles : son nombre d'entrées n'a
  // aucun rapport avec le nombre d'articles d'une catégorie.
  let hubItems = itemsFor(() => true, true);
  if (o.hubLimit !== undefined && o.hubLimit !== null) {
    hubItems = hubItems.slice(-Math.max(0, o.hubLimit));
  }
  files.push({
    path: HUB_PATH,
    content: indexPageFixture({ title: 'Blog', cards: cards, items: hubItems })
  });

  indexed.forEach((a) => locs.push(SITE + '/' + slugOf(a) + '.html'));
  files.push({ path: SITEMAP_FILE, content: sitemapFixture(locs) });
  return files.filter((f) => omit.indexOf(f.path) === -1);
}

/**
 * Copie l'étatcourant du dépôt mocké, pour rejouer une publication dans un
 * contexte neuf qui repart de l'état réellement atteint.
 */
function repoSnapshot(fetchMock) {
  return INDEX_FILES.map((p) => ({ path: p, content: fetchMock.file(p) })).filter((f) => f.content !== null);
}

const INDEX_FILES = CATEGORY_SLUGS.map((s) => 'blog/' + s + '/index.html')
  .concat([HUB_PATH, SITEMAP_FILE]);

/**
 * Construit un contexte complet.
 *
 * Le dépôt mocké sert les 7 fichiers d'index (5 catégories, hub, sitemap) dans
 * un état DÉJÀ réconcilié : la réconciliation ne doit donc produire aucune
 * écriture dans les scénarios historiques. `indexes: false` retire ces routes
 * (utile pour observer un refus réseau sur les index) et
 * `indexes: { includeArticle: false }` simule un index en retard.
 *
 * @param {{articles?:Array, config?:Object, props?:Object, routes?:Array,
 *          lockAvailable?:boolean, activeCell?:Object, sheets?:Object,
 *          indexes?:boolean|Object, fetchOptions?:Object}} [opt]
 */
function setup(opt) {
  const o = opt || {};
  const articles = o.articles || [makeArticle()];
  const repoOptions = o.indexes === undefined ? {} : o.indexes;
  const withIndexes = o.indexes !== false;

  const baseFetch = makeFetchMock(o.routes || [templateRoute()]);
  const files = o.indexFiles || indexRepo(articles, Object.assign({}, repoOptions, {
    targetId: o.targetId,
    activeCellRow: o.activeCell ? o.activeCell.row : null
  }));
  const fetchMock = withIndexes
    ? makeGitMock(files, o.routes || [templateRoute()], o.fetchOptions)
    : baseFetch;

  const sheets = o.sheets === null ? {} : Object.assign({
    Articles: articlesSheet(articles),
    Logs: logsSheet()
  }, o.config === null ? {} : { Config: configSheet(o.config === undefined ? { TEST_MODE: 'FALSE' } : o.config) },
    o.sheets || {});

  const props = Object.assign({ GITHUB_TOKEN: TOKEN, GITHUB_WRITE_ENABLED: 'TRUE' }, o.props || {});

  const created = createContext({
    sheets: sheets,
    properties: props,
    fetchImpl: fetchMock,
    lockAvailable: o.lockAvailable,
    activeCell: o.activeCell
  });

  return {
    ctx: created.ctx,
    sheets: created.helpers.sheets,
    props: created.helpers.props,
    lock: created.helpers.lock,
    sleeps: created.helpers.sleeps,
    ui: created.helpers.ui,
    fetch: fetchMock,
    base: baseFetch
  };
}

/** Ligne `Articles` lue depuis la feuille (état réel, pas la fixture). */
function row(ctx, id) {
  return call(ctx, 'findArticleById', id);
}

function status(ctx, id) {
  return row(ctx, id).STATUS;
}

function logRows(sheets) {
  return sheets.Logs._rows;
}

function logMessages(sheets) {
  return logRows(sheets).map((r) => r[7]);
}

/* ========================================================================== */
suite('Sélection');
/* ========================================================================== */

test('la ligne sélectionnée est publiée (nominal)', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-new', 'commit-new'), times: Infinity }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat : ' + JSON.stringify(result.code) + ' ' + result.message);
  eq(result.code, 'PUBLISHED', 'code');
  eq(result.status, 'PUBLISHED', 'statut final');
  eq(status(s.ctx, 'A-1'), 'PUBLISHED', 'statut en feuille');
  eq(row(s.ctx, 'A-1').GITHUB_PATH, ARTICLE_PATH, 'GITHUB_PATH');
  eq(row(s.ctx, 'A-1').GITHUB_SHA, 'sha-new', 'GITHUB_SHA');
  eq(row(s.ctx, 'A-1').GITHUB_COMMIT, 'commit-new', 'GITHUB_COMMIT');
  eq(row(s.ctx, 'A-1').ERROR, '', 'ERROR vidé');
  eq(row(s.ctx, 'A-1').PUBLISHED_AT, '2026-07-14', 'PUBLISHED_AT préservé');
});

test('ligne sélectionnée vide : aucune action, aucun write', () => {
  const s = setup({ activeCell: { row: 1 }, routes: [] });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'NO_SELECTION', 'code');
  eq(status(s.ctx, 'A-1'), 'READY', 'statut inchangé');
  eq(s.fetch.calls.length, 0, 'aucun appel HTTP');
  eq(s.lock.log.length, 0, 'aucun verrou tentative');
});

test('ligne sélectionnée sans ligne Articles : refus explicite', () => {
  const s = setup({ activeCell: { row: 2 }, routes: [], sheets: { Articles: null } });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'NO_SELECTION', 'code');
  eq(s.fetch.calls.length, 0, 'aucun appel HTTP');
});

test('le prochain READY est choisi, pas les autres', () => {
  const s = setup({
    articles: [
      makeArticle({ ID: 'A-1', STATUS: 'DRAFT', SLUG: 'premier' }),
      makeArticle({ ID: 'A-2', STATUS: 'READY', SLUG: 'deuxieme' }),
      makeArticle({ ID: 'A-3', STATUS: 'READY', SLUG: 'troisieme' })
    ],
    routes: [
      templateRoute(),
      { method: 'get', path: '/contents/blog/tva/deuxieme.html', code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: '/contents/blog/tva/deuxieme.html', body: putResponse('blog/tva/deuxieme.html', 'x', 's', 'c') }
    ]
  });
  const result = call(s.ctx, 'publishNextReadyArticle');
  ok(result.ok, 'résultat : ' + result.message);
  eq(result.articleId, 'A-2', 'article traité');
  eq(result.remaining, 1, 'READY restants signalés');
  eq(status(s.ctx, 'A-1'), 'DRAFT', 'A-1 non traité');
  eq(status(s.ctx, 'A-3'), 'READY', 'A-3 non traité');
  const puts = s.fetch.calls.filter((c) => c.method === 'put');
  eq(puts.length, 1, 'un seul PUT');
});

test('aucun READY : refus sans write', () => {
  const s = setup({ articles: [makeArticle({ STATUS: 'PUBLISHED' })], routes: [] });
  const result = call(s.ctx, 'publishNextReadyArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'NO_READY', 'code');
  eq(s.fetch.calls.length, 0, 'aucun appel HTTP');
});

/* ========================================================================== */
suite('Verrou');
/* ========================================================================== */

test('verrou déjà pris : refus immédiat, aucun write, statut intact', () => {
  const s = setup({
    lockAvailable: false,
    activeCell: { row: 2 },
    routes: []
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'LOCKED', 'code');
  includes(s.lock.log, 'tryLock:1000', 'verrou tenté en tryLock');
  eq(s.fetch.calls.length, 0, 'aucun appel HTTP');
  eq(status(s.ctx, 'A-1'), 'READY', 'statut inchangé');
});

test('le verrou est relâché après un succès', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 's', 'c') }
    ]
  });
  call(s.ctx, 'publishSelectedArticle');
  includes(s.lock.log, 'releaseLock', 'verrou relâché');
  notOk(s.lock.held, 'verrou libéré');
});

test('le verrou est relâché même après un échec GitHub', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 422, body: { message: 'Invalid request' } }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  includes(s.lock.log, 'releaseLock', 'verrou relâché');
  notOk(s.lock.held, 'verrou libéré');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut ERROR');
});

/* ========================================================================== */
suite('Transitions refusées');
/* ========================================================================== */

['PUBLISHED', 'PUBLISHING', 'ERROR'].forEach((st) => {
  test('statut ' + st + ' : republication refusée sans write', () => {
    const s = setup({
      articles: [makeArticle({ STATUS: st })],
      activeCell: { row: 2 },
      routes: []
    });
    const result = call(s.ctx, 'publishSelectedArticle');
    notOk(result.ok, 'résultat');
    eq(result.code, 'REPUBLISH_BLOCKED', 'code');
    eq(status(s.ctx, 'A-1'), st, 'statut inchangé');
    eq(s.fetch.calls.length, 0, 'aucun appel HTTP');
  });
});

/* ========================================================================== */
suite('Rendu et validation');
/* ========================================================================== */

test('gabarit introuvable : ERROR + message, aucun write', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [{ method: 'get', path: TEMPLATE_ROUTE, code: 404, body: { message: 'Not Found' } }]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'TEMPLATE', 'code');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut');
  ok(row(s.ctx, 'A-1').ERROR.length > 0, 'ERROR renseigné');
  assertReadOnly(s, 'échec gabarit');
  eq(templateWasRead(s), 1, 'le gabarit a bien été lu');
});

test('rendu en échec : ERROR + codes du moteur', () => {
  const s = setup({
    articles: [makeArticle({ CONTENT: '' })],
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'RENDER', 'code');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut');
  includes(row(s.ctx, 'A-1').ERROR, 'V5', 'code V5 (CONTENT) reported');
  assertReadOnly(s, 'échec de rendu');
});

test('validation de production : un lien mort dans le corps bloque la publication', () => {
  const s = setup({
    articles: [makeArticle({ CONTENT: '<h2 id="alpha">A</h2><a href="#fantome">lien mort</a>' })],
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'RENDER', 'code');
  includes(row(s.ctx, 'A-1').ERROR, 'V9', 'code V9 (ancre morte) reported');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut');
});

test('catégorie inconnue : ERROR avant tout accès GitHub du fichier', () => {
  const s = setup({
    articles: [makeArticle({ CATEGORY: 'Rubrique Fantôme' })],
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'RENDER', 'code');
  includes(row(s.ctx, 'A-1').ERROR, 'V3', 'code V3 (catégorie) reported');
});

test('READING_TIME absent : ERROR (le temps de lecture est éditorial, jamais calculé)', () => {
  const s = setup({
    articles: [makeArticle({ READING_TIME: '' })],
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'RENDER', 'code');
  includes(row(s.ctx, 'A-1').ERROR, 'R3b', 'code R3b (temps de lecture)');
  assertReadOnly(s, 'temps de lecture absent');
});

test('PUBLISHED_AT vide : la date du jour est posée au format attendu par le moteur', () => {
  const s = setup({
    articles: [makeArticle({ PUBLISHED_AT: '' })],
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 's', 'c') }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat : ' + result.message);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(row(s.ctx, 'A-1').PUBLISHED_AT),
    'PUBLISHED_AT au format YYYY-MM-DD, obtenu ' + row(s.ctx, 'A-1').PUBLISHED_AT);
});

test('le pipeline passe par PUBLISHING (transition observée)', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 's', 'c') }
    ]
  });
  const seen = [];
  const original = s.ctx.updateArticleFields;
  s.ctx.updateArticleFields = function (id, fields) {
    seen.push(id + ':' + fields.STATUS);
    return original.call(s.ctx, id, fields);
  };
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat');
  eq(seen[0], 'A-1:PUBLISHING', 'première transition');
  eq(seen[seen.length - 1], 'A-1:PUBLISHED', 'transition finale');
});

/* ========================================================================== */
suite('Verrous d\'écriture');
/* ========================================================================== */

test('TEST_MODE=TRUE : rendu et validation exécutés, AUCUNE écriture', () => {
  const s = setup({
    config: { TEST_MODE: 'TRUE' },
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'TEST_MODE', 'code');
  ok(result.testMode, 'indicateur mode test');
  ok(result.validation && result.validation.ok, 'la validation de production a bien tourné');
  assertReadOnly(s, 'mode test');
  eq(templateWasRead(s), 1, 'le gabarit a été lu');
  eq(status(s.ctx, 'A-1'), 'READY', 'statut restauré (publiable)');
  eq(row(s.ctx, 'A-1').ERROR, '', 'ERROR vide');
});

test('GITHUB_WRITE_ENABLED=FALSE : refus, aucun write', () => {
  const s = setup({
    props: { GITHUB_WRITE_ENABLED: 'FALSE' },
    config: { TEST_MODE: 'FALSE' },
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'WRITES_DISABLED', 'code');
  assertReadOnly(s, 'écritures désactivées');
  eq(status(s.ctx, 'A-1'), 'READY', 'statut restauré');
});

test('Config absente : refus fermé (fail closed)', () => {
  const s = setup({
    config: null,
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  notOk(s.sheets.Config, 'aucune feuille Config');
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'GATE', 'code');
  assertReadOnly(s, 'config absente');
  eq(status(s.ctx, 'A-1'), 'READY', 'statut restauré');
});

test('TEST_MODE reste TRUE après une publication refusée', () => {
  const s = setup({
    config: { TEST_MODE: 'TRUE' },
    activeCell: { row: 2 },
    routes: [templateRoute()]
  });
  call(s.ctx, 'publishSelectedArticle');
  eq(call(s.ctx, 'getConfigBoolean', 'TEST_MODE'), true, 'TEST_MODE inchangé');
  eq(call(s.ctx, 'writesEnabled'), true, 'le verrou d\'écriture n\'a pas été touché');
});

/* ========================================================================== */
suite('Contents API');
/* ========================================================================== */

test('404 sur la cible : création avec message de commit déterministe', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-create', 'commit-create') }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat : ' + result.message);

  const put = s.fetch.calls.filter((c) => c.method === 'put')[0];
  ok(put, 'PUT émis');
  const payload = JSON.parse(put.payload);
  eq(payload.message, 'Publication : article-de-test', 'message de commit');
  notOk('sha' in payload, 'aucun SHA sur une création');
  const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
  includes(decoded, 'index, follow', 'robots basculés en production');
  includes(decoded, 'Facture TVA', 'titre injecté');
  notOk(decoded.indexOf('{{') !== -1, 'aucun placeholder résiduel');
  eq(result.githubCommit, 'commit-create', 'commit tracé');
});

test('fichier déjà présent : mise à jour avec le SHA distant', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, body: contentsResponse(ARTICLE_PATH, 'ancien contenu', 'sha-ancien') },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-nouveau', 'commit-update') }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat : ' + result.message);
  const put = s.fetch.calls.filter((c) => c.method === 'put')[0];
  const payload = JSON.parse(put.payload);
  eq(payload.sha, 'sha-ancien', 'SHA envoyé pour l\'update');
  eq(result.githubSha, 'sha-nouveau', 'SHA retourné conservé');
  eq(row(s.ctx, 'A-1').GITHUB_SHA, 'sha-nouveau', 'GITHUB_SHA en feuille');
});

test('409 : relecture du SHA puis retry borné', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, body: contentsResponse(ARTICLE_PATH, 'v1', 'sha-v1') },
      { method: 'put', path: ARTICLE_ROUTE, code: 409, body: { message: 'is at ... but expected ...' } },
      { method: 'get', path: ARTICLE_ROUTE, body: contentsResponse(ARTICLE_PATH, 'v2', 'sha-v2') },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-v3', 'commit-v3') }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat : ' + result.message);
  const puts = s.fetch.calls.filter((c) => c.method === 'put');
  eq(puts.length, 2, 'deux PUT (conflit + retry)');
  eq(JSON.parse(puts[0].payload).sha, 'sha-v1', '1er PUT : SHA initial');
  eq(JSON.parse(puts[1].payload).sha, 'sha-v2', '2e PUT : SHA relu');
  eq(result.githubSha, 'sha-v3', 'SHA final');
  ok(result.retried, 'retry signalé dans le résultat');
});

test('422 : ERROR avec message, jamais PUBLISHED', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 422, body: { message: 'Invalid request' } }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'GITHUB', 'code');
  eq(result.status, 'ERROR', 'statut retourné');
  includes(row(s.ctx, 'A-1').ERROR, '422', 'code HTTP dans le message');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut en feuille');
  eq(row(s.ctx, 'A-1').GITHUB_SHA, '', 'aucun SHA inventé');
});

test('401 : refus explicite token absent ou expiré', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 401, body: { message: 'Bad credentials' } }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  includes(row(s.ctx, 'A-1').ERROR, '401', 'code HTTP');
  includes(row(s.ctx, 'A-1').ERROR, 'token', 'cause.token évoquée');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut');
});

test('403 : permission insuffisante refusée', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 403, body: { message: 'Forbidden' } }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  includes(row(s.ctx, 'A-1').ERROR, '403', 'code HTTP');
});

test('le token n\'apparaît jamais dans les journaux', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 's', 'c') }
    ]
  });
  call(s.ctx, 'publishSelectedArticle');
  const dump = JSON.stringify(logRows(s.sheets));
  notOk(dump.indexOf(TOKEN) !== -1, 'token absent des logs');
});

test('un token glissé dans une erreur GitHub est expurgé avant écriture en feuille', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 422, body: { message: 'clé ' + TOKEN + ' rejetée' } }
    ]
  });
  call(s.ctx, 'publishSelectedArticle');
  notOk(row(s.ctx, 'A-1').ERROR.indexOf(TOKEN) !== -1, 'token expurgé de la colonne ERROR');
  notOk(JSON.stringify(logRows(s.sheets)).indexOf(TOKEN) !== -1, 'token expurgé des logs');
});

test('assertWritesAllowed reste le point d\'entrée unique : appel direct refusé en mode test', () => {
  const s = setup({ config: { TEST_MODE: 'TRUE' }, routes: [] });
  let thrown = null;
  try {
    call(s.ctx, 'createOrUpdateFile', { path: ARTICLE_PATH, content: 'x', message: 'contournement' });
  } catch (e) {
    thrown = e;
  }
  ok(thrown, 'createOrUpdateFile refuse l\'écriture');
  eq(thrown.message, 'TEST_MODE=TRUE : aucune écriture GitHub n\'est effectuée.', 'message du verrou');
  eq(s.fetch.calls.length, 0, 'aucun appel HTTP, le verrou tranche avant');
});

/* ========================================================================== */
suite('Retries');
/* ========================================================================== */

[429, 500, 502, 503].forEach((code) => {
  test('HTTP ' + code + ' : retenté puis publication réussie', () => {
    const s = setup({
      config: { TEST_MODE: 'FALSE', MAX_RETRIES: '3' },
      activeCell: { row: 2 },
      routes: [
        templateRoute(),
        { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
        { method: 'put', path: ARTICLE_ROUTE, code: code, body: { message: 'transitoire' } },
        { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-ok', 'commit-ok') }
      ]
    });
    const result = call(s.ctx, 'publishSelectedArticle');
    ok(result.ok, 'résultat : ' + result.message);
    eq(s.fetch.calls.filter((c) => c.method === 'put').length, 2, 'PUT retenté une fois');
    ok(s.sleeps.length > 0, 'attente entre les tentatives');
  });
});

test('retries épuisés : la réponse est rendue à l\'appelant', () => {
  const s = setup({
    config: { TEST_MODE: 'FALSE', MAX_RETRIES: '1' },
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 503, body: { message: 'Service unavailable' }, times: Infinity }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'GITHUB', 'code');
  includes(row(s.ctx, 'A-1').ERROR, '503', 'code HTTP final');
  eq(s.fetch.calls.filter((c) => c.method === 'put').length, 2, '1 tentative + 1 retry');
});

test('422 n\'est jamais retenté (échec permanent)', () => {
  const s = setup({
    config: { TEST_MODE: 'FALSE', MAX_RETRIES: '3' },
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, code: 422, body: { message: 'Invalid request' }, times: Infinity }
    ]
  });
  call(s.ctx, 'publishSelectedArticle');
  eq(s.fetch.calls.filter((c) => c.method === 'put').length, 1, 'un seul PUT');
});

/* ========================================================================== */
suite('Idempotence');
/* ========================================================================== */

/** Rend le HTML exact produit par une publication (via la charge utile PUT). */
function publishedHtml(s) {
  const put = s.fetch.calls.filter((c) => c.method === 'put')[0];
  return Buffer.from(JSON.parse(put.payload).content, 'base64').toString('utf8');
}

const WRITE_ROUTES = [
  templateRoute(),
  { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
  { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-first', 'commit-first') }
];

test('republier un contenu identique ne crée aucun nouveau commit', () => {
  const first = setup({ activeCell: { row: 2 }, routes: WRITE_ROUTES });
  const r1 = call(first.ctx, 'publishSelectedArticle');
  ok(r1.ok, 'première publication : ' + r1.message);
  const html = publishedHtml(first);

  // L'opérateur repasse la ligne en READY, comme documenté.
  call(first.ctx, 'updateArticleFields', 'A-1', { STATUS: 'READY' });

  const second = setup({
    activeCell: { row: 2 },
    articles: [makeArticle({ STATUS: 'READY', GITHUB_PATH: ARTICLE_PATH, GITHUB_SHA: 'sha-first', GITHUB_COMMIT: 'commit-first' })],
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, body: contentsResponse(ARTICLE_PATH, html, 'sha-first'), times: Infinity }
    ]
  });
  const r2 = call(second.ctx, 'publishSelectedArticle');
  ok(r2.ok, 'deuxième publication : ' + r2.message);
  eq(r2.code, 'UNCHANGED', 'code');
  eq(second.fetch.calls.filter((c) => c.method === 'put').length, 0, 'aucun PUT');
  eq(r2.githubSha, 'sha-first', 'SHA distant réutilisé');
  eq(status(second.ctx, 'A-1'), 'PUBLISHED', 'statut PUBLISHED');
  eq(row(second.ctx, 'A-1').GITHUB_COMMIT, 'commit-first', 'commit historique préservé');
});

test('un contenu différent déclenche bien un nouvel update', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, body: contentsResponse(ARTICLE_PATH, 'contenu différent', 'sha-v1') },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-v2', 'commit-v2') }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat');
  eq(result.code, 'PUBLISHED', 'code');
  eq(s.fetch.calls.filter((c) => c.method === 'put').length, 1, 'un PUT émis');
});

test('deux exécutions en mode test ne produisent aucun write', () => {
  const s = setup({
    config: { TEST_MODE: 'TRUE' },
    activeCell: { row: 2 },
    routes: [templateRoute(2)]
  });
  call(s.ctx, 'publishSelectedArticle');
  const r2 = call(s.ctx, 'publishSelectedArticle');
  eq(r2.code, 'TEST_MODE', 'deuxième passage toujours refusé');
  assertReadOnly(s, 'deuxième passage');
  eq(templateWasRead(s), 2, 'chaque passage a lu le gabarit');
  eq(status(s.ctx, 'A-1'), 'READY', 'statut toujours publiable');
});

/* ========================================================================== */
suite('Intégrité et menu');
/* ========================================================================== */

test('TEST_MODE est TRUE par défaut dans la configuration', () => {
  eq(call(createContext({}).ctx, 'getConfigBoolean', 'TEST_MODE'), true, 'défaut sûr');
});

test('les deux entrées de publication sont au menu, après la validation', () => {
  const s = setup();
  call(s.ctx, 'onOpen');
  const labels = s.ui.items.map((i) => i.label);
  const iValidate = labels.indexOf('✅ Valider les articles');
  const iSelected = labels.indexOf('🚀 Publier l\'article sélectionné');
  const iNext = labels.indexOf('🚀 Publier le prochain article READY');
  ok(iSelected !== -1, 'entrée « article sélectionné » présente');
  ok(iNext !== -1, 'entrée « prochain READY » présente');
  ok(iValidate < iSelected && iSelected < iNext, 'ordre : validation, sélectionné, prochain');
  eq(s.ui.items[iSelected].fn, 'publishSelectedArticle', 'callback');
  eq(s.ui.items[iNext].fn, 'publishNextReadyArticle', 'callback');
});

test('aucune entrée de scheduler ni de publication par lot', () => {
  const s = setup();
  call(s.ctx, 'onOpen');
  const items = s.ui.items.filter((i) => i.fn);

  // Un MOTEUR de planification reste interdit : aucune entree de menu, hormis
  // le dialogue de configuration, ne doit pointer vers un scheduler, une
  // publication par lot, une activation automatique ou un declencheur.
  const CONFIG_DIALOG = 'openSchedulerConfigDialog';
  items.forEach((i) => {
    if (i.fn === CONFIG_DIALOG) return;
    notOk(
      /schedul|cron|autopubl|batch|runall|publishtall|trigger/i.test(i.fn),
      'aucun moteur dans ' + i.fn
    );
  });

  // Seule entree de planification admise : le dialogue de CONFIGURATION
  // valide par le Product Owner, qui ne cree aucun declencheur (prouve
  // par scheduler.test.cjs : ScriptApp reste vide).
  const planning = items.filter((i) => /planifi|schedul|cron/i.test(i.label + ' ' + i.fn));
  eq(planning.length, 1, 'une seule entree de planification');
  eq(planning[0].fn, CONFIG_DIALOG, 'dialogue de configuration');
});

test('les actions de menu historiques restent câblées', () => {
  const s = setup();
  call(s.ctx, 'onOpen');
  const fns = s.ui.items.map((i) => i.fn).filter(Boolean);
  ['menuConfiguration', 'menuBootstrapSheets', 'menuTestGithub', 'menuCheckTemplate',
    'menuValidateArticles', 'publishSelectedArticle', 'publishNextReadyArticle',
    'menuShowErrors'].forEach((fn) => {
    includes(fns, fn, 'entrée ' + fn);
  });
});

test('une route HTTP non mockée n\'est jamais contournée par un appel réel', () => {
  const s = setup({ activeCell: { row: 2 }, routes: [templateRoute(1)] });
  // Seule la lecture du gabarit est mockée : toute autre route fait échouer le
  // mock, ce qui devient une erreur de transport pour httpRequest. Le
  // Publisher doit alors reporter l'article en ERROR, sans rien publier.
  const result = call(s.ctx, 'publishSelectedArticle');
  notOk(result.ok, 'résultat');
  eq(result.code, 'GITHUB', 'la lecture de la cible échoue');
  includes(row(s.ctx, 'A-1').ERROR, 'Transport', 'erreur de transport remontée');
  eq(status(s.ctx, 'A-1'), 'ERROR', 'statut');
  eq(s.fetch.calls.filter((c) => c.method === 'put').length, 0, 'aucun PUT');
  ok(s.fetch.calls.length > 2, 'le mock a bien intercepté la route absente : ' + s.fetch.calls.length + ' appels');
});

test('le compte rendu opérateur reste lisible et sans secret', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-x', 'commit-x') }
    ]
  });
  const result = call(s.ctx, 'publishSelectedArticle');
  const report = call(s.ctx, 'formatPublishReport', result);
  includes(report, 'RÉUSSIE', 'en-tête');
  includes(report, ARTICLE_PATH, 'chemin du fichier');
  includes(report, 'https://www.invooffice.com/blog/tva/article-de-test.html', 'URL publique');
  notOk(report.indexOf(TOKEN) !== -1, 'aucun token dans le compte rendu');
  eq(s.ui.alerts.length, 1, 'une alerte émise');
});

test('les logs de publication sont structurés', () => {
  const s = setup({
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: ARTICLE_ROUTE, body: putResponse(ARTICLE_PATH, 'x', 'sha-x', 'commit-x') }
    ]
  });
  call(s.ctx, 'publishSelectedArticle');
  const actions = logRows(s.sheets).map((r) => r[2]);
  includes(actions, 'publish', 'action publish journalisée');
  const success = logRows(s.sheets).filter((r) => r[1] === 'SUCCESS');
  ok(success.length >= 1, 'un niveau SUCCESS');
  ok(logMessages(s.sheets).length >= 1, 'messages présents');
});

/* ========================================================================== */
/* REGRESSION — « html.replace is not a function » (TEST-001)                  */
/* ========================================================================== */

suite('Régression TEST-001 (html.replace)');

/**
 * Cause racine : decodeContentResponse() livrait le retour brut de
 * Utilities.base64Decode(), qui est un Byte[] (tableau d'octets signes) et non
 * une String. validateTemplate() Receiving alors un tableau :
 *   - html.length          -> longueur en OCTETS  (faux, silencieux)
 *   - html.indexOf('{{…}}')-> Array#indexOf       -> -1, erreur T2 pushed
 *   - html.replace(...)    -> TypeError            -> plantage
 * D'ou l'erreur observee en TEST_MODE, avant tout appel en ecriture.
 */
test('cause racine : getFile().content est une String, pas un Byte[]', () => {
  const s = setup({ routes: [templateRoute()] });

  const file = call(s.ctx, 'getFile', 'blog/template-article.html');
  ok(file, 'fichier décodé');
  eq(typeof file.content, 'string', 'type de content');
  notOk(Array.isArray(file.content), 'ce n’est pas un tableau d’octets');
  eq(file.content, TEMPLATE, 'contenu intégralement restitué (UTF-8 exact)');
  eq(file.content.length, TEMPLATE.length, 'longueur en caractères (pas en octets)');
  includes(file.content, '{{TITLE}}', 'gabarit lisible comme du texte');
});

test('cause racine : l’UTF-8 survive au passage base64 (accents + arabe)', () => {
  const source = '<p>Facture conforme : é, è, ù, ç —，拿着发票</p>';
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  const s = setup({ routes: [templateRoute()] });

  // Réponse shaped comme celle de l'API Contents : base64 découpé par \n.
  const decoded = call(s.ctx, 'decodeContentResponse', {
    type: 'file',
    sha: 'sha-utf8',
    path: 'blog/x.html',
    size: Buffer.byteLength(source, 'utf8'),
    content: encoded.replace(/(.{20})/g, '$1\n')
  });

  eq(typeof decoded.content, 'string', 'type de content');
  eq(decoded.content, source, 'UTF-8 fidèle (aucun octet signé résiduel)');
  eq(decoded.content.length, source.length, 'longueur en caractères');
});

test('cause racine : validateTemplate() reçoit bien une String', () => {
  const s = setup({ routes: [templateRoute()] });
  const content = call(s.ctx, 'getFile', 'blog/template-article.html').content;

  // Point exact du plantage historique (Validator.gs, validateTemplate).
  const validation = call(s.ctx, 'validateTemplate', content);
  ok(validation.ok, 'gabarit valide : ' + JSON.stringify(validation.errors));
  notOk(
    validation.errors.some((e) => String(e.message).indexOf('html.replace') !== -1),
    'aucune trace de l’erreur de type'
  );
});

test('TEST-001 complet : READY + TEST_MODE, rendu et validation OK, 0 write', () => {
  const s = setup({
    articles: [makeArticle({
      ID: 'TEST-001',
      TITLE: 'Comment créer une facture conforme au Maroc',
      CATEGORY: 'Facturation',
      SLUG: 'test-facture-conforme-maroc',
      STATUS: 'READY',
      PUBLISHED_AT: ''
    })],
    // TEST_MODE seul bloque : GITHUB_WRITE_ENABLED reste TRUE, ce qui prouve
    // que le verrou produit le refus (et non unsettings manquant).
    config: { TEST_MODE: 'TRUE' },
    activeCell: { row: 2 },
    // 2 lectures du gabarit : la sonde directe ci-dessus, puis le Publisher.
    routes: [templateRoute(2)]
  });

  // 1. le Publisher reçoit bien la ligne
  const line = row(s.ctx, 'TEST-001');
  eq(line.SLUG, 'test-facture-conforme-maroc', 'slug de la ligne');
  eq(line.CATEGORY, 'Facturation', 'catégorie de la ligne');
  eq(line.STATUS, 'READY', 'statut de départ');

  // 2-5. rendu + post-traitement + validation, sans l'erreur de type.
  // Le rapport de refus n'expose volontairement PAS le HTML ; on prouve donc la
  // String à la source (renderArticleHtml) et via validation.ok, qui ne peut
  // aboutir que si le post-traitement a reçu du texte.
  const render = call(s.ctx, 'renderArticleHtml', line, {
    templateHtml: call(s.ctx, 'getFile', 'blog/template-article.html').content,
    publishedAt: '2026-09-30'
  });
  ok(render.ok, 'rendu réussi : ' + JSON.stringify(render.errors));
  eq(typeof render.html, 'string', 'renderArticleHtml renvoie une String');
  notOk(Array.isArray(render.html), 'le HTML rendu n’est pas un tableau');
  ok(render.html.indexOf('Comment créer une facture conforme au Maroc') !== -1, 'titre injecté');
  ok(call(s.ctx, 'validateRenderedHtml', render.html, {
    canonicalPath: '/blog/facturation/test-facture-conforme-maroc.html'
  }).ok, 'validateRenderedHtml accepte le rendu');

  // On ne compte que les appels du Publisher (la sonde ci-dessus en fait 1).
  const callsBefore = s.fetch.calls.length;
  const result = call(s.ctx, 'publishSelectedArticle');
  const publishCalls = s.fetch.calls.slice(callsBefore);
  notOk(String(result.message).indexOf('html.replace') !== -1, 'aucun « html.replace is not a function »');
  notOk(String(result.error || '').indexOf('html.replace') !== -1, 'aucune trace dans error');
  notOk(String(result.detail || '').indexOf('html.replace') !== -1, 'aucune trace dans detail');
  eq(result.code, 'TEST_MODE', 'refus attendu : mode test');
  ok(result.testMode, 'indicateur mode test');
  ok(result.validation && result.validation.ok, 'validation de production réussie');

  // 6. aucune écriture GitHub
  eq(publishCalls.filter((c) => c.method !== 'get').length, 0, '0 write (0 PUT/POST/PATCH/DELETE)');
  eq(s.fetch.calls.filter((c) => c.method !== 'get').length, 0, '0 write sur la session entière');
  // Le rendu exige désormais les index de catégorie (voisinage) : la sonde fait
  // donc plusieurs lectures. Seule l'ABSENCE d'écriture est un invariant ici ;
  // l'ordre exact des lectures est couvert par T8.
  eq(publishCalls.filter((c) => c.method === 'get').length, publishCalls.length, 'que des lectures');
  const firstTemplate = publishCalls.filter((c) => c.path.indexOf(TEMPLATE_ROUTE) !== -1)[0];
  ok(firstTemplate !== undefined, 'le GET du gabarit fait partie des lectures');
  ok(firstTemplate.path.indexOf('?ref=master') !== -1, 'lecture sur la branche master');
  ok(s.fetch.calls[0].path.indexOf(TEMPLATE_ROUTE) !== -1, 'la sonde a lu le même gabarit');

  // 7. aucun appel réel : toute route non mockée lève
  eq(s.fetch.calls.every((c) => c.path.indexOf('/repos/') === 0), true, 'appels limités à l’API mockée');

  // État conservé : la ligne reste publiable
  eq(status(s.ctx, 'TEST-001'), 'READY', 'statut restauré (READY, comme le contrat le prévoit)');
  eq(row(s.ctx, 'TEST-001').ERROR, '', 'ERROR vide');
  eq(row(s.ctx, 'TEST-001').GITHUB_PATH, '', 'GITHUB_PATH vide');
});

test('TEST-001 : deux simulations successives restent à 0 write', () => {
  const s = setup({
    articles: [makeArticle({
      ID: 'TEST-001',
      CATEGORY: 'Facturation',
      SLUG: 'test-facture-conforme-maroc',
      STATUS: 'READY',
      PUBLISHED_AT: ''
    })],
    config: { TEST_MODE: 'TRUE' },
    activeCell: { row: 2 },
    routes: [templateRoute(2)]
  });

  const first = call(s.ctx, 'publishSelectedArticle');
  const second = call(s.ctx, 'publishSelectedArticle');
  eq(first.code, 'TEST_MODE', '1re simulation bloquée');
  eq(second.code, 'TEST_MODE', '2e simulation bloquée');
  eq(s.fetch.calls.filter((c) => c.method !== 'get').length, 0, 'toujours 0 write');
  eq(status(s.ctx, 'TEST-001'), 'READY', 'statut inchangé');
});

test('TEST-001 : le rendu complet fonctionne si les deux verrous sont ouverts', () => {
  // Preuve que le défaut était BIEN le type, et non le contenu de la ligne :
  // le même article passe le pipeline complet hors mode test.
  const articlePath = 'blog/facturation/test-facture-conforme-maroc.html';
  const articleRoute = '/contents/' + articlePath;
  const s = setup({
    articles: [makeArticle({
      ID: 'TEST-001',
      TITLE: 'Comment créer une facture conforme au Maroc',
      CATEGORY: 'Facturation',
      SLUG: 'test-facture-conforme-maroc',
      STATUS: 'READY',
      PUBLISHED_AT: ''
    })],
    config: { TEST_MODE: 'FALSE' },
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: articleRoute, code: 404, body: { message: 'Not Found' } },
      { method: 'put', path: articleRoute, body: putResponse(articlePath, 'x', 'sha-t1', 'commit-t1') }
    ]
  });

  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'résultat : ' + result.code + ' ' + result.message);
  eq(result.code, 'PUBLISHED', 'code');
  const put = s.fetch.calls.filter((c) => c.method === 'put')[0];
  ok(put, 'PUT émis');
  const decoded = Buffer.from(JSON.parse(put.payload).content, 'base64').toString('utf8');
  includes(decoded, 'Comment créer une facture conforme au Maroc', 'titre injecté');
  includes(decoded, 'index, follow', 'robots basculés en production');
  notOk(decoded.indexOf('{{') !== -1, 'aucun placeholder résiduel');
  eq(row(s.ctx, 'TEST-001').STATUS, 'PUBLISHED', 'PUBLISHED en feuilles de test');
});

/* ========================================================================== */
/* Réconciliation des index statiques du Blog                                  */
/* ========================================================================== */

/* ========================================================================== */
/* Contexte de voisinage : ACCUMULATION cross-catégories                       */
/* ========================================================================== */

suite('Contexte de voisinage');

/** Article publié, déjà listé dans les index. */
function seed(id, category, slug, dateIso) {
  return makeArticle({
    ID: id, TITLE: id + ' titre', CATEGORY: category, SLUG: slug,
    PUBLISHED_AT: dateIso, ARTICLE_EXCERPT: 'Extrait ' + id, __seeded: true
  });
}

const SELF = makeArticle({ ID: 'A-9', SLUG: 'cible', PUBLISHED_AT: '2026-07-20' });

/** Chemins des index de catégorie effectivement lus, dans l'ordre réel. */
function indexesRead(s) {
  return s.fetch.calls
    .filter((c) => c.method === 'get')
    .map((c) => c.path.split('?')[0].replace(/^.*\/contents\//, ''))
    .filter((p) => /^blog\/[^/]+\/index\.html$/.test(p));
}

test('régression : les listes cross-catégories s\'ACCUMULENT (1 propre + 3 autres ⇒ 3 cartes)', () => {
  // AVANT le correctif, la sélection était recalculée sur la SEULE dernière
  // catégorie lue : ce test rend 2 cartes au lieu de 3 et le prouve.
  const s = setup({
    articles: [
      seed('T-1', 'TVA Maroc', 'tva-1', '2026-01-05'),
      seed('A-1', 'Auto-entrepreneur', 'ae-1', '2026-01-06'),
      seed('D-1', 'Devis', 'devis-1', '2026-01-07'),
      seed('G-1', 'Guides', 'guides-1', '2026-01-08'),
      SELF
    ],
    targetId: 'A-9',
    indexes: { includeArticle: false }
  });

  const ctx = call(s.ctx, 'resolveArticleContext', SELF, '2026-07-20');
  ok(ctx.ok, 'contexte résolu : ' + ctx.error);

  eq(ctx.related.length, 3, '3 cartes, et non les seules cartes de la dernière catégorie lue');

  // Les 3 cartes viennent de 3 catégories DIFFÉRENTES : l'accumulation est donc
  // prouvée par la diversité, pas seulement par le compte.
  const cats = ctx.related.map((r) => r.path.split('/')[2]);
  eq(cats.length, 3, '3 chemins');
  eq(new Set(cats).size, 3, '3 catégories différentes : ' + cats.join(', '));

  eq(new Set(ctx.related.map((r) => r.path)).size, 3, 'aucun doublon');
  eqList(ctx.related.map((r) => r.title), ['T-1 titre', 'A-1 titre', 'D-1 titre'],
    'catégorie propre d\'abord, puis l\'ordre de lecture des autres');
  notOk(ctx.related.some((r) => r.path === '/blog/tva/cible.html'), 'jamais l\'article lui-même');
});

test('catégorie propre vide + 2 autres catégories ⇒ 2 cartes', () => {
  const s = setup({
    articles: [
      seed('A-1', 'Auto-entrepreneur', 'ae-1', '2026-01-06'),
      seed('D-1', 'Devis', 'devis-1', '2026-01-07'),
      SELF
    ],
    targetId: 'A-9',
    indexes: { includeArticle: false }
  });

  const ctx = call(s.ctx, 'resolveArticleContext', SELF, '2026-07-20');
  ok(ctx.ok, 'contexte résolu : ' + ctx.error);
  eq(ctx.related.length, 2, 'les 2 seules cartes disponibles');
  eqList(ctx.related.map((r) => r.path), ['/blog/auto-entrepreneur/ae-1.html', '/blog/devis/devis-1.html'],
    'les deux catégories lues, dans l\'ordre');
  eq(ctx.previous, null, 'aucun voisin : la catégorie propre est vide');
  eq(ctx.next, null, 'aucun voisin : la catégorie propre est vide');
});

test('lecture paresseuse : catégorie propre dense ⇒ AUCUNE lecture des autres', () => {
  const s = setup({
    articles: [
      seed('T-1', 'TVA Maroc', 'tva-1', '2026-01-05'),
      seed('T-2', 'TVA Maroc', 'tva-2', '2026-01-06'),
      seed('T-3', 'TVA Maroc', 'tva-3', '2026-01-07'),
      seed('A-1', 'Auto-entrepreneur', 'ae-1', '2026-01-08'),
      seed('D-1', 'Devis', 'devis-1', '2026-01-09'),
      SELF
    ],
    targetId: 'A-9',
    indexes: { includeArticle: false }
  });

  const ctx = call(s.ctx, 'resolveArticleContext', SELF, '2026-07-20');
  ok(ctx.ok, 'contexte résolu : ' + ctx.error);
  eq(ctx.related.length, 3, 'plafond atteint dès la catégorie propre');
  eqList(indexesRead(s), ['blog/tva/index.html'],
    'une seule requête : celle de l\'index propre, aucun GET inutile');
});

test('lecture paresseuse : arrêt EXACT dès la 3e carte, ordre de lecture déterministe', () => {
  const s = setup({
    articles: [
      seed('A-1', 'Auto-entrepreneur', 'ae-1', '2026-01-06'),
      seed('D-1', 'Devis', 'devis-1', '2026-01-07'),
      seed('F-1', 'Facturation', 'fact-1', '2026-01-08'),
      seed('G-1', 'Guides', 'guides-1', '2026-01-09'),
      SELF
    ],
    targetId: 'A-9',
    indexes: { includeArticle: false }
  });

  const ctx = call(s.ctx, 'resolveArticleContext', SELF, '2026-07-20');
  ok(ctx.ok, 'contexte résolu : ' + ctx.error);
  eq(ctx.related.length, 3, '3 cartes');
  // `listKnownCategories()` trie les noms : l'ordre de lecture est donc
  // déterministe et indépendant de l'ordre d'insertion dans CATEGORY_MAP.
  eqList(indexesRead(s), [
    'blog/tva/index.html',          // l'index propre, toujours lu
    'blog/auto-entrepreneur/index.html',
    'blog/devis/index.html',
    'blog/facturation/index.html'   // 3e carte atteinte ici
  ], 'lecture arrêtée sur Facturation : Guides n\'est jamais demandé');
  eqList(ctx.related.map((r) => r.title), ['A-1 titre', 'D-1 titre', 'F-1 titre'],
    'les 3 premières catégories lues, dans l\'ordre');
});

test('404 sur l\'index PROPRE = tolérance, mais une erreur de lecture BLOQUE', () => {
  // L'index propre est absent ET déclaré en 404, comme en production.
  const tolerated = setup({
    articles: [SELF],
    targetId: 'A-9',
    indexes: { includeArticle: false, omit: ['blog/tva/index.html'] },
    routes: [templateRoute(), { method: 'get', path: '/contents/blog/tva/index.html', code: 404, body: { message: 'Not Found' } }]
  });
  const okCtx = call(tolerated.ctx, 'resolveArticleContext', SELF, '2026-07-20');
  ok(okCtx.ok, 'un 404 est une absence, pas une panne : ' + okCtx.error);
  eqList(okCtx.related, [], 'aucun candidat');
  eq(okCtx.previous, null, 'aucun voisin');
  eq(okCtx.next, null, 'aucun voisin');

  // Même fichier absent, mais le serveur répond 500 : c'est une panne de
  // lecture, et elle doit arrêter la publication.
  const broken = setup({
    articles: [SELF],
    targetId: 'A-9',
    indexes: { includeArticle: false, omit: ['blog/tva/index.html'] },
    routes: [templateRoute(), { method: 'get', path: '/contents/blog/tva/index.html', code: 500, body: { message: 'Server Error' } }]
  });
  const badCtx = call(broken.ctx, 'resolveArticleContext', SELF, '2026-07-20');
  notOk(badCtx.ok, 'une erreur de lecture non-404 BLOQUE');
  includes(badCtx.error, 'blog/tva/index.html', 'le message nomme le fichier fautif');
});

/* ========================================================================== */
/* Réconciliation des index statiques du Blog                                  */
/* ========================================================================== */

suite('Index Blog');

/** Article prêt à publier, dans une catégorie à part. */
function tvaArticle(over) {
  return makeArticle(Object.assign({ PUBLISHED_AT: '2026-07-14' }, over || {}));
}

/** Routes minimales : gabarit + création de l'article. */
function publishRoutes(articlePath) {
  const route = '/contents/' + articlePath;
  return [
    templateRoute(),
    { method: 'get', path: route, code: 404, body: { message: 'Not Found' } },
    { method: 'put', path: route, body: putResponse(articlePath, 'x', 'sha-art', 'commit-art') }
  ];
}

/** Le gabarit a bien été lu (et pas plus d'une fois par exécution). */
function templateWasRead(s) {
  return s.fetch.calls.filter(
    (c) => c.method === 'get' && c.path.indexOf('/blog/template-article.html') !== -1
  ).length;
}

/**
 * Aucune écriture n'a été tentée : seules des LECTURES sont autorisées.
 *
 * Le nombre exact de lectures n'est plus une valeur d'assertion — il dépend du
 * nombre de catégories (le voisinage lit l'index de la catégorie, puis les
 * autres tant qu'il n'a pas 3 cartes). L'invariant vérifié ici est « 0 PUT », et
 * l'ordre des lectures est couvert précisément par T8.
 */
function assertReadOnly(s, label) {
  eq(s.fetch.calls.filter((c) => c.method !== 'get').length, 0, label + ' : aucune écriture');
}

/** Les 4 écritures de la séquence, dans l'ordre où elles ont eu lieu. */
function putPaths(s) {
  return s.fetch.calls.filter((c) => c.method === 'put').map((c) => c.path.split('?')[0]);
}

test('T1 : la carte générée reprend exactement le markup de production', () => {
  const s = setup({ articles: [tvaArticle()], routes: publishRoutes(ARTICLE_PATH) });
  const item = call(s.ctx, 'buildArticleListItem', {
    TITLE: 'Facture TVA : le guide complet',
    SLUG: 'article-de-test',
    CATEGORY: 'TVA Maroc',
    PUBLISHED_AT: '2026-07-14',
    READING_TIME: '6',
    ARTICLE_EXCERPT: 'Extrait d\'article distinct de la description.'
  }, { withCategory: true });

  ok(item.ok, 'carte construite');
  eq(item.href, '/blog/tva/article-de-test.html', 'href canonique');
  eq(item.html, articleListItem(
    'TVA Maroc · 14 juillet 2026 · 6 min',
    '/blog/tva/article-de-test.html',
    'Facture TVA : le guide complet',
    'Extrait d&#39;article distinct de la description.'
  ), 'markup de la carte (échappement compris)');

  // La page de catégorie ne préfixe PAS la catégorie ; le hub le fait.
  const cat = call(s.ctx, 'buildArticleListItem', {
    TITLE: 'Facture TVA : le guide complet', SLUG: 'article-de-test', CATEGORY: 'TVA Maroc',
    PUBLISHED_AT: '2026-07-14', READING_TIME: '6', ARTICLE_EXCERPT: 'x'
  }, { withCategory: false });
  ok(cat.html.indexOf('TVA Maroc ·') === -1, 'la page de catégorie omet la catégorie');
  ok(cat.html.indexOf('<div class="meta">14 juillet 2026 · 6 min</div>') !== -1, 'méta de catégorie');
});

test('T2 : index en retard → les 3 index sont écrits, dans l\'ordre imposé', () => {
  const a = tvaArticle();
  const s = setup({
    articles: [a],
    indexes: { includeArticle: false },
    activeCell: { row: 2 },
    routes: publishRoutes(ARTICLE_PATH)
  });

  // État de départ : l'article est absent des trois index.
  notOk(listItems(s.fetch.file('blog/tva/index.html')).some((l) => l.indexOf('/blog/tva/article-de-test.html') !== -1), 'absent de l\'index de catégorie');
  notOk(s.fetch.file(HUB_PATH).indexOf('/blog/tva/article-de-test.html') !== -1, 'absent du hub');
  notOk(sitemapLocs(s.fetch.file(SITEMAP_FILE)).indexOf(SITE + '/blog/tva/article-de-test.html') !== -1, 'absent du sitemap');

  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'publication : ' + result.code + ' ' + result.message);
  eq(result.status, 'PUBLISHED', 'statut');
  eq(result.indexed, true, 'index réconcilié');
  eq(result.indexWrites, 3, '3 index écrits');

  // SÉQUENCE IMPOSÉE : article → catégorie → hub → sitemap.
  eqList(putPaths(s), [
    '/repos/ysonouari/INVOOFFICE/contents/blog/tva/article-de-test.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/tva/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/sitemap-fr.xml'
  ], 'ordre exact des écritures');

  // Contenu réellement écrit sur le disque mocké.
  const cat = s.fetch.file('blog/tva/index.html');
  eq(listItems(cat).length, 1, 'l\'index de catégorie contient la carte');
  ok(listItems(cat)[0].indexOf('14 juillet 2026 · 6 min') !== -1, 'méta sans catégorie');
  ok(cat.indexOf('TVA Maroc · 14 juillet') === -1, 'pas de catégorie dans l\'index de catégorie');

  const hub = s.fetch.file(HUB_PATH);
  eq(listItems(hub).length, 1, 'le hub contient la carte');
  ok(listItems(hub)[0].indexOf('TVA Maroc · 14 juillet 2026 · 6 min') !== -1, 'méta avec catégorie dans le hub');

  const sm = s.fetch.file(SITEMAP_FILE);
  ok(sitemapLocs(sm).indexOf(SITE + '/blog/tva/article-de-test.html') !== -1, '<loc> ajouté');
  ok(sm.indexOf('<lastmod>2026-07-14</lastmod>') !== -1, '<lastmod> = date de publication');
  ok(sm.indexOf('<priority>0.8</priority>') !== -1, 'priorité conforme au format existant');
  ok(sm.indexOf('</urlset>') !== -1, '</urlset> préservé');
});

test('T3 : index déjà à jour → aucune écriture, résultat UNCHANGED', () => {
  const a = tvaArticle();

  // 1re publication : index en retard, donc 3 écritures d'index.
  const s1 = setup({
    articles: [a],
    indexes: { includeArticle: false },
    activeCell: { row: 2 },
    routes: publishRoutes(ARTICLE_PATH)
  });
  const first = call(s1.ctx, 'publishSelectedArticle');
  ok(first.ok, 'première publication : ' + first.code + ' ' + first.message);
  eq(first.indexWrites, 3, '3 écritures à la première publication');

  // 2e publication dans un contexte NEUF, qui repart de l'état ATTEINT :
  // les index tels qu'ils sont sur le disque, et l'article tel qu'il a été
  // écrit (récupéré dans la charge utile du PUT, seul endroit où il existe).
  const s2 = setup({
    articles: [a],
    indexFiles: repoSnapshot(s1.fetch).concat([{ path: ARTICLE_PATH, content: publishedHtml(s1) }]),
    activeCell: { row: 2 },
    routes: [
      templateRoute(),
      { method: 'get', path: ARTICLE_ROUTE, body: contentsResponse(ARTICLE_PATH, publishedHtml(s1), 'sha-art') }
    ]
  });

  const again = call(s2.ctx, 'publishSelectedArticle');
  ok(again.ok, 'republication : ' + again.code);
  eq(again.code, 'UNCHANGED', 'article identique');
  eq(again.indexed, true, 'toujours réconcilié');
  eq(again.indexWrites, 0, 'AUCUNE écriture d\'index');
  eq(putPaths(s2).length, 0, 'aucun PUT du tout');
  eq(s2.fetch.indexCalls.filter((c) => c.method === 'put').length, 0, 'aucun PUT d\'index');
});

test('T4 : le sitemap n\'est jamais dupliqué', () => {
  const s = setup({ articles: [tvaArticle()], indexes: false });
  const loc = SITE + '/blog/tva/article-de-test.html';
  const base = sitemapFixture([SITE + '/', SITE + '/blog/', SITE + '/blog/tva/']);

  const once = call(s.ctx, 'insertIntoSitemap', base, loc, '2026-07-14');
  ok(once.ok, 'première insertion valide');
  eq(once.changed, true, 'première insertion : le contenu change');

  const twice = call(s.ctx, 'insertIntoSitemap', once.html, loc, '2026-07-14');
  ok(twice.ok, 'seconde insertion valide');
  eq(twice.changed, false, 'déjà présent : aucun changement');
  eq(twice.html, once.html, 'contenu strictement identique');
  eq(sitemapLocs(once.html).filter((l) => l === loc).length, 1, 'un seul <loc>');
  // Le format existant est respecté : une entrée d'article tient sur une ligne.
  const line = once.html.split('\n').filter((l) => l.indexOf(loc) !== -1)[0];
  ok(line.indexOf('<changefreq>monthly</changefreq>') !== -1, 'changefreq mensuel');
  ok(once.html.split('\n').filter((l) => l.indexOf('<urlset') === 0).length === 1, 'un seul urlset');
  // Une URL absente est refusée, pas écrite à moitié.
  eq(call(s.ctx, 'insertIntoSitemap', base, '', '2026-07-14').ok, false, 'URL absente refusée');

  // --- Mise en forme : l'entrée doit être indiscernable des entréesvoisines ---
  // Le sitemap de production indente chaque <url> de 2 espaces et laisse
  // </urlset> seul sur sa ligne. Un saut de ligne en trop produirait une ligne
  // vide ; l'absence du saut de fin collerait </urlset> à l'entrée.
  const onceLines = once.html.split('\n');
  const insertedAt = onceLines.findIndex((l) => l.indexOf(loc) !== -1);
  eq(onceLines[insertedAt].slice(0, 2), '  ', 'entrée indentée de 2 espaces');
  eq(onceLines[insertedAt].slice(2, 6), '<url', 'rien avant <url> hormis l\'indentation');
  ok(onceLines[insertedAt].indexOf('</urlset>') === -1, '</urlset> absent de la ligne d\'entrée');
  eq(onceLines[insertedAt + 1], '</urlset>', '</urlset> sur sa propre ligne');
  ok(insertedAt > 0, 'l\'entrée a été insérée');
  ok(onceLines[insertedAt - 1] !== '', 'aucune ligne vide avant l\'entrée');
  // La ligne précédente est bien la dernière entrée d'origine, et le contenu
  // de production est préservé ailleurs : rien d'autre n'a bougé.
  ok(onceLines[insertedAt - 1].indexOf(SITE + '/blog/tva/</loc>') !== -1,
    'l\'entrée précédente est la dernière entrée d\'origine');
  eq(sitemapLocs(once.html).filter((l) => l === loc).length, 1, 'URL insérée exactement une fois');
});

test('T5 : index de catégorie absent → avertissement, article PUBLISHED, aucun PUT sur ce fichier', () => {
  const a = tvaArticle();
  // Un fichier ABSENT se simule par une route GET explicite en 404 : c'est le
  // contrat réel de `getFile()` (404 → null). Omettre le fichier sans déclarer
  // la route ferait échouer la lecture, ce qui testerait autre chose.
  const routes = publishRoutes(ARTICLE_PATH).concat([
    { method: 'get', path: '/contents/blog/tva/index.html', code: 404, body: { message: 'Not Found' } }
  ]);
  const s = setup({
    articles: [a],
    indexes: { includeArticle: false, omit: ['blog/tva/index.html'] },
    activeCell: { row: 2 },
    routes: routes
  });

  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'l\'article EST publié : ' + result.code + ' / ' + result.message + ' / ' + result.error);
  eq(result.status, 'PUBLISHED', 'statut PUBLISHED');
  eq(row(s.ctx, 'A-1').STATUS, 'PUBLISHED', 'PUBLISHED en feuilles de test');
  eq(result.indexed, false, 'index NON réconcilié');
  eq(result.indexWrites, 2, 'hub et sitemap ont été réconciliés malgré tout');
  ok(result.warnings.some((w) => w.code === 'IX1'), 'avertissement IX1 (index de catégorie)');

  // Les étapes suivantes ne sont PAS annulées par l'échec de la catégorie.
  ok(s.fetch.file(HUB_PATH).indexOf('/blog/tva/article-de-test.html') !== -1, 'le hub a bien été mis à jour');
  ok(sitemapLocs(s.fetch.file(SITEMAP_FILE)).indexOf(SITE + '/blog/tva/article-de-test.html') !== -1, 'le sitemap aussi');
  // Le compteur est LAISSÉ INTACT : sans index de catégorie, il n'existe aucune
  // source de vérité. Un compteur deviné serait pire qu'un compteur en retard.
  eq(hubCount(s.fetch.file(HUB_PATH), 'tva'), '0 article', 'compteur non deviné');

  // Aucun PUT vers un fichier absent, et rien n\'est inventé.
  notOk(putPaths(s).some((p) => p.indexOf('/blog/tva/index.html') !== -1), 'aucun PUT sur l\'index de catégorie');
  notOk(s.fetch.has('blog/tva/index.html'), 'le fichier n\'a pas été créé');
  includes(call(s.ctx, 'formatPublishReport', result), 'NON RÉCONCILIÉ', 'le compte rendu opérateur le dit');
  ok(logRows(s.sheets).some((r) => r[1] === 'WARNING'), 'un WARNING est journalisé');
  eq(result.error || '', '', 'ce n\'est pas une erreur : l\'article est publié');
});

test('T6 : le compteur du hub suit l\'index de catégorie, pas la liste du hub', () => {
  // Index de catégorie « Facturation » exhaustif (3 articles) alors que le hub
  // n'en montre qu'UN : compter la liste du hub donnerait 2 au lieu de 4.
  const f1 = makeArticle({ ID: 'F-1', TITLE: 'Facture 1', SLUG: 'f-1', CATEGORY: 'Facturation', PUBLISHED_AT: '2026-05-02', __seeded: true });
  const f2 = makeArticle({ ID: 'F-2', TITLE: 'Facture 2', SLUG: 'f-2', CATEGORY: 'Facturation', PUBLISHED_AT: '2026-05-03', __seeded: true });
  const f3 = makeArticle({ ID: 'F-3', TITLE: 'Facture 3', SLUG: 'f-3', CATEGORY: 'Facturation', PUBLISHED_AT: '2026-05-04', __seeded: true });
  const target = makeArticle({ ID: 'F-4', TITLE: 'Facture 4', SLUG: 'f-4', CATEGORY: 'Facturation', PUBLISHED_AT: '2026-05-05' });
  const s = setup({
    articles: [f1, f2, f3, target],
    indexes: { includeArticle: false, hubLimit: 1 },
    activeCell: { row: 5 },
    routes: publishRoutes('blog/facturation/f-4.html')
  });

  const hubBefore = s.fetch.file(HUB_PATH);
  eq(listItems(s.fetch.file('blog/facturation/index.html')).length, 3, 'l\'index de catégorie en a 3');
  eq(listItems(hubBefore).length, 1, 'le hub n\'en montre qu\'un : les deux listes divergent');
  eq(hubCount(hubBefore, 'facturation'), '3 articles', 'compteur initial aligné sur la catégorie');
  // Les 4 autres compteurs sont figés : ils ne doivent pas bouger.
  const othersBefore = ['auto-entrepreneur', 'devis', 'guides', 'tva'].map((s2) => hubCount(hubBefore, s2)).join('|');

  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'publication : ' + result.code);
  eq(result.indexed, true, 'index réconcilié');

  const hubAfter = s.fetch.file(HUB_PATH);
  eq(listItems(s.fetch.file('blog/facturation/index.html')).length, 4, 'index de catégorie : 4');
  eq(listItems(hubAfter).length, 2, 'le hub : 2 seulement');
  eq(hubCount(hubAfter, 'facturation'), '4 articles', 'compteur = index de catégorie (4), PAS la liste du hub (2)');
  eq(['auto-entrepreneur', 'devis', 'guides', 'tva'].map((s2) => hubCount(hubAfter, s2)).join('|'), othersBefore, 'les 4 autres compteurs sont intacts');
  // Accord singulier au singulier.
  const solo = setup({
    articles: [tvaArticle()],
    indexes: { includeArticle: false },
    activeCell: { row: 2 },
    routes: publishRoutes(ARTICLE_PATH)
  });
  call(solo.ctx, 'publishSelectedArticle');
  eq(hubCount(solo.fetch.file(HUB_PATH), 'tva'), '1 article', '« 1 article », pas « 1 articles »');
  // Sans source de vérité, rien n'est deviné.
  const noCounts = setup({ articles: [tvaArticle()], indexes: false });
  const hub = indexPageFixture({ cards: [{ slug: 'tva', name: 'TVA Maroc', count: '7 articles' }], items: [] });
  eq(call(noCounts.ctx, 'updateCategoryCounts', hub, {}).html, hub, 'updateCategoryCounts sans compteurs ne touche à rien');
  eq(call(noCounts.ctx, 'updateCategoryCounts', hub).html, hub, 'appel à 1 argument : hub intact');
  eq(call(noCounts.ctx, 'updateCategoryCounts', hub, { tva: 7 }).changed, false, 'compteur déjà juste : aucun changement');
  eq(call(noCounts.ctx, 'updateCategoryCounts', hub, { tva: 8 }).html.indexOf('8 articles') !== -1, true, 'compteur mis à jour quand la source est fournie');
});

test('T7 : un article absent de la liste est inséré en tête, l\'ordre des autres est préservé', () => {
  const existing = makeArticle({ ID: 'E-1', TITLE: 'Ancien', SLUG: 'ancien', PUBLISHED_AT: '2026-01-05', __seeded: true });
  const target = tvaArticle();
  const s = setup({
    articles: [existing, target],
    indexes: { includeArticle: false },
    activeCell: { row: 3 },
    routes: publishRoutes(ARTICLE_PATH)
  });

  const before = listItems(s.fetch.file('blog/tva/index.html'));
  eq(before.length, 1, 'un article préexistant');
  ok(before[0].indexOf('/blog/tva/ancien.html') !== -1, 'c\'est l\'ancien');

  call(s.ctx, 'publishSelectedArticle');

  const after = listItems(s.fetch.file('blog/tva/index.html'));
  eq(after.length, 2, 'deux articles');
  ok(after[0].indexOf('/blog/tva/article-de-test.html') !== -1, 'le nouveau passe en tête');
  ok(after[1].indexOf('/blog/tva/ancien.html') !== -1, 'l\'ancien est conservé et intact');
  eq(after[1], before[0], 'l\'entrée préexistante n\'a pas bougé d\'un octet');
});

test('T8 : ordre des appels garanti même quand l\'article est déjà à jour', () => {
  // L'ordre porte sur les LECTURES. Le voisinage éditorial se résout AVANT le
  // rendu, donc avant toute écriture : l'index de la catégorie d'abord, puis —
  // seulement si la catégorie ne fournit pas RELATED_LIMIT cartes — les autres
  // catégories par ordre alphabétique, et enfin la réconciliation (catégorie,
  // hub, sitemap) qui, elle, suit l'écriture de l'article.
  const a = tvaArticle();
  const s = setup({ articles: [a], activeCell: { row: 2 }, routes: publishRoutes(ARTICLE_PATH) });
  call(s.ctx, 'publishSelectedArticle');

  const indexReads = s.fetch.calls
    .filter((c) => c.method === 'get' && c.index)
    .map((c) => c.path.split('?')[0]);
  eqList(indexReads, [
    '/repos/ysonouari/INVOOFFICE/contents/blog/tva/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/auto-entrepreneur/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/devis/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/facturation/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/guides/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/tva/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/sitemap-fr.xml'
  ], 'voisinage (catégorie puis complément), puis réconciliation : catégorie, hub, sitemap');

  // Les lectures de voisinage précèdent l'écriture de l'article (il faut les
  // voisins pour RENDRE l'article) ; l'écriture précède en revanche toute
  // lecture de RÉCONCILIATION (catégorie, hub, sitemap).
  const reconStart = s.fetch.calls.findIndex((c) => c.method === 'put' && c.path.indexOf(ARTICLE_PATH) !== -1);
  const afterWrite = s.fetch.calls.slice(reconStart + 1);
  const recon = afterWrite.filter((c) => c.method === 'get' && c.index).map((c) => c.path.split('?')[0]);
  eqList(recon, [
    '/repos/ysonouari/INVOOFFICE/contents/blog/tva/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/blog/index.html',
    '/repos/ysonouari/INVOOFFICE/contents/sitemap-fr.xml'
  ], 'après l\'écriture : catégorie, puis hub, puis sitemap');
  ok(reconStart !== -1, 'l\'article a bien été écrit');
});

test('T9 : conflit SHA sur un index → relecture du SHA puis retry borné', () => {
  const a = tvaArticle();
  const s = setup({
    articles: [a],
    indexes: { includeArticle: false },
    activeCell: { row: 2 },
    routes: publishRoutes(ARTICLE_PATH),
    // Un seul 409, sur le PUT de l'index de catégorie.
    fetchOptions: { failOnce: { path: '/blog/tva/index.html', method: 'put', status: 409 } }
  });

  const result = call(s.ctx, 'publishSelectedArticle');
  ok(result.ok, 'la publication aboutit malgré le conflit : ' + result.code + ' ' + result.message);
  eq(result.indexed, true, 'index réconcilié après retry');

  const tvaPuts = s.fetch.calls.filter((c) => c.method === 'put' && c.path.indexOf('/blog/tva/index.html') !== -1);
  eq(tvaPuts.length, 2, 'conflit puis retry : exactement 2 PUT');
  // Le retry doit transporter le SHA RÉEL relu, pas celui du conflit.
  ok(JSON.parse(tvaPuts[1].payload).sha !== undefined, 'le retry envoie un sha');
  // La catégorie a fini par être écrite, et le hub a été compté dessus.
  eq(listItems(s.fetch.file('blog/tva/index.html')).length, 1, 'index de catégorie écrit après le retry');
  eq(hubCount(s.fetch.file(HUB_PATH), 'tva'), '1 article', 'compteur du hub correct (catégorie réparée)');
  eq(result.indexWrites, 3, 'les 3 index ont bien été écrits');
});

/* -------------------------------------------------------------------------- */

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write('ECHEC : ' + failures.length + ' test(s) en échec, ' + passed + ' réussi(s)\n');
  failures.forEach((f) => process.stdout.write('  [' + f.suite + '] ' + f.name + '\n    ' + f.message + '\n'));
  process.exit(1);
}
process.stdout.write('OK : ' + passed + ' tests réussis (Publisher)\n');
