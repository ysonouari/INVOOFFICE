/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : BlogIndexes.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : RÉCONCILIER les index statiques du Blog après
 * l'écriture d'un article, afin qu'un article publié soit immédiatement
 * visible dans sa page de catégorie, dans le hub Blog et dans le sitemap.
 *
 * Principes ( conformity stricte à l'existant ) :
 *   - PATCH déterministe, JAMAIS régénération. L'ordre éditorial des 9
 *     articles existants n'est PAS dérivable des données (la page
 *     Facturation mélange 8 min, 6 min puis 7 min à date identique) : le
 *     régénérer le détruirait. On ne touche donc qu'à la seule entrée qui
 *     nous concerne.
 *   - AUCUNE modification des fichiers du dépôt depuis Apps Script en dehors
 *     des 3 fichiers d'index ; le HTML de production est lu tel quel et
 *     réécrit octet pour octet, sauf l'entrée concernée.
 *   - AUCUNE bibliothèque de parsing HTML : Apps Script n'en fournit pas et
 *     le dépôt n'en dépend pas. Ciblage par motifs ancrés et bornés.
 *   - AUCUN changement d'architecture : réutilisation de escHtml(),
 *     frenchDate(), normalizeReadingTime(), sitePath(), getCategoryMap(),
 *     getFile(), createOrUpdate(), logWarning().
 *   - Le retry sur conflit de SHA est fait EN LIGNE dans
 *     upsertArticleInIndexFile() et NON via retryAfterConflict() (helper de
 *     Publisher.gs) : il faut aussi recalculer le compteur sur le contenu
 *     relu, ce que le helper partagé ne permet pas. createOrUpdate() reste
 *     utilisé pour l'écriture, donc le verrou assertWritesAllowed() s'applique
 *     exactement comme pour l'article.
 *   - SÉQUENCE FIXE : index de catégorie → hub Blog → sitemap.
 *
 * Idempotence : la réconciliation est relisible et réinsérable. Republier un
 * article déjà présent ne produit aucun changement, donc aucune écriture.
 */

var BLOG_HUB_PATH = 'blog/index.html';
var BLOG_LIST_OPEN = '<ul class="article-list">';
var BLOG_ITEM_OPEN = '<li class="article-item">';
var BLOG_CARD_OPEN = '<div class="cat-card">';
var ARTICLE_ITEM_RE = /<li class="article-item">[\s\S]*?<\/li>/g;

/* ------------------------------------------------------------------------ */
/* Carte d'article                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Excerpt de carte : même chaîne de repli que le moteur SEO
 * (SEO_SLOT_SOURCES.articleExcerpt), afin qu'une carte et une balise
 * og:description ne divergent pas silencieusement. Jamais recalculé.
 */
function indexCardExcerpt(article) {
  var chain = ['ARTICLE_EXCERPT', 'META_DESCRIPTION'];
  for (var i = 0; i < chain.length; i++) {
    var candidate = String(
      article[chain[i]] === null || article[chain[i]] === undefined ? '' : article[chain[i]]
    ).trim();
    if (candidate) return candidate;
  }
  return '';
}

/**
 * Une carte d'index, au markup EXACT déjà en production.
 *
 * Hub        : <div class="meta">{Catégorie} · {date} · {N} min</div>
 * Catégorie  : <div class="meta">{date} · {N} min</div>
 *
 * Le temps de lecture est ÉDITORIAL (colonne READING_TIME) : il n'est jamais
 * recalculé, conformément à la décision PO-2 du moteur de rendu.
 *
 * @param {Object} article ligne `Articles`
 * @param {{withCategory?:boolean, sitePath?:string}} [options]
 *        `sitePath` permet au Publisher de réinjecter le chemin calculé par
 *        renderArticleHtml(), garantissant que la carte pointe exactement sur
 *        le fichier publié.
 * @return {{ok:boolean, html?:string, href?:string, error?:string}}
 */
function buildArticleListItem(article, options) {
  var opt = options || {};
  var withCategory = opt.withCategory !== false;

  var title = String(article && article.TITLE ? article.TITLE : '').trim();
  if (!title) {
    return { ok: false, error: 'TITLE absent : impossible de fabriquer une carte d’index.' };
  }

  var slug = String(article && article.SLUG ? article.SLUG : '').trim();
  if (!slug) {
    return { ok: false, error: 'SLUG absent : impossible de fabriquer une carte d’index.' };
  }

  var categoryName = String(article && article.CATEGORY ? article.CATEGORY : '').trim();
  var map = getCategoryMap();
  var categorySlug = String(map[categoryName] === undefined ? '' : map[categoryName]).trim();
  if (!categorySlug) {
    return {
      ok: false,
      error: 'Catégorie inconnue pour l’index : « ' + categoryName + ' ».'
    };
  }

  var reading = normalizeReadingTime(article.READING_TIME);
  if (reading.error) return { ok: false, error: reading.error };

  var date = frenchDate(String(article.PUBLISHED_AT || '').trim());
  if (!date) {
    return {
      ok: false,
      error: 'PUBLISHED_AT illisible : « ' + article.PUBLISHED_AT + ' » (attendu YYYY-MM-DD).'
    };
  }

  var href = opt.sitePath ? opt.sitePath : sitePath(categorySlug, slug);
  if (href.charAt(0) !== '/') href = '/' + href;

  var meta = date + ' · ' + reading.value + ' min';
  if (withCategory) meta = categoryName + ' · ' + meta;

  var html = BLOG_ITEM_OPEN +
    '<div class="meta">' + escHtml(meta) + '</div>' +
    '<h3><a href="' + escHtml(href) + '">' + escHtml(title) + '</a></h3>' +
    '<p>' + escHtml(indexCardExcerpt(article)) + '</p>' +
    '</li>';

  return { ok: true, html: html, href: href, categorySlug: categorySlug };
}

/* ------------------------------------------------------------------------ */
/* Insertion dans une liste d'articles                                        */
/* ------------------------------------------------------------------------ */

/**
 * Insère ou remplace une carte dans le `<ul class="article-list">` existant.
 *
 * Fonction PUR : ne lit ni n'écrit GitHub. Cible la liste existante et ne
 * modifie rien en dehors. L'identification d'un article déjà listé se fait par
 * son href EXACT, ce qui garantit l'absence de doublon.
 *
 * L'ordre éditorial est préservé : seul l'article concerné est déplacé, les
 * autres entrées ne bougent pas. Un nouvel article est inséré en tête (ordre
 * « Derniers articles »).
 *
 * @param {string} html page d'index existante
 * @param {{html:string, href:string}} item sortie de buildArticleListItem()
 * @return {{ok:boolean, html?:string, action?:string, error?:string}}
 */
function upsertArticleInList(html, item) {
  var source = String(html || '');
  var openIdx = source.indexOf(BLOG_LIST_OPEN);
  if (openIdx === -1) {
    return {
      ok: false,
      error: 'Liste d’articles absente : ' + BLOG_LIST_OPEN + ' introuvable.'
    };
  }
  var bodyStart = openIdx + BLOG_LIST_OPEN.length;
  var closeIdx = source.indexOf('</ul>', bodyStart);
  if (closeIdx === -1) {
    return { ok: false, error: 'Liste d’articles non fermée : </ul> introuvable.' };
  }

  var body = source.slice(bodyStart, closeIdx);
  var needle = 'href="' + item.href + '"';

  // 1) l'article est déjà listé → remplacement de SON entrée uniquement.
  ARTICLE_ITEM_RE.lastIndex = 0;
  var existing = null;
  var m;
  while ((m = ARTICLE_ITEM_RE.exec(body)) !== null) {
    if (m[0].indexOf(needle) !== -1) {
      existing = m;
      break;
    }
  }
  if (existing) {
    return {
      ok: true,
      action: 'replaced',
      html: source.slice(0, bodyStart) +
        body.slice(0, existing.index) + item.html + body.slice(existing.index + existing[0].length) +
        source.slice(closeIdx)
    };
  }

  // 2) article absent → insertion en tête, en réutilisant la séparation et
  //    l'indentation déjà présentes dans la liste.
  var firstIdx = body.indexOf(BLOG_ITEM_OPEN);
  if (firstIdx === -1) {
    return {
      ok: true,
      action: 'inserted',
      html: source.slice(0, bodyStart) + item.html + body + source.slice(closeIdx)
    };
  }
  var sep = body.slice(0, firstIdx);
  return {
    ok: true,
    action: 'inserted',
    html: source.slice(0, bodyStart) +
      body.slice(0, firstIdx) + item.html + sep + body.slice(firstIdx) +
      source.slice(closeIdx)
  };
}

/* ------------------------------------------------------------------------ */
/* Écriture d'un fichier d'index (idempotente)                                */
/* ------------------------------------------------------------------------ */

/**
 * Lit un fichier d'index, applique upsertArticleInList(), réécrit UNIQUEMENT
 * si le contenu a réellement changé.
 *
 * createOrUpdate() réutilise createOrUpdateFile(), donc TOUJOURS le verrou
 * assertWritesAllowed() : aucun contournement possible de TEST_MODE ni de
 * GITHUB_WRITE_ENABLED. Le message de commit est déterministe.
 *
 * @param {string} path chemin du fichier d'index (ex. blog/tva/index.html)
 * @param {{html:string, href:string}} item sortie de buildArticleListItem()
 * @param {Object} [meta] { message, action } trace lisible du commit
 * @return {{ok:boolean, action?:string, path?:string, changed?:boolean,
 *           sha?:string, count?:number, error?:string}}
 */
function upsertArticleInIndexFile(path, item, meta) {
  var info = meta || {};
  var existing;
  try {
    existing = getFile(path);
  } catch (e) {
    return { ok: false, error: 'Lecture impossible de ' + path + ' : ' + redact(String(e && e.message ? e.message : e)) };
  }
  if (!existing) {
    return {
      ok: false,
      error: 'Index absent du dépôt : ' + path +
        '. L’index doit exister avant publication (aucune création automatique).'
    };
  }

  var patched = upsertArticleInList(existing.content, item);
  if (!patched.ok) return { ok: false, error: path + ' : ' + patched.error };

  // Nombre RÉEL d'entrées de la liste patchée : c'est la source de vérité du
  // compteur du hub, et non un durcissage ni le total du hub (qui ne liste
  // qu'une sélection d'articles). Calculé sur le contenu déjà patché, donc
  // sans lecture GitHub supplémentaire.
  var count = (patched.html.match(/<li class="article-item">/g) || []).length;

  // Aucun changement → aucune écriture, aucun commit. C'est ce qui rend la
  // republication silencieuse et le double-clic opérateur sans effet.
  if (patched.html === existing.content) {
    return {
      ok: true,
      action: 'unchanged',
      path: path,
      changed: false,
      sha: existing.sha,
      count: count
    };
  }

  var message = info.message || ('Index : ajout de ' + (item.href || ''));
  try {
    var written = createOrUpdate({
      path: path,
      content: patched.html,
      message: message,
      sha: existing,
      action: 'update'
    });
    return {
      ok: true,
      action: patched.action,
      path: path,
      changed: true,
      sha: written.sha,
      count: count
    };
  } catch (e) {
    if (!isShaConflict(e) || PUBLISH_CONFLICT_RETRIES < 1) {
      return { ok: false, error: path + ' : ' + redact(String(e && e.message ? e.message : e)) };
    }
    var fresh = getFile(path);
    if (!fresh) return { ok: false, error: path + ' : disparu après conflit de SHA.' };
    var again = upsertArticleInList(fresh.content, item);
    if (!again.ok) return { ok: false, error: path + ' : ' + again.error };
    // Le compte est RECALCULÉ sur le contenu relu : après un conflit, l'index a
    // pu changer entre-temps, et c'est cette version qui fait foi.
    var freshCount = (again.html.match(/<li class="article-item">/g) || []).length;
    if (again.html === fresh.content) {
      return { ok: true, action: 'unchanged', path: path, changed: false, sha: fresh.sha, count: freshCount };
    }
    var retried = createOrUpdate({
      path: path,
      content: again.html,
      message: message,
      sha: fresh,
      action: 'update'
    });
    return { ok: true, action: again.action, path: path, changed: true, sha: retried.sha, count: freshCount };
  }
}

/* ------------------------------------------------------------------------ */
/* Compteurs de catégories du hub                                             */
/* ------------------------------------------------------------------------ */

/**
 * Recalcule les compteurs du `.cat-grid` du hub.
 *
 * Seules les valeurs passed dans `counts` sont réécrites : le nom, le lien, le
 * style et l'ordre des cartes sont intacts. Les compteurs des catégories non
 * listées sont LAISSÉS INTACTS, ce qui évite 4 lectures GitHub supplémentaires
 * par publication (les autres catégories n'ont pas changé).
 *
 * Le compte fourni doit provenir du nombre RÉEL de `<li class="article-item">`
 * de l'index de catégorie — c'est l'orchestrateur qui l'a compté sur le
 * contenu déjà patché, donc sans lecture additionnelle. Compter la liste du HUB
 * serait faux : elle ne liste qu'une sélection d'articles, pas une catégorie.
 *
 * Appelée à 1 argument, la fonction ne modifie RIEN et le signale : sans source
 * de vérité, mieux vaut un compteur en retard qu'un compteur faux.
 *
 * @param {string} hubHtml hub Blog existant
 * @param {Object} [counts] { slug: nombre } pour les catégories à recaler
 * @return {{ok:boolean, html?:string, changed?:boolean, error?:string}}
 */
function updateCategoryCounts(hubHtml, counts) {
  var source = String(hubHtml || '');
  var out = source;
  var changed = false;
  if (!counts || typeof counts !== 'object' || Object.keys(counts).length === 0) {
    return { ok: true, html: out, changed: false, error: 'Aucun compteur fourni : hub laissé intact.' };
  }
  var slugs = Object.keys(counts);

  for (var i = 0; i < slugs.length; i++) {
    var slug = slugs[i];
    var n = parseInt(counts[slug], 10);
    if (isNaN(n) || n < 0) continue;

    // Ancre sur le lien de la carte : jamais de confusion entre catégories.
    var anchor = BLOG_CARD_OPEN + '<a href="/blog/' + slug + '/">';
    var cardIdx = out.indexOf(anchor);
    if (cardIdx === -1) continue;

    var countIdx = out.indexOf('<div class="count">', cardIdx);
    if (countIdx === -1) continue;
    var countEnd = out.indexOf('</div>', countIdx);
    if (countEnd === -1) continue;

    var label = n + (n > 1 ? ' articles' : ' article');
    var replacement = '<div class="count">' + label;
    var current = out.slice(countIdx, countEnd);
    if (current === replacement) continue;

    out = out.slice(0, countIdx) + replacement + out.slice(countEnd);
    changed = true;
  }

  return { ok: true, html: out, changed: changed };
}

/* ------------------------------------------------------------------------ */
/* Sitemap                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Ajoute l'URL d'un article au sitemap, UNE SEULE FOIS.
 *
 * Fonction PUR. Respecte le format existant : les entrées d'articles sont des
 * balises `<url>` sur une seule ligne, sans xhtml:link (réservées aux pages
 * statiques). `</urlset>` est toujours préservé.
 *
 * @param {string} xml sitemap existant
 * @param {string} loc URL absolue, ex. https://www.invooffice.com/blog/x.html
 * @param {string} lastmod date ISO YYYY-MM-DD
 * @return {{ok:boolean, html?:string, changed?:boolean, error?:string}}
 */
function insertIntoSitemap(xml, loc, lastmod) {
  var source = String(xml || '');
  if (!loc) return { ok: false, error: 'URL d’article absente : sitemap non mis à jour.' };

  var date = String(lastmod || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'lastmod invalide : « ' + lastmod + ' » (attendu YYYY-MM-DD).' };
  }

  // Déjà présent → aucune écriture, même si l'entrée a été ajoutée à la main.
  if (source.indexOf('<loc>' + loc + '</loc>') !== -1) {
    return { ok: true, html: source, changed: false };
  }

  var closeIdx = source.lastIndexOf('</urlset>');
  if (closeIdx === -1) return { ok: false, error: 'Sitemap invalide : </urlset> introuvable.' };

  var entry = '<url><loc>' + escHtml(loc) + '</loc>' +
    '<lastmod>' + date + '</lastmod>' +
    '<changefreq>monthly</changefreq>' +
    '<priority>0.8</priority></url>';

  // Le sitemap de production indente de 2 espaces chaque entrée et garde
  // `</urlset>` sur sa propre ligne. `slice(0, closeIdx)` se termine déjà par le
  // saut de ligne qui précède `</urlset>` : on le retire avant de joindre, sinon
  // la nouvelle entrée se retrouve précédée d'une ligne vide. Ce retrait rend
  // aussi le résultat correct si la source n'a pas ce saut de ligne.
  var head = source.slice(0, closeIdx).replace(/\n+$/, '');
  return {
    ok: true,
    changed: true,
    html: head + '\n  ' + entry + '\n' + source.slice(closeIdx)
  };
}

/* ------------------------------------------------------------------------ */
/* Orchestration                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Réconcilie les 3 index statiques d'un article fraîchement publié.
 *
 * SÉQUENCE IMPOSÉE : index de catégorie → hub Blog → sitemap.
 *
 * Appelé UNIQUEMENT après le succès de writeArticleFile(). Un échec d'index ne
 * remonte JAMAIS en exception et ne modifie JAMAIS le statut PUBLISHED :
 * l'article EST publié, seul son référencement statique peut être en retard.
 * Chaque étape est isolée : l'échec du sitemap n'annule pas l'index de
 * catégorie, et inversement.
 *
 * @param {Object} article ligne `Articles` (après écriture)
 * @param {{sitePath?:string, publishedAt?:string}} [options]
 *        `publishedAt` est la date RÉSOLUE par le Publisher : un article
 *        nouvellement publié n'a pas encore de PUBLISHED_AT en colonne, or la
 *        date alimente à la fois le libellé de la carte et le <lastmod>.
 * @return {{ok:boolean, indexed:boolean, categoryIndex:Object, hub:Object,
 *           sitemap:Object, warnings:Array<Object>, writes:number}}
 */
function updateIndexesForArticle(article, options) {
  var opt = options || {};
  var warnings = [];
  var report = {
    ok: true,
    indexed: true,
    writes: 0,
    categoryIndex: { path: '', action: 'skipped' },
    hub: { path: BLOG_HUB_PATH, action: 'skipped' },
    sitemap: { path: APP.SITEMAP_PATH, action: 'skipped' },
    warnings: warnings
  };

  // Copie enrichie : la date résolue prime sur la colonne, qui peut être vide
  // pour une première publication. `article` n'est jamais muté.
  var resolved = {};
  for (var k in article) {
    if (Object.prototype.hasOwnProperty.call(article, k)) resolved[k] = article[k];
  }
  if (opt.publishedAt && !String(resolved.PUBLISHED_AT || '').trim()) {
    resolved.PUBLISHED_AT = String(opt.publishedAt).trim();
  }

  var item = buildArticleListItem(resolved, { withCategory: false, sitePath: opt.sitePath });
  if (!item.ok) {
    report.ok = false;
    report.indexed = false;
    warnings.push({ code: 'IX0', message: 'Index non réconcilié : ' + item.error });
    return report;
  }
  var categorySlug = item.categorySlug;
  var categoryPath = APP.BLOG_DIR + '/' + categorySlug + '/index.html';
  report.categoryIndex.path = categoryPath;

  /* --- 1. Index de catégorie -------------------------------------------- */
  var category = upsertArticleInIndexFile(categoryPath, item, {
    message: 'Index : ' + (resolved.SLUG || '') + ' (' + categorySlug + ')'
  });
  if (!category.ok) {
    report.ok = false;
    report.indexed = false;
    report.categoryIndex.action = 'error';
    warnings.push({ code: 'IX1', message: 'Index de catégorie : ' + category.error });
  } else {
    report.categoryIndex = category;
    if (category.changed) report.writes += 1;
  }

  /* --- 2. Hub Blog ------------------------------------------------------ */
  try {
    var hubExisting = getFile(BLOG_HUB_PATH);
    if (!hubExisting) throw new Error('Hub absent du dépôt : ' + BLOG_HUB_PATH);

    var hubItem = buildArticleListItem(resolved, { withCategory: true, sitePath: opt.sitePath });
    if (!hubItem.ok) throw new Error(hubItem.error);

    var hubList = upsertArticleInList(hubExisting.content, hubItem);
    if (!hubList.ok) throw new Error(hubList.error);

    // Compteur = nombre RÉEL d'entrées de l'INDEX DE CATÉGORIE patché à
    // l'étape 1, pas du hub : le hub ne liste qu'une sélection d'articles,
    // donc compter sa propre liste donnerait un total sans rapport avec la
    // catégorie. Les 4 autres compteurs restent intacts (elles n'ont pas bougé).
    var countedMap = {};
    if (category.ok && typeof category.count === 'number') countedMap[categorySlug] = category.count;
    var hubHtml = updateCategoryCounts(hubList.html, countedMap).html;

    if (hubHtml === hubExisting.content) {
      report.hub = { path: BLOG_HUB_PATH, action: 'unchanged', changed: false, sha: hubExisting.sha };
    } else {
      var hubWritten = createOrUpdate({
        path: BLOG_HUB_PATH,
        content: hubHtml,
        message: 'Hub : ' + (resolved.SLUG || ''),
        sha: hubExisting,
        action: 'update'
      });
      report.hub = { path: BLOG_HUB_PATH, action: hubList.action, changed: true, sha: hubWritten.sha };
      report.writes += 1;
    }
  } catch (e) {
    report.ok = false;
    report.indexed = false;
    report.hub.action = 'error';
    warnings.push({ code: 'IX2', message: 'Hub Blog : ' + redact(String(e && e.message ? e.message : e)) });
  }

  /* --- 3. Sitemap ------------------------------------------------------- */
  try {
    var sitemapExisting = getFile(APP.SITEMAP_PATH);
    if (!sitemapExisting) throw new Error('Sitemap absent du dépôt : ' + APP.SITEMAP_PATH);

    var loc = APP.SITE_ORIGIN + item.href;
    var patched = insertIntoSitemap(sitemapExisting.content, loc, resolved.PUBLISHED_AT);
    if (!patched.ok) throw new Error(patched.error);

    if (!patched.changed) {
      report.sitemap = { path: APP.SITEMAP_PATH, action: 'unchanged', changed: false, sha: sitemapExisting.sha };
    } else {
      var smWritten = createOrUpdate({
        path: APP.SITEMAP_PATH,
        content: patched.html,
        message: 'Sitemap : ' + (resolved.SLUG || ''),
        sha: sitemapExisting,
        action: 'update'
      });
      report.sitemap = { path: APP.SITEMAP_PATH, action: 'inserted', changed: true, sha: smWritten.sha };
      report.writes += 1;
    }
  } catch (e) {
    report.ok = false;
    report.indexed = false;
    report.sitemap.action = 'error';
    warnings.push({ code: 'IX3', message: 'Sitemap : ' + redact(String(e && e.message ? e.message : e)) });
  }

  if (!report.ok) {
    logWarning('publish', 'Article publié mais index Blog non réconcilié.', {
      articleId: article.ID,
      slug: article.SLUG,
      githubPath: article.GITHUB_PATH,
      details: { warnings: warnings.length, writes: report.writes }
    });
  }

  return report;
}

/* ========================================================================== */
/* D5 — SUPPRESSION D'UN ARTICLE : inverses stricts des fonctions ci-dessus    */
/* ========================================================================== */
/*
 * Principes (mêmes invariants que la partie « ajout ») :
 *   - PUR d'abord : removeFromArticleList(), removeFromHub() et
 *     removeFromSitemap() ne lisent ni n'écrivent GitHub. Elles sont donc
 *     testables octet par octet, sans mocks ni réseau ;
 *   - JAMAIS de régénération : on ne reconstruit pas une page, on retire
 *     l'entrée exacte. Les octets non concernés sont renvoyés À L'IDENTIQUE ;
 *   - L'identité est le HREF (index) et la LOC (sitemap). Jamais le titre,
 *     jamais les métadonnées, jamais le texte de catégorie : le hub porte un
 *     `<div class="meta">` qui contient la catégorie, les index de catégorie
 *     ne le portent pas — le href est donc le SEUL identifiant commun ;
 *   - IDEMPOTENT : une entrée déjà absente renvoie `changed:false` sans écriture ;
 *   - SÉQUENCE IMPOSÉE : index de catégorie → hub Blog → sitemap, et le
 *     FICHIER ARTICLE EST SUPPRIMÉ EN DERNIER (Publisher.gs).
 */

/** Longueur de la balise fermante `</url>` (bornes du retrait sitemap). */
var SITEMAP_URL_CLOSE_LEN = 6;

/** Nombre réel d'entrées d'une liste d'articles. */
function countArticleItems(html) {
  return (String(html || '').match(/<li class="article-item">/g) || []).length;
}

/* ------------------------------------------------------------------------ */
/* Retrait d'une carte de liste                                              */
/* ------------------------------------------------------------------------ */

/**
 * Retire LA carte correspondant au href exact, et elle seule.
 *
 * Fonction PUR : ne lit ni n'écrit GitHub. Miroir exact de
 * upsertArticleInList() — même découpage (ARTICLE_ITEM_RE), même ancre
 * (`<ul class="article-list">`) — donc un aller-retour ajout/suppression est
 * sans dérive.
 *
 * L'IDENTITÉ EST LE HREF. Aucun titre, aucune métadonnée, aucun texte de
 * catégorie n'est utilisé pour reconnaître l'entrée : c'est la seule clé
 * commune à l'index de catégorie et au hub.
 *
 * Le retrait emporte le saut de ligne ET l'indentation de la ligne retirée
 * afin de ne laisser ni ligne vide ni indentation orpheline. S'il s'agit de la
 * dernière carte, c'est le séparateur PRÉCÉDENT qui est emporté.
 *
 * @param {string} html page d'index existante
 * @param {string} href href EXACT de l'article, ex. /blog/tva/taux.html
 * @return {{ok:boolean, html:string, changed:boolean, removed:boolean,
 *           count:number, error?:string}}
 */
function removeFromArticleList(html, href) {
  var source = String(html || '');
  var target = String(href || '');
  if (!target) {
    return { ok: false, html: source, changed: false, removed: false, count: countArticleItems(source), error: 'href absent : aucune carte ciblée.' };
  }

  var openIdx = source.indexOf(BLOG_LIST_OPEN);
  if (openIdx === -1) {
    return { ok: false, html: source, changed: false, removed: false, count: 0, error: 'Liste d’articles absente : ' + BLOG_LIST_OPEN + ' introuvable.' };
  }
  var bodyStart = openIdx + BLOG_LIST_OPEN.length;
  var closeIdx = source.indexOf('</ul>', bodyStart);
  if (closeIdx === -1) {
    return { ok: false, html: source, changed: false, removed: false, count: 0, error: 'Liste d’articles non fermée : </ul> introuvable.' };
  }

  var body = source.slice(bodyStart, closeIdx);
  var needle = 'href="' + target + '"';

  ARTICLE_ITEM_RE.lastIndex = 0;
  var hits = [];
  var m;
  while ((m = ARTICLE_ITEM_RE.exec(body)) !== null) {
    if (m[0].indexOf(needle) !== -1) hits.push(m);
  }

  // Absent : aucune écriture. C'est ce qui rend le retrait idempotent.
  if (!hits.length) {
    return { ok: true, html: source, changed: false, removed: false, count: countArticleItems(body) };
  }
  // Anomalie de contenu : deux cartes pour un seul href. On REFUSE plutôt que
  // de choisir arbitrairement — une suppression destructive ne devine pas.
  if (hits.length > 1) {
    return {
      ok: false, html: source, changed: false, removed: false,
      count: countArticleItems(body),
      error: 'Anomalie : ' + hits.length + ' cartes portent le href « ' + target + ' ». Suppression refusée.'
    };
  }

  var hit = hits[0];
  var end = hit.index + hit[0].length;
  var start = hit.index;
  var nlAfter = /^(\r\n|\n|\r)/.exec(body.slice(end));
  var follows = nlAfter !== null && body.slice(end + nlAfter[0].length).indexOf(BLOG_ITEM_OPEN) === 0;

  if (follows) {
    // Une carte suit : on emporte le saut de ligne + l'indentation qui
    // précèdent la carte suivante, sinon il resterait une indentation nue.
    var indent = /^[ \t]*/.exec(body.slice(end + nlAfter[0].length))[0];
    end += nlAfter[0].length + indent.length;
  } else {
    // Dernière carte (ou unique) : on emporte le saut de ligne + l'indentation
    // qui la précèdent, sinon il resterait une ligne vide avant `</ul>`.
    var before = /(\r\n|\n|\r)[ \t]*$/.exec(body.slice(0, hit.index));
    if (before) start = hit.index - before[0].length;
  }

  var newBody = body.slice(0, start) + body.slice(end);
  var out = source.slice(0, bodyStart) + newBody + source.slice(closeIdx);
  return {
    ok: true,
    html: out,
    changed: true,
    removed: true,
    count: countArticleItems(newBody)
  };
}

/**
 * Retire la carte de l'index de catégorie.
 *
 * Le `<h2>` n'est JAMAIS retiré, même quand la liste devient vide. Un titre de
 * section porte du texte réel : l'effacer serait une perte éditoriale, et le
 * risque de le faire à tort (mauvaise catégorie, comparaison d'accent, entité
 * HTML, `<h2>` de navigation) dépasse largement le bénéfice esthétique. Un
 * `<h2>` « Articles publiés » au-dessus d'une liste vide est un défaut
 * cosmétique, réversible à la main, sans lien cassé et sans effet sur le SEO
 * comme sur le compteur du hub — qui est, lui, recalculé.
 *
 * Le retrait est donc strictement le même que dans `removeFromArticleList()`,
 * mais avec son propre nom : l'appelant se documente ainsi, et la garantie
 * « aucun titre touché » est explicite dans le code.
 *
 * @param {string} html
 * @param {string} href
 * @return {{ok:boolean, html:string, changed:boolean, removed:boolean, count:number}}
 */
function removeFromCategoryList(html, href) {
  return removeFromArticleList(html, href);
}

/**
 * Retrait dans le hub : la carte d'article PLUS le compteur de sa catégorie.
 *
 * Aucune suppression de la carte `cat-card` : même à 0 article, la catégorie
 * reste un point d'entrée navigable. Faire disparaître une catégorie est une
 * décision éditoriale, jamais un effet de bord technique.
 *
 * Le compteur est fourni par l'orchestrateur (nombre RÉEL d'entrées de l'index
 * de catégorie, relu à l'étape précédente) — exactement la règle déjà appliquée
 * par updateIndexesForArticle(), qui ne recompte jamais la liste du hub.
 *
 * @param {string} html hub existant
 * @param {string} href href EXACT de l'article
 * @param {string} categorySlug slug de la catégorie
 * @param {number} [count] total de la catégorie ; absent = compteur inchangé
 */
function removeFromHub(html, href, categorySlug, count) {
  var source = String(html || '');
  var slug = String(categorySlug || '').trim();
  var link = String(href || '');

  // Garde STRUCTUREL (pas de métadonnée, pas de texte) : le href porte lui-même
  // le segment de catégorie, ce que l'on vérifie sur la chaîne du href.
  if (slug) {
    if (link.indexOf('/' + APP.BLOG_DIR + '/' + slug + '/') === -1) {
      return { ok: false, html: source, changed: false, removed: false, error: 'Le href « ' + href + ' » n’appartient pas à la catégorie « ' + slug + ' ».' };
    }
  }

  var card = removeFromArticleList(source, href);
  if (!card.ok) return { ok: false, html: source, changed: false, removed: false, error: card.error };
  if (!card.removed) return { ok: card.ok, html: source, changed: false, removed: false, count: card.count };

  var out = card.html;
  var counted = false;
  if (typeof count === 'number' && !isNaN(count)) {
    var applied = updateCategoryCounts(out, (function () {
      var map = {};
      map[slug] = count;
      return map;
    })());
    out = applied.html;
    counted = applied.changed === true;
  }

  return {
    ok: true,
    html: out,
    changed: out !== source,
    removed: true,
    count: card.count,
    countUpdated: counted
  };
}

/* ------------------------------------------------------------------------ */
/* Retrait du sitemap                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Retire l'entrée `<url>…</url>` qui porte EXACTEMENT cette URL.
 *
 * Fonction PUR. JAMAIS de suppression par ligne : le sitemap de production
 * contient des entrées `single-line` ET des entrées `multi-line` (avec
 * `xhtml:link`), et sa dernière entrée est collée à `</urlset>`. Une approche
 * par ligne échouerait sur les deux formats. On travaille donc sur le BLOC.
 *
 * L'ancre est `lastIndexOf('<url>', iLoc)` et non `indexOf` : une entrée
 * voisine peut contenir la chaîne `<url>` ailleurs, et une recherche depuis le
 * début viserait le mauvais bloc — c'est-à-dire la suppression d'une AUTRE
 * page. C'est le risque central de cette fonction.
 *
 * @param {string} xml sitemap existant
 * @param {string} loc URL ABSOLUE exacte, ex. https://www.invooffice.com/blog/x.html
 * @return {{ok:boolean, html:string, changed:boolean, removed:boolean, error?:string}}
 */
function removeFromSitemap(xml, loc) {
  var source = String(xml || '');
  var target = String(loc || '');
  if (!target) {
    return { ok: false, html: source, changed: false, removed: false, error: 'URL absente : sitemap non modifié.' };
  }

  var locTag = '<loc>' + target + '</loc>';
  var iLoc = source.indexOf(locTag);
  // Déjà absent → aucune écriture, même si l'entrée a été retirée à la main.
  if (iLoc === -1) return { ok: true, html: source, changed: false, removed: false };

  var iOpen = source.lastIndexOf('<url>', iLoc);
  var iClose = source.indexOf('</url>', iLoc);
  if (iOpen === -1 || iClose === -1) {
    return {
      ok: false, html: source, changed: false, removed: false,
      error: 'Sitemap invalide : bloc <url>…</url> introuvable autour de ' + target + '.'
    };
  }

  var blockEnd = iClose + SITEMAP_URL_CLOSE_LEN;

  // S'il existe un saut de ligne APRÈS `</url>`, on retire le bloc et CE SEUL
  // saut de ligne : la ligne suivante garde exactement son indentation.
  var nlAfter = /^(\r\n|\n|\r)/.exec(source.slice(blockEnd));
  if (nlAfter) {
    var headPart = source.slice(0, iOpen);
    var nlBefore = /(\r\n|\n|\r)[ \t]*$/.exec(headPart);
    var start = nlBefore ? iOpen - nlBefore[0].length : iOpen;
    return {
      ok: true,
      changed: true,
      removed: true,
      html: source.slice(0, start) + source.slice(blockEnd + nlAfter[0].length)
    };
  }

  // CAS COLLÉ : aucune fin de ligne après `</url>` (entrée de production collée
  // à `</urlset>`). On s'arrête STRICTEMENT à la fin de `</url>` et on retire
  // le séparateur PRÉCÉDENT : `</urlset>` est conservé, les autres `<url>` sont
  // intacts. Le retrait reste idempotent (2e appel : loc absente).
  var headPart2 = source.slice(0, iOpen);
  var nlBefore2 = /(\r\n|\n|\r)[ \t]*$/.exec(headPart2);
  var start2 = nlBefore2 ? iOpen - nlBefore2[0].length : iOpen;
  return {
    ok: true,
    changed: true,
    removed: true,
    html: source.slice(0, start2) + source.slice(blockEnd)
  };
}

/* ------------------------------------------------------------------------ */
/* Écriture d'un retrait (idempotente, retry 409 borné)                      */
/* ------------------------------------------------------------------------ */

/**
 * Moteur d'écriture commun aux 3 retraits : lit, applique `patchFn`, réécrit
 * UNIQUEMENT si le contenu a changé.
 *
 * Reprend le motif de conflit de upsertArticleInIndexFile() : PUT → 409 →
 * relecture → recalcul sur le contenu FRAIS → un seul nouvel essai. Le SHA
 * transporté par le retry est celui RELU, jamais celui du conflit.
 *
 * `patchFn(content)` doit renvoyer `{ok, html, changed, …}` sans jamais
 * effectuer d'écriture : c'est ce qui rend chaque étape testable et
 * rejouable. Aucun commit n'est créé si `changed === false`.
 *
 * @param {string} path
 * @param {Function} patchFn (content:string) => Object
 * @param {string} [message] message de commit déterministe
 */
function patchIndexFile(path, patchFn, message) {
  var existing;
  try {
    existing = getFile(path);
  } catch (e) {
    return { ok: false, path: path, changed: false, error: 'Lecture impossible de ' + path + ' : ' + redact(String(e && e.message ? e.message : e)) };
  }
  if (!existing) {
    // Un index absent n'est jamais CRÉÉ par une suppression : il n'y a rien à
    // retirer, et recréer un fichier serait une écriture non demandée.
    return { ok: true, path: path, changed: false, removed: false, absent: true, count: 0 };
  }

  var patched = patchFn(existing.content);
  if (!patched || patched.ok !== true) {
    return { ok: false, path: path, changed: false, error: path + ' : ' + ((patched && patched.error) || 'retrait impossible') };
  }
  if (!patched.changed) {
    return {
      ok: true, path: path, changed: false, removed: false,
      sha: existing.sha, count: typeof patched.count === 'number' ? patched.count : countArticleItems(existing.content)
    };
  }

  var commit = message || ('Retrait : ' + path);
  try {
    var written = createOrUpdate({
      path: path,
      content: patched.html,
      message: commit,
      sha: existing,
      action: 'update'
    });
    return {
      ok: true, path: path, changed: true, removed: true, sha: written.sha,
      count: typeof patched.count === 'number' ? patched.count : countArticleItems(patched.html)
    };
  } catch (e) {
    if (!isShaConflict(e) || PUBLISH_CONFLICT_RETRIES < 1) {
      return { ok: false, path: path, changed: false, error: path + ' : ' + redact(String(e && e.message ? e.message : e)) };
    }
    var fresh;
    try {
      fresh = getFile(path);
    } catch (readError) {
      return { ok: false, path: path, changed: false, error: path + ' : ' + redact(String(readError && readError.message ? readError.message : readError)) };
    }
    if (!fresh) return { ok: true, path: path, changed: false, removed: false, absent: true, count: 0 };
    var again = patchFn(fresh.content);
    if (!again || again.ok !== true) {
      return { ok: false, path: path, changed: false, error: path + ' : ' + ((again && again.error) || 'retrait impossible après conflit de SHA') };
    }
    if (!again.changed) {
      return { ok: true, path: path, changed: false, removed: false, sha: fresh.sha, count: countArticleItems(fresh.content) };
    }
    var retried = createOrUpdate({
      path: path,
      content: again.html,
      message: commit,
      sha: fresh,
      action: 'update'
    });
    return {
      ok: true, path: path, changed: true, removed: true, sha: retried.sha,
      count: typeof again.count === 'number' ? again.count : countArticleItems(again.html), retried: true
    };
  }
}

/**
 * Retrait dans un index de catégorie (wrapper nommé du plan, D5.8).
 *
 * `categoryName` n'est plus transmis à `removeFromCategoryList()` : le `<h2>`
 * n'est jamais retiré, donc l'intitulé de la catégorie n'a plus d'usage ici.
 * Le paramètre reste accepté (et ignoré) pour ne pas casser l'appelant.
 *
 * @param {string} path ex. blog/facturation/index.html
 * @param {string} href href EXACT de l'article
 * @param {{message?:string, categoryName?:string}} [meta]
 */
function removeArticleFromIndexFile(path, href, meta) {
  var info = meta || {};
  return patchIndexFile(path, function (content) {
    return removeFromCategoryList(content, href);
  }, info.message || ('Index : retrait de ' + href));
}

/* ------------------------------------------------------------------------ */
/* Orchestration du retrait des 3 index                                      */
/* ------------------------------------------------------------------------ */

/**
 * Retire les références statiques d'un article : index de catégorie → hub →
 * sitemap. SÉQUENCE STRICTE, identique en lecture et en écriture.
 *
 * Appelé UNIQUEMENT par Publisher.gs, et UNIQUEMENT après le contrôle d'identité
 * et le contrôle du SHA distant, et AVANT la suppression du fichier article :
 * c'est ce qui rend l'état « index à jour + fichier supprimé » inatteignable.
 *
 * AUCUN échec ne remonte en exception. Chaque étape est isolée : l'échec du
 * sitemap n'annule pas l'index de catégorie. Les avertissements sont
 * remontés dans `warnings` (donc dans le résultat, le compte rendu opérateur et
 * la feuille Logs).
 *
 * @param {Object} article ligne `Articles`
 * @param {{href:string, categorySlug:string, categoryName?:string, slug?:string}} options
 * @return {{ok:boolean, removed:boolean, steps:Object, warnings:Array, writes:number}}
 */
function removeIndexesForArticle(article, options) {
  var opt = options || {};
  var warnings = [];
  var href = String(opt.href || '');
  var categorySlug = String(opt.categorySlug || '').trim();
  var categoryName = String(opt.categoryName || '');
  var slug = String(opt.slug || (article && article.SLUG) || '');

  var report = {
    ok: true,
    removed: false,
    writes: 0,
    categoryIndex: { path: '', changed: false, removed: false },
    hub: { path: BLOG_HUB_PATH, changed: false, removed: false },
    sitemap: { path: APP.SITEMAP_PATH, changed: false, removed: false },
    warnings: warnings
  };

  if (!href || !categorySlug) {
    report.ok = false;
    warnings.push({ code: 'RX0', message: 'Retrait impossible : href ou catégorie absent.' });
    return report;
  }

  /* --- 1. Index de catégorie --------------------------------------------- */
  var categoryPath = APP.BLOG_DIR + '/' + categorySlug + '/index.html';
  report.categoryIndex.path = categoryPath;
  var category = removeArticleFromIndexFile(categoryPath, href, {
    categoryName: categoryName,
    message: 'Index : retrait de ' + slug + ' (' + categorySlug + ')'
  });
  if (!category.ok) {
    report.ok = false;
    report.categoryIndex.error = category.error;
    warnings.push({ code: 'RX1', message: 'Index de catégorie : ' + category.error });
  } else {
    report.categoryIndex = category;
    if (category.changed) { report.removed = true; report.writes += 1; }
    // Catégorie désormais vide : signalée, jamais supprimée.
    if (category.removed && category.count === 0) {
      warnings.push({
        code: 'CATEGORY_COUNT_EMPTY',
        message: 'Index de catégorie « ' + categoryPath + ' » désormais vide. ' +
          'La catégorie et son index sont CONSERVés : leur suppression reste une décision éditoriale.'
      });
    }
  }

  /* --- 2. Hub Blog ------------------------------------------------------ */
  // Compteur = total RÉEL de l'INDEX DE CATÉGORIE (étape 1), jamais de la liste
  // du hub : le hub ne liste qu'une sélection d'articles. Si l'étape 1 a
  // échoué, on ne touche à AUCUN compteur (updateCategoryCounts() refuse
  // d'écrire sans source de vérité — « aucun compteur fourni »).
  var countedMap = {};
  var haveCount = category.ok && !category.absent && typeof category.count === 'number';
  if (haveCount) countedMap[categorySlug] = category.count;
  try {
    var hub = patchIndexFile(BLOG_HUB_PATH, function (content) {
      return removeFromHub(content, href, categorySlug, haveCount ? category.count : undefined);
    }, 'Hub : retrait de ' + slug);
    if (!hub.ok) {
      report.ok = false;
      report.hub.error = hub.error;
      warnings.push({ code: 'RX2', message: 'Hub Blog : ' + hub.error });
    } else {
      report.hub = hub;
      if (hub.changed) { report.removed = true; report.writes += 1; }
    }
  } catch (e) {
    report.ok = false;
    report.hub.error = redact(String(e && e.message ? e.message : e));
    warnings.push({ code: 'RX2', message: 'Hub Blog : ' + report.hub.error });
  }

  /* --- 3. Sitemap ------------------------------------------------------- */
  try {
    var sitemap = patchIndexFile(APP.SITEMAP_PATH, function (content) {
      return removeFromSitemap(content, APP.SITE_ORIGIN + href);
    }, 'Sitemap : retrait de ' + slug);
    if (!sitemap.ok) {
      report.ok = false;
      report.sitemap.error = sitemap.error;
      warnings.push({ code: 'RX3', message: 'Sitemap : ' + sitemap.error });
    } else {
      report.sitemap = sitemap;
      if (sitemap.changed) { report.removed = true; report.writes += 1; }
    }
  } catch (e) {
    report.ok = false;
    report.sitemap.error = redact(String(e && e.message ? e.message : e));
    warnings.push({ code: 'RX3', message: 'Sitemap : ' + report.sitemap.error });
  }

  if (!report.ok) {
    // MÊME chemin de journalisation que le reste du flux de suppression :
    // `logWarning()` laisserait la colonne dédiée GITHUB_PATH vide et
    // disperserait le chemin dans DETAILS, alors que la valeur EST connue ici.
    // `logDeleteEvent()` (Publisher.gs) est le helper D5 unique : on le
    // réutilise, on n'en crée pas un second, et `Logger.gs` reste intact.
    logDeleteEvent(LEVEL.WARNING, 'Index Blog partiellement nettoyé avant suppression.', {
      articleId: article && article.ID,
      slug: slug,
      status: article && article.STATUS,
      githubPath: article && article.GITHUB_PATH,
      details: {
        warnings: warnings.length,
        codes: warnings.map(function (w) { return w.code; }),
        writes: report.writes
      }
    });
  }

  return report;
}
