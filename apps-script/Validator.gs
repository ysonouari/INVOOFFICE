/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Validator.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : moteur de validation. Aucune écriture, aucun effet de
 * bord hormis la lecture de Config (pour la table de catégories, D2).
 *
 * Trois familles :
 *   validateArticle(a)      → champs de la ligne Sheets        (V1-V7, V12)
 *   validateRenderedHtml()  → HTML rendu                        (V9-V11 + production)
 *   validateTemplate()      → gabarit chargé depuis GitHub      (pré-requis)
 *
 * V8 (cible absente de GitHub) est un contrôle réseau : voir checkTargetPath.
 */

/** Placeholders attendus du gabarit (Phase 1, §2). */
var REQUIRED_PLACEHOLDERS = [
  'TITLE', 'DESCRIPTION', 'CANONICAL_PATH', 'DATE_PUBLISHED', 'DATE_MODIFIED',
  'CATEGORY', 'CATEGORY_NAME', 'CATEGORY_SLUG', 'DATE_PUBLISHED_FORMATTED',
  'READING_TIME', 'TOC_ITEMS', 'ARTICLE_BODY', 'FAQ_SECTION',
  'RELATED_ARTICLES', 'PREV_LINK', 'NEXT_LINK'
];

/** Gabarit : la profondeur de ses assets vaut 1 niveau (il est à la racine de blog/). */
var TEMPLATE_ROBOTS = 'noindex, nofollow';
/** Production : métadonnées indexables. */
var PUBLISHED_ROBOTS = 'index, follow';

/* -------------------------------------------------------------------------- */
/* Lignes Articles                                                            */
/* -------------------------------------------------------------------------- */

function validateArticle(article) {
  var errors = [];
  var warnings = [];

  if (!article) return { ok: false, errors: [{ code: 'V0', message: 'Article absent' }], warnings: [] };

  // V1 — TITLE
  if (!article.TITLE) {
    errors.push({ code: 'V1', message: 'TITLE est obligatoire' });
  }

  // V2 — SLUG
  if (!article.SLUG) {
    errors.push({ code: 'V2', message: 'SLUG est obligatoire' });
  } else if (!isValidSlug(article.SLUG)) {
    errors.push({
      code: 'V2',
      message: 'SLUG invalide (attendu minuscules, chiffres et tirets) : ' + article.SLUG
    });
  }

  // V3 — CATEGORY via table explicite (D2) ; jamais de création automatique
  var category = null;
  if (!article.CATEGORY) {
    errors.push({ code: 'V3', message: 'CATEGORY est obligatoire' });
  } else {
    try {
      category = resolveCategory(article.CATEGORY);
    } catch (e) {
      errors.push({ code: 'V3', message: e.message });
    }
  }

  // V4 — META_DESCRIPTION (≤160, aligné sur le test SEO existant)
  if (!article.META_DESCRIPTION) {
    errors.push({ code: 'V4', message: 'META_DESCRIPTION est obligatoire' });
  } else if (article.META_DESCRIPTION.length > APP.MAX_DESCRIPTION) {
    errors.push({
      code: 'V4',
      message: 'META_DESCRIPTION trop long (' + article.META_DESCRIPTION.length +
        ' > ' + APP.MAX_DESCRIPTION + ')'
    });
  }

  // V5 — CONTENT
  if (!article.CONTENT) {
    errors.push({ code: 'V5', message: 'CONTENT est obligatoire' });
  } else if (!isBalancedHtml(article.CONTENT)) {
    errors.push({ code: 'V5', message: 'CONTENT : balises HTML non équilibrées' });
  }

  // V6 — SEO_TITLE (avertissement, pas blocage)
  if (article.SEO_TITLE && (article.SEO_TITLE + ' — Blog INVOOFFICE').length > 65) {
    warnings.push({
      code: 'V6',
      message: 'SEO_TITLE + suffixe > 65 caractères (risque de troncature SERP)'
    });
  }

  // V7 — IMAGE_URL : chemin relatif au dépôt uniquement (CSP img-src 'self')
  if (article.IMAGE_URL && !isRepoRelativeImage(article.IMAGE_URL)) {
    errors.push({
      code: 'V7',
      message: 'IMAGE_URL doit être un chemin relatif au dépôt (la CSP bloque ' +
        'les URLs externes) : ' + article.IMAGE_URL
    });
  }

  // Décision D1 — champs de description distincts, contrôlés séparément
  ['SOCIAL_DESCRIPTION', 'ARTICLE_EXCERPT', 'CARD_EXCERPT'].forEach(function (field) {
    if (article[field] && article[field].length > APP.MAX_DESCRIPTION) {
      warnings.push({
        code: 'V1x',
        message: field + ' > ' + APP.MAX_DESCRIPTION + ' caractères'
      });
    }
  });

  // STATUS
  if (article.STATUS && VALID_STATUSES.indexOf(article.STATUS) === -1) {
    errors.push({
      code: 'V1y',
      message: 'STATUT inconnu : ' + article.STATUS +
        ' (attendu ' + VALID_STATUSES.join(', ') + ')'
    });
  }

  // V12 — motifs de script dans les champs textuels
  ['TITLE', 'SEO_TITLE', 'META_DESCRIPTION', 'SOCIAL_DESCRIPTION',
    'ARTICLE_EXCERPT', 'CARD_EXCERPT', 'KEYWORD'].forEach(function (field) {
    if (containsScript(article[field])) {
      errors.push({ code: 'V12', message: 'Contenu de script détecté dans ' + field });
    }
  });

  var result = { ok: errors.length === 0, errors: errors, warnings: warnings };
  if (category) {
    result.category = category;
    result.path = blogPath(category.slug, article.SLUG);
    result.sitePath = sitePath(category.slug, article.SLUG);
  }
  return result;
}

/** V8 — la cible n'existe pas déjà sur GitHub. Contrôle réseau, en lecture. */
function checkTargetPath(article) {
  var v = validateArticle(article);
  if (!v.path) return { ok: false, reason: 'Chemin indéterminable (catégorie ou slug)' };
  if (fileExists(v.path)) {
    return { ok: false, reason: 'TARGET_ALREADY_EXISTS', path: v.path };
  }
  return { ok: true, path: v.path };
}

/* -------------------------------------------------------------------------- */
/* Gabarit                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Contrôle le gabarit AVANT tout rendu.
 * Le gabarit doit conserver `noindex, nofollow` : le test existant
 * (blog-design-system, AC-8) l'exige. C'est le moteur qui bascule en
 * `index, follow` sur la sortie (post-traitement), pas le gabarit.
 */
function validateTemplate(html) {
  var errors = [];
  var warnings = [];

  if (!html) {
    return { ok: false, errors: [{ code: 'T0', message: 'Gabarit vide' }], warnings: [] };
  }
  if (html.length > APP.MAX_TEMPLATE_BYTES) {
    errors.push({
      code: 'T1',
      message: 'Gabarit trop volumineux (' + html.length + ' > ' + APP.MAX_TEMPLATE_BYTES + ')'
    });
  }

  var missing = REQUIRED_PLACEHOLDERS.filter(function (p) {
    return html.indexOf('{{' + p + '}}') === -1;
  });
  if (missing.length) {
    errors.push({
      code: 'T2',
      message: 'Placeholders absents du gabarit : ' + missing.join(', ')
    });
  }

  if (html.indexOf('content="' + TEMPLATE_ROBOTS + '"') === -1) {
    errors.push({
      code: 'T3',
      message: 'Le gabarit doit conserver « ' + TEMPLATE_ROBOTS + ' » ' +
        '(exigé par le test AC-8) : le basculement se fait au rendu.'
    });
  }

  if (html.indexOf('favicon.svg') === -1) {
    warnings.push({
      code: 'T4',
      message: 'Gabarit sans favicon.svg (décision D3 : attendu, comme les articles publiés)'
    });
  }

  if (containsScript(html.replace(/<script[\s\S]*?<\/script>/gi, ''))) {
    warnings.push({ code: 'T5', message: 'Balise ou attribut suspect hors <script>' });
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* -------------------------------------------------------------------------- */
/* HTML rendu                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Contrôle du HTML généré, juste avant publication.
 * Couvre V9 (ancres), V10 (placeholders résiduels), V11 (canonical) et les
 * invariants de production relevés en Phase 1 (profondeur, robots, favicon).
 *
 * @param {string} html
 * @param {{canonicalPath:string}} expected
 */
function validateRenderedHtml(html, expected) {
  var errors = [];
  var warnings = [];
  var text = String(html || '');
  var withoutComments = stripHtmlComments(text);

  // V10 — aucun placeholder résiduel (les commentaires HTML sont ignorés :
  // le gabarit contient un commentaire de développement).
  // Le motif accepte les placeholders à casse mixte (le contrôle historique ne
  // voyait que [A-Z_]) : une divergence de casse doit être signalée, pas ignorée.
  var residual = withoutComments.match(/\{\{[A-Za-z0-9_]+\}\}/g);
  if (residual) {
    errors.push({
      code: 'V10',
      message: 'Placeholders non substitués : ' + unique(residual).join(', ')
    });
  }

  // V11 — canonical exact
  if (expected && expected.canonicalPath) {
    var canonical = getMetaContent(text, 'canonical');
    // Un canonical ABSENT est une erreur : le contrôle historique ne comparait
    // que si la balise existait, laissant passer une sortie sans canonical.
    if (!canonical) {
      errors.push({
        code: 'V11a',
        message: 'Canonical absent (attendu ' + buildSiteUrl(expected.canonicalPath) + ')'
      });
    } else if (canonical !== buildSiteUrl(expected.canonicalPath)) {
      errors.push({
        code: 'V11',
        message: 'Canonical inattendu : ' + canonical +
          ' (attendu ' + buildSiteUrl(expected.canonicalPath) + ')'
      });
    }

    // Cohérence og:url et hreflang avec le canonical (invariant de production).
    ['og:url'].forEach(function (key) {
      var value = getMetaContent(text, key);
      if (value && value !== buildSiteUrl(expected.canonicalPath)) {
        errors.push({
          code: 'V11b',
          message: key + ' incohérent : ' + value +
            ' (attendu ' + buildSiteUrl(expected.canonicalPath) + ')'
        });
      }
    });
  }

  // Production — robots indexable
  if (text.indexOf('content="' + PUBLISHED_ROBOTS + '"') === -1) {
    errors.push({
      code: 'P1',
      message: 'Robots « ' + PUBLISHED_ROBOTS + ' » absent (post-traitement non appliqué)'
    });
  }
  if (text.indexOf('content="' + TEMPLATE_ROBOTS + '"') !== -1) {
    errors.push({
      code: 'P1b',
      message: 'Robots du gabarit « ' + TEMPLATE_ROBOTS + ' » encore présent'
    });
  }

  // Production — profondeur des assets (2 niveaux depuis blog/{cat}/)
  // Un asset à 1 niveau s'écrit href="../css/..." ; le motif ci-dessous ne peut
  // pas correspondre à "../../css/..." car le 4e caractère devrait être un nom
  // de répertoire, or il s'agit d'un point.
  // Le contrôle couvre href/src ET l'import dynamique from '../js/theme.js',
  // ainsi que manifest.json et les autres racines d'assets du gabarit.
  var shallow = text.match(/(?:href|src)=["']\.\.\/(?:css|js|icons|assets|fonts|manifest\.json)[/"\']/g);
  if (shallow) {
    errors.push({
      code: 'P2',
      message: 'Assets à profondeur 1 niveau : ' + unique(shallow).join(', ') +
        ' (attendu « ../../ »)'
    });
  }
  var shallowImport = text.match(/from\s*["']\.\.\/(?:js|css|assets|fonts)[/"\']/g);
  if (shallowImport) {
    errors.push({
      code: 'P2d',
      message: 'Import dynamique à profondeur 1 niveau : ' + unique(shallowImport).join(', ') +
        ' (attendu « ../../ »)'
    });
  }
  if (text.indexOf('"../../css/blog.css"') === -1) {
    errors.push({ code: 'P2b', message: 'css/blog.css non résolu en ../../' });
  }
  if (text.indexOf('"../../icons/favicon.svg"') === -1) {
    errors.push({
      code: 'P2c',
      message: 'favicon.svg non résolu en ../../icons/favicon.svg (décision D3)'
    });
  }
  if (text.indexOf('"../../manifest.json"') === -1) {
    errors.push({ code: 'P2e', message: 'manifest.json non résolu en ../../manifest.json' });
  }

  // V9 — chaque ancre du sommaire existe dans le corps
  var anchors = [];
  var re = /<a href="#([^"]+)"/g;
  var m;
  while ((m = re.exec(text)) !== null) anchors.push(m[1]);
  var missingAnchors = anchors.filter(function (a) {
    return text.indexOf('id="' + a + '"') === -1;
  });
  if (missingAnchors.length) {
    errors.push({
      code: 'V9',
      message: 'Ancres sans cible : ' + unique(missingAnchors).join(', ')
    });
  }

  // V13 — unicité des id (invariant de production : le sommaire pointe par id)
  var ids = [];
  var idRe = /\sid="([^"]+)"/g;
  while ((m = idRe.exec(text)) !== null) ids.push(m[1]);
  var duplicateIds = ids.filter(function (id, i) { return ids.indexOf(id) !== i; });
  if (duplicateIds.length) {
    errors.push({
      code: 'V13',
      message: 'Identifiants dupliqués dans le HTML rendu : ' + unique(duplicateIds).join(', ')
    });
  }

  // Production — intégrité JSON-LD (parse réellement chaque bloc)
  var ldBlocks = text.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  if (!ldBlocks.length) {
    errors.push({ code: 'P3', message: 'Aucun bloc JSON-LD dans le HTML rendu' });
  }
  ldBlocks.forEach(function (block, i) {
    var raw = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
    if (parseJsonSafe(raw) === null) {
      errors.push({ code: 'P3b', message: 'JSON-LD #' + (i + 1) + ' invalide (non parsable)' });
    }
  });

  // Production — le suffixe de marque ne doit apparaître qu'une fois dans <title>
  var titleTag = /<title>([\s\S]*?)<\/title>/i.exec(text);
  if (!titleTag) {
    errors.push({ code: 'P3c', message: 'Balise <title> absente' });
  } else {
    var occurrences = titleTag[1].split('Blog INVOOFFICE').length - 1;
    if (occurrences !== 1) {
      errors.push({
        code: 'P3d',
        message: 'Suffixe de marque présent ' + occurrences + ' fois dans <title> (attendu 1)'
      });
    }
  }

  // Production — aucun attribut d'événement inline ni javascript: dans le rendu
  var inlineHandlers = text.match(/\son(?:click|load|error|mouseover|focus)\s*=/gi);
  if (inlineHandlers) {
    errors.push({
      code: 'P4',
      message: 'Gestionnaires d\'événements inline détectés : ' + unique(inlineHandlers).join(', ')
    });
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Contrôle que la configuration est exploitable.
 *
 * Une clé est « manquante » si la ligne de Config est ABSENTE, pas si la
 * valeur est vide : PUBLISH_HOUR et PUBLISH_MINUTE sont volontairement vides
 * par défaut (l'heure est fixée à la phase planning). Les clés obligatoires
 * non vides sont, elles, contrôlées sur leur valeur.
 */
function validateConfig() {
  var errors = [];
  var map = readConfigMap();
  var absent = missingConfigKeys();

  absent.forEach(function (key) {
    errors.push({ code: 'C1', message: 'Ligne Config absente : ' + key });
  });

  // Clés qui doivent porter une valeur exploitable.
  ['AUTO_PUBLISH', 'ARTICLES_PER_DAY', 'ARTICLES_PER_WEEK', 'PUBLISH_DAYS',
    'MAX_ARTICLES_PER_RUN', 'MAX_RETRIES', 'SCHEDULE_MODE', 'CATEGORY_MAP'
  ].forEach(function (key) {
    if (map[key] === undefined || String(map[key]).trim() === '') {
      errors.push({ code: 'C1b', message: 'Config sans valeur : ' + key });
    }
  });

  var categories = getCategoryMap();
  if (!Object.keys(categories).length) {
    errors.push({
      code: 'C2',
      message: 'CATEGORY_MAP vide ou invalide : catégories inconnues impossibles à valider'
    });
  }

  // Cohérence planning (décision D5) : 6 articles, 3 jours, 2 exécutions.
  var perWeek = Number(map.ARTICLES_PER_WEEK);
  var days = String(map.PUBLISH_DAYS).split(',')
    .map(function (d) { return d.trim().toUpperCase(); })
    .filter(Boolean);
  if (isFinite(perWeek) && perWeek > 0) {
    if (!days.length) {
      errors.push({ code: 'C3', message: 'PUBLISH_DAYS vide alors que ARTICLES_PER_WEEK=' + perWeek });
    } else if (perWeek % days.length !== 0) {
      errors.push({
        code: 'C3b',
        message: 'ARTICLES_PER_WEEK (' + perWeek + ') n\'est pas répartissable ' +
          'également sur ' + days.length + ' jour(s)'
      });
    }
  }

  return { ok: errors.length === 0, errors: errors, warnings: [] };
}

/** Clés de CONFIG_KEYS dont la ligne est absente de la feuille Config. */
function missingConfigKeys() {
  var sheet = getConfigSheet();
  if (!sheet) return CONFIG_KEYS.slice();
  var present = {};
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  values.forEach(function (row) {
    var key = String(row[0] === null ? '' : row[0]).trim();
    if (key) present[key] = true;
  });
  return CONFIG_KEYS.filter(function (k) { return !present[k]; });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isBalancedHtml(html) {
  var s = String(html || '');
  var tags = s.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g) || [];
  var voids = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'source'];
  var stack = [];
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    var name = (tag.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/) || [])[1];
    if (!name || voids.indexOf(name.toLowerCase()) !== -1) continue;
    if (tag.charAt(1) === '/') {
      if (stack.pop() !== name.toLowerCase()) return false;
    } else if (!/\/>$/.test(tag)) {
      stack.push(name.toLowerCase());
    }
  }
  return stack.length === 0;
}

function isRepoRelativeImage(url) {
  var s = String(url || '').trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (/^\/\//.test(s)) return false;
  if (s.charAt(0) === '/') return true;
  return /^[A-Za-z0-9._\-/]+$/.test(s);
}

function stripHtmlComments(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

function unique(list) {
  var seen = {};
  var out = [];
  list.forEach(function (v) {
    if (!seen[v]) { seen[v] = true; out.push(v); }
  });
  return out;
}

/**
 * Extrait une valeur d'en-tête.
 * @param {string} html
 * @param {string} key 'canonical' | 'og:title' | 'description' | ...
 * @return {string} '' si absent
 */
function getMetaContent(html, key) {
  var s = String(html || '');

  if (key === 'canonical') {
    var link = /<link[^>]*rel="canonical"[^>]*>/i.exec(s);
    if (!link) return '';
    var href = /href="([^"]*)"/i.exec(link[0]);
    return href ? href[1] : '';
  }

  var nameRe = new RegExp(
    '<meta[^>]*name="' + escapeRegExp(key) + '"[^>]*>', 'i');
  var propRe = new RegExp(
    '<meta[^>]*property="' + escapeRegExp(key) + '"[^>]*>', 'i');
  var tag = nameRe.exec(s) || propRe.exec(s);
  if (!tag) return '';

  var content = /content="([^"]*)"/i.exec(tag[0]);
  return content ? content[1] : '';
}

/** Échappe une chaîne pour usage dans une RegExp. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
