/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Config.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : lecture/écriture de la configuration.
 *   1. Script Properties (secrets + identifiants du dépôt) — jamais dans Sheets,
 *      jamais dans les logs, jamais affichés en clair.
 *   2. Feuille `Config` (valeurs métier, éditables sans redéploiement).
 *   3. Table de correspondance des catégories (décision D2).
 *
 * PHASE 2 — fondation. Aucune publication.
 */

/* -------------------------------------------------------------------------- */
/* Clés                                                                       */
/* -------------------------------------------------------------------------- */

/** Clés stockées en Script Properties. */
var PROP_KEYS = {
  TOKEN: 'GITHUB_TOKEN',
  OWNER: 'GITHUB_OWNER',
  REPOSITORY: 'GITHUB_REPOSITORY',
  BRANCH: 'GITHUB_BRANCH',
  API_BASE: 'GITHUB_API_BASE',
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  WRITE_ENABLED: 'GITHUB_WRITE_ENABLED',
  SITE_ORIGIN: 'SITE_ORIGIN'
};

/** Clés de la feuille `Config` (ordre d'affichage imposé par la mission). */
var CONFIG_KEYS = [
  'AUTO_PUBLISH',
  'ARTICLES_PER_DAY',
  'PUBLISH_HOUR',
  'PUBLISH_MINUTE',
  'TIMEZONE',
  'ENABLE_FEATURED_IMAGE',
  'TEST_MODE',
  'MAX_ARTICLES_PER_RUN',
  'MAX_RETRIES',
  'SCHEDULE_MODE',
  'ARTICLES_PER_WEEK',
  'PUBLISH_DAYS',
  'CATEGORY_MAP'
];

/** Valeurs par défaut. */
var CONFIG_DEFAULTS = {
  AUTO_PUBLISH: 'TRUE',
  ARTICLES_PER_DAY: '1',
  PUBLISH_HOUR: '',
  PUBLISH_MINUTE: '',
  // Même fuseau que le manifeste (appsscript.json). Aucun second fuseau caché :
  // l'horodatage de publication et le scheduler doivent lire CETTE valeur.
  // (Écart Europe/Paris corrigé : +2 h en été contre +1 h au Maroc.)
  TIMEZONE: 'Africa/Casablanca',
  // PO-3 : l'image à la une reste DÉSACTIVÉE. Le gabarit n'expose aucun
  // placeholder d'image et le socle de production référence en dur
  // /icons/og-image-1200x630.png. Passer cette valeur à TRUE n'ajoute donc
  // aucune image : le moteur ignore IMAGE_URL (cf. Renderer.gs).
  ENABLE_FEATURED_IMAGE: 'FALSE',
  // PHASE 4 : le mode test est le défaut. Le moteur de publication
  // (Publisher.gs) rend ET valide l'article, puis s'arrête : la levée du
  // mode test est un acte délibéré du Product Owner, jamais un effet de bord.
  // GITHUB_WRITE_ENABLED (Script Property) reste FALSE par défaut : les deux
  // verrous doivent être ouverts pour qu'un commit existe.
  TEST_MODE: 'TRUE',
  MAX_ARTICLES_PER_RUN: '1',
  MAX_RETRIES: '3',
  SCHEDULE_MODE: 'WEEKLY',
  ARTICLES_PER_WEEK: '6',
  PUBLISH_DAYS: 'TUESDAY,FRIDAY',
  // Décision D2 : correspondance EXPLICITE, jamais dérivée par slugify().
  // « TVA Maroc » → « tva » est un cas non dérivable.
  CATEGORY_MAP: JSON.stringify({
    'Auto-entrepreneur': 'auto-entrepreneur',
    'Devis': 'devis',
    'Facturation': 'facturation',
    'Guides': 'guides',
    'TVA Maroc': 'tva'
  })
};

/** Clés legacy WordPress : conservées, affichées, JAMAIS exécutées. */
var CONFIG_LEGACY = [
  'WORDPRESS_URL',
  'WORDPRESS_DEFAULT_STATUS',
  'CREATE_MISSING_CATEGORIES'
];

/* -------------------------------------------------------------------------- */
/* Script Properties                                                          */
/* -------------------------------------------------------------------------- */

function propGet(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (e) {
    return '';
  }
}

function propSet(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function propDelete(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

/**
 * Token GitHub. Usage unique : l'en-tête d'autorisation de Github.gs.
 * Ne jamais appeler cette fonction depuis un log, un message d'erreur ou l'UI.
 */
function getGithubToken() {
  return propGet(PROP_KEYS.TOKEN);
}

function getGithubOwner() {
  return propGet(PROP_KEYS.OWNER) || APP.OWNER;
}

function getGithubRepository() {
  return propGet(PROP_KEYS.REPOSITORY) || APP.REPOSITORY;
}

function getGithubBranch() {
  return propGet(PROP_KEYS.BRANCH) || APP.BRANCH;
}

function getGithubApiBase() {
  return (propGet(PROP_KEYS.API_BASE) || APP.API_BASE).replace(/\/+$/, '');
}

/**
 * Verrou d'écriture. Défaut FALSE : la fondation ne peut structurellement
 * produire aucun commit. Levé explicitement par le Product Owner lors du
 * pilote, jamais automatiquement — et jamais seul : TEST_MODE doit aussi
 * valoir FALSE (Publisher.gs, assertWritesAllowed).
 */
function writesEnabled() {
  return propGet(PROP_KEYS.WRITE_ENABLED).toUpperCase() === 'TRUE';
}

function setWritesEnabled(enabled) {
  propSet(PROP_KEYS.WRITE_ENABLED, enabled ? 'TRUE' : 'FALSE');
}

/**
 * Domaine canonique. Constante issue de l'audit (Phase 1, §1.1) :
 * https://www.invooffice.com — jamais invooffice.com.
 *
 * Un opérateur PEUT surcharger via la Script Property SITE_ORIGIN, mais
 * l'override doit être strictement identique à la valeur vérifiée : toute
 * autre valeur est refusée (protection contre invooffice.com et les anciens
 * domaines).
 */
function getSiteOrigin() {
  var override = propGet(PROP_KEYS.SITE_ORIGIN).replace(/\/+$/, '');
  return override || APP.SITE_ORIGIN;
}

/**
 * Décision D9 — garde-fou local, sans réseau.
 * Vérifie que l'origine effective est bien celle validée en Phase 1.
 * Appelée par buildSiteUrl(), donc à chaque construction d'URL.
 *
 * @throws {Error} si une origine non validée est configurée
 */
function assertSiteOrigin() {
  var effective = getSiteOrigin();
  if (effective !== APP.SITE_ORIGIN) {
    throw new Error(
      'SITE_ORIGIN non conforme : « ' + effective + ' » (valeur validée : ' +
      APP.SITE_ORIGIN + '). Corrigez la Script Property ' + PROP_KEYS.SITE_ORIGIN + '.'
    );
  }
  return effective;
}

/**
 * Décision D9 — vérification RÉELLE contre le dépôt, en lecture seule.
 * Confirme que les pages publiées utilisent bien l'origine validée, avant
 * toute génération d'URL. Appelée explicitement par le moteur (pas par
 * buildSiteUrl, pour ne pas introduire d'E/S réseau dans une fonction pure).
 *
 * @return {{ok:boolean, expected:string, found:string[], filesChecked:number}}
 * @throws {Error} si une page publiée diverge
 */
function verifySiteOriginFromRepository() {
  var expected = assertSiteOrigin();
  var found = [];
  var checked = 0;

  var samples = [APP.TEMPLATE_PATH].concat(APP.CANONICAL_SAMPLES || []);
  samples.forEach(function (path) {
    var file = getFile(path);
    if (!file) return;
    checked += 1;
    var re = /https?:\/\/[a-z0-9.-]+/gi;
    var m;
    while ((m = re.exec(file.content)) !== null) {
      if (found.indexOf(m[0]) === -1) found.push(m[0]);
    }
  });

  if (!checked) {
    throw new Error(
      'Vérification canonique impossible : aucune page lisible dans le dépôt. ' +
      'Contrôle manuel requis avant publication.'
    );
  }

  var foreign = found.filter(function (origin) {
    return origin !== expected && /\.invooffice\.com$/i.test(origin.replace(/^https?:\/\//, ''));
  });

  if (foreign.length) {
    throw new Error(
      'Origine canonique incohérente dans le dépôt : ' + foreign.join(', ') +
      ' (attendu ' + expected + ')'
    );
  }

  return { ok: true, expected: expected, found: found, filesChecked: checked };
}

/**
 * Fuseau de référence unique de la publication.
 *
 * Source de vérité : la feuille `Config` (clé TIMEZONE), ce qui permet de la
 * corriger sans redéploiement. Le manifeste `appsscript.json` déclare le même
 * fuseau : `assertTimeZoneConsistency()` refuse toute divergence, de sorte
 * qu'aucun second fuseau ne puisse se glisser en silence.
 */
function getConfiguredTimeZone() {
  return getConfigValue('TIMEZONE').trim() || CONFIG_DEFAULTS.TIMEZONE;
}

/**
 * Vérifie que Config et le manifeste désignent le même fuseau.
 * @throws {Error} en cas de divergence
 */
function assertTimeZoneConsistency() {
  var configured = getConfiguredTimeZone();
  if (configured !== APP.MANIFEST_TIMEZONE) {
    throw new Error(
      'Divergence de fuseau : Config TIMEZONE=' + configured +
      ' alors que appsscript.json déclare ' + APP.MANIFEST_TIMEZONE + '.'
    );
  }
  return configured;
}

/** URL absolue d'un chemin Blog, ex. buildSiteUrl('/blog/tva/'). */
function buildSiteUrl(path) {
  assertSiteOrigin();
  var p = String(path || '');
  if (p.charAt(0) !== '/') p = '/' + p;
  return getSiteOrigin() + p;
}

/* -------------------------------------------------------------------------- */
/* Feuille Config                                                             */
/* -------------------------------------------------------------------------- */

function getConfigSheet() {
  return getSheetByName(SHEETS.CONFIG);
}

/**
 * Feuille Config sous forme de Map (clé → valeur texte).
 * Les clés absentes retombent sur CONFIG_DEFAULTS.
 */
function readConfigMap() {
  var out = {};
  Object.keys(CONFIG_DEFAULTS).forEach(function (k) { out[k] = CONFIG_DEFAULTS[k]; });
  var sheet = getConfigSheet();
  if (!sheet) return out;

  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] === null ? '' : values[i][0]).trim();
    if (!key) continue;
    out[key] = values[i][1] === null ? '' : String(values[i][1]);
  }
  return out;
}

/** Valeur brute (texte) d'une clé de configuration. */
function getConfigValue(key) {
  var map = readConfigMap();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
}

function getConfigBoolean(key) {
  return getConfigValue(key).trim().toUpperCase() === 'TRUE';
}

function getConfigNumber(key, fallback) {
  var raw = getConfigValue(key).trim();
  if (raw === '') return fallback;
  var n = Number(raw);
  return isFinite(n) ? n : fallback;
}

/** Écrit une valeur dans la colonne B de la ligne de la clé (crée la ligne si besoin). */
function setConfigValue(key, value) {
  var sheet = getConfigSheet();
  if (!sheet) throw new Error('Feuille Config introuvable');
  var last = sheet.getLastRow();
  for (var r = 1; r <= last; r++) {
    if (String(sheet.getRange(r, 1).getValue()).trim() === key) {
      sheet.getRange(r, 2).setValue(String(value));
      return;
    }
  }
  sheet.appendRow([key, String(value)]);
}

/**
 * Écrit la feuille Config si elle est absente ou incomplète.
 * Ne supprime jamais une clé existante et ne réécrit pas une valeur présente.
 */
function ensureConfigSheet() {
  var sheet = getSheetByNameOrCreate(SHEETS.CONFIG);
  var created = [];

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, 2).setValues([['KEY', 'VALUE']]);
    created.push('en-têtes');
  }

  CONFIG_KEYS.forEach(function (key) {
    if (findConfigRow(sheet, key) === 0) {
      sheet.appendRow([key, CONFIG_DEFAULTS[key]]);
      created.push(key);
    }
  });

  // Legacy : présents, marqués, jamais exécutés.
  CONFIG_LEGACY.forEach(function (key) {
    if (findConfigRow(sheet, key) === 0) {
      sheet.appendRow([key, 'LEGACY / NOT USED']);
      created.push(key + ' (legacy)');
    }
  });

  return created;
}

function findConfigRow(sheet, key) {
  var last = sheet.getLastRow();
  for (var r = 1; r <= last; r++) {
    if (String(sheet.getRange(r, 1).getValue()).trim() === key) return r;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* Table de catégories (décision D2)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Correspondance nom → slug, lue dans la feuille Config (clé CATEGORY_MAP).
 * Format : JSON objet { "Nom affiché": "slug" }.
 *
 * Ne pas remplacer par un slugify() : « TVA Maroc » → « tva » n'est pas
 * dérivable (Phase 1, §1.3).
 *
 * @return {Object} map nom → slug (vide si la clé est absente ou invalide)
 */
function getCategoryMap() {
  var raw = getConfigValue('CATEGORY_MAP');
  var parsed = parseJsonSafe(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  var out = {};
  Object.keys(parsed).forEach(function (name) {
    var slug = String(parsed[name] === null ? '' : parsed[name]).trim();
    if (name && slug && isValidSlug(slug)) out[name.trim()] = slug;
  });
  return out;
}

/**
 * Résout un nom de catégorie.
 * @return {{name:string, slug:string}}
 * @throws {Error} catégorie inconnue — jamais de création automatique.
 */
function resolveCategory(name) {
  var key = String(name === null || name === undefined ? '' : name).trim();
  var map = getCategoryMap();
  if (!key) throw new Error('Catégorie absente');
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    throw new Error('Catégorie inconnue : « ' + key + ' » (aucune création automatique)');
  }
  return { name: key, slug: map[key] };
}

function isKnownCategory(name) {
  try {
    resolveCategory(name);
    return true;
  } catch (e) {
    return false;
  }
}

/** Liste triée des catégories connues (libellés), pour l'UI. */
function listKnownCategories() {
  return Object.keys(getCategoryMap()).sort();
}

/** Chemin du fichier article, ex. blogPath('tva','taux-tva-maroc'). */
function blogPath(categorySlug, slug) {
  return APP.BLOG_DIR + '/' + categorySlug + '/' + slug + '.html';
}

/** Chemin canonique (web) de l'article, ex. /blog/tva/taux-tva-maroc.html */
function sitePath(categorySlug, slug) {
  return '/' + blogPath(categorySlug, slug);
}
