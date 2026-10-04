/**
 * Voisinage éditorial — « Articles similaires », « Article précédent » et
 * « Article suivant ».
 *
 * SOURCE DE VÉRITÉ : le fichier `blog/{cat}/index.html` de chaque catégorie.
 * Jamais le hub `blog/index.html`, qui ne liste que 7 entrées pour 10 articles
 * publiés, ni un listing de répertoire, qui ramènerait des artefacts de test
 * non publiés (`test-facture-conforme-maroc.html`). Ne sont donc candidats que
 * les articles listés dans un index de catégorie, et le Publisher contrôle
 * ensuite, via `fileExists()`, que chacun d'eux pointe un fichier réel.
 *
 * MODULE PUR : aucun accès réseau, aucune écriture, aucun accès à la feuille.
 * Le Publisher fournit le HTML de l'index ; la lecture GitHub et le contrôle
 * d'existence restent dans Publisher.gs, `renderArticleHtml()` devant rester
 * pur (Renderer.gs).
 */

/* -------------------------------------------------------------------------- */
/* Lecture d'un index de catégorie                                             */
/* -------------------------------------------------------------------------- */

/**
 * Extrait les entrées `<li class="article-item">` d'un index de catégorie.
 *
 * Le markup est celui produit par `buildArticleListItem()` (BlogIndexes.gs) :
 *
 *   <li class="article-item">
 *     <div class="meta">30 septembre 2026 · 8 min</div>
 *     <h3><a href="/blog/facturation/x.html">Titre</a></h3>
 *     <p>Description courte.</p>
 *   </li>
 *
 * `position` est l'ordinal dans le fichier : c'est le second critère de tri
 * (décision E5), il rend l'ordre déterministe quand plusieurs articles
 * partagent la même date.
 *
 * @param {string} html contenu de `blog/{cat}/index.html`
 * @return {Array<{href:string,title:string,excerpt:string,dateIso:string,position:number}>}
 */
function parseIndexArticles(html) {
  var out = [];
  var source = String(html || '');
  var itemRe = /<li class="article-item">([\s\S]*?)<\/li>/g;
  var m;
  var position = 0;
  while ((m = itemRe.exec(source)) !== null) {
    var chunk = m[1];
    var index = position;
    position++;

    var link = /<h3><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/.exec(chunk);
    if (!link) continue;
    var href = normalizeArticleHref(unescapeHtml(link[1]));
    var title = collapseWhitespace(unescapeHtml(link[2]));
    if (!href || !title) continue;

    var meta = /<div class="meta">([\s\S]*?)<\/div>/.exec(chunk);
    var excerpt = /<p>([\s\S]*?)<\/p>/.exec(chunk);

    out.push({
      href: href,
      title: title,
      excerpt: excerpt ? collapseWhitespace(unescapeHtml(excerpt[1])) : '',
      dateIso: frenchDateToIso(meta ? unescapeHtml(meta[1]) : ''),
      position: index
    });
  }
  return out;
}

/**
 * '30 septembre 2026 · 8 min' → '2026-09-30'. Renvoie '' si la date est
 * illisible : l'entrée est alors CLASSÉE EN FIN DE LISTE plutôt que d'en
 * faire un motif de rejet (une date illisible dans un index existant ne doit
 * pas condamner indéfiniment la publication d'un article valide).
 */
function frenchDateToIso(text) {
  var m = /(\d{1,2})\s+([a-zA-Zéèêàçôîùû]+)\s+(\d{4})/.exec(String(text || ''));
  if (!m) return '';
  var month = FR_MONTHS.indexOf(m[2].toLowerCase());
  if (month === -1) return '';
  var day = parseInt(m[1], 10);
  if (!(day >= 1 && day <= 31)) return '';
  return m[3] + '-' + pad2(month + 1) + '-' + pad2(day);
}

/** Annule l'échappement de `escHtml()`. `&amp;` en DERNIER (cf. escHtml). */
function unescapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Réduit toute suite d'espaces (y compris newlines) à un espace unique. */
function collapseWhitespace(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Sélection déterministe                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ordre « derniers articles » : date DÉCROISSANTE puis position d'index
 * CROISSANTE (décision E5). Le second critère n'est jamais décoratif : trois
 * articles de `blog/facturation/index.html` sont datés du 1 juillet 2026, et
 * seule la position d'index départage les ex-æquo de façon stable.
 *
 * @param {Array<Object>} list
 * @return {Array<Object>} NOUVEAU tableau trié (l'entrée n'est pas modifiée)
 */
function sortArticlesByRecency(list) {
  var copy = (Array.isArray(list) ? list : []).slice();
  copy.sort(function (a, b) {
    var da = String(a.dateIso || '');
    var db = String(b.dateIso || '');
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? 1 : -1;
    }
    return a.position - b.position;
  });
  return copy;
}

/**
 * Voisins chronologiques dans la MÊME catégorie (option A+).
 *
 * L'index étant trié du plus récent au plus ancien, le voisin « précédent »
 * est l'entrée qui PRÉCÈDE l'article dans la liste (la plus récente des deux)
 * et le voisin « suivant » celle qui suit (la plus ancienne). La convention
 * inverse produirait des liens qui remontent le temps.
 *
 * @param {Array<Object>} list entrées de l'index de la catégorie de l'article
 * @param {string} selfHref chemin web de l'article en cours de rendu
 * @return {{previous:Object|null, next:Object|null, rank:number, order:Array<Object>}}
 *         `previous`/`next` valent null quand le côté n'existe pas (premier ou
 *         dernier article de la catégorie) ; `rank` vaut -1 si l'article n'est
 *         pas listé.
 */
function pickNeighbours(list, selfHref) {
  var order = sortArticlesByRecency(list);
  var target = normalizeArticleHref(selfHref);
  var rank = -1;
  for (var i = 0; i < order.length; i++) {
    if (order[i].href === target) { rank = i; break; }
  }
  if (rank === -1) return { previous: null, next: null, rank: -1, order: order };
  return {
    previous: asNeighbour(order[rank - 1]),
    next: asNeighbour(order[rank + 1]),
    rank: rank,
    order: order
  };
}

/**
 * Adapte une entrée d'index au format attendu par le RENDREUR.
 *
 * `buildArticleLink()` et `buildRelatedArticles()` lisent `path` (ou `url`) :
 * une entrée renvoyée telle quelle produirait un lien vide, et les deux côtés de
 * la navigation retomberaient sur l'emplacement vide E3 — c'est-à-dire un
 * article sans voisins alors que l'index en contient. `href` est conservé car
 * c'est le champ utilisé pour le tri et pour l'exclusion de soi-même.
 */
function asNeighbour(item) {
  if (!item) return null;
  return {
    title: item.title,
    path: item.href,
    href: item.href,
    excerpt: item.excerpt || '',
    dateIso: item.dateIso || '',
    position: item.position
  };
}

/**
 * « Articles similaires » : 3 cartes maximum, MÊME CATÉGORIE D'ABORD puis
 * complément par les autres catégories. L'article lui-même et tout doublon
 * sont exclus. L'ordre suit `sortArticlesByRecency()`, donc une même entrée
 * produit toujours la même sortie.
 *
 * @param {Array<Object>} ownList entrées de la catégorie de l'article
 * @param {Array<Array<Object>>} otherLists entrées des autres catégories
 * @param {string} selfHref chemin web de l'article en cours de rendu
 * @param {number} [limit]
 * @return {Array<{title:string,path:string,excerpt:string}>} forme attendue par
 *         `buildRelatedArticles()` (Renderer.gs)
 */
function pickRelated(ownList, otherLists, selfHref, limit) {
  var max = (limit && limit > 0) ? limit : 3;
  var seen = {};
  var self = normalizeArticleHref(selfHref);
  if (self) seen[self] = true;
  var out = [];

  function collect(list) {
    sortArticlesByRecency(list).forEach(function (item) {
      if (out.length >= max) return;
      if (!item || !item.href || seen[item.href]) return;
      seen[item.href] = true;
      out.push(asNeighbour(item));
    });
  }

  collect(ownList);
  (Array.isArray(otherLists) ? otherLists : []).forEach(collect);
  return out;
}

/**
 * Nombre de cartes que `pickRelated()` PEUT réellement produire sur
 * `ownList` + `otherLists`, doublons exclus et article courant retiré.
 *
 * Cette fonction ne sert qu'à décider s'il faut lire UNE catégorie de plus.
 * Sa déduplication est volontairement IDENTIQUE à celle de `pickRelated()`
 * (même normalisation du href courant, même comparaison sur `item.href`) : c'est
 * cette garantie qui rend l'arrêt paresseux EXACT. Un simple
 * `ownList.length + autres.length` ferait arrêter la lecture trop tôt si deux
 * index pointaient le même article, et le bloc se.renderait alors avec moins de
 * cartes que la limite.
 *
 * @param {Array<Object>} ownList entrées de la catégorie de l'article
 * @param {Array<Array<Object>>} otherLists entrées déjà lues des autres catégories
 * @param {string} selfHref chemin web de l'article en cours de rendu
 * @return {number}
 */
function countReachableCandidates(ownList, otherLists, selfHref) {
  var seen = {};
  var self = normalizeArticleHref(selfHref);
  if (self) seen[self] = true;
  var n = 0;

  function count(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (item) {
      if (!item || !item.href || seen[item.href]) return;
      seen[item.href] = true;
      n++;
    });
  }

  count(ownList);
  (Array.isArray(otherLists) ? otherLists : []).forEach(count);
  return n;
}

/* -------------------------------------------------------------------------- */
/* Contrôle des liens émis                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Liens émis par les deux blocs de bas de page, extraits du HTML RENDU (et non
 * de l'index) : on contrôle donc exactement ce qui a été écrit, pas ce qui
 * avait été demandé.
 *
 * @param {string} html HTML rendu
 * @return {string[]} chemins de dépôt, ex. 'blog/facturation/x.html'
 */
function extractFooterBlockLinks(html) {
  var source = String(html || '');
  var scopes = [];

  // La grille contient des `.related-card` qui sont eux-mêmes des `<div>` : une
  // expression régulière non gloutonne s'arrêterait au PREMIER `</div>` et ne
  // vérifierait que la première carte sur trois. Les imbrications sont donc
  // équilibrées, comme au retrait du bloc vide (règle 5c).
  var gridOpen = source.indexOf('<div class="related-grid">');
  if (gridOpen !== -1) {
    var gridEnd = findClosingDiv(source, gridOpen);
    if (gridEnd === -1) throw new Error('related-grid non fermee : bloc de bas de page malforme');
    scopes.push(source.slice(gridOpen, gridEnd));
  }

  var nav = /<nav class="prev-next"[\s\S]*?<\/nav>/.exec(source);
  if (nav) scopes.push(nav[0]);

  // Le lien « Retour à la catégorie » vise `/blog/<slug>/`, donc un index de
  // catégorie et non un article : sa présence est DÉJÀ prouvée par la lecture
  // qui a produit le voisinage (readCategoryIndex). Le revérifier coûterait un
  // appel GitHub pour rien. Seul le cas « catégorie sans index » l'omet, et il
  // est assumé : c'est l'état d'une catégorie qui n'a encore aucun article.
  var out = [];
  var re = /href="(\/blog\/[^"'#?]+\.html)"/g;
  var m;
  scopes.forEach(function (scope) {
    re.lastIndex = 0;
    while ((m = re.exec(scope)) !== null) {
      var path = m[1].replace(/^\/+/, '');
      if (out.indexOf(path) === -1) out.push(path);
    }
  });
  return out;
}
