/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Sheets.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : structure et accès aux feuilles `Articles`, `Config`
 * et `Logs`. Création idempotente, lecture pilotée par les en-têtes (l'ordre
 * des colonnes n'est pas critique), écriture ciblée.
 *
 * Décision D1 : quatre champs de description distincts
 *   META_DESCRIPTION (déjà dans les 14 colonnes imposées)
 * + SOCIAL_DESCRIPTION, ARTICLE_EXCERPT, CARD_EXCERPT (ajoutés, documentés §5.3).
 * Décision D8 : aucun fichier de test n'est créé ni modifié par ce module.
 */

/** Noms de feuilles — exactement 3 feuilles principales. */
var SHEETS = {
  ARTICLES: 'Articles',
  CONFIG: 'Config',
  LOGS: 'Logs'
};

/**
 * Colonnes `Articles`.
 * Les 14 premières sont imposées par la mission et conservées dans l'ordre.
 * Les suivantes sont des ajouts documentés (décision D1 + idempotence).
 * `READING_TIME` est un ajout D1 d'intégration (cf. commentaire sur la
 * colonne) : le moteur de rendu l'exige et ne la calcule jamais.
 */
var ARTICLE_COLUMNS = [
  // --- 14 colonnes imposées (ordre inchangé) ---
  'ID',
  'TITLE',
  'KEYWORD',
  'CONTENT',
  'CATEGORY',
  'SLUG',
  'SEO_TITLE',
  'META_DESCRIPTION',
  'IMAGE_URL',
  'STATUS',
  'WP_POST_ID',
  'WP_URL',
  'PUBLISHED_AT',
  'ERROR',
  // --- Ajout D1 : descriptions distinctes ---
  'SOCIAL_DESCRIPTION',
  'ARTICLE_EXCERPT',
  'CARD_EXCERPT',
  // --- Ajout D1 (intégration Renderer) : temps de lecture ---
  // Le gabarit expose {{READING_TIME}} et le moteur refuse de le CALCULER
  // (PO-2 : donnée éditoriale, jamais dérivée du nombre de mots). Sans cette
  // colonne, aucune ligne ne pourrait être rendue (code R3b) : la donnée doit
  // donc être saisissable. readArticles() étant piloté par l'en-tête,
  // Renderer.gs la lit sans modification.
  'READING_TIME',
  // --- Ajout technique : idempotence / traçabilité ---
  'GITHUB_PATH',
  'GITHUB_SHA',
  'GITHUB_COMMIT'
];

/** Colonnes `Logs`. */
var LOG_COLUMNS = [
  'TIMESTAMP',
  'LEVEL',
  'ACTION',
  'ARTICLE_ID',
  'SLUG',
  'STATUS',
  'GITHUB_PATH',
  'MESSAGE',
  'DETAILS'
];

/** Statuts autorisés. */
var STATUS = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  ERROR: 'ERROR'
};

var VALID_STATUSES = [
  STATUS.DRAFT, STATUS.READY, STATUS.PUBLISHING, STATUS.PUBLISHED, STATUS.ERROR
];

/** Niveaux de log. */
var LEVEL = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

/* -------------------------------------------------------------------------- */
/* Accès                                                                      */
/* -------------------------------------------------------------------------- */

function getSpreadsheet() {
  var id = propGet(PROP_KEYS.SPREADSHEET_ID);
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'Spreadsheet introuvable. Renseigner SPREADSHEET_ID en Script Property ' +
      'ou lier le script au tableur.'
    );
  }
  return active;
}

/**
 * Retourne la feuille par nom, ou la crée si absente.
 * @param {string} name
 * @param {Object=} opts {create:boolean}
 */
function getSheetByNameOrCreate(name, opts) {
  var create = !opts || opts.create !== false;
  var sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet && create) sheet = getSpreadsheet().insertSheet(name);
  return sheet;
}

/** Lecture seule : retourne la feuille ou null si elle n'existe pas encore. */
function getSheetByName(name) {
  return getSheetByNameOrCreate(name, { create: false });
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Crée les feuilles manquantes et écrit les en-têtes attendus.
 * N'écrase AUCUNE donnée existante : si un en-tête diffère, l'écart est
 * rapporté (drift) au lieu d'être corrigé silencieusement.
 *
 * @return {{created:string[], missingHeaders:Object[]}}
 */
function bootstrapSheets() {
  var report = { created: [], missingHeaders: [] };

  var articles = getSheetByNameOrCreate(SHEETS.ARTICLES);
  if (isNewSheet(articles)) {
    articles.getRange(1, 1, 1, ARTICLE_COLUMNS.length)
      .setValues([ARTICLE_COLUMNS]);
    report.created.push(SHEETS.ARTICLES);
  } else {
    report.missingHeaders.push.apply(
      report.missingHeaders,
      checkHeaders(articles, ARTICLE_COLUMNS, SHEETS.ARTICLES)
    );
  }

  var logs = getSheetByNameOrCreate(SHEETS.LOGS);
  if (isNewSheet(logs)) {
    logs.getRange(1, 1, 1, LOG_COLUMNS.length).setValues([LOG_COLUMNS]);
    report.created.push(SHEETS.LOGS);
  } else {
    report.missingHeaders.push.apply(
      report.missingHeaders,
      checkHeaders(logs, LOG_COLUMNS, SHEETS.LOGS)
    );
  }

  var configCreated = ensureConfigSheet();
  if (configCreated.length) report.created.push(SHEETS.CONFIG);

  return report;
}

function isNewSheet(sheet) {
  return sheet.getLastRow() < 1;
}

/**
 * Compare l'en-tête attendu à l'en-tête réel.
 * @return {Array<{sheet:string, expected:string, found:string}>}
 */
function checkHeaders(sheet, expected, label) {
  var found = sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(function (v) {
    return String(v === null ? '' : v).trim();
  });
  var drift = [];
  expected.forEach(function (name, i) {
    if (found[i] !== name) {
      drift.push({
        sheet: label,
        column: i + 1,
        expected: name,
        found: found[i] || '(vide)'
      });
    }
  });
  return drift;
}

/** Map en-tête → index de colonne (1-based) pour une feuille. */
function headerIndex(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var c = 0; c < head.length; c++) {
    var key = String(head[c] === null ? '' : head[c]).trim();
    if (key) map[key] = c + 1;
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Lecture des articles                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Lit toutes les lignes de `Articles` sous forme d'objets, pilotés par
 * l'en-tête. La ligne 1 (en-têtes) est ignorée. `__row` conserve le n° de
 * ligne pour les écritures ciblées.
 *
 * @return {Array<Object>}
 */
function readArticles() {
  var sheet = getSheetByNameOrCreate(SHEETS.ARTICLES, { create: false });
  if (!sheet || sheet.getLastRow() < 2) return [];

  var map = headerIndex(sheet);
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  var out = [];

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var any = false;
    var obj = { __row: r + 2 };
    for (var name in map) {
      if (!Object.prototype.hasOwnProperty.call(map, name)) continue;
      var v = row[map[name] - 1];
      var text = v === null || v === undefined ? '' : String(v).trim();
      obj[name] = text;
      if (text !== '') any = true;
    }
    if (any) out.push(obj);
  }
  return out;
}

/** Retrouve un article par ID. @return {Object|null} */
function findArticleById(id) {
  var key = String(id || '').trim();
  if (!key) return null;
  var rows = readArticles();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].ID === key) return rows[i];
  }
  return null;
}

/**
 * Écrit une ou plusieurs colonnes d'un article identifié par son ID.
 * Ne crée jamais de ligne (l'ID doit exister).
 * @return {boolean} true si la ligne a été trouvée
 */
function updateArticleFields(id, fields) {
  var sheet = getSheetByNameOrCreate(SHEETS.ARTICLES, { create: false });
  if (!sheet) throw new Error('Feuille Articles introuvable');
  var article = findArticleById(id);
  if (!article) return false;

  var map = headerIndex(sheet);
  var writes = [];
  Object.keys(fields).forEach(function (name) {
    if (!Object.prototype.hasOwnProperty.call(map, name)) {
      throw new Error('Colonne inconnue : ' + name);
    }
    var value = fields[name];
    writes.push({ col: map[name], value: value === null || value === undefined ? '' : String(value) });
  });

  for (var i = 0; i < writes.length; i++) {
    sheet.getRange(article.__row, writes[i].col).setValue(writes[i].value);
  }
  return true;
}

/**
 * Liste les articles éligibles, triés par ordre de feuille (déterministe).
 * @param {string} status statut exact requis
 * @return {Array<Object>}
 */
function findArticlesByStatus(status) {
  return readArticles().filter(function (a) { return a.STATUS === status; });
}

/** Applique un verrou de script pour sérialiser les écritures. */
function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
