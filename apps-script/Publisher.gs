/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Publisher.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : publier UN SEUL article, de bout en bout.
 *
 * PHASE 4 — le pipeline est strictement séquentiel et traçable :
 *
 *   sélection → verrou → READY/DRAFT → PUBLISHING → gabarit → rendu
 *   → validation (contrat de production) → TEST_MODE / verrou d'écriture
 *   → Contents API (create ou update) → PUBLISHED
 *
 *   Toute défaillance contrôlée (ligne, gabarit, rendu, validation, GitHub)
 *   repasse la ligne en ERROR avec un message ; un simple verrou d'écriture
 *   fermé ou un mode test ne sont PAS des erreurs d'article : la ligne est
 *   rendue à son statut d'origine pour rester publiable.
 *
 * SÛRETÉ (invariants non négociables) :
 *   - UN seul article par exécution, jamais de lot ;
 *   - le verrou est acquis en ÉCHEC RAPIDE (tryLock) : si une publication est
 *     déjà en cours, on n'attend pas et on ne continue pas ;
 *   - le rendu ET sa validation ont lieu AVANT toute écriture, y compris en
 *     mode test : le mode test exerce donc réellement le moteur ;
 *   - TEST_MODE puis GITHUB_WRITE_ENABLED sont vérifiés par le point d'entrée
 *     unique existant assertWritesAllowed() — aucun second chemin d'écriture ;
 *   - le message de commit est déterministe et le contenu inchangé n'est pas
 *     réécrit : republier le même article ne crée aucun doublon logique.
 *
 * AUCUNE publication réelle n'est possible tant que TEST_MODE = TRUE
 * (valeur par défaut de CONFIG_DEFAULTS).
 */

/** Attente maximale du verrou de script, en ms. Échec rapide assumé. */
var PUBLISH_LOCK_MS = 1000;

/** Nombre de relectures du SHA après un conflit 409 (1 = borné, déterministe). */
var PUBLISH_CONFLICT_RETRIES = 1;

/**
 * Statuts qui interdisent de relancer une publication.
 *
 * Construit à l'appel, et NON à la charge du fichier : Apps Script charge les
 * .gs par ordre alphabétique (Code, Config, Github, Logger, Publisher, …), donc
 * `STATUS` — défini dans Sheets.gs — n'existe pas encore ici. Une constante de
 * haut niveau qui le référencerait interromprait le chargement du projet.
 */
function publishBlockedStatuses() {
  return [STATUS.PUBLISHING, STATUS.PUBLISHED, STATUS.ERROR];
}

/* -------------------------------------------------------------------------- */
/* Entrées de menu                                                            */
/* -------------------------------------------------------------------------- */

/** Publie l'article situé sur la ligne sélectionnée de la feuille `Articles`. */
function publishSelectedArticle() {
  try {
    var selection = selectActiveArticle();
    if (!selection.ok) {
      logWarning('publish_selected', selection.error, {});
      alertOrLog('Publication : ÉCHEC\n\n' + selection.error);
      return failure('NO_SELECTION', selection.error, null);
    }

    var result = publishArticleById(selection.article.ID);
    alertOrLog(formatPublishReport(result));
    return result;
  } catch (e) {
    var message = redact(String(e && e.message ? e.message : e));
    logError('publish_selected', message, {});
    alertOrLog('Publication : ÉCHEC\n\n' + message);
    return failure('UNEXPECTED', message, null);
  }
}

/**
 * Publie le premier article READY, dans l'ordre de la feuille.
 * Les suivants ne sont PAS traités : le contrat reste « un article par
 * exécution ». Leur nombre est rapporté à l'opérateur.
 */
function publishNextReadyArticle() {
  try {
    var ready = findArticlesByStatus(STATUS.READY);
    if (!ready.length) {
      logInfo('publish_next', 'Aucun article READY à publier', { total: 0 });
      alertOrLog('Publication : aucun article READY.\n\nPassez une ligne en READY pour la publier.');
      return failure('NO_READY', 'Aucun article READY à publier.', null);
    }

    var result = publishArticleById(ready[0].ID);
    result.remaining = ready.length - 1;
    if (result.remaining > 0) {
      logInfo('publish_next', result.remaining + ' article(s) READY restant(s), non traités', {
        total: ready.length
      });
    }
    alertOrLog(formatPublishReport(result));
    return result;
  } catch (e) {
    var message = redact(String(e && e.message ? e.message : e));
    logError('publish_next', message, {});
    alertOrLog('Publication : ÉCHEC\n\n' + message);
    return failure('UNEXPECTED', message, null);
  }
}

/* -------------------------------------------------------------------------- */
/* Noyau                                                                      */
/* -------------------------------------------------------------------------- */

/** Point d'entrée testable : publie l'article identifié par son ID. */
function publishArticleById(id) {
  return publishArticle(findArticleById(id));
}

/**
 * Pipeline de publication d'un article.
 *
 * @param {Object} article ligne `Articles` (lue par en-tête)
 * @param {{lockWaitMs?:number}} [options]
 * @return {Object} résultat structuré (jamais d'exception)
 */
function publishArticle(article, options) {
  var opts = options || {};
  var waitMs = opts.lockWaitMs === undefined ? PUBLISH_LOCK_MS : opts.lockWaitMs;

  if (!article || !article.ID) {
    return failure('NO_ARTICLE', 'Aucun article à publier (ligne absente ou sans ID).', article);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs)) {
    // Publication concurrente : on ne continue pas, on ne modifie aucune ligne.
    logWarning('publish', 'Publication ignorée : une publication est déjà en cours', {
      articleId: article.ID,
      slug: article.SLUG,
      status: article.STATUS
    });
    return failure('LOCKED',
      'Une publication est déjà en cours. Aucune action.', article);
  }

  try {
    return runPublishPipeline(article.ID, opts);
  } catch (e) {
    // Filet de sécurité : une exception inattendue ne doit jamais laisser la
    // ligne figée en PUBLISHING, ni faire fuiter un détail sensible.
    var message = redact(String(e && e.message ? e.message : e));
    try {
      markError(article.ID, message);
    } catch (writeError) {
      console.error('Impossible de marquer ERROR : ' + redact(String(writeError && writeError.message)));
    }
    logError('publish', message, { articleId: article.ID, slug: article.SLUG });
    return failure('UNEXPECTED', message, article, { status: STATUS.ERROR });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Enchaîne les étapes sous verrou. L'ID est relu depuis la feuille à chaque
 * étape qui en a besoin : aucune donnée périmée n'est réutilisée.
 */
function runPublishPipeline(id, opts) {
  var article = findArticleById(id);
  if (!article) return failure('NO_ARTICLE', 'Ligne introuvable : ' + id, null);

  /* --- 0. Refus de republication --------------------------------------- */
  if (publishBlockedStatuses().indexOf(article.STATUS) !== -1) {
    var blocked = 'Statut « ' + article.STATUS + ' » : publication déjà engagée ou ' +
      'terminée. Repassez la ligne en READY pour publier à nouveau.';
    logWarning('publish', blocked, {
      articleId: id, slug: article.SLUG, status: article.STATUS
    });
    return failure('REPUBLISH_BLOCKED', blocked, article);
  }

  var originStatus = article.STATUS || STATUS.DRAFT;

  /* --- 1. PUBLISHING ---------------------------------------------------- */
  markPublishing(id);
  article = findArticleById(id);

  /**
   * Date de publication :JJJJ-MM-JJ (format exigé par le moteur, code R3a).
   * Une date déjà posée est CONSERVÉE : c'est elle qui rend la republication
   * idempotente (le HTML rendu ne doit pas changer d'un jour à l'autre).
   */
  var publishedAt = String(article.PUBLISHED_AT || '').trim() || toIsoDate();

  /* --- 2. Gabarit (lecture seule, source de vérité = dépôt) ------------- */
  var template = loadArticleTemplate();
  if (!template.ok) {
    return failToError(id, article, 'TEMPLATE', template.error);
  }

  /* --- 3. Rendu + validation du contrat de production ------------------- */
  var render = renderArticleHtml(article, {
    templateHtml: template.html,
    publishedAt: publishedAt
  });
  if (!render.ok) {
    return failToError(id, article, 'RENDER', describeRenderErrors(render.errors));
  }

  /* --- 4. Verrous d'écriture, APRÈS rendu et validation ----------------- */
  var gate = publishGate();
  if (!gate.ok) {
    restoreStatus(id, originStatus);
    logError('publish', gate.message, {
      articleId: id,
      slug: article.SLUG,
      status: originStatus,
      githubPath: render.path,
      details: { testMode: gate.testMode }
    });
    var result = failure(gate.code, gate.message, article, {
      status: originStatus,
      testMode: gate.testMode,
      githubPath: render.path,
      sitePath: render.sitePath,
      validation: render.validation,
      warnings: render.warnings
    });
    return result;
  }

  /* --- 5. Contents API -------------------------------------------------- */
  var write;
  try {
    write = writeArticleFile(render.path, render.html, article);
  } catch (e) {
    return failToError(id, article, 'GITHUB', redact(String(e && e.message ? e.message : e)));
  }

  /* --- 5b. Index statiques du Blog (catégorie → hub → sitemap) ----------- */
  /**
   * Appelé UNIQUEMENT après le succès de l'écriture de l'article : rien ne
   * n'est indexé si l'article n'est pas publié. L'ordre est imposé par
   * updateIndexesForArticle(). La réconciliation est idempotente, elle est
   * donc exécutée même quand `write.action === 'unchanged'` : un index peut
   * être en retard alors que l'article, lui, est à jour.
   *
   * Jamais d'exception : l'article EST publié, seul son référencement statique
   * peut être en retard. Les alertes remontent dans `warnings` (donc dans le
   * résultat, le compte rendu opérateur et la feuille Logs) et le statut reste
   * PUBLISHED. Aucun retour arrière, aucune suppression.
   */
  var indexes = updateIndexesForArticle(article, {
    sitePath: render.sitePath,
    publishedAt: publishedAt
  });
  render.warnings = (render.warnings || []).concat(indexes.warnings || []);

  /* --- 6. PUBLISHED ----------------------------------------------------- */
  var fields = {
    STATUS: STATUS.PUBLISHED,
    PUBLISHED_AT: publishedAt,
    GITHUB_PATH: write.path,
    GITHUB_SHA: write.sha,
    ERROR: ''
  };
  // Le SHA de commit n'est connu que si un commit vient d'être créé :
  // une republication inchangée ne doit pas effacer la trace précédente.
  if (write.commitSha) fields.GITHUB_COMMIT = write.commitSha;
  updateArticleFields(id, fields);

  var published = findArticleById(id);
  var action = write.action === 'unchanged' ? 'unchanged' : write.action;

  // logSuccess(action, fields) : le message se place DANS l'objet de champs.
  // Un troisième argument serait silencieusement ignoré et l'on perdrait du
  // même coup la trace structurée de l'indexation.
  logSuccess('publish',
    {
      message: action === 'unchanged' ? 'Article déjà publié, aucun nouveau commit' : 'Article publié',
      articleId: id,
      slug: article.SLUG,
      status: STATUS.PUBLISHED,
      githubPath: write.path,
      details: {
        action: action,
        sitePath: render.sitePath,
        testMode: false,
        bytes: write.bytes,
        retried: write.retried === true,
        indexed: indexes.indexed,
        indexWrites: indexes.writes,
        warnings: (render.warnings || []).length
      }
    });

  return success(published, {
    code: action === 'unchanged' ? 'UNCHANGED' : 'PUBLISHED',
    message: action === 'unchanged'
      ? 'Article déjà publié à l’identique : aucun nouveau commit.'
      : 'Article publié.',
    status: STATUS.PUBLISHED,
    publishedAt: publishedAt,
    githubPath: write.path,
    githubSha: write.sha,
    githubCommit: write.commitSha,
    sitePath: render.sitePath,
    bytes: write.bytes,
    retried: write.retried === true,
    indexed: indexes.indexed,
    indexWrites: indexes.writes,
    validation: render.validation,
    warnings: render.warnings
  });
}

/* -------------------------------------------------------------------------- */
/* Sélection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Article situé sur la ligne active de la feuille `Articles`.
 * @return {{ok:boolean, article?:Object, error?:string}}
 */
function selectActiveArticle() {
  var sheet = null;
  try {
    sheet = SpreadsheetApp.getActiveSheet();
  } catch (e) {
    sheet = null;
  }
  if (!sheet || String(sheet.getName()) !== SHEETS.ARTICLES) {
    return {
      ok: false,
      error: 'Sélectionnez une ligne de la feuille « ' + SHEETS.ARTICLES + ' ».'
    };
  }

  var row = sheet.getActiveCell().getRow();
  if (!row || row < 2) {
    return { ok: false, error: 'Ligne d’en-tête sélectionnée : choisissez une ligne d’article.' };
  }

  var rows = readArticles();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].__row === row) return { ok: true, article: rows[i] };
  }
  return { ok: false, error: 'Aucune ligne d’article à la ligne ' + row + '.' };
}

/* -------------------------------------------------------------------------- */
/* Verrous d'écriture                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Delegue à assertWritesAllowed() (point d'entrée unique de Github.gs) et
 * traduit le refus en code exploitable. Aucun second chemin d'écriture.
 * @return {{ok:boolean, code?:string, message?:string, testMode:boolean}}
 */
function publishGate() {
  try {
    assertWritesAllowed();
    return { ok: true, testMode: false };
  } catch (e) {
    var raw = String(e && e.message ? e.message : e);
    if (raw === ERR_TEST_MODE) {
      return {
        ok: false,
        code: 'TEST_MODE',
        testMode: true,
        message: 'TEST_MODE=TRUE — mode test : rendu et validation effectués, ' +
          'aucune écriture GitHub. Article NON publié.'
      };
    }
    if (raw === ERR_WRITES_DISABLED) {
      return {
        ok: false,
        code: 'WRITES_DISABLED',
        testMode: false,
        message: 'GITHUB_WRITE_ENABLED=FALSE — écriture fermée. Article NON publié.'
      };
    }
    return { ok: false, code: 'GATE', testMode: false, message: raw };
  }
}

/* -------------------------------------------------------------------------- */
/* Écriture GitHub                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Crée ou met à jour le fichier de l'article via l'API Contents.
 *
 * Idempotence : si le contenu distant est déjà identique, AUCUN commit n'est
 * créé (le SHA existant est réutilisé). En cas de conflit de SHA (409), le
 * fichier est relu et l'écriture retentée une fois, bornée.
 *
 * @return {{action:string, path:string, sha:string, commitSha:string,
 *           bytes:number, retried?:boolean}}
 */
function writeArticleFile(path, content, article) {
  var message = publishCommitMessage(article);
  var existing = getFile(path);

  if (existing && existing.content === content) {
    return {
      action: 'unchanged',
      path: path,
      sha: existing.sha,
      commitSha: '',
      bytes: content.length
    };
  }

  try {
    return createOrUpdate({ path: path, content: content, message: message, sha: existing, action: existing ? 'update' : 'create' });
  } catch (e) {
    if (!isShaConflict(e) || PUBLISH_CONFLICT_RETRIES < 1) throw e;
    return retryAfterConflict(path, content, message);
  }
}

/** Conflit de SHA : le dépôt a bougé entre la lecture et l'écriture. */
function retryAfterConflict(path, content, message) {
  var fresh = getFile(path);
  if (fresh && fresh.content === content) {
    return {
      action: 'unchanged',
      path: path,
      sha: fresh.sha,
      commitSha: '',
      bytes: content.length,
      retried: true
    };
  }
  var written = createOrUpdate({
    path: path,
    content: content,
    message: message,
    sha: fresh,
    action: fresh ? 'update' : 'create'
  });
  written.retried = true;
  return written;
}

/** Appel unique en écriture, résultat normalisé. */
function createOrUpdate(opt) {
  var res = createOrUpdateFile({
    path: opt.path,
    content: opt.content,
    message: opt.message,
    sha: opt.sha ? opt.sha.sha : ''
  });
  return {
    action: opt.action,
    path: res.path || opt.path,
    sha: res.sha,
    commitSha: res.commitSha,
    bytes: opt.content.length
  };
}

/** Le message d'erreur correspond-il à un conflit de SHA (HTTP 409) ? */
function isShaConflict(e) {
  return String(e && e.message ? e.message : e).indexOf('GitHub API 409') !== -1;
}

/**
 * Message de commit déterministe : deux exécutions du même article
 * produisent le même message (traçabilité sans créer de divergence).
 */
function publishCommitMessage(article) {
  return 'Publication : ' + String(article.SLUG || article.ID || 'article');
}

/* -------------------------------------------------------------------------- */
/* Transitions d'état                                                         */
/* -------------------------------------------------------------------------- */

/** READY/DRAFT → PUBLISHING. */
function markPublishing(id) {
  updateArticleFields(id, { STATUS: STATUS.PUBLISHING, ERROR: '' });
}

/** PUBLISHING → ERROR, avec le motif. */
function markError(id, message) {
  updateArticleFields(id, { STATUS: STATUS.ERROR, ERROR: message });
}

/**
 * PUBLISHING → statut d'origine.
 * Un mode test ou un verrou fermé n'est pas une erreur d'article : la ligne
 * doit rester publiable, donc restaurée et non marquée ERROR.
 */
function restoreStatus(id, status) {
  updateArticleFields(id, { STATUS: status, ERROR: '' });
}

/* -------------------------------------------------------------------------- */
/* Résultat                                                                   */
/* -------------------------------------------------------------------------- */

function describeRenderErrors(errors) {
  if (!errors || !errors.length) return 'Erreur de rendu non détaillée.';
  return errors.map(function (e) {
    return (e.code ? e.code + ' ' : '') + e.message;
  }).join(' ; ');
}

/** Raccourci : échec contrôlé, ligne passée en ERROR. */
function failToError(id, article, code, message) {
  var safe = redact(String(message || ''));
  markError(id, safe);
  logError('publish', safe, {
    articleId: id,
    slug: article.SLUG,
    status: STATUS.ERROR,
    githubPath: article.GITHUB_PATH
  });
  var failed = failure(code, safe, article, { status: STATUS.ERROR });
  var fresh = findArticleById(id);
  if (fresh) failed.status = fresh.STATUS;
  return failed;
}

function publishResult(overrides) {
  var base = {
    ok: false,
    code: 'UNKNOWN',
    message: '',
    articleId: '',
    title: '',
    slug: '',
    status: '',
    statusBefore: '',
    githubPath: '',
    githubSha: '',
    githubCommit: '',
    publishedAt: '',
    sitePath: '',
    testMode: false,
    bytes: 0,
    retried: false,
    remaining: 0,
    // `null` = indexation non applicable (échec AVANT toute écriture : rien n'a
    // été publié, il n'y a donc rien à réconcilier). Seuls les chemins qui
    // publient réellement tranchent : `true` réconcilié, `false` en retard.
    indexed: null,
    indexWrites: 0,
    errors: [],
    warnings: [],
    validation: null
  };
  var out = Object.assign(base, overrides || {});
  if (out.article && typeof out.article === 'object') {
    if (!out.articleId) out.articleId = out.article.ID || '';
    if (!out.title) out.title = out.article.TITLE || '';
    if (!out.slug) out.slug = out.article.SLUG || '';
    if (!out.statusBefore) out.statusBefore = out.article.STATUS || '';
    if (!out.githubPath) out.githubPath = out.article.GITHUB_PATH || '';
    if (!out.githubSha) out.githubSha = out.article.GITHUB_SHA || '';
    if (!out.githubCommit) out.githubCommit = out.article.GITHUB_COMMIT || '';
    if (!out.publishedAt) out.publishedAt = out.article.PUBLISHED_AT || '';
  }
  return out;
}

function failure(code, message, article, overrides) {
  return publishResult(Object.assign({
    ok: false,
    code: code,
    message: message
  }, overrides || {}, { article: article || null }));
}

function success(article, overrides) {
  return publishResult(Object.assign({ ok: true }, overrides || {}, {
    article: article || null
  }));
}

/* -------------------------------------------------------------------------- */
/* Présentation                                                               */
/* -------------------------------------------------------------------------- */

/** Compte rendu lisible, sans jamais exposer de détail technique sensible. */
function formatPublishReport(result) {
  if (!result) return 'Publication : aucun résultat.';

  var lines = [];
  var label = result.ok
    ? (result.code === 'UNCHANGED' ? 'Publication : INCHANGÉE' : 'Publication : RÉUSSIE')
    : 'Publication : ÉCHEC';

  lines.push(label);
  lines.push('');
  if (result.title || result.slug) {
    lines.push('Article   : ' + (result.title || result.slug) +
      (result.slug ? ' (' + result.slug + ')' : ''));
  }
  if (result.statusBefore) lines.push('Statut    : ' + result.statusBefore + ' → ' + result.status);
  if (result.message) lines.push('Détail    : ' + result.message);

  if (result.ok) {
    if (result.sitePath) lines.push('URL       : ' + buildSiteUrl(result.sitePath));
    if (result.githubPath) lines.push('Fichier   : ' + result.githubPath);
    if (result.githubSha) lines.push('SHA       : ' + result.githubSha.slice(0, 12));
    if (result.githubCommit) lines.push('Commit    : ' + result.githubCommit.slice(0, 12));
    if (result.publishedAt) lines.push('Publié le : ' + frenchDate(result.publishedAt));
    lines.push('Octets    : ' + result.bytes);
    // L'indexation des pages statiques est un résultat À PART ENTIÈRE : un
    // article publié mais invisible dans le hub doit être visible comme tel.
    if (result.indexed === false) {
      lines.push('Index     : NON RÉCONCILIÉ (article publié, sommaire à reprendre)');
    } else if (result.indexWrites) {
      lines.push('Index     : ' + result.indexWrites + ' index mis à jour');
    }
  }

  if (result.testMode) {
    lines.push('', 'Mode test : rendu et validation exécutés, AUCUNE écriture GitHub.');
  }
  if (result.remaining > 0) {
    lines.push('', result.remaining + ' autre(s) article(s) READY non traité(s) ' +
      '(un article par exécution).');
  }
  if (result.warnings && result.warnings.length) {
    lines.push('', 'Avertissements :');
    result.warnings.slice(0, 5).forEach(function (w) {
      lines.push('- ' + ((w.code ? w.code + ' ' : '') + w.message));
    });
  }
  return lines.join('\n');
}
