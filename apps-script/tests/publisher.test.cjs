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
  contentsResponse,
  putResponse
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

/**
 * Construit un contexte complet.
 * @param {{articles?:Array, config?:Object, props?:Object, routes?:Array,
 *          lockAvailable?:boolean, activeCell?:Object, sheets?:Object}} [opt]
 */
function setup(opt) {
  const o = opt || {};
  const articles = o.articles || [makeArticle()];
  const fetchMock = makeFetchMock(o.routes || [templateRoute()]);
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
    fetch: fetchMock
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
  eq(s.fetch.calls.length, 1, 'un seul appel (lecture gabarit)');
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
  eq(s.fetch.calls.length, 1, 'aucun write tenté');
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
  eq(s.fetch.calls.length, 1, 'aucune écriture');
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
  eq(s.fetch.calls.length, 1, 'seule la lecture du gabarit');
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
  eq(s.fetch.calls.length, 1, 'aucun write');
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
  eq(s.fetch.calls.length, 1, 'aucun write');
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
  eq(s.fetch.calls.length, 2, 'seules les deux lectures du gabarit');
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
  const labels = s.ui.items.map((i) => i.label).join(' | ');
  notOk(/planifi|schedul|cron/i.test(labels), 'aucun scheduler exposé');
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
  eq(publishCalls.length, 1, 'le Publisher n’a fait qu’une requête');
  ok(publishCalls[0].path.indexOf(TEMPLATE_ROUTE) !== -1, 'l’unique appel est le GET du gabarit');
  ok(publishCalls[0].path.indexOf('?ref=master') !== -1, 'lecture sur la branche master');
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

/* -------------------------------------------------------------------------- */

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write('ECHEC : ' + failures.length + ' test(s) en échec, ' + passed + ' réussi(s)\n');
  failures.forEach((f) => process.stdout.write('  [' + f.suite + '] ' + f.name + '\n    ' + f.message + '\n'));
  process.exit(1);
}
process.stdout.write('OK : ' + passed + ' tests réussis (Publisher)\n');
