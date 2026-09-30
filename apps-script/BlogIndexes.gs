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
