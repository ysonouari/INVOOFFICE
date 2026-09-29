/**
 * INVOOFFICE — Appels d'outils Apps Script
 * Module : tests/harness.cjs
 * ---------------------------------------------------------------------------
 * Charge les modules .gs dans un contexte `vm` avec les quelques globales
 * Apps Script réellement utilisées (Sheets, Properties, UrlFetch), afin que le
 * moteur de rendu soit testable SANS exécution Apps Script et SANS réseau.
 *
 * Le harnais n'est volontairement pas un test Playwright : il porte le nom
 * `harness.cjs` et vit hors de `tests/`, donc la globale de `playwright.config`
 * (testDir: '.') ne le collecte pas.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APPS_SCRIPT_DIR = path.join(__dirname, '..');

/** Modules chargés, dans l'ordre (aucune dépendance à l'ordre : hoisting vm). */
const MODULES = [
  'Utils.gs',
  'Config.gs',
  'Sheets.gs',
  'Github.gs',
  'Validator.gs',
  'TemplateLoader.gs',
  'Logger.gs',
  'Renderer.gs',
  'Code.gs'
];

/* -------------------------------------------------------------------------- */
/* Doublures Apps Script                                                      */
/* -------------------------------------------------------------------------- */

/** Feuille Sheets simulée : valeurs tabulaires + lecture par en-tête. */
function makeSheet(headerRow, rows) {
  return {
    _header: headerRow || [],
    _rows: rows || [],
    getLastRow() { return this._rows.length; },
    getLastColumn() { return this._header.length; },
    getRange(row, col, numRows, numCols) {
      const r = numRows === undefined ? 1 : numRows;
      const c = numCols === undefined ? 1 : numCols;
      const startRow = row - 1;
      const startCol = col - 1;
      const values = [];
      for (let i = 0; i < r; i += 1) {
        const line = [];
        for (let j = 0; j < c; j += 1) {
          if (i === 0) {
            line.push(this._header[startCol + j]);
          } else {
            const src = this._rows[startRow + i - 1] || [];
            line.push(src[startCol + j] === undefined ? '' : src[startCol + j]);
          }
        }
        values.push(line);
      }
      return { getValues: () => values, setValue: () => {} };
    },
    appendRow() {},
    setFrozenRows() {},
    getLastRowValues() { return this._rows; }
  };
}

/**
 * Construit un contexte isolé avec les doublures.
 *
 * @param {{sheets?:Object, properties?:Object, fetchImpl?:Function}} [opts]
 * @return {{ctx:Object, helpers:Object}}
 */
function createContext(opts) {
  const options = opts || {};
  const props = Object.assign({}, options.properties || {});
  const sheets = Object.assign({}, options.sheets || {});

  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => sheets[name] || null,
      insertSheet: (name) => {
        const created = makeSheet([], []);
        sheets[name] = created;
        return created;
      }
    }),
    openById: (id) => {
      if (id !== 'harness-spreadsheet') {
        throw new Error('SPREADSHEET_ID inattendu dans les tests : ' + id);
      }
      return {
        getSheetByName: (name) => sheets[name] || null,
        insertSheet: (name) => {
          const created = makeSheet([], []);
          sheets[name] = created;
          return created;
        }
      };
    }
  };

  const sandbox = {
    console,
    SpreadsheetApp,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; }
      })
    },
    Session: { getActiveUser: () => ({ getEmail: () => 'harness@example.invalid' }) },
    UrlFetchApp: options.fetchImpl || { fetch: () => { throw new Error('réseau interdit dans les tests'); } },
    Utilities: {
      sleep: () => {},
      formatDate: (d, tz, fmt) => new Date(d).toISOString(),
      getUuid: () => '00000000-0000-0000-0000-000000000000'
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => null, releaseLock: () => {} })
    },
    HtmlService: {
      createHtmlOutput: () => ({ setTitle: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) })
    },
    Logger: {},
    MailApp: { sendEmail: () => { throw new Error('email interdit dans les tests'); } },
    Browser: {},
    JSON,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    Intl
  };
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);

  const loaded = [];
  MODULES.forEach((file) => {
    const full = path.join(APPS_SCRIPT_DIR, file);
    const code = fs.readFileSync(full, 'utf8');
    try {
      new vm.Script(code, { filename: file });
    } catch (e) {
      throw new Error(`Syntaxe invalide dans ${file} : ${e.message}`);
    }
    vm.runInContext(code, ctx, { filename: file });
    loaded.push(file);
  });

  return { ctx, helpers: { sheets, props, loaded } };
}

/** Wrapper : appelle une fonction du contexte en capturant ses erreurs. */
function call(ctx, name, ...args) {
  if (typeof ctx[name] !== 'function') {
    throw new Error(`Symbole introuvable : ${name}()`);
  }
  return ctx[name](...args);
}

/** Feuille `Articles` à partir d'objets (convertis en lignes + en-tête). */
function articlesSheet(articleObjects) {
  const header = [
    'ID', 'TITLE', 'KEYWORD', 'CONTENT', 'CATEGORY', 'SLUG', 'SEO_TITLE',
    'META_DESCRIPTION', 'IMAGE_URL', 'STATUS', 'WP_POST_ID', 'WP_URL',
    'PUBLISHED_AT', 'ERROR', 'SOCIAL_DESCRIPTION', 'ARTICLE_EXCERPT',
    'CARD_EXCERPT', 'GITHUB_PATH', 'GITHUB_SHA', 'GITHUB_COMMIT'
  ];
  const rows = articleObjects.map((a) => header.map((h) => (a[h] === undefined ? '' : a[h])));
  return makeSheet(header, rows);
}

/** Feuille `Config` à partir d'un objet clé/valeur. */
function configSheet(values) {
  const header = ['Cle', 'Valeur'];
  const rows = Object.keys(values).map((k) => [k, values[k]]);
  return makeSheet(header, rows);
}

module.exports = {
  MODULES,
  createContext,
  call,
  articlesSheet,
  configSheet,
  makeSheet,
  APPS_SCRIPT_DIR
};
