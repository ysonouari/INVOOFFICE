/**
 * INVOOFFICE — Appels d'outils Apps Script
 * Module : tests/harness.cjs
 * ---------------------------------------------------------------------------
 * Charge les modules .gs dans un contexte `vm` avec les quelques globales
 * Apps Script réellement utilisées (Sheets, Properties, UrlFetch, LockService,
 * Utilities) afin que le rendu ET la publication soient testables SANS
 * exécution Apps Script et SANS réseau.
 *
 * Le harnais n'est volontairement pas un test Playwright : il porte le nom
 * `harness.cjs` et vit hors de `tests/`, donc la globale de `playwright.config`
 * (testDir: '.') ne le collecte pas.
 *
 * Doublures conformes à l'API réelle :
 *   - getLastRow() inclut la ligne d'en-tête (1 + nombre de lignes de données) ;
 *   - getRange(row, col[, numRows, numCols]) lit ET écrit dans la feuille, ce
 *     qui permet d'observer les transitions de statut du Publisher ;
 *   - aucun appel réseau n'est possible par défaut (route non mockée = échec).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APPS_SCRIPT_DIR = path.join(__dirname, '..');

/** Préfixe des URLs `contents` de l'API GitHub (hors domaine, hors query). */
const CONTENTS_PATH_RE = /^\/repos\/[^/]+\/[^/]+\/contents\//;

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
  'Publisher.gs',
  'BlogIndexes.gs',
  'Code.gs'
];

/* -------------------------------------------------------------------------- */
/* Doublures Sheets                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Feuille simulée : en-tête + lignes de données, avec lecture/écriture réelles.
 * `getLastRow()` inclut l'en-tête, comme dans Apps Script.
 */
function makeSheet(headerRow, rows, name) {
  const sheet = {
    _header: headerRow || [],
    _rows: (rows || []).map((r) => r.slice()),
    _name: name || '',
    _activeCell: { row: 1, column: 1 },

    getName() { return this._name; },
    setName(v) { this._name = v; return this; },

    getLastRow() { return this._rows.length + 1; },
    getLastColumn() { return this._header.length; },

    getActiveCell() {
      const cell = this._activeCell;
      return {
        getRow: () => cell.row,
        getColumn: () => cell.column,
        setRow: (r) => { cell.row = r; },
        setColumn: (c) => { cell.column = c; }
      };
    },

    /** Lecture d'une cellule (1 = en-tête, 2+ = données). */
    _read(rr, cc) {
      if (rr === 1) return this._header[cc - 1] === undefined ? '' : this._header[cc - 1];
      const row = this._rows[rr - 2];
      if (!row) return '';
      return row[cc - 1] === undefined ? '' : row[cc - 1];
    },

    /** Écriture d'une cellule, en développant la feuille au besoin. */
    _write(rr, cc, value) {
      if (rr === 1) { this._header[cc - 1] = value; return; }
      while (this._rows.length < rr - 1) this._rows.push([]);
      const row = this._rows[rr - 2];
      while (row.length < cc - 1) row.push('');
      row[cc - 1] = value;
    },

    getRange(row, col, numRows, numCols) {
      const r = numRows === undefined ? 1 : numRows;
      const c = numCols === undefined ? 1 : numCols;
      const self = this;
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < r; i += 1) {
            const line = [];
            for (let j = 0; j < c; j += 1) line.push(self._read(row + i, col + j));
            out.push(line);
          }
          return out;
        },
        getValue: () => self._read(row, col),
        setValue: (v) => { self._write(row, col, v); return this; },
        setValues: (values) => {
          (values || []).forEach((line, i) => {
            (line || []).forEach((v, j) => self._write(row + i, col + j, v));
          });
          return this;
        },
        clearContent: () => {
          for (let i = 0; i < r; i += 1) {
            for (let j = 0; j < c; j += 1) self._write(row + i, col + j, '');
          }
          return this;
        }
      };
    },

    appendRow(values) {
      this._rows.push((values || []).slice());
      return this;
    },

    setFrozenRows() { return this; },
    setColumnWidth() { return this; },
    autoResizeColumns() { return this; }
  };
  return sheet;
}

/* -------------------------------------------------------------------------- */
/* Doublure HTTP : routes déterministes                                        */
/* -------------------------------------------------------------------------- */

/**
 * UrlFetchApp mocké. Chaque route est consommée une fois (`times` par défaut)
 * ou répétée (`times: Infinity`). Une route `{ status: 'transport' }` lève
 * une erreur réseau, ce qui permet de tester les retries de transport.
 *
 * @param {Array<{method?:string, path:string|RegExp, code?:number,
 *                body?:*, times?:number, status?:string}>} routes
 */
function makeFetchMock(routes) {
  const calls = [];
  const queue = (routes || []).map((r) => Object.assign({}, r, {
    left: r.times === undefined ? 1 : r.times
  }));

  const fetchImpl = (url, params) => {
    const method = String((params && params.method) || 'get').toLowerCase();
    const call = {
      url: String(url),
      path: String(url).replace(/^https?:\/\/[^/]+/, ''),
      method: method,
      payload: params && params.payload ? params.payload : null
    };
    calls.push(call);

    const route = queue.find((r) => {
      if (r.left <= 0) return false;
      if (r.method && String(r.method).toLowerCase() !== method) return false;
      return r.path instanceof RegExp ? r.path.test(call.path) : call.path.indexOf(r.path) !== -1;
    });

    if (!route) {
      throw new Error('Route non mockée : ' + method + ' ' + call.path);
    }
    route.left -= 1;

    if (route.status === 'transport') {
      throw new Error('Transport simulé : ' + method + ' ' + call.path);
    }

    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body === undefined ? {} : route.body);
    const code = route.code === undefined ? 200 : route.code;
    return {
      getResponseCode: () => code,
      getContentText: () => body,
      getAllHeaders: () => ({})
    };
  };

  fetchImpl.fetch = fetchImpl;
  fetchImpl.calls = calls;
  fetchImpl.pending = () => queue.filter((r) => r.left > 0).length;
  return fetchImpl;
}

/* -------------------------------------------------------------------------- */
/* Contexte                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Construit un contexte isolé avec les doublures.
 *
 * @param {{sheets?:Object, properties?:Object, fetchImpl?:Function,
 *          lockAvailable?:boolean, activeCell?:{row:number,column:number}}} [opts]
 * @return {{ctx:Object, helpers:Object}}
 */
function createContext(opts) {
  const options = opts || {};
  const props = Object.assign({}, options.properties || {});
  const sheets = Object.assign({}, options.sheets || {});
  const lockState = {
    available: options.lockAvailable === undefined ? true : options.lockAvailable,
    held: false,
    log: []
  };
  const sleeps = [];
  const ui = makeUiMock();

  if (options.activeCell) {
    const target = sheets.Articles;
    if (target) target._activeCell = { row: options.activeCell.row, column: options.activeCell.column || 1 };
  }

  const spreadsheetMethods = () => ({
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      const created = makeSheet([], [], name);
      sheets[name] = created;
      return created;
    },
    getActiveSheet: () => sheets.Articles || null
  });

  const SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheetMethods(),
    openById: (id) => {
      if (id !== 'harness-spreadsheet') {
        throw new Error('SPREADSHEET_ID inattendu dans les tests : ' + id);
      }
      return spreadsheetMethods();
    },
    getActiveSheet: () => sheets.Articles || null,
    getUi: () => ui
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
      sleep: (ms) => { sleeps.push(ms); },
      formatDate: (d, tz, fmt) => new Date(d).toISOString(),
      getUuid: () => '00000000-0000-0000-0000-000000000000',
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      // Apps Script : Utilities.base64Decode() renvoie un Byte[] SIGNE, PAS un
      // String. Le harnais reproduit ce contrat exact (sinon le defaut
      // html.replace de decodeContentResponse reste invisible aux tests).
      base64Decode: (text) => Array.from(Buffer.from(String(text), 'base64'))
        .map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (content) => {
        const bytes = () => {
          if (Buffer.isBuffer(content)) return content;
          if (Array.isArray(content)) return Buffer.from(content.map((b) => (b < 0 ? b + 256 : b)));
          return Buffer.from(String(content), 'utf8');
        };
        return {
          getBytes: () => bytes(),
          getDataAsString: (enc) => bytes().toString(enc === 'UTF-8' ? 'utf8' : enc),
          getContentType: () => 'text/plain'
        };
      }
    },
    LockService: {
      getScriptLock: () => {
        const lock = {
          tryLock: (ms) => {
            lockState.log.push('tryLock:' + (ms === undefined ? 'default' : ms));
            if (!lockState.available) return null;
            lockState.held = true;
            return lock;
          },
          waitLock: (ms) => {
            lockState.log.push('waitLock:' + (ms === undefined ? 'default' : ms));
            if (!lockState.available) throw new Error('Verrou déjà détenu (waitLock)');
            lockState.held = true;
            return lock;
          },
          releaseLock: () => { lockState.log.push('releaseLock'); lockState.held = false; }
        };
        return lock;
      }
    },
    HtmlService: {
      createHtmlOutput: (html) => {
        const out = {
          setTitle: () => out,
          setWidth: () => out,
          setHeight: () => out,
          getContent: () => String(html || '')
        };
        return out;
      }
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
    Intl,
    Buffer
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

  return { ctx, helpers: { sheets, props, loaded, lock: lockState, sleeps, ui } };
}

/** Menu + alertes du tableur, pour observer onOpen() et les retours opérateur. */
function makeUiMock() {
  const items = [];
  const alerts = [];
  const menu = {
    name: '',
    items: items,
    addItem(label, fn) { items.push({ label: label, fn: fn }); return menu; },
    addSeparator() { items.push({ label: '---', fn: null }); return menu; },
    addToUi() { return menu; }
  };
  return {
    items: items,
    alerts: alerts,
    createMenu(name) { menu.name = name; return menu; },
    alert(message) { alerts.push(String(message)); },
    showModalDialog() {}
  };
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
    'CARD_EXCERPT', 'READING_TIME', 'GITHUB_PATH', 'GITHUB_SHA', 'GITHUB_COMMIT'
  ];
  const rows = articleObjects.map((a) => header.map((h) => (a[h] === undefined ? '' : a[h])));
  return makeSheet(header, rows, 'Articles');
}

/** Feuille `Config` à partir d'un objet clé/valeur. */
function configSheet(values) {
  const header = ['Cle', 'Valeur'];
  const rows = Object.keys(values).map((k) => [k, values[k]]);
  return makeSheet(header, rows, 'Config');
}

/** Feuille `Logs` vide (les écritures sont observées via `_rows`). */
function logsSheet() {
  return makeSheet(
    ['TIMESTAMP', 'LEVEL', 'ACTION', 'ARTICLE_ID', 'SLUG', 'STATUS', 'GITHUB_PATH', 'MESSAGE', 'DETAILS'],
    [],
    'Logs'
  );
}

/** Contenu GitHub `contents` d'un fichier texte, tel que renvoyé par l'API. */
function contentsResponse(path, text, sha) {
  return {
    type: 'file',
    path: path,
    sha: sha || 'sha-' + Buffer.from(path).toString('hex').slice(0, 8),
    size: Buffer.byteLength(text, 'utf8'),
    content: Buffer.from(text, 'utf8').toString('base64')
  };
}

/** Réponse `contents` d'une création/mise à jour (PUT). */
function putResponse(path, text, sha, commitSha) {
  return {
    content: contentsResponse(path, text, sha),
    commit: { sha: commitSha || 'commit-' + (sha || 'x') }
  };
}

/* -------------------------------------------------------------------------- */
/* Dépôt mocké (état) : index de catégorie, hub Blog, sitemap                 */
/* -------------------------------------------------------------------------- */

/**
 * Dépôt GitHub MUTABLE : contrairement à makeFetchMock (liste de routes
 * consommables une fois), ce mock garde l'état réellement écrit. Indispensable
 * pour prouver l'idempotence des index : un PUT doit être visible au GET
 * suivant, sinon « republication sans écriture » serait indémontrable.
 *
 * Seuls les chemins `/contents/` sont servis ici ; tout le reste est délégué à
 * `fallback` (makeFetchMock), ce qui permet de mocker le gabarit et l'article
 * avec les mécanismes existants, inchangés.
 *
 * @param {Array<{path:string, content:string, sha?:string}>} initialFiles
 * @param {{fallback?:Function}} [opt]
 */
function makeRepoMock(initialFiles, opt) {
  const fallback = (opt && opt.fallback) || null;
  const files = new Map();
  let seq = 0;
  (initialFiles || []).forEach((f) => {
    seq += 1;
    files.set(f.path, { content: f.content, sha: f.sha || 'sha-seed-' + seq });
  });

  const calls = [];
  const CONTENTS_RE = CONTENTS_PATH_RE;

  const respond = (code, body) => ({
    getResponseCode: () => code,
    getContentText: () => JSON.stringify(body),
    getAllHeaders: () => ({})
  });

  const fetchImpl = (url, params) => {
    const raw = String(url);
    const method = String((params && params.method) || 'get').toLowerCase();
    const bare = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const rel = CONTENTS_RE.test(bare) ? bare.replace(CONTENTS_RE, '') : null;

    // Ce mock ne sert QUE les fichiers d'index qu'il a ensemencés. Le
    // gabarit et l'article passent par le fallback : ils continuent d'être
    // couverts par makeFetchMock, et une route non déclarée reste une erreur.
    if (rel === null || !files.has(rel)) {
      if (!fallback) throw new Error('Route non mockée : ' + method + ' ' + bare);
      return fallback(url, params);
    }

    const call = {
      url: raw,
      path: bare,
      method: method,
      payload: params && params.payload ? params.payload : null
    };
    calls.push(call);

    if (method === 'get') {
      const file = files.get(rel);
      return respond(200, contentsResponse(rel, file.content, file.sha));
    }

    if (method === 'put') {
      const payload = JSON.parse(call.payload);
      seq += 1;
      const sha = 'sha-write-' + seq;
      files.set(rel, {
        content: Buffer.from(String(payload.content || ''), 'base64').toString('utf8'),
        sha: sha
      });
      return respond(200, putResponse(rel, 'x', sha, 'commit-' + seq));
    }

    return respond(405, { message: 'Method Not Allowed' });
  };

  fetchImpl.fetch = fetchImpl;
  fetchImpl.calls = calls;
  /** Contenu actuellement stocké pour `p` dans le dépôt mocké (null si absent). */
  fetchImpl.file = (p) => (files.has(p) ? files.get(p).content : null);
  fetchImpl.has = (p) => files.has(p);
  return fetchImpl;
}

/**
 * Dépôt GitHub complet : fichiers d'index ÉTATUABLES (makeRepoMock) + routes
 * ponctuelles consommables (makeFetchMock), avec un journal d'appels UNIQUE et
 * ordonné.
 *
 * C'est ce mock qu'utilisent les tests Publisher : le gabarit et l'article
 * restent couverts par makeFetchMock (inchangé), les index sont réinscriptibles,
 * et `calls` conserve l'ordre RÉEL des requêtes — indispensable pour prouver
 * l'ordre de publication article → catégorie → hub → sitemap.
 *
 * @param {Array<{path:string, content:string, sha?:string}>} indexFiles
 * @param {Array<Object>} routes routes ponctuelles (gabarit, article…)
 * @param {{failOnce?:{path?:string, method?:string, status?:number, body?:Object}}} [opt]
 *        `failOnce` fait échouer UNE seule requête (409 de conflit, 5xx…) puis
 *        délègue au comportement normal : c'est ce qui permet de tester le
 *        retry de createOrUpdate() sur les index.
 */
function makeGitMock(indexFiles, routes, opt) {
  const repo = makeRepoMock(indexFiles, { fallback: null });
  const queue = makeFetchMock(routes || []);
  const calls = [];
  const seeded = (indexFiles || []).map((f) => f.path);
  const o = opt || {};
  const failOnce = o.failOnce || null;
  let fired = false;

  const fetchImpl = (url, params) => {
    const raw = String(url);
    const method = String((params && params.method) || 'get').toLowerCase();
    // `path` conserve la query (comme makeFetchMock) : les tests historiques
    // assertent `?ref=master`. `bare` sert uniquement au routage interne.
    const withQuery = raw.replace(/^https?:\/\/[^/]+/, '');
    const bare = withQuery.split('?')[0];
    const rel = CONTENTS_PATH_RE.test(bare) ? bare.replace(CONTENTS_PATH_RE, '') : null;
    // Un chemin n'est servi par le dépôt mocké que s'il a été ENSEMENCÉ :
    // le gabarit et l'article restent couverts par les routes ponctuelles, donc
    // une route non déclarée demeure une erreur franche.
    const isIndex = rel !== null && seeded.indexOf(rel) !== -1;

    // Journal unique, dans l'ordre réel des appels.
    calls.push({
      url: raw,
      path: withQuery,
      method: method,
      payload: params && params.payload ? params.payload : null,
      index: isIndex
    });

    if (failOnce && !fired &&
        (!failOnce.path || bare.indexOf(failOnce.path) !== -1) &&
        (!failOnce.method || failOnce.method.toLowerCase() === method)) {
      fired = true;
      const code = failOnce.status || 409;
      return {
        getResponseCode: () => code,
        getContentText: () => JSON.stringify(failOnce.body || { message: 'Conflict' }),
        getAllHeaders: () => ({})
      };
    }

    if (isIndex) return repo(url, params);
    return queue(url, params);
  };

  fetchImpl.fetch = fetchImpl;
  fetchImpl.calls = calls;
  fetchImpl.indexCalls = calls.filter((c) => c.index);
  fetchImpl.base = queue;
  fetchImpl.file = repo.file;
  fetchImpl.has = repo.has;
  return fetchImpl;
}

/* -------------------------------------------------------------------------- */
/* Fixtures d'index : markup identique à la production Blog                    */
/* -------------------------------------------------------------------------- */

/** Un `<li class="article-item">` au markup EXACT de la production. */
function articleListItem(meta, href, title, excerpt) {
  return '<li class="article-item"><div class="meta">' + meta + '</div>' +
    '<h3><a href="' + href + '">' + title + '</a></h3>' +
    '<p>' + excerpt + '</p></li>';
}

/**
 * Copie à l'identique de `escHtml()` (Utils.gs).
 *
 * Les fixtures d'index doivent contenir les MÊMES entités que les fichiers de
 * production : sans cela, un extrait contenant une apostrophe produirait une
 * carte différente de celle du code, et l'idempotence serait faussement en
 * échec. Les fixtures sont donc « faithful by construction ».
 */
function escHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Page d'index (catégorie OU hub) : `.cat-grid` optionnel + une
 * `<ul class="article-list">`. CRLF et `<li>` sur une seule ligne, comme les
 * fichiers de production, pour que la détection de séparateur soit exercée.
 *
 * Les valeurs sont ÉCHAPPÉES comme en production (cf. escHtml ci-dessus).
 */
function indexPageFixture(opt) {
  const o = opt || {};
  const nl = '\r\n';
  const parts = ['<!DOCTYPE html>', '<html lang="fr">', '<head><title>' + escHtml(o.title || 'Blog') + '</title></head>', '<body>'];

  if (o.cards && o.cards.length) {
    parts.push('<div class="cat-grid">');
    o.cards.forEach((c) => {
      parts.push('  <div class="cat-card"><a href="/blog/' + c.slug + '/">' + escHtml(c.name) +
        '</a><div class="count">' + escHtml(c.count) + '</div></div>');
    });
    parts.push('</div>');
  }

  parts.push('<ul class="article-list">');
  (o.items || []).forEach((i) => {
    parts.push(articleListItem(escHtml(i.meta), escHtml(i.href), escHtml(i.title), escHtml(i.excerpt)));
  });
  parts.push('</ul>');
  parts.push('</body>', '</html>', '');
  return parts.join(nl);
}

/** Sitemap minimal : une entrée par ligne, comme `sitemap-fr.xml`. */
function sitemapFixture(locs) {
  const body = (locs || []).map((l) => {
    return '<url><loc>' + l + '</loc><lastmod>2026-07-01</lastmod>' +
      '<changefreq>monthly</changefreq><priority>0.8</priority></url>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    (body ? body + '\n' : '') +
    '</urlset>\n';
}

module.exports = {
  MODULES,
  createContext,
  call,
  articlesSheet,
  configSheet,
  logsSheet,
  makeSheet,
  makeFetchMock,
  makeRepoMock,
  makeGitMock,
  contentsResponse,
  putResponse,
  escHtml,
  articleListItem,
  indexPageFixture,
  sitemapFixture,
  APPS_SCRIPT_DIR
};
