/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Renderer.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : produire le HTML final d'un article à partir du
 * gabarit `blog/template-article.html` et d'une ligne `Articles`.
 *
 * PUR (Phase 3) :
 *   - aucune écriture GitHub, aucun appel réseau, aucun accès Sheets en lecture
 *     hormis resolveCategory() (table de catégories, D2) ;
 *   - le gabarit n'est JAMAIS modifié : c'est la SORTIE qui reçoit le
 *     post-traitement de profondeur (D3) ;
 *   - validateRenderedHtml() est appelé AVANT de rendre le résultat : aucune
 *     publication future ne peut ignorer le contrat de production.
 *
 * Modèle SEO à 10 champs (PO-1)
 * ---------------------------------------------------------------------------
 * La mesure du socle de production (9 articles) montre que les dix chaînes
 * éditoriales sont INDÉPENDANTES et NON déductibles les unes des autres :
 *   og:title == <title>      6/9      twitter:title == <h1>     1/9
 *   fil d'Ariane == <h1>     0/9      meta description == og:description  0/9
 * Réduire le rendu à « TITLE + DESCRIPTION » détruirait donc 10 champs sur 10.
 * Chaque emplacement est donc un SLOT explicite, résolu par une chaîne de
 * sources ordonnée et surchargeable via `options.seo` :
 *
 *   1  pageTitle         <title>                          SEO_TITLE
 *   2  headline          <h1>                             TITLE
 *   3  ogTitle           og:title                         OG_TITLE
 *   4  twitterTitle      twitter:title                    TWITTER_TITLE
 *   5  jsonLdHeadline    JSON-LD "headline"               JSONLD_HEADLINE
 *   6  breadcrumbTitle   fil d'Ariane + JSON-LD ListItem  BREADCRUMB_TITLE
 *   7  metaDescription   meta description                 META_DESCRIPTION
 *   8  ogDescription     og:description                   OG_DESCRIPTION
 *   9  twitterDescription twitter:description             TWITTER_DESCRIPTION
 *  10  jsonLdDescription JSON-LD "description"            JSONLD_DESCRIPTION
 *
 * `readArticles()` étant piloté par l'en-tête, une colonne optionnelle
 * (`OG_TITLE`, `TWITTER_TITLE`, …) est reprise automatiquement SANS modifier
 * le schéma Sheets. Aucune colonne nouvelle n'est exigée.
 *
 * Suffixe de marque : appliqué au <title> et à og:title (9/9 et 5/9 en
 * production), JAMAIS aux autres emplacements, et JAMAIS en double.
 */

/** Suffixe de marque — em dash (U+2014), identique au gabarit et à la production. */
var BRAND_SUFFIX = ' \u2014 Blog INVOOFFICE';

/** Placeholders dont la valeur est du HTML de confiance (jamais échappé). */
var RAW_HTML_PLACEHOLDERS = [
  'TOC_ITEMS', 'ARTICLE_BODY', 'FAQ_SECTION',
  'RELATED_ARTICLES', 'PREV_LINK', 'NEXT_LINK'
];

/**
 * Chaînes de sources par emplacement, dans l'ordre de priorité décroissante.
 * `__seo.<slot>` (surcharge d'appel) reste prioritaire sur la colonne.
 */
var SEO_SLOT_SOURCES = {
  pageTitle: ['SEO_TITLE', 'TITLE'],
  headline: ['TITLE', 'SEO_TITLE'],
  ogTitle: ['OG_TITLE', 'SEO_TITLE', 'TITLE'],
  twitterTitle: ['TWITTER_TITLE', 'OG_TITLE', 'SEO_TITLE', 'TITLE'],
  jsonLdHeadline: ['JSONLD_HEADLINE', 'TITLE', 'SEO_TITLE'],
  breadcrumbTitle: ['BREADCRUMB_TITLE', 'TWITTER_TITLE', 'TITLE', 'SEO_TITLE'],
  metaDescription: ['META_DESCRIPTION', 'SOCIAL_DESCRIPTION'],
  ogDescription: ['OG_DESCRIPTION', 'SOCIAL_DESCRIPTION', 'META_DESCRIPTION'],
  twitterDescription: ['TWITTER_DESCRIPTION', 'OG_DESCRIPTION', 'SOCIAL_DESCRIPTION', 'META_DESCRIPTION'],
  jsonLdDescription: ['JSONLD_DESCRIPTION', 'OG_DESCRIPTION', 'SOCIAL_DESCRIPTION', 'META_DESCRIPTION'],
  articleExcerpt: ['ARTICLE_EXCERPT', 'META_DESCRIPTION']
};

/** Emplacements portant le suffixe de marque. */
var SUFFIXED_SLOTS = ['pageTitle', 'ogTitle'];

/**
 * Règles d'ancrage des `{{TITLE}}` (7 occurrences, 6 sens distincts).
 * L'ancre la plus longue gagne ; une occurrence non reconnue est une ERREUR,
 * jamais un repli silencieux.
 */
var TITLE_SITE_RULES = [
  { slot: 'pageTitle', anchor: '<title>', mode: 'html' },
  { slot: 'ogTitle', anchor: '<meta property="og:title" content="', mode: 'html' },
  { slot: 'twitterTitle', anchor: '<meta name="twitter:title" content="', mode: 'html' },
  { slot: 'jsonLdHeadline', anchor: '"headline": "', mode: 'json' },
  { slot: 'breadcrumbTitle', anchor: '"name": "', mode: 'json' },
  { slot: 'headline', anchor: '<h1>', mode: 'html' },
  { slot: 'breadcrumbTitle', anchor: '<span>', mode: 'html' }
];

/** Règles d'ancrage des `{{DESCRIPTION}}` (5 occurrences, 5 sens distincts). */
var DESCRIPTION_SITE_RULES = [
  { slot: 'metaDescription', anchor: '<meta name="description" content="', mode: 'html' },
  { slot: 'ogDescription', anchor: '<meta property="og:description" content="', mode: 'html' },
  { slot: 'twitterDescription', anchor: '<meta name="twitter:description" content="', mode: 'html' },
  { slot: 'jsonLdDescription', anchor: '"description": "', mode: 'json' },
  { slot: 'articleExcerpt', anchor: '<p class="article-excerpt">', mode: 'html' }
];

/** Racines d'assets réécrites en ../../ (règle 2 du post-traitement). */
var DEPTH_ONE_ASSET_ROOTS = ['css', 'js', 'icons', 'manifest.json', 'assets', 'fonts'];

/**
 * Erreur portant son CODE de contrat.
 * Le moteur s'appuie sur `e.code` pour distinguer une violation de gabarit
 * (R5b) d'une substitution impossible (R5) : sans cela, un gabarit|altéré
 * serait diagnosticé à tort comme un problème de données.
 */
function codedError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

/* -------------------------------------------------------------------------- */
/* Modèle SEO                                                                 */
/* -------------------------------------------------------------------------- */

/** true si `value` porte déjà le suffixe de marque. */
function hasBrandSuffix(value) {
  var s = String(value === null || value === undefined ? '' : value).trim();
  return s.length > 0 && s.slice(-BRAND_SUFFIX.length) === BRAND_SUFFIX;
}

/**
 * Ajoute le suffixe de marque une SEULE fois.
 * Un suffixe déjà présent n'est jamais dupliqué (garde « suffix-prevention »).
 */
function withBrandSuffix(value) {
  var s = String(value === null || value === undefined ? '' : value).trim();
  if (!s) return '';
  return hasBrandSuffix(s) ? s : s + BRAND_SUFFIX;
}

/**
 * Construit le modèle SEO à 10 champs.
 *
 * @param {Object} article  ligne `Articles` (lu par en-tête)
 * @param {{seo?:Object}} [options]
 * @return {{values:Object, sources:Object, missing:string[], warnings:Object[]}}
 */
function buildSeoModel(article, options) {
  var opts = options || {};
  var overrides = opts.seo || {};
  var values = {};
  var sources = {};
  var missing = [];
  var warnings = [];

  Object.keys(SEO_SLOT_SOURCES).forEach(function (slot) {
    var chosen = '';
    var origin = '';

    // 1) surcharge d'appel — elle seule peut porter une valeur absente de la ligne
    if (String(overrides[slot] === null || overrides[slot] === undefined ? '' : overrides[slot]).trim() !== '') {
      chosen = String(overrides[slot]).trim();
      origin = 'options.seo.' + slot;
    }

    // 2) colonnes de la ligne, pilotées par l'en-tête
    if (!chosen) {
      var chain = SEO_SLOT_SOURCES[slot];
      for (var i = 0; i < chain.length; i++) {
        var candidate = String(article[chain[i]] === null || article[chain[i]] === undefined ? '' : article[chain[i]]).trim();
        if (candidate) {
          chosen = candidate;
          origin = chain[i];
          break;
        }
      }
    }

    // 3) repli déterministe sur un emplacement déjà résolu
    if (!chosen) {
      chosen = fallbackForSlot(slot, values);
      if (chosen) origin = 'repli:' + slot;
    }

    if (!chosen) {
      missing.push(slot);
      return;
    }

    values[slot] = SUFFIXED_SLOTS.indexOf(slot) !== -1 ? withBrandSuffix(chosen) : chosen;
    sources[slot] = origin;

    // Traçabilité : un emplacement qui retombe sur une chaîne secondaire est
    // signalé, car la valeur production peut alors diverger.
    var first = SEO_SLOT_SOURCES[slot][0];
    if (origin !== first && origin.indexOf('repli:') === 0) {
      warnings.push({
        code: 'R1x',
        message: 'Slot « ' + slot + ' » sans colonne dédiée ni surcharge : repli sur « ' +
          origin.replace('repli:', '') + ' »'
      });
    }
  });

  return { values: values, sources: sources, missing: missing, warnings: warnings };
}

/** Repli d'un emplacement sur un emplacement déjà résolu (ordre stable). */
function fallbackForSlot(slot, values) {
  switch (slot) {
    case 'pageTitle': return values.headline || '';
    case 'ogTitle': return values.pageTitle || '';
    case 'twitterTitle': return values.ogTitle || values.headline || '';
    case 'jsonLdHeadline': return values.headline || values.pageTitle || '';
    case 'breadcrumbTitle': return values.twitterTitle || values.headline || '';
    case 'ogDescription': return values.metaDescription || '';
    case 'twitterDescription': return values.ogDescription || values.metaDescription || '';
    case 'jsonLdDescription': return values.ogDescription || values.metaDescription || '';
    case 'articleExcerpt': return values.metaDescription || '';
    default: return '';
  }
}

/* -------------------------------------------------------------------------- */
/* Sous-blocs de contenu                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Normalise un temps de lecture éditorial (PO-2).
 * Accepte « 8 », « 8 min », « 8 minutes », 8. Le gabarit porte déjà
 * « min de lecture » : seule la valeur numérique est substituée.
 * Ne recalcule JAMAIS la durée à partir du contenu.
 *
 * @return {{value:string, error:string}}
 */
function normalizeReadingTime(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return {
      value: '',
      error: 'READING_TIME absent : durée de lecture éditoriale obligatoire ' +
        '(PO-2 — le moteur ne la calcule jamais). Fournir la colonne READING_TIME.'
    };
  }
  var m = /(\d+)/.exec(String(raw));
  if (!m) {
    return {
      value: '',
      error: 'READING_TIME illisible : « ' + String(raw) + ' » (attendu un nombre de minutes)'
    };
  }
  var n = parseInt(m[1], 10);
  if (n < 1 || n > 999) {
    return { value: '', error: 'READING_TIME hors bornes (1-999) : ' + n };
  }
  return { value: String(n), error: '' };
}

/**
 * Détecte la convention de fin de ligne d'un fragment.
 * Le gabarit et les articles publiés sont en CRLF : les blocs générés doivent
 * l'être aussi, sinon la sortie mélange les deux conventions.
 */
function detectNewline(text) {
  return /\r\n/.test(String(text || '')) ? '\r\n' : '\n';
}

/** Normalise les fins de ligne d'un fragment généré. */
function withNewline(value, newline) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\r\n|\n|\r/g, newline || '\n');
}

/**
 * Bloc FAQ : « <h2 id="faq"> » + une entrée `.faq-item` par question.
 * Le gabarit fournit le `<!-- FAQ SECTION -->` ; le moteur fournit le contenu.
 * Aucun contenu ⇒ chaîne vide (le bloc disparaît, comme en production sans FAQ).
 *
 * @param {{q:string,a:string}|Array} faq
 * @param {{heading?:string, newline?:string}} [opt]
 * @return {string} HTML de confiance
 */
function buildFaqSection(faq, opt) {
  var opts = opt || {};
  var items = [];
  if (Array.isArray(faq)) items = faq;
  else if (faq && (faq.q || faq.question)) items = [faq];
  if (!items.length) return '';

  var heading = String(opts.heading || 'Questions fréquentes').trim() || 'Questions fréquentes';
  var out = ['<h2 id="faq">' + escHtml(heading) + '</h2>'];
  items.forEach(function (item) {
    var question = String(item.q === undefined ? (item.question || '') : (item.q || '')).trim();
    var answer = String(item.a === undefined ? (item.answer || '') : (item.a || '')).trim();
    if (!question || !answer) return;
    out.push('<div class="faq-item"><h3>' + escHtml(question) + '</h3><p>' + escHtml(answer) + '</p></div>');
  });
  if (out.length === 1) return '';
  return withNewline(out.join('\n'), opts.newline);
}

/** Texte lisible d'un fragment (balises retirées, entités décodées). */
function headingText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sommaire : une entrée par titre (h2/h3) PORTAANT un id, dans l'ordre du
 * document, corps PUIS FAQ. Le gabarit fournit `<nav class="toc"><ol>`.
 *
 * @param {string} contentHtml  corps + FAQ (HTML de confiance)
 * @param {{newline?:string}} [opt]
 * @return {string} HTML de confiance
 */
function buildTocItems(contentHtml, opt) {
  var opts = opt || {};
  var items = [];
  var re = /<h([23])\s[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi;
  var m;
  while ((m = re.exec(String(contentHtml || ''))) !== null) {
    var label = headingText(m[3]);
    if (!label) continue;
    items.push('<li><a href="#' + escHtml(m[2]) + '">' + escHtml(label) + '</a></li>');
  }
  return withNewline(items.join('\n'), opts.newline);
}

/**
 * Cartes « Articles similaires » : `.related-card` (grille fournie par le
 * gabarit). Le gabarit n'expose pas l'image (PO-3) : pas de `<img>`.
 *
 * @param {Array<{title:string,path?:string,url?:string,excerpt?:string}>} related
 * @param {{newline?:string}} [opt]
 * @return {string} HTML de confiance
 */
function buildRelatedArticles(related, opt) {
  var opts = opt || {};
  if (!Array.isArray(related) || !related.length) return '';
  var out = [];
  related.forEach(function (item) {
    var title = String(item.title || '').trim();
    var href = normalizeArticleHref(item.path || item.url);
    if (!title || !href) return;
    var card = '<div class="related-card"><a href="' + escHtml(href) + '">' + escHtml(title) + '</a>';
    var excerpt = String(item.excerpt || '').trim();
    if (excerpt) card += '<p>' + escHtml(excerpt) + '</p>';
    out.push(card + '</div>');
  });
  return withNewline(out.join('\n'), opts.newline);
}

/**
 * Emplacement d'un côté absent de la navigation (décision E3).
 * `.prev-next` est un flex `justify-content: space-between` : sans
 * emplacement, le « Suivant » du premier article d'une catégorie se colle à
 * gauche au lieu d'être à droite, et la navigation diffère visuellement de celle
 * des articles qui ont deux voisins.
 */
var EMPTY_NAV_SLOT = '<span></span>';

/**
 * Lien précédent / suivant. Libellés génériques (PO-4) : aucune colonne
 * supplémentaire, le titre du voisin est la seule donnée variable.
 *
 * @param {{title:string,path?:string,url?:string}|null} neighbour
 * @param {'previous'|'next'} kind
 * @return {string} HTML de confiance ('' si le voisin n'existe pas)
 */
function buildArticleLink(neighbour, kind) {
  if (!neighbour) return '';
  var title = String(neighbour.title || '').trim();
  var href = normalizeArticleHref(neighbour.path || neighbour.url);
  if (!title || !href) return '';
  if (kind === 'previous') {
    return '<a href="' + escHtml(href) + '">\u2190 Article pr\u00e9c\u00e9dent</a>';
  }
  return '<a href="' + escHtml(href) + '">Article suivant : ' + escHtml(title) + ' \u2192</a>';
}

/**
 * Normalise un chemin d'article en chemin web absolu de la racine.
 * Accepte « blog/tva/x.html », « /blog/tva/x.html » et
 * « https://www.invooffice.com/blog/tva/x.html ».
 * Refuse toute origine étrangère (décision D9).
 *
 * @return {string} '' si le chemin est inexploitable
 */
function normalizeArticleHref(value) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    var origin = assertSiteOrigin();
    if (raw.slice(0, origin.length + 1) !== origin + '/') return '';
    raw = raw.slice(origin.length);
  }

  raw = raw.replace(/^\/+/, '');
  var m = /^blog\/([a-z0-9-]+)\/([a-z0-9-]+)\.html$/.exec(raw);
  if (!m) return '';
  return '/' + raw;
}

/* -------------------------------------------------------------------------- */
/* Substitution des placeholders                                              */
/* -------------------------------------------------------------------------- */

/** Échappe une valeur selon le site : 'html' → escHtml, 'json' → escJson. */
function escapeForSite(value, mode) {
  if (mode === 'json') return escJson(value);
  if (mode === 'raw') return String(value === null || value === undefined ? '' : value);
  return escHtml(value);
}

/** Règle d'ancrage applicable à la position courante (ancre la plus longue). */
function matchSiteRule(token, before) {
  var rules = token === 'DESCRIPTION' ? DESCRIPTION_SITE_RULES : TITLE_SITE_RULES;
  var window = before.slice(-160);
  var best = null;
  rules.forEach(function (rule) {
    if (window.slice(-rule.anchor.length) === rule.anchor) {
      if (!best || rule.anchor.length > best.anchor.length) best = rule;
    }
  });
  return best;
}

/**
 * Bornes des commentaires HTML d'un fragment.
 * Le gabarit documente son usage avec un commentaire contenant
 * « {{PLACEHOLDER}} » : la substitution doit l'IGNORER (la règle 4 le retire
 * ensuite), sinon le jeton de documentation serait pris pour un champ à
 * remplir.
 *
 * @return {Array<[number,number]>} couples [début, fin[
 */
function htmlCommentRanges(html) {
  var ranges = [];
  var re = /<!--[\s\S]*?-->/g;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/** true si `index` tombe à l'intérieur d'un commentaire HTML. */
function isInsideComment(ranges, index) {
  for (var i = 0; i < ranges.length; i++) {
    if (index >= ranges[i][0] && index < ranges[i][1]) return true;
  }
  return false;
}

/**
 * Substitution en UNE seule passe de gauche à droite.
 *
 * `{{TITLE}}` et `{{DESCRIPTION}}` sont multi-sens : ils sont résolus par
 * ancrage contextuel. Les 14 autres placeholders sont à valeur unique et
 * résolus par table. Les placeholders `RAW_HTML_PLACEHOLDERS` sont du HTML de
 * confiance : ils ne sont PAS échappés (PO : ne pas doubler l'échappement).
 *
 * Une substitution ne réexamine jamais le texte déjà produit : une valeur
 * contenant « {{…}} » ne peut donc pas provoquer de cascade.
 *
 * @param {string} template
 * @param {Object} table  {values, single, singleMode}
 * @return {{html:string, counts:Object}}
 * @throws {Error} sur placeholder inconnu, ancre non reconnue ou table incomplète
 */
function substitutePlaceholders(template, table) {
  var source = String(template || '');
  var comments = htmlCommentRanges(source);
  var re = /\{\{([A-Z_]+)\}\}/g;
  var out = '';
  var last = 0;
  var counts = {};
  var m;

  while ((m = re.exec(source)) !== null) {
    if (isInsideComment(comments, m.index)) continue;

    var token = m[1];
    out += source.slice(last, m.index);
    last = m.index + m[0].length;

    if (token === 'TITLE' || token === 'DESCRIPTION') {
      var rule = matchSiteRule(token, source.slice(0, m.index));
      if (!rule) {
        throw new Error(
          'Site non reconnu pour {{' + token + '}} : le gabarit a divergé. ' +
          'Contexte : « ' + source.slice(Math.max(0, m.index - 60), m.index).replace(/\s+/g, ' ') + ' »'
        );
      }
      counts[token] = (counts[token] || 0) + 1;
      out += escapeForSite(table.values[rule.slot], rule.mode);
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(table.single, token)) {
      throw new Error('Placeholder sans valeur : {{' + token + '}}');
    }
    counts[token] = (counts[token] || 0) + 1;
    out += escapeForSite(table.single[token], table.singleMode[token]);
  }

  out += source.slice(last);
  return { html: out, counts: counts };
}

/**
 * Remplace les deux sites suffixés en entier et absorbe le littéral du
 * gabarit (« — Blog INVOOFFICE »), afin que le suffixe ne soit jamais dupliqué.
 * Le texte absorbé DOIT être un suffixe de marque : sinon, ERREUR (le gabarit
 * a divergé et aucune donnée ne doit être perdue).
 *
 * @return {{html:string, sites:{title:number, ogTitle:number}}}
 */
function applySuffixedTitleSites(template, values) {
  var html = String(template || '');
  var sites = { title: 0, ogTitle: 0 };

  // Structure de capture UNIFORME (3 groupes) : (préfixe, suffixe littéral
  // absorbé, suffixe de balise). Sans elle, le second groupe d'un motif à un
  // seul groupe recevrait l'index de décalage au lieu du littéral.
  var patterns = [
    {
      name: 'title',
      slot: 'pageTitle',
      re: /(<title>)\{\{TITLE\}\}([^<]*)(<\/title>)/i
    },
    {
      name: 'ogTitle',
      slot: 'ogTitle',
      re: /(<meta property="og:title" content=")\{\{TITLE\}\}([^"]*)("\s*\/?>)/i
    }
  ];

  patterns.forEach(function (p) {
    html = html.replace(p.re, function (whole, open, tail, close) {
      var absorbed = String(tail || '');
      if (absorbed.indexOf('Blog INVOOFFICE') === -1) {
        throw codedError(
          'R5b',
          'Le gabarit ne porte plus le suffixe de marque attendu à l\'emplacement ' +
          p.name + ' (littéral « ' + absorbed + ' »). Rendu interrompu : aucune donnée perdue.'
        );
      }
      sites[p.name] += 1;
      return open + escHtml(values[p.slot]) + close;
    });
  });

  if (sites.title !== 1 || sites.ogTitle !== 1) {
    throw codedError(
      'R5b',
      'Gabarit : sites suffixés inattendus (title=' + sites.title +
      ', og:title=' + sites.ogTitle + ' ; attendu 1 et 1).'
    );
  }
  return { html: html, sites: sites };
}

/* -------------------------------------------------------------------------- */
/* Post-traitement de production (règles 2 à 5)                               */
/* -------------------------------------------------------------------------- */

/**
 * Règle 2 — profondeur des assets : « ../ » → « ../../ ».
 *
 * Appliqué à la SORTIE uniquement (le gabarit reste à 1 niveau, D3).
 * Couvre `href`/`src`, mais aussi l'import dynamique `from '../js/theme.js'`,
 * et `manifest.json` que le contrôle P2 historique oubliait.
 */
function deepenAssets(html) {
  var out = String(html || '');
  DEPTH_ONE_ASSET_ROOTS.forEach(function (root) {
    // L'ancre ne CONSOMME pas le séparateur : la substitution ajoute « ../../ »
    // devant la racine et laisse le « / » d'origine en place.
    var pattern = new RegExp('((?:href|src)=["\']|from\\s*["\'])\\.\\./' +
      escapeRegExp(root) + '(?=["\'/])', 'g');
    out = out.replace(pattern, '$1../../' + root);
  });
  return out;
}

/** Règle 3 — robots : « noindex, nofollow » → « index, follow » (occurrence unique). */
function publishRobots(html) {
  var out = String(html || '');
  var matches = out.match(new RegExp(escapeRegExp(TEMPLATE_ROBOTS), 'g')) || [];
  if (matches.length !== 1) {
    throw new Error(
      'Robots du gabarit : ' + matches.length + ' occurrence(s) de « ' +
      TEMPLATE_ROBOTS + ' » (attendu 1).'
    );
  }
  return out.split(TEMPLATE_ROBOTS).join(PUBLISHED_ROBOTS);
}

/** Règle 4 — retrait du commentaire de développement du gabarit. */
function stripDevComment(html) {
  return String(html || '').replace(/<!--\s*TEMPLATE D'ARTICLE[\s\S]*?-->\s*/gi, '');
}

/**
 * Règle 5 — retour à la catégorie : « /blog/ » → « /blog/{cat}/ ».
 *
 * Ancré sur `.back-blog` : le lien « Blog » du fil d'Ariane et celui du pied
 * de page pointent vers le HUB et ne doivent pas être redirigés.
 *
 * Le HREF et le LIBELLÉ sont tous deux réécrits (décision E4). Le gabarit ne
 * contient qu'un libellé constant — « ← Retour au blog » — que la seule règle 5
 * d'origine ne touchait pas : les articles générés affichaient donc « Retour au
 * blog » en pointant pourtant sur leur catégorie. Le libellé retenu, « ← Retour
 * à la catégorie {Nom} », est celui des trois articles déjà produits par un
 * ancien pipeline (`auto-entrepreneur/*`, `tva/*`, `devis/…`) : aucune donnée
 * éditoriale nouvelle n'est introduite.
 *
 * Le remplacement passe par une FONCTION et non une chaîne `$1` : le nom de
 * catégorie est échappé par `escHtml()` et une séquence `$` y serait
 * interprétée comme une référence de groupe.
 *
 * @param {string} html
 * @param {{slug:string,name:string}} category
 * @return {string}
 */
function backLinkToCategory(html, category) {
  var slug = String(category && category.slug ? category.slug : '').trim();
  var name = String(category && category.name ? category.name : '').trim();
  if (!slug || !name) {
    throw new Error('Catégorie incomplète : règle 5 inapplicable.');
  }
  var pattern = new RegExp(
    '(<div class="back-blog"[^>]*>\\s*<a href=")/blog/("[^>]*>)[^<]*(<\\/a>)', 'i');
  var out = String(html || '').replace(pattern, function (match, pre, mid, post) {
    return pre + '/blog/' + escHtml(slug) + '/' + mid +
      '← Retour à la catégorie ' + escHtml(name) + post;
  });
  if (out === html) {
    throw new Error('Gabarit : bloc .back-blog introuvable (règle 5 inapplicable).');
  }
  return out;
}

/**
 * Repère l'index, dans `html`, du `</div>` qui ferme le `<div>` ouvert à
 * `start`. Le comptage de profondeur évite toute hypothèse sur le contenu
 * intermédiaire (cartes imbriquées, balises Libellées).
 *
 * @return {number} index juste APRÈS le `</div>` fermant, -1 si non fermé
 */
function findClosingDiv(html, start) {
  var re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = start;
  var depth = 0;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].charAt(1) === '/') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

/**
 * Règle 5c — « Articles similaires » : le bloc, TITRE COMPRIS, n'est pas émis
 * lorsqu'aucune carte n'a été rendue (décision E2).
 *
 * Le gabarit écrit toujours `<h3>Articles similaires</h3>` ; la grille vide
 * laissait donc un titre orphelin au-dessus de rien. Le retrait se fait en
 * post-traitement, après substitution, et le gabarit reste inchangé — il
 * conserve ainsi ses placeholders, exigence de `validateTemplate()`.
 *
 * @param {string} html
 * @return {string}
 */
function stripEmptyRelated(html) {
  var source = String(html || '');
  // Des cartes existent : le bloc est conservé tel quel.
  if (/<div class="related-card">/.test(source)) return source;

  var open = /<div class="related">/.exec(source);
  if (!open) {
    throw new Error('Gabarit : bloc .related introuvable (règle 5c inapplicable).');
  }
  var start = open.index;
  var end = findClosingDiv(source, start);
  if (end === -1) {
    throw new Error('Gabarit : bloc .related non fermé (règle 5c inapplicable).');
  }
  var removed = source.slice(start, end);
  if (!/<div class="related-grid">\s*<\/div>/.test(removed)) {
    throw new Error('Gabarit : .related sans carte et sans grille vide (règle 5c).');
  }

  // Le commentaire de gabarit « <!-- RELATED ARTICLES --> » qui précède le
  // bloc devient orphelin : il est retiré avec lui.
  var lead = /[ \t]*<!--\s*RELATED ARTICLES\s*-->[ \t]*(\r?\n[ \t]*)?$/
    .exec(source.slice(0, start));
  if (lead) start -= lead[0].length;

  // Le saut de ligne qui suit le bloc est conservé : la mise en page du
  // gabarit reste inchangée pour ce qui suit.
  return source.slice(0, start) + source.slice(end);
}

/* -------------------------------------------------------------------------- */
/* Rendu                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Rend l'HTML final d'un article. PUR : aucun effet de bord, aucun réseau,
 * aucune écriture. Une entrée future (phase 4) appellera ceci PUIS publiera
 * `result.html` uniquement si `result.ok === true`.
 *
 * @param {Object} article  ligne `Articles`
 * @param {{templateHtml:string, faq?:*, related?:Array, previous?:Object,
 *          next?:Object, seo?:Object, readingTime?:*, publishedAt?:string,
 *          modifiedAt?:string, faqHeading?:string}} options
 * @return {{ok:boolean, html?:string, path?:string, sitePath?:string,
 *           canonicalUrl?:string, validation?:Object, errors?:Object[],
 *           warnings?:Object[]}}
 */
/**
 * Emplacements SEO sans valeur tolerated : tout le reste part dans le HTML.
 * Avec les chaînes de repli actuelles, `missing` est « tout ou rien » : les
 * six emplacements obligatoires sont donc toujours remplis ensemble quand
 * `validateArticle` a accepté la ligne. Le contrôle reste car il protège les
 * emplacements futurs, dont la chaîne de repli serait vide.
 */
var REQUIRED_SEO_SLOTS = ['pageTitle', 'headline', 'metaDescription',
  'jsonLdHeadline', 'jsonLdDescription', 'breadcrumbTitle'];

/**
 * Emplacements obligatoireskovides dans un modèle déjà construit.
 * Fonction pure : testable directement, sans passer par le moteur.
 *
 * @param {{values:Object}} model
 * @return {string[]} noms des emplacements obligatoires sans valeur
 */
function requiredSlotsMissing(model) {
  var values = (model && model.values) || {};
  return REQUIRED_SEO_SLOTS.filter(function (slot) { return !values[slot]; });
}

function renderArticleHtml(article, options) {
  var opts = options || {};
  var errors = [];
  var warnings = [];

  /* --- 0. Préconditions -------------------------------------------------- */
  if (!article) {
    return fail('Article absent');
  }
  var template = String(opts.templateHtml || '');
  if (!template) {
    return fail('Gabarit absent : templateHtml requis');
  }
  var templateCheck = validateTemplate(template);
  if (!templateCheck.ok) {
    return {
      ok: false,
      errors: templateCheck.errors,
      warnings: (templateCheck.warnings || []).concat(warnings),
      validation: templateCheck
    };
  }

  var articleCheck = validateArticle(article);
  if (!articleCheck.ok) {
    return { ok: false, errors: articleCheck.errors, warnings: articleCheck.warnings || [] };
  }
  var category = articleCheck.category;
  var sitePathOfArticle = articleCheck.sitePath;
  warnings = warnings.concat(articleCheck.warnings || []);

  /* --- 1. Modèle SEO à 10 champs ---------------------------------------- */
  var model = buildSeoModel(article, { seo: opts.seo });
  warnings = warnings.concat(model.warnings);
  if (model.missing.length) {
    errors.push({
      code: 'R2',
      message: 'Emplacements SEO sans valeur : ' + model.missing.join(', ')
    });
  }
  requiredSlotsMissing(model).forEach(function (slot) {
    errors.push({ code: 'R2b', message: 'Emplacement SEO obligatoire vide : ' + slot });
  });

  /* --- 2. Dates (temps de lecture : donnée éditoriale, jamais calculé) --- */
  var publishedIso = String(article.PUBLISHED_AT || opts.publishedAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedIso)) {
    errors.push({
      code: 'R3a',
      message: 'PUBLISHED_AT absent ou invalide : « ' + publishedIso + ' » (attendu YYYY-MM-DD)'
    });
    publishedIso = publishedIso || '1970-01-01';
  }
  var modifiedIso = String(article.MODIFIED_AT || opts.modifiedAt || publishedIso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(modifiedIso)) modifiedIso = publishedIso;

  var reading = normalizeReadingTime(
    String(article.READING_TIME === undefined || article.READING_TIME === null || article.READING_TIME === ''
      ? opts.readingTime
      : article.READING_TIME) || ''
  );
  if (reading.error) errors.push({ code: 'R3b', message: reading.error });

  var formattedPublished = frenchDate(publishedIso);
  if (!formattedPublished) {
    errors.push({ code: 'R3c', message: 'Date de publication non formatable : ' + publishedIso });
  }

  /* --- 3. Canonical ----------------------------------------------------- */
  var canonicalPath = String(article.CANONICAL_PATH || '').trim() || sitePathOfArticle;
  var canonicalUrl = buildSiteUrl(canonicalPath);

  /* --- 4. Contenu de confiance ----------------------------------------- */
  var newline = detectNewline(template);
  var body = String(article.CONTENT || '');
  var faqHtml = buildFaqSection(opts.faq, { heading: opts.faqHeading, newline: newline });
  if (faqHtml && body.indexOf('id="faq"') !== -1) {
    errors.push({
      code: 'R4a',
      message: 'Le corps contient déjà id="faq" : le bloc FAQ du gabarit entrerait en collision'
    });
  }
  if (containsScript(body)) {
    errors.push({ code: 'R4b', message: 'CONTENT : motif de script détecté (neutralisé)' });
  }

  var tocSource = body + (faqHtml ? newline + faqHtml : '');
  var tocItems = buildTocItems(tocSource, { newline: newline });
  // Le sommaire est construit à partir des TITRES : une FAQ rendue doit donc
  // y figurer. Le contrôle porte sur la sortie du sommaire, pas sur le corps.
  if (faqHtml && tocItems.indexOf('<li><a href="#faq">') === -1) {
    errors.push({ code: 'R4c', message: 'Le sommaire ne référence pas #faq' });
  }

  var relatedHtml = buildRelatedArticles(opts.related, { newline: newline });
  // E3 : un côté absent devient un emplacement vide, jamais une chaîne vide.
  var prevLink = buildArticleLink(opts.previous, 'previous') || EMPTY_NAV_SLOT;
  var nextLink = buildArticleLink(opts.next, 'next') || EMPTY_NAV_SLOT;

  /* --- 5. Table de substitution ---------------------------------------- */
  var single = {
    CANONICAL_PATH: canonicalPath,
    DATE_PUBLISHED: publishedIso,
    DATE_MODIFIED: modifiedIso,
    CATEGORY: category.name,
    CATEGORY_NAME: category.name,
    CATEGORY_SLUG: category.slug,
    DATE_PUBLISHED_FORMATTED: formattedPublished,
    READING_TIME: reading.value,
    TOC_ITEMS: tocItems,
    ARTICLE_BODY: body,
    FAQ_SECTION: faqHtml,
    RELATED_ARTICLES: relatedHtml,
    PREV_LINK: prevLink,
    NEXT_LINK: nextLink
  };
  var singleMode = {};
  RAW_HTML_PLACEHOLDERS.forEach(function (p) { singleMode[p] = 'raw'; });

  /* --- 6. Substitution puis post-traitement ---------------------------- */
  var html;
  try {
    var suffixed = applySuffixedTitleSites(template, model.values);
    var substituted = substitutePlaceholders(suffixed.html, {
      values: model.values, single: single, singleMode: singleMode
    });
    html = substituted.html;
  } catch (e) {
    // Une violation de contrat du GABARIT porte déjà son code (R5b) :
    // elle ne doit pas être diluée dans le R5 générique de substitution.
    return {
      ok: false,
      errors: [{ code: e.code || 'R5', message: e.message }],
      warnings: warnings
    };
  }

  try {
    html = deepenAssets(html);          // règle 2
    html = publishRobots(html);         // règle 3
    html = stripDevComment(html);       // règle 4
    html = backLinkToCategory(html, category);   // règle 5
    html = stripEmptyRelated(html);             // règle 5c
  } catch (e) {
    return { ok: false, errors: [{ code: 'R5b', message: e.message }], warnings: warnings };
  }

  /* --- 7. Règle 6 : contrat de production, AVANT toute écriture --------- */
  var validation = validateRenderedHtml(html, { canonicalPath: canonicalPath });
  if (errors.length) {
    return { ok: false, errors: errors, warnings: warnings, validation: validation };
  }
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings: warnings, validation: validation };
  }
  warnings = warnings.concat(validation.warnings || []);

  return {
    ok: true,
    html: html,
    path: articleCheck.path,
    sitePath: sitePathOfArticle,
    canonicalUrl: canonicalUrl,
    category: category,
    model: model,
    validation: validation,
    warnings: warnings,
    errors: []
  };

  function fail(message) {
    return { ok: false, errors: [{ code: 'R0', message: message }], warnings: [] };
  }
}
