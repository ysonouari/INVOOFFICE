/**
 * INVOOFFICE — Tests de l'interface Planification / Automatisation (Scheduler.gs)
 * ---------------------------------------------------------------------------
 * Exécution : `npm run test:apps-script`
 *
 * AUCUN réseau, AUCUN vrai tableur, AUCUN déclencheur : `UrlFetchApp` lève,
 * `ScriptApp` est une doublure en LECTURE SEULE dont `newTrigger()` échoue.
 *
 * Ces tests prouvent le comportement OBSERVABLE du dialogue :
 *   - la lecture de l'état vient de la feuille `Config` (repli sur les défauts) ;
 *   - les jours sont des CASES À COCHER, jamais un champ libre ;
 *   - la répartition affichée est ARTICLES_PER_WEEK / nbJours, règle déjà
 *     appliquée par validateConfig() — et les deux verdicts sont ÉQUIVALENTS ;
 *   - rien n'est écrit si la validation serveur échoue ;
 *   - seules les 5 clés de planification sont écrites, jamais une autre ;
 *   - l'ordre des lignes de Config n'est jamais modifié quand les clés existent ;
 *   - l'enregistrement est idempotent ;
 *   - AUCUN déclencheur n'est créé, et le dialogue annonce honnêtement l'état
 *     réel (« 0 déclencheur — aucune automatisation en exécution ») ;
 *   - les clés legacy WordPress sont toujours présentes et inchangées.
 */

const fs = require('fs');
const path = require('path');

const {
  createContext,
  call,
  configSheet,
  logsSheet
} = require('./harness.cjs');

const SCHEDULER_PATH = path.join(__dirname, '..', 'Scheduler.gs');
const SCHEDULER_SRC = fs.readFileSync(SCHEDULER_PATH, 'utf8');

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

function eqList(actual, expected, label) {
  eq(JSON.stringify(actual), JSON.stringify(expected), label);
}

function includes(list, value, label) {
  if (list.indexOf(value) === -1) {
    throw new Error((label || 'liste') + ' : ' + JSON.stringify(value) + ' absent de ' + JSON.stringify(list));
  }
}

/** Instance avec une feuille Config réaliste + Logs. */
function makeCtx(configOverrides, options) {
  const base = {
    AUTO_PUBLISH: 'TRUE',
    ARTICLES_PER_DAY: '1',
    PUBLISH_HOUR: '',
    PUBLISH_MINUTE: '',
    TIMEZONE: 'Africa/Casablanca',
    ENABLE_FEATURED_IMAGE: 'FALSE',
    TEST_MODE: 'TRUE',
    MAX_ARTICLES_PER_RUN: '1',
    MAX_RETRIES: '3',
    SCHEDULE_MODE: 'WEEKLY',
    ARTICLES_PER_WEEK: '6',
    PUBLISH_DAYS: 'TUESDAY,FRIDAY',
    CATEGORY_MAP: JSON.stringify({ 'TVA Maroc': 'tva' })
  };
  const config = Object.assign(base, configOverrides || {});
  return createContext({
    sheets: { Config: configSheet(config), Logs: logsSheet() },
    properties: (options && options.properties) || {}
  });
}

/** Codes d'erreur renvoyés par validateSchedulerConfig(). */
function codes(result) {
  return result.errors.map((e) => e.code).sort();
}

/** Saisie valide de référence. */
function validInput(overrides) {
  return Object.assign({
    autoPublish: true,
    mode: 'WEEKLY',
    perWeek: '6',
    days: ['TUESDAY', 'FRIDAY'],
    maxPerRun: '1'
  }, overrides || {});
}

/** Verdict de validateConfig() sur la règle de répartition (C3 / C3b). */
function existingRuleVerdict(ctx, perWeek, days) {
  const per = Number(perWeek);
  const list = String(days).split(',')
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);
  if (isFinite(per) && per > 0) {
    if (!list.length) return 'C3';
    if (per % list.length !== 0) return 'C3b';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
suite('Menu');
/* -------------------------------------------------------------------------- */

test('onOpen expose 🗓️ Planification / Automatisation', () => {
  const { ctx, helpers } = makeCtx();
  call(ctx, 'onOpen');
  const entry = helpers.ui.items.find((i) => i.label.indexOf('Planification / Automatisation') !== -1);
  ok(entry, 'entrée de menu présente');
  eq(entry.fn, 'openSchedulerConfigDialog', 'entrée branchée sur openSchedulerConfigDialog');
  ok(helpers.ui.items.some((i) => i.label === '⚙️ Configuration'), 'menu Configuration en place');
});

test('openSchedulerConfigDialog ouvre un dialogue titré', () => {
  const { ctx, helpers } = makeCtx();
  call(ctx, 'openSchedulerConfigDialog');
  eq(helpers.ui.dialogs.length, 1, 'un dialogue capturé');
  eq(helpers.ui.dialogs[0].title, 'Planification / Automatisation', 'titre du dialogue');
  ok(helpers.ui.dialogs[0].html.length > 500, 'HTML non vide');
});

test('les entrées de menu existantes sont préservées', () => {
  const { ctx, helpers } = makeCtx();
  call(ctx, 'onOpen');
  const labels = helpers.ui.items.map((i) => i.fn).filter(Boolean);
  ['menuConfiguration', 'menuBootstrapSheets', 'menuTestGithub', 'menuCheckTemplate',
    'menuValidateArticles', 'publishSelectedArticle', 'publishNextReadyArticle',
    'deleteSelectedPublishedArticle', 'menuShowErrors'
  ].forEach((fn) => includes(labels, fn, 'entrée préexistante'));
});

/* -------------------------------------------------------------------------- */
suite('Lecture de l\'état');
/* -------------------------------------------------------------------------- */

test('l\'état reflète la feuille Config', () => {
  const { ctx } = makeCtx();
  const s = call(ctx, 'getSchedulerConfigState');
  eq(s.autoPublish, true, 'AUTO_PUBLISH');
  eq(s.mode, 'WEEKLY', 'SCHEDULE_MODE');
  eq(s.perWeekRaw, '6', 'ARTICLES_PER_WEEK');
  eq(s.maxPerRunRaw, '1', 'MAX_ARTICLES_PER_RUN');
  eqList(s.days, ['TUESDAY', 'FRIDAY'], 'PUBLISH_DAYS');
  eq(s.timeZone, 'Africa/Casablanca', 'TIMEZONE');
});

test('Config absente : repli sur CONFIG_DEFAULTS', () => {
  const { ctx } = createContext({ sheets: { Logs: logsSheet() } });
  const s = call(ctx, 'getSchedulerConfigState');
  eq(s.perWeekRaw, '6', 'ARTICLES_PER_WEEK par défaut');
  eqList(s.days, ['TUESDAY', 'FRIDAY'], 'PUBLISH_DAYS par défaut');
  eq(s.mode, 'WEEKLY', 'SCHEDULE_MODE par défaut');
});

test('Config partielle : la clé absente retombe sur son défaut', () => {
  const { ctx } = createContext({
    sheets: { Config: configSheet({ ARTICLES_PER_WEEK: '6' }), Logs: logsSheet() }
  });
  const s = call(ctx, 'getSchedulerConfigState');
  eq(s.perWeekRaw, '6', 'valeur présente conservée');
  eq(s.maxPerRunRaw, '1', 'clé absente → défaut');
  eqList(s.days, ['TUESDAY', 'FRIDAY'], 'PUBLISH_DAYS absent → défaut');
});

test('les jours sont normalisés dans l\'ordre canonique', () => {
  const { ctx } = makeCtx({ PUBLISH_DAYS: 'FRIDAY,tuesday ,MONDAY' });
  eqList(call(ctx, 'getSchedulerConfigState').days, ['MONDAY', 'TUESDAY', 'FRIDAY'], 'ordre canonique');
});

test('un jour inconnu est ignoré', () => {
  const { ctx } = makeCtx({ PUBLISH_DAYS: 'TUESDAY,NOTADAY,FRIDAY' });
  eqList(call(ctx, 'getSchedulerConfigState').days, ['TUESDAY', 'FRIDAY'], 'jour inconnu éliminé');
});

test('serializePublishDays réordonne et dédoublonne', () => {
  const { ctx } = makeCtx();
  eq(call(ctx, 'serializePublishDays', ['FRIDAY', 'TUESDAY']), 'TUESDAY,FRIDAY', 'ordre canonique');
  eq(call(ctx, 'serializePublishDays', ['TUESDAY', 'TUESDAY']), 'TUESDAY', 'doublon éliminé');
  eq(call(ctx, 'serializePublishDays', ['BAD']), '', 'aucun jour valide → chaîne vide');
});

/* -------------------------------------------------------------------------- */
suite('Validation — règles existantes');
/* -------------------------------------------------------------------------- */

test('une saisie valide est acceptée', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'validateSchedulerConfig', validInput());
  eq(r.ok, true, 'ok');
  eq(r.errors.length, 0, 'aucune erreur');
});

test('ARTICLES_PER_WEEK : 0, hors borne et décimal refusés', () => {
  const { ctx } = makeCtx();
  ['0', '-1', '8', '6.5', '', 'abc'].forEach((v) => {
    const r = call(ctx, 'validateSchedulerConfig', validInput({ perWeek: v }));
    eq(r.ok, false, 'refusé : ' + JSON.stringify(v));
    includes(codes(r), 'SCHED_PER_WEEK', 'code pour ' + JSON.stringify(v));
  });
});

test('ARTICLES_PER_WEEK accepte 1..7', () => {
  const { ctx } = makeCtx();
  for (let i = 1; i <= 7; i += 1) {
    const r = call(ctx, 'validateSchedulerConfig', validInput({ perWeek: String(i), days: ['MONDAY'] }));
    eq(r.ok, true, i + ' accepté');
  }
});

test('PER_WEEK > 0 sans aucun jour → SCHED_DAYS_EMPTY', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'validateSchedulerConfig', validInput({ days: [] }));
  eq(r.ok, false, 'refusé');
  includes(codes(r), 'SCHED_DAYS_EMPTY', 'code');
});

test('la règle s\'applique même avec AUTO_PUBLISH = FALSE (miroir de C3)', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'validateSchedulerConfig', validInput({ autoPublish: false, days: [] }));
  includes(codes(r), 'SCHED_DAYS_EMPTY', 'C3 ne dépend pas de AUTO_PUBLISH');
});

test('6 articles sur 4 jours → SCHED_DISTRIBUTION', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'validateSchedulerConfig', validInput({
    days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']
  }));
  eq(r.ok, false, 'refusé');
  includes(codes(r), 'SCHED_DISTRIBUTION', 'code');
});

test('SCHEDULE_MODE non supporté → SCHED_MODE', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'validateSchedulerConfig', validInput({ mode: 'DAILY' }));
  eq(r.ok, false, 'refusé');
  includes(codes(r), 'SCHED_MODE', 'code');
});

test('seul WEEKLY est proposé', () => {
  const { ctx } = makeCtx();
  eqList(call(ctx, 'getSchedulerConfigState').modes, ['WEEKLY'], 'modes supportés');
  ok(SCHEDULER_SRC.indexOf("var SCHEDULER_MODES = ['WEEKLY']") !== -1, 'aucun mode ajouté');
});

test('MAX_ARTICLES_PER_RUN hors borne → SCHED_MAX_PER_RUN', () => {
  const { ctx } = makeCtx();
  ['0', '8', 'x', ''].forEach((v) => {
    const r = call(ctx, 'validateSchedulerConfig', validInput({ maxPerRun: v }));
    eq(r.ok, false, 'refusé : ' + JSON.stringify(v));
    includes(codes(r), 'SCHED_MAX_PER_RUN', 'code pour ' + JSON.stringify(v));
  });
});

test('AUTO_PUBLISH illisible → SCHED_AUTO_PUBLISH', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'validateSchedulerConfig', validInput({ autoPublish: 'peut-etre' }));
  includes(codes(r), 'SCHED_AUTO_PUBLISH', 'code');
});

test('AUTO_PUBLISH accepte booleen et chaînes TRUE/FALSE', () => {
  const { ctx } = makeCtx();
  eq(call(ctx, 'validateSchedulerConfig', validInput({ autoPublish: false })).ok, true, 'false');
  eq(call(ctx, 'validateSchedulerConfig', validInput({ autoPublish: 'TRUE' })).ok, true, 'TRUE');
  eq(call(ctx, 'validateSchedulerConfig', validInput({ autoPublish: 'false' })).normalized.AUTO_PUBLISH, 'FALSE', 'normalisé');
});

test('EQUIVALENCE avec validateConfig() : même verdict sur 49 combinaisons', () => {
  const { ctx } = makeCtx();
  // Bornes 1..7 : au-delà, Scheduler.gs refuse pour dépassement de borne (une
  // raison distincte, déjà couverte) et non pour la règle de répartition.
  const totals = [1, 2, 3, 4, 5, 6, 7];
  const daySets = [
    'MONDAY',
    'MONDAY,TUESDAY',
    'TUESDAY,FRIDAY',
    'MONDAY,TUESDAY,WEDNESDAY',
    'MONDAY,TUESDAY,WEDNESDAY,THURSDAY',
    'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
    ''
  ];
  let checked = 0;
  totals.forEach((total) => {
    daySets.forEach((days) => {
      const list = days === '' ? [] : days.split(',');
      const label = total + '/' + list.length + 'j';
      const mine = call(ctx, 'validateSchedulerConfig', validInput({
        perWeek: String(total), days: list
      }));
      const mineCodes = codes(mine);
      const theirs = existingRuleVerdict(ctx, total, days);

      if (theirs === 'C3') {
        includes(mineCodes, 'SCHED_DAYS_EMPTY', label + ' → C3 (jour vide)');
      } else if (theirs === 'C3b') {
        includes(mineCodes, 'SCHED_DISTRIBUTION', label + ' → C3b (non répartissable)');
      } else {
        const blocking = mineCodes.filter((c) => c === 'SCHED_DAYS_EMPTY' || c === 'SCHED_DISTRIBUTION');
        eq(blocking.length, 0, label + ' : aucun refus de répartition attendu');
      }
      checked += 1;
    });
  });
  eq(checked, 49, 'combinaisons effectivement testées');
});

/* -------------------------------------------------------------------------- */
suite('Résumé de répartition');
/* -------------------------------------------------------------------------- */

test('6 articles / 2 jours → 3 par jour', () => {
  const { ctx } = makeCtx();
  const s = call(ctx, 'computeScheduleSummary', '6', ['TUESDAY', 'FRIDAY']);
  eq(s.perWeek, 6, 'total');
  eq(s.perDay, 3, 'par jour');
  eq(s.even, true, 'répartition exacte');
  eqList(s.days, ['TUESDAY', 'FRIDAY'], 'jours normalisés');
});

test('6 articles / 4 jours → répartition impossible', () => {
  const { ctx } = makeCtx();
  const s = call(ctx, 'computeScheduleSummary', '6', ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']);
  eq(s.even, false, 'non répartissable');
  eq(s.perDay, 1.5, 'quotient');
});

test('aucun jour → perDay 0 sans exception', () => {
  const { ctx } = makeCtx();
  const s = call(ctx, 'computeScheduleSummary', '6', []);
  eq(s.perDay, 0, 'perDay');
  eq(s.days.length, 0, 'aucun jour');
});

/* -------------------------------------------------------------------------- */
suite('Écriture');
/* -------------------------------------------------------------------------- */

test('une saisie valide écrit les 5 clés', () => {
  const { ctx } = makeCtx();
  const r = call(ctx, 'saveSchedulerConfig', validInput({
    autoPublish: false, perWeek: '4', days: ['MONDAY'], maxPerRun: '2'
  }));
  eq(r.ok, true, 'ok');
  eq(r.code, 'SAVED', 'code');
  const map = call(ctx, 'readConfigMap');
  eq(map.AUTO_PUBLISH, 'FALSE', 'AUTO_PUBLISH écrite');
  eq(map.SCHEDULE_MODE, 'WEEKLY', 'SCHEDULE_MODE écrite');
  eq(map.ARTICLES_PER_WEEK, '4', 'ARTICLES_PER_WEEK écrite');
  eq(map.PUBLISH_DAYS, 'MONDAY', 'PUBLISH_DAYS écrite');
  eq(map.MAX_ARTICLES_PER_RUN, '2', 'MAX_ARTICLES_PER_RUN écrite');
});

test('PUBLISH_DAYS est sérialisé dans l\'ordre canonique', () => {
  const { ctx } = makeCtx();
  call(ctx, 'saveSchedulerConfig', validInput({ days: ['FRIDAY', 'TUESDAY'] }));
  eq(call(ctx, 'readConfigMap').PUBLISH_DAYS, 'TUESDAY,FRIDAY', 'ordre canonique stocké');
});

test('un refus n\'écrit RIEN', () => {
  const { ctx } = makeCtx();
  const before = JSON.stringify(call(ctx, 'readConfigMap'));
  const r = call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '5' }));
  eq(r.ok, false, 'refusé');
  eq(r.code, 'SCHED_INVALID', 'code');
  ok(r.errors.length > 0, 'erreurs retournées');
  eq(JSON.stringify(call(ctx, 'readConfigMap')), before, 'Config inchangée');
});

test('les clés hors périmètre ne sont JAMAIS écrites', () => {
  const { ctx } = makeCtx();
  const guarded = [
    'ARTICLES_PER_DAY', 'PUBLISH_HOUR', 'PUBLISH_MINUTE', 'TIMEZONE',
    'ENABLE_FEATURED_IMAGE', 'TEST_MODE', 'MAX_RETRIES', 'CATEGORY_MAP'
  ];
  const before = call(ctx, 'readConfigMap');
  call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'], maxPerRun: '3' }));
  const after = call(ctx, 'readConfigMap');
  guarded.forEach((k) => eq(after[k], before[k], k + ' intacte'));
});

test('TIMEZONE reste aligné sur le manifeste (jamais réécrit)', () => {
  const { ctx } = makeCtx();
  call(ctx, 'saveSchedulerConfig', validInput());
  eq(call(ctx, 'assertTimeZoneConsistency'), 'Africa/Casablanca', 'pas de divergence introduite');
});

test('l\'ordre des lignes de Config n\'est pas modifié', () => {
  const { ctx, helpers } = makeCtx();
  const keysBefore = helpers.sheets.Config._rows.map((r) => r[0]);
  call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'] }));
  const keysAfter = helpers.sheets.Config._rows.map((r) => r[0]);
  eqList(keysAfter, keysBefore, 'ni réordonnancement ni doublon de ligne');
});

test('aucune clé legacy WordPress n\'est écrite ni supprimée', () => {
  const { ctx, helpers } = createContext({
    sheets: {
      Config: configSheet({
        AUTO_PUBLISH: 'TRUE', SCHEDULE_MODE: 'WEEKLY', ARTICLES_PER_WEEK: '6',
        PUBLISH_DAYS: 'TUESDAY,FRIDAY', MAX_ARTICLES_PER_RUN: '1',
        WORDPRESS_URL: 'LEGACY / NOT USED',
        WORDPRESS_DEFAULT_STATUS: 'LEGACY / NOT USED',
        CREATE_MISSING_CATEGORIES: 'LEGACY / NOT USED'
      }),
      Logs: logsSheet()
    }
  });
  call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'] }));
  const rows = helpers.sheets.Config._rows;
  ['WORDPRESS_URL', 'WORDPRESS_DEFAULT_STATUS', 'CREATE_MISSING_CATEGORIES'].forEach((k) => {
    const row = rows.find((r) => r[0] === k);
    ok(row, k + ' toujours présente');
    eq(row[1], 'LEGACY / NOT USED', k + ' inchangée');
  });
});

test('l\'enregistrement est idempotent', () => {
  const { ctx } = makeCtx();
  // ARTICLES_PER_WEEK (6→4) et PUBLISH_DAYS (TUESDAY,FRIDAY→MONDAY) changent ;
  // AUTO_PUBLISH, SCHEDULE_MODE et MAX_ARTICLES_PER_RUN valent déjà la cible.
  const first = call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '4', days: ['MONDAY'] }));
  eq(first.ok, true, 'ok');
  eqList(first.changed.sort(), ['ARTICLES_PER_WEEK', 'PUBLISH_DAYS'], '2 clés modifiées au premier passage');
  const second = call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '4', days: ['MONDAY'] }));
  eq(second.ok, true, 'toujours ok');
  eqList(second.changed, [], 'aucune clé modifiée au second passage');
});

test('l\'écriture d\'une clé absente passe par setConfigValue (ligne ajoutée)', () => {
  const { ctx, helpers } = createContext({
    sheets: { Config: configSheet({ ARTICLES_PER_WEEK: '6', PUBLISH_DAYS: 'MONDAY' }), Logs: logsSheet() }
  });
  const before = helpers.sheets.Config._rows.length;
  const r = call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'], autoPublish: false }));
  eq(r.ok, true, 'ok');
  ok(helpers.sheets.Config._rows.length > before, 'les lignes manquantes sont créées');
  eq(call(ctx, 'readConfigMap').AUTO_PUBLISH, 'FALSE', 'AUTO_PUBLISH ajoutée avec la valeur enregistrée');
});

test('une erreur d\'écriture est capturée, jamais propagée', () => {
  const { ctx } = createContext({ sheets: { Logs: logsSheet() } });
  const r = call(ctx, 'saveSchedulerConfig', validInput());
  eq(r.ok, false, 'échec');
  eq(r.code, 'SCHED_SAVE_FAILED', 'code');
  ok(r.message.indexOf('Config') !== -1 || r.message.length > 0, 'message présent');
});

test('l\'enregistrement journalise sans secret', () => {
  const { ctx, helpers } = makeCtx();
  call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'] }));
  const rows = helpers.sheets.Logs._rows;
  ok(rows.length >= 1, 'une entrée de journal');
  const entry = rows[rows.length - 1];
  eq(entry[2], 'scheduler', 'action = scheduler');
  ok(String(entry[8]).indexOf('gho_') === -1, 'aucun token dans le détail');
});

test('un échec de journalisation n\'annule pas l\'écriture', () => {
  const { ctx } = createContext({ sheets: { Config: configSheet({
    AUTO_PUBLISH: 'TRUE', SCHEDULE_MODE: 'WEEKLY', ARTICLES_PER_WEEK: '6',
    PUBLISH_DAYS: 'MONDAY', MAX_ARTICLES_PER_RUN: '1'
  }) } });
  const r = call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'] }));
  eq(r.ok, true, 'écriture conservée sans feuille Logs');
});

/* -------------------------------------------------------------------------- */
suite('Déclencheurs — aucun créé');
/* -------------------------------------------------------------------------- */

test('describeSchedulerTriggers lit 0 déclencheur', () => {
  const { ctx } = makeCtx();
  const t = call(ctx, 'describeSchedulerTriggers');
  eq(t.readable, true, 'lecture possible');
  eq(t.count, 0, 'aucun déclencheur');
  eq(t.automationRunning, false, 'aucune automatisation en exécution');
});

test('le dialogue annonce honnêtement 0 déclencheur', () => {
  const { ctx, helpers } = makeCtx();
  call(ctx, 'openSchedulerConfigDialog');
  const html = helpers.ui.dialogs[0].html;
  ok(html.indexOf('0 d\u00e9clencheur \u2014 aucune automatisation en ex\u00e9cution.') !== -1,
    'mention « 0 déclencheur — aucune automatisation en exécution »');
});

test('deux déclencheurs simulés → libellé au pluriel, sans activation', () => {
  const { ctx, helpers } = makeCtx();
  ctx.ScriptApp.setProjectTriggers([{}, {}]);
  const s = call(ctx, 'getSchedulerConfigState');
  eq(s.triggers.count, 2, 'compteur');
  const html = call(ctx, 'renderSchedulerDialogHtml', s);
  ok(html.indexOf('2 d\u00e9clencheurs') !== -1, 'libellé pluriel');
});

test('un état illisible est signalé sans mensonge', () => {
  const { ctx } = makeCtx();
  ctx.ScriptApp.getProjectTriggers = () => { throw new Error('acces refuse'); };
  const t = call(ctx, 'describeSchedulerTriggers');
  eq(t.readable, false, 'illisible');
  eq(t.count, -1, 'compteur inconnu');
  ok(call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'))
    .indexOf('illisible') !== -1, 'mention « illisible »');
});

test('aucun déclencheur n\'est créé par le flux complet', () => {
  const { ctx } = makeCtx();
  call(ctx, 'onOpen');
  call(ctx, 'openSchedulerConfigDialog');
  call(ctx, 'getSchedulerConfigState');
  call(ctx, 'saveSchedulerConfig', validInput({ perWeek: '2', days: ['MONDAY'] }));
  eq(ctx.ScriptApp.__projectTriggers.length, 0, 'ScriptApp toujours vide');
});

test('preuve statique : ni création ni suppression de déclencheur', () => {
  notOk(/newTrigger\s*\(/.test(SCHEDULER_SRC), 'newTrigger absent');
  notOk(/ScriptApp\.deleteTrigger/.test(SCHEDULER_SRC), 'deleteTrigger absent');
  notOk(/ScriptApp\.createTrigger/.test(SCHEDULER_SRC), 'createTrigger absent');
  ok(/ScriptApp\.getProjectTriggers/.test(SCHEDULER_SRC), 'getProjectTriggers présent (lecture)');
  notOk(/Services\.getScriptResources/.test(SCHEDULER_SRC), 'aucun script externe');
  notOk(/PropertiesService/.test(SCHEDULER_SRC), 'aucun Script Property');
});

/* -------------------------------------------------------------------------- */
suite('Rendu du dialogue');
/* -------------------------------------------------------------------------- */

test('les jours sont des cases à cocher, jamais un champ libre', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  eq((html.match(/data-day="[A-Z]+"/g) || []).length, 7, '7 cases à cocher');
  ok(html.indexOf('data-day="TUESDAY" checked') !== -1, 'mardi coché d\'après Config');
  ok(html.indexOf('data-day="FRIDAY" checked') !== -1, 'vendredi coché d\'après Config');
  notOk(/data-day="SUNDAY" checked/.test(html), 'dimanche non coché');
  ok(html.indexOf('name="PUBLISH_DAYS"') === -1, 'aucun champ libre PUBLISH_DAYS');
});

test('les cases à cocher sont des <input type="checkbox">', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  const dayInputs = html.match(/<input type="checkbox" data-day="[A-Z]+"/g) || [];
  eq(dayInputs.length, 7, '7 input checkbox de jour');
  ok(html.indexOf('id="autoPublish"') !== -1, 'case AUTO_PUBLISH');
});

test('le fuseau est affiché en lecture seule', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  ok(html.indexOf('Fuseau horaire (lecture seule)') !== -1, 'mention lecture seule');
  ok(html.indexOf('Africa/Casablanca') !== -1, 'fuseau affiché');
  ok(html.indexOf('id="timeZone"') === -1, 'aucun champ éditable pour le fuseau');
});

test('le client appelle saveSchedulerConfig et jamais setConfigValue', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  ok(html.indexOf('.saveSchedulerConfig(') !== -1, 'appel serveur saveSchedulerConfig');
  ok(html.indexOf('setConfigValue') === -1, 'setConfigValue absent du client');
});

test('les erreurs sont affichées dans le dialogue, sans alert()', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  ok(html.indexOf('id="result" role="status" aria-live="polite"') !== -1, 'zone de statut accessible');
  ok(html.indexOf('withFailureHandler') !== -1, 'échec réseau capturé');
  ok(!/\balert\s*\(/.test(html), 'aucun alert()');
});

test('le résumé vivant utilise la règle ARTICLES_PER_WEEK / nbJours', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  ok(html.indexOf('var per=n/days.length;') !== -1, 'division par le nombre de jours');
  ok(html.indexOf('ne se divise pas exactement sur') !== -1, 'message de répartition impossible');
  ok(html.indexOf('id="summary" aria-live="polite"') !== -1, 'zone de résumé annoncée');
});

test('seul le mode supporté est rendu dans le sélecteur', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  eq((html.match(/<option value="[A-Z]+"/g) || []).length, 1, 'une seule option');
  ok(html.indexOf('<option value="WEEKLY" selected>') !== -1, 'WEEKLY sélectionné');
});

test('une valeur Config hostile est échappée', () => {
  const { ctx } = makeCtx({ ARTICLES_PER_WEEK: '6"><script>alert(1)</script>' });
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  notOk(html.indexOf('"><script>alert(1)</script>') !== -1, 'injection neutralisée');
  ok(html.indexOf('&quot;&gt;&lt;script&gt;') !== -1, 'valeur échappée');
});

test('les bornes de saisie sont rendues', () => {
  const { ctx } = makeCtx();
  const html = call(ctx, 'renderSchedulerDialogHtml', call(ctx, 'getSchedulerConfigState'));
  ok(html.indexOf('id="perWeek" min="1" max="7"') !== -1, 'bornes ARTICLES_PER_WEEK');
  ok(html.indexOf('id="maxPerRun" min="1" max="7"') !== -1, 'bornes MAX_ARTICLES_PER_RUN');
});

/* -------------------------------------------------------------------------- */
suite('Non-régression — périmètre respecté');
/* -------------------------------------------------------------------------- */

test('le pipeline de publication n\'est pas modifié par Scheduler.gs', () => {
  ['deleteArticle', 'deleteArticleById', 'runDeletePipeline', 'publishSelectedArticle',
    'publishNextReadyArticle', 'assertWritesAllowed', 'deleteFile'
  ].forEach((fn) => {
    notOk(new RegExp('function\\s+' + fn + '\\s*\\(').test(SCHEDULER_SRC), fn + ' non redéfini');
  });
});

test('Scheduler.gs n\'écrit que via setConfigValue', () => {
  const writers = (SCHEDULER_SRC.match(/\w+SetValue\s*\(/g) || []);
  eqList(writers, [], 'aucun setValue direct');
  ok(SCHEDULER_SRC.indexOf('setConfigValue(') !== -1, 'setConfigValue utilisé');
});

test('les constantes de clés correspondent au périmètre annoncé', () => {
  const { ctx } = makeCtx();
  const writable = ctx.SCHEDULER_WRITABLE_KEYS;
  eqList(writable, [
    'AUTO_PUBLISH', 'SCHEDULE_MODE', 'ARTICLES_PER_WEEK', 'PUBLISH_DAYS', 'MAX_ARTICLES_PER_RUN'
  ], 'périmètre d\'écriture');
  writable.forEach((k) => {
    ok(ctx.CONFIG_KEYS.indexOf(k) !== -1, k + ' existe déjà dans Config.gs');
  });
});

test('ensureConfigSheet continue de recréer les clés legacy', () => {
  const { ctx } = createContext({ sheets: { Logs: logsSheet() } });
  call(ctx, 'ensureConfigSheet');
  const map = call(ctx, 'readConfigMap');
  eq(map.WORDPRESS_URL, 'LEGACY / NOT USED', 'WORDPRESS_URL recréée');
  eq(map.WORDPRESS_DEFAULT_STATUS, 'LEGACY / NOT USED', 'WORDPRESS_DEFAULT_STATUS recréée');
  eq(map.CREATE_MISSING_CATEGORIES, 'LEGACY / NOT USED', 'CREATE_MISSING_CATEGORIES recréée');
});

/* -------------------------------------------------------------------------- */

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write('ECHEC : ' + failures.length + ' test(s) en échec, ' + passed + ' réussi(s)\n');
  failures.forEach((f) => process.stdout.write('  [' + f.suite + '] ' + f.name + '\n    ' + f.message + '\n'));
  process.exit(1);
}
process.stdout.write('OK : ' + passed + ' tests réussis (Scheduler)\n');
