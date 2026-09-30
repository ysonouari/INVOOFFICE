/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Github.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : client de l'API GitHub (repos + Contents).
 *
 * Opérations : getRepositoryInfo, testGithubConnection, getFile,
 *              createOrUpdateFile.
 *
 * SÉCURITÉ — deux verrous indépendants, tous deux fermés par défaut :
 *   1. GITHUB_WRITE_ENABLED (Script Property) : coupe createOrUpdateFile.
 *   2. TEST_MODE (Config, TRUE par défaut) : coupe toute écriture même si le
 *      premier verrou est levé.
 * Le test de connexion est en lecture seule (GET /repos/...).
 */

/** Message Levé quand une écriture est tentée alors que les verrous sont fermés. */
var ERR_WRITES_DISABLED =
  'Écriture GitHub désactivée (GITHUB_WRITE_ENABLED=FALSE). ' +
  'Aucune modification n\'a été effectuée.';

var ERR_TEST_MODE =
  'TEST_MODE=TRUE : aucune écriture GitHub n\'est effectuée.';

/* -------------------------------------------------------------------------- */
/* Couche HTTP bas niveau                                                    */
/* -------------------------------------------------------------------------- */

function ghHeaders(extra) {
  var headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'INVOOFFICE-Blog-Automation'
  };
  var token = getGithubToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (extra) {
    Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
  }
  return headers;
}

function ghUrl(path) {
  var base = getGithubApiBase();
  return /^https?:\/\//.test(path) ? path : base + path;
}

/**
 * Effectue un appel API et normalise les erreurs.
 * @return {Object} réponse UrlFetchApp
 * @throws {Error} message nettoyé (jamais de token)
 */
function ghRequest(method, path, payload) {
  var response = httpRequest({
    url: ghUrl(path),
    method: method,
    headers: ghHeaders(payload ? { 'Content-Type': 'application/json' } : null),
    payload: payload ? toJson(payload) : null,
    retries: getConfigNumber('MAX_RETRIES', 3)
  });

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) return response;

  throw new Error(ghErrorMessage(code, response.getContentText()));
}

/** Traduit un statut HTTP en message exploitable, sans jamais fuiter le token. */
function ghErrorMessage(code, body) {
  var detail = '';
  try {
    var parsed = JSON.parse(body || '{}');
    if (parsed && parsed.message) detail = parsed.message;
  } catch (e) {
    // corps non JSON : on reste générique
  }
  var hint = '';
  if (code === 401) hint = ' (token absent, expiré ou sans permission)';
  if (code === 403) hint = ' (permission insuffisante sur le dépôt)';
  if (code === 404) hint = ' (dépôt, branche ou fichier introuvable)';
  return 'GitHub API ' + code + hint + (detail ? ' : ' + redact(detail) : '');
}

/* -------------------------------------------------------------------------- */
/* Opérations en lecture                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Informations du dépôt.
 * @return {{fullName:string, defaultBranch:string, private:boolean, push:boolean}}
 */
function getRepositoryInfo() {
  var response = ghRequest('get', '/repos/' + getGithubOwner() + '/' + getGithubRepository());
  var data = JSON.parse(response.getContentText());
  return {
    fullName: String(data.full_name || ''),
    defaultBranch: String(data.default_branch || ''),
    private: data.private === true,
    push: !!(data.permissions && data.permissions.push)
  };
}

/**
 * Test de connexion, en lecture seule.
 * Vérifie que : le token est présent, le dépôt répond, la branche configurée
 * existe, et que le token dispose du droit d'écriture (information seule :
 * aucune écriture n'est tentée).
 *
 * @return {{ok:boolean, checks:Object, errors:string[]}}
 */
function testGithubConnection() {
  var checks = {
    tokenConfigured: !!getGithubToken(),
    owner: getGithubOwner(),
    repository: getGithubRepository(),
    branch: getGithubBranch(),
    apiBase: getGithubApiBase(),
    reachable: false,
    defaultBranchMatches: false,
    canPush: false
  };
  var errors = [];

  if (!checks.tokenConfigured) {
    errors.push('GITHUB_TOKEN absent des Script Properties');
  }

  try {
    var info = getRepositoryInfo();
    checks.reachable = true;
    checks.fullName = info.fullName;
    checks.private = info.private;
    checks.canPush = info.push;
    if (info.defaultBranch !== checks.branch) {
      errors.push('Branche configurée « ' + checks.branch +
        ' » ≠ branche par défaut « ' + info.defaultBranch + ' »');
    } else {
      checks.defaultBranchMatches = true;
    }
  } catch (e) {
    errors.push(redact(e.message));
  }

  return { ok: errors.length === 0, checks: checks, errors: errors };
}

/**
 * Lit un fichier du dépôt.
 * @param {string} path chemin relatif, ex. blog/template-article.html
 * @return {{sha:string, path:string, content:string, size:number}|null}
 *          null si le fichier n'existe pas (404)
 */
function getFile(path) {
  var url = '/repos/' + getGithubOwner() + '/' + getGithubRepository() +
    '/contents/' + path + '?ref=' + encodeURIComponent(getGithubBranch());
  var response;
  try {
    response = ghRequest('get', url, null);
  } catch (e) {
    if (String(e.message).indexOf('GitHub API 404') !== -1) return null;
    throw e;
  }
  return decodeContentResponse(JSON.parse(response.getContentText()));
}

/** Décode la réponse `contents` (base64, sauts de ligne inclus). */
function decodeContentResponse(data) {
  if (!data || data.type !== 'file') return null;
  var content = String(data.content || '').replace(/\n/g, '');
  return {
    sha: String(data.sha || ''),
    path: String(data.path || ''),
    // Utilities.base64Decode() renvoie un Byte[] (tableau d'octets signes),
    // PAS un String. Sans le passage par un Blob, `content` arrivait non-string
    // aux appelants (validateTemplate, re.exec sur Config) et echouait sur
    // « html.replace is not a function ». On produit donc reellement le String
    // promis par le contrat @return de getFile().
    content: Utilities.newBlob(Utilities.base64Decode(content)).getDataAsString('UTF-8'),
    size: Number(data.size || 0)
  };
}

/** Le chemin existe-t-il déjà ? (contrôle de doublon, décision de validation) */
function fileExists(path) {
  return getFile(path) !== null;
}

/* -------------------------------------------------------------------------- */
/* Opérations en écriture (verrouillées)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Les écritures sont impossibles tant que GITHUB_WRITE_ENABLED n'est pas TRUE.
 * Cette fonction est le point d'entrée unique pour toute écriture.
 *
 * Principe de sécurité : ÉCHEC FERMÉ (fail closed). Si la feuille Config est
 * absente, on ne retombe PAS sur les valeurs par défaut — un TEST_MODE lu à
 * « FALSE » par défaut autoriserait une écriture alors que la configuration
 * n'a jamais été posée. On refuse donc tant que Config n'est pas initialisée.
 *
 * @throws {Error} si un verrou est fermé ou si la configuration est absente
 */
function assertWritesAllowed() {
  if (!writesEnabled()) throw new Error(ERR_WRITES_DISABLED);
  if (!getConfigSheet()) {
    throw new Error(
      'Feuille Config absente : initialisation requise avant toute écriture ' +
      '(menus « Initialiser les feuilles »).'
    );
  }
  if (getConfigBoolean('TEST_MODE')) throw new Error(ERR_TEST_MODE);
}

/**
 * Crée ou met à jour un fichier via l'API Contents.
 *
 * Appelé par Publisher.gs (phase publication) ; protégé par
 * assertWritesAllowed(). En cas d'échec, l'appelant reçoit une exception et
 * ne doit marquer l'article PUBLISHED qu'après succès.
 *
 * @param {{path:string, content:string, message:string, sha?:string, branch?:string}} opt
 * @return {{sha:string, commitSha:string, path:string}}
 */
function createOrUpdateFile(opt) {
  assertWritesAllowed();

  var path = String(opt.path || '');
  if (!path) throw new Error('Chemin vide');
  var branch = opt.branch || getGithubBranch();

  var payload = {
    message: String(opt.message || 'Publication article Blog'),
    content: Utilities.base64Encode(Utilities.newBlob(opt.content).getBytes()),
    branch: branch
  };
  if (opt.sha) payload.sha = opt.sha;

  var response = ghRequest(
    'put',
    '/repos/' + getGithubOwner() + '/' + getGithubRepository() +
      '/contents/' + path,
    payload
  );

  var data = JSON.parse(response.getContentText());
  return {
    sha: String((data.content && data.content.sha) || ''),
    commitSha: String((data.commit && data.commit.sha) || ''),
    path: String((data.content && data.content.path) || path)
  };
}

/**
 * Vérifie que les prérequis d'écriture sont reunis (sans écrire).
 * @return {{ok:boolean, errors:string[]}}
 */
function checkWriteReadiness() {
  var errors = [];
  if (!writesEnabled()) {
    errors.push('GITHUB_WRITE_ENABLED=FALSE (verrou fermé)');
  }
  if (!getConfigSheet()) {
    errors.push('Feuille Config absente (initialisation requise)');
  } else if (getConfigBoolean('TEST_MODE')) {
    errors.push('TEST_MODE=TRUE : aucune écriture ne sera effectuée');
  }
  var conn = testGithubConnection();
  if (!conn.ok) errors = errors.concat(conn.errors);
  return { ok: errors.length === 0, errors: errors };
}

/* -------------------------------------------------------------------------- */
/* Suppression (verrouillée) — D5                                             */
/* -------------------------------------------------------------------------- */

/**
 * Forme STRUCTURELLE d'un chemin d'article : blog/<catégorie>/<article>.html
 *
 * ATTENTION — ce motif seul est INSUFFISANT et ne doit jamais être utilisé
 * seul comme garde-fou. « index » satisfait `[a-z0-9-]+`, donc
 * `blog/facturation/index.html` VALIDE ce motif alors que c'est un index de
 * catégorie, jamais un article. La défense réelle est
 * validateArticleFilePath(), qui ajoute une liste de refus explicite.
 *
 * Ce motif couvre déjà, par construction : le hub et le gabarit (un seul
 * segment), le sitemap (hors préfixe `blog/`), les répertoires (`/` final),
 * la traversée (`.`), les antislash, les chemins encodés (`%`), les jokers
 * (`*`) et les chemins absolus (`/` initial).
 */
var ARTICLE_PATH_RE = /^blog\/[a-z0-9-]+\/[a-z0-9-]+\.html$/;

/** Un index de catégorie : blog/<catégorie>/index.html (INTERDIT à la suppression). */
var CATEGORY_INDEX_RE = /^blog\/[^/]+\/index\.html$/;

/**
 * Vérifie qu'un chemin est bien celui d'un ARTICLE, et rien d'autre.
 *
 * Fonction PURE et SÛRE-FAILLE : toute ambiguïté est refusée. Aucune écriture
 * n'est tentée. C'est la seule défense propre de deleteFile(), qui ne connaît
 * pas la feuille : la validation d'IDENTITÉ (la ligne correspond-elle à ce
 * chemin ?) appartient à Publisher.gs.
 *
 * @param {string} path chemin relatif déjà validé comme `GITHUB_PATH`
 * @throws {Error} si le chemin n'est pas un article
 */
function validateArticleFilePath(path) {
  var value = String(path === null || path === undefined ? '' : path);

  if (!value) throw new Error('Chemin vide : suppression refusée.');

  // Listes de refus EXPLICITES, évaluées AVANT le motif. Ce sont elles qui
  // portent réellement les invariants « jamais un index, jamais un sitemap ».
  if (value === BLOG_HUB_PATH) {
    throw new Error('Suppression refusée : « ' + BLOG_HUB_PATH + ' » est le hub du Blog.');
  }
  if (value === APP.SITEMAP_PATH) {
    throw new Error('Suppression refusée : « ' + APP.SITEMAP_PATH + ' » est le sitemap.');
  }
  if (value === APP.TEMPLATE_PATH) {
    throw new Error('Suppression refusée : « ' + APP.TEMPLATE_PATH + ' » est le gabarit.');
  }
  if (CATEGORY_INDEX_RE.test(value)) {
    throw new Error('Suppression refusée : « ' + value + ' » est un index de catégorie.');
  }

  if (!ARTICLE_PATH_RE.test(value)) {
    throw new Error(
      'Suppression refusée : « ' + value + ' » n\'a pas la forme attendue ' +
      '(blog/<catégorie>/<article>.html). Aucun joker, aucun répertoire, ' +
      'aucune traversée.'
    );
  }

  return true;
}

/**
 * Supprime UN fichier du dépôt via l'API Contents.
 *
 *Appelé par Publisher.gs (opération « supprimer un article publié ») ; protégé
 * par assertWritesAllowed(), exactement comme createOrUpdateFile(). Aucune
 * suppression récursive, aucune suppression de répertoire : le SHA est
 * obligatoire, ce qui interdit le mode `recursive` de l'API Contents — un
 * appel sans SHA échouerait, un appel avec SHA ne peut viser qu'UN fichier.
 *
 * Le chemin NE DOIT PAS provenir d'une saisie utilisateur : il vient de la
 * colonne GITHUB_PATH d'une ligne `Articles`, et n'a atteint cette fonction
 * qu'après avoir été comparé au chemin DÉRIVÉ de CATEGORY + CATEGORY_MAP +
 * SLUG (invariant d'identité). validateArticleFilePath() n'en est pas le
 * substitut : il borne la STRUCTURE du chemin, pas sa provenance.
 *
 * @param {{path:string, sha:string, message?:string}} opt
 *        `branch` est volontairement IGNORÉ : le paramètre est obsolète dans
 *        l'API Contents (2022-11-28) et une seule source de vérité de branche
 *        doit exister dans le projet.
 * @return {{code:number, deleted:boolean, commitSha:string, path:string}}
 * @throws {Error} si un verrou d'écriture est fermé, si le chemin n'est pas un
 *         article, si le SHA est absent, ou si l'API répond en erreur
 */
function deleteFile(opt) {
  // Point d'entrée UNIQUE d'écriture : aucune requête réseau avant cette ligne.
  assertWritesAllowed();

  var path = String(opt && opt.path ? opt.path : '');
  validateArticleFilePath(path);

  // SHA obligatoire : garde-fou contre la suppression récursive de répertoires.
  var sha = String(opt && opt.sha ? opt.sha : '');
  if (!sha) {
    throw new Error(
      'Suppression refusée : SHA obligatoire pour ' + path +
      ' (il empêche toute suppression récursive).'
    );
  }

  var response = ghRequest(
    'delete',
    '/repos/' + getGithubOwner() + '/' + getGithubRepository() + '/contents/' + path,
    // `sha` est EXIGE par l'API Contents : sans lui l'appel échoue (422) au
    // lieu de supprimer, et il interdit toute suppression récursive. Il est
    // transmis à l'identique, jamais recalculé.
    {
      message: String(opt.message || ('Suppression : ' + path)),
      sha: sha
    }
  );

  var data = JSON.parse(response.getContentText());
  // L'API renvoie `content: null` sur un DELETE réussi : le SHA du fichier
  // supprimé n'est donc PAS relisible, seul celui du commit l'est.
  return {
    code: response.getResponseCode(),
    deleted: true,
    commitSha: String((data && data.commit && data.commit.sha) || ''),
    path: path
  };
}
