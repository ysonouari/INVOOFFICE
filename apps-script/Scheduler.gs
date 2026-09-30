/**
 * INVOOFFICE — Publication automatisée du Blog
 * Module : Scheduler.gs
 * ---------------------------------------------------------------------------
 * Responsabilité unique : INTERFACE DE CONFIGURATION de la planification.
 *
 * SOURCE DE VÉRITÉ : la feuille `Config`, via les primitives existantes
 * `readConfigMap()` (lecture) et `setConfigValue()` (écriture). Aucun second
 * magasin de configuration, aucun Script Property pour la planification,
 * aucun planning codé en dur.
 *
 * RÈGLE DE RÉPARTITION : celle déjà appliquée par `validateConfig()`
 * (Validator.gs, contrôles C3 et C3b) — `ARTICLES_PER_WEEK` doit être un
 * multiple exact du nombre de jours sélectionnés. Ce module ne propose donc
 * AUCUN algorithme de planification : il ne fait qu'appliquer la règle
 * existante et l'afficher.
 *
 * CE QUE CE MODULE NE FAIT PAS (décision du Product Owner, cf. Code.gs) :
 *   - il ne crée, ne supprime et ne modifie AUCUN déclencheur ScriptApp ;
 *   - il n'implémente aucun moteur de planification ni publication par lot ;
 *   - il ne touche pas au pipeline de publication (Publisher.gs).
 * L'état réel est affiché honnêtement via `describeSchedulerTriggers()`,
 * qui se contente de LIRE `ScriptApp.getProjectTriggers()` dans un try/catch :
 * « 0 déclencheur — aucune automatisation en exécution ».
 */

/* -------------------------------------------------------------------------- */
/* Constantes                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Modes réellement supportés. `WEEKLY` est le seul mode présent dans
 * `CONFIG_DEFAULTS` et le seul mode dont la règle de répartition existe.
 * Aucun mode n'est ajouté ici.
 */
var SCHEDULER_MODES = ['WEEKLY'];
var SCHEDULER_DEFAULT_MODE = 'WEEKLY';

/**
 * Bornes de saisie. Le moteur de publication traitant UN SEUL article par
 * invocation (Code.gs) et une répartition paire plafonnée à un article par
 * jour, ces bornes découlent de la règle existante — elles ne créent aucun
 * comportement nouveau.
 */
var SCHEDULER_MAX_ARTICLES_PER_WEEK = 7;
var SCHEDULER_MAX_ARTICLES_PER_RUN = 7;

/** Ordre canonique des jours : jamais l'ordre de saisie. */
var PUBLISH_DAY_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
];

var PUBLISH_DAY_LABELS = {
  MONDAY: 'Lundi',
  TUESDAY: 'Mardi',
  WEDNESDAY: 'Mercredi',
  THURSDAY: 'Jeudi',
  FRIDAY: 'Vendredi',
  SATURDAY: 'Samedi',
  SUNDAY: 'Dimanche'
};

/** Clés que ce dialogue est autorisé à écrire. Rien d'autre n'est touché. */
var SCHEDULER_WRITABLE_KEYS = [
  'AUTO_PUBLISH',
  'SCHEDULE_MODE',
  'ARTICLES_PER_WEEK',
  'PUBLISH_DAYS',
  'MAX_ARTICLES_PER_RUN'
];

/* -------------------------------------------------------------------------- */
/* Normalisation des jours                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Normalise une liste de jours : majuscules, valeurs inconnues ignorées,
 * doublons supprimés, ordre canonique guarantees.
 * @param {Array<string>|string} days
 * @return {Array<string>}
 */
function normalizePublishDays(days) {
  var list = Array.isArray(days) ? days : String(days || '').split(',');
  var seen = {};
  list.forEach(function (d) {
    var key = String(d === null || d === undefined ? '' : d).trim().toUpperCase();
    if (PUBLISH_DAY_ORDER.indexOf(key) !== -1) seen[key] = true;
  });
  return PUBLISH_DAY_ORDER.filter(function (d) { return seen[d] === true; });
}

/** Liste normalisée → chaîne stockée dans `PUBLISH_DAYS`. */
function serializePublishDays(days) {
  return normalizePublishDays(days).join(',');
}

/** Valeur Config brute → liste normalisée. */
function parsePublishDays(raw) {
  return normalizePublishDays(String(raw === null || raw === undefined ? '' : raw).split(','));
}

function isPublishDay(value) {
  return PUBLISH_DAY_ORDER.indexOf(String(value || '').trim().toUpperCase()) !== -1;
}

/* -------------------------------------------------------------------------- */
/* Résumé de répartition                                                      */
/* -------------------------------------------------------------------------- */

function isWholeNumber(value) {
  var n = Number(value);
  return String(value).trim() !== '' && isFinite(n) && Math.floor(n) === n;
}

/**
 * Applique la règle existante de répartition paire.
 * `even === false` signifie exactement ce que `validateConfig()` refuse
 * (C3b) : le total ne se divise pas sur le nombre de jours.
 * @return {{perWeek:number, days:Array<string>, perDay:number, even:boolean}}
 */
function computeScheduleSummary(perWeek, days) {
  var normalizedDays = normalizePublishDays(days);
  var total = Number(perWeek);
  var safeTotal = isFinite(total) ? total : 0;
  if (!normalizedDays.length || safeTotal <= 0) {
    return { perWeek: safeTotal, days: normalizedDays, perDay: 0, even: false };
  }
  var perDay = safeTotal / normalizedDays.length;
  return {
    perWeek: safeTotal,
    days: normalizedDays,
    perDay: perDay,
    even: Math.floor(perDay) === perDay
  };
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * État réel des déclencheurs. LECTURE SEULE.
 * Aucun trigger n'est créé ni modifié : l'idempotence est donc structurelle.
 */
function describeSchedulerTriggers() {
  try {
    var triggers = ScriptApp.getProjectTriggers() || [];
    return { readable: true, count: triggers.length, automationRunning: false };
  } catch (e) {
    // Hors contexte autorisé (script exécuté manuellement) : on ne prétend rien.
    return { readable: false, count: -1, automationRunning: false };
  }
}

/** État complet du dialogue, lu depuis la feuille `Config`. */
function getSchedulerConfigState() {
  var map = readConfigMap();
  var days = parsePublishDays(map.PUBLISH_DAYS);
  return {
    autoPublish: String(map.AUTO_PUBLISH).trim().toUpperCase() === 'TRUE',
    mode: String(map.SCHEDULE_MODE || SCHEDULER_DEFAULT_MODE).trim().toUpperCase(),
    modes: SCHEDULER_MODES.slice(),
    perWeekRaw: String(map.ARTICLES_PER_WEEK),
    maxPerRunRaw: String(map.MAX_ARTICLES_PER_RUN),
    days: days,
    timeZone: getConfiguredTimeZone(),
    summary: computeScheduleSummary(map.ARTICLES_PER_WEEK, days),
    triggers: describeSchedulerTriggers(),
    schedulerImplemented: false
  };
}

/* -------------------------------------------------------------------------- */
/* Validation — miroir de validateConfig() (C3 / C3b)                         */
/* -------------------------------------------------------------------------- */

/**
 * Valide côté SERVEUR. Le client n'est jamais cru : rien n'est écrit tant que
 * cette fonction n'a pas renvoyé ok.
 * @param {{autoPublish:*, mode:*, perWeek:*, days:*, maxPerRun:*}} input
 * @return {{ok:boolean, errors:Array<{code:string,message:string}>, normalized:Object}}
 */
function validateSchedulerConfig(input) {
  var src = input && typeof input === 'object' ? input : {};
  var errors = [];

  var autoPublish = normalizeBooleanInput(src.autoPublish);
  if (autoPublish !== 'TRUE' && autoPublish !== 'FALSE') {
    errors.push({
      code: 'SCHED_AUTO_PUBLISH',
      message: 'Publication automatique : valeur TRUE ou FALSE attendue.'
    });
  }

  var mode = String(src.mode === null || src.mode === undefined ? '' : src.mode).trim().toUpperCase();
  if (SCHEDULER_MODES.indexOf(mode) === -1) {
    errors.push({
      code: 'SCHED_MODE',
      message: 'Mode non pris en charge (' + mode + '). Modes disponibles : ' +
        SCHEDULER_MODES.join(', ') + '.'
    });
  }

  var perWeek = Number(String(src.perWeek === null || src.perWeek === undefined ? '' : src.perWeek).trim());
  var perWeekOk = isWholeNumber(src.perWeek) && isFinite(perWeek) &&
    perWeek >= 1 && perWeek <= SCHEDULER_MAX_ARTICLES_PER_WEEK;
  if (!perWeekOk) {
    errors.push({
      code: 'SCHED_PER_WEEK',
      message: 'Articles par semaine : entier entre 1 et ' +
        SCHEDULER_MAX_ARTICLES_PER_WEEK + ' attendu.'
    });
  }

  var days = normalizePublishDays(src.days);
  // Miroir EXACT de C3 : la règle s'applique dès que ARTICLES_PER_WEEK > 0,
  // sans condition sur AUTO_PUBLISH ni sur SCHEDULE_MODE — comme dans
  // validateConfig(). Aucune règle supplémentaire n'est inventée ici.
  if (perWeekOk && perWeek > 0 && !days.length) {
    errors.push({
      code: 'SCHED_DAYS_EMPTY',
      message: 'Sélectionnez au moins un jour de publication.'
    });
  }
  // Règle existante C3b : la répartition doit être exacte.
  if (days.length && isWholeNumber(src.perWeek) && isFinite(perWeek) && perWeek > 0 &&
    perWeek % days.length !== 0) {
    errors.push({
      code: 'SCHED_DISTRIBUTION',
      message: 'Articles par semaine (' + perWeek + ') ne se répartit pas également sur ' +
        days.length + ' jour(s) : un multiple de ' + days.length + ' est requis.'
    });
  }

  var maxPerRun = Number(String(src.maxPerRun === null || src.maxPerRun === undefined ? '' : src.maxPerRun).trim());
  var maxOk = isWholeNumber(src.maxPerRun) && isFinite(maxPerRun) &&
    maxPerRun >= 1 && maxPerRun <= SCHEDULER_MAX_ARTICLES_PER_RUN;
  if (!maxOk) {
    errors.push({
      code: 'SCHED_MAX_PER_RUN',
      message: 'Articles maximum par exécution : entier entre 1 et ' +
        SCHEDULER_MAX_ARTICLES_PER_RUN + ' attendu.'
    });
  }

  return {
    ok: errors.length === 0,
    errors: errors,
    normalized: {
      AUTO_PUBLISH: autoPublish,
      SCHEDULE_MODE: mode,
      ARTICLES_PER_WEEK: isFinite(perWeek) ? String(Math.floor(perWeek)) : '',
      PUBLISH_DAYS: serializePublishDays(days),
      MAX_ARTICLES_PER_RUN: isFinite(maxPerRun) ? String(Math.floor(maxPerRun)) : ''
    }
  };
}

function normalizeBooleanInput(value) {
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  var raw = String(value === null || value === undefined ? '' : value).trim().toUpperCase();
  if (raw === 'TRUE' || raw === 'FALSE') return raw;
  return '';
}

/* -------------------------------------------------------------------------- */
/* Écriture                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Valide puis écrit. N'écrit QUE les 5 clés de `SCHEDULER_WRITABLE_KEYS`,
 * via `setConfigValue()` (colonne B de la ligne visée, aucun réordonnancement).
 * Ne crée aucun déclencheur et ne modifie aucun autre réglage.
 */
function saveSchedulerConfig(input) {
  try {
    var check = validateSchedulerConfig(input);
    if (!check.ok) {
      return {
        ok: false,
        code: 'SCHED_INVALID',
        message: check.errors.length + ' valeur(s) refusée(s) : aucune écriture.',
        errors: check.errors,
        state: getSchedulerConfigState()
      };
    }

    var before = readConfigMap();
    SCHEDULER_WRITABLE_KEYS.forEach(function (key) {
      setConfigValue(key, check.normalized[key]);
    });
    var after = readConfigMap();
    var changed = SCHEDULER_WRITABLE_KEYS.filter(function (k) {
      return String(before[k]) !== String(after[k]);
    });

    var state = getSchedulerConfigState();
    try {
      logInfo('scheduler', 'Configuration de planification enregistrée', {
        auto_publish: state.autoPublish ? 'TRUE' : 'FALSE',
        mode: state.mode,
        per_week: state.perWeekRaw,
        days: state.days.join(','),
        max_per_run: state.maxPerRunRaw,
        changed: changed.join(',') || '(aucun changement)',
        triggers: state.triggers.count
      });
    } catch (logErr) {
      // Un échec de journalisation ne doit jamais annuler une écriture valide.
      console.error('Journalisation planification impossible : ' + redact(logErr.message));
    }

    return {
      ok: true,
      code: 'SAVED',
      message: 'Configuration enregistrée dans la feuille Config.',
      changed: changed,
      state: state
    };
  } catch (e) {
    return {
      ok: false,
      code: 'SCHED_SAVE_FAILED',
      message: 'Enregistrement impossible : ' + redact(String(e && e.message ? e.message : e)),
      errors: []
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Point d'entrée menu                                                         */
/* -------------------------------------------------------------------------- */

/** Entrée du menu « 🗓️ Planification / Automatisation ». */
function openSchedulerConfigDialog() {
  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(renderSchedulerDialogHtml(getSchedulerConfigState()))
        .setWidth(640)
        .setHeight(620),
      'Planification / Automatisation'
    );
  } catch (e) {
    // Hors contexte de tableur : on retombe sur le journal, comme showDialog().
    logInfo('scheduler', 'Planification / Automatisation', 'Interface indisponible : ' + redact(e.message));
  }
}

/* -------------------------------------------------------------------------- */
/* Rendu du dialogue                                                           */
/* -------------------------------------------------------------------------- */

/** Phrase d'état honnête : jamais de promesse d'automatisation inexistante. */
function triggerStatusText(triggers) {
  if (!triggers || triggers.readable !== true) {
    return 'État des déclencheurs illisible — aucune automatisation en exécution.';
  }
  var n = triggers.count;
  var word = n > 1 ? 'déclencheurs' : 'déclencheur';
  if (n === 0) return '0 déclencheur — aucune automatisation en exécution.';
  return n + ' ' + word + ' — publication automatique non implémentée dans ce projet.';
}

/**
 * Construit le HTML. Toutes les valeurs proviennent de la feuille `Config` et
 * passent par `escHtml()`. Le bouton d'enregistrement appelle
 * `saveSchedulerConfig()` : aucune écriture directe depuis le client.
 */
function renderSchedulerDialogHtml(state) {
  var s = state || getSchedulerConfigState();
  var days = normalizePublishDays(s.days);

  var dayBoxes = PUBLISH_DAY_ORDER.map(function (d) {
    var checked = days.indexOf(d) !== -1 ? ' checked' : '';
    return '<label class="day" data-day-label="' + d + '" style="display:inline-flex;' +
      'align-items:center;gap:4px;margin:0 12px 4px 0;cursor:pointer">' +
      '<input type="checkbox" data-day="' + d + '"' + checked + '> ' +
      escHtml(PUBLISH_DAY_LABELS[d]) + '</label>';
  }).join('');

  var modeOptions = SCHEDULER_MODES.map(function (m) {
    var sel = m === s.mode ? ' selected' : '';
    return '<option value="' + escHtml(m) + '"' + sel + '>' + escHtml(m) + '</option>';
  }).join('');

  var html = [
    '<div style="font-family:Roboto,Arial,sans-serif;font-size:13px;color:#202124">',
    '<h3 style="margin:0 0 4px">Planification / Automatisation</h3>',
    '<p id="automationStatus" style="margin:0 0 12px;padding:6px 8px;border-radius:4px;' +
      'background:#fef7e0;color:#8a6d3b;font-weight:600">' +
      escHtml(triggerStatusText(s.triggers)) + '</p>',

    '<p style="margin:0 0 10px;color:#5f6368">' +
      'Ces réglages sont enregistrés dans la feuille <b>Config</b>. ' +
      'Aucun moteur de planification n\'est implémenté : ces valeurs ne déclenchent ' +
      'aucune publication automatique.</p>',

    '<p style="margin:0 0 10px">' +
      '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">' +
      '<input type="checkbox" id="autoPublish"' + (s.autoPublish ? ' checked' : '') + '> ' +
      'Publication automatique</label></p>',

    '<p style="margin:0 0 10px">' +
      '<label for="mode" style="display:block;margin-bottom:4px;font-weight:600">Mode</label>' +
      '<select id="mode" style="width:100%;padding:4px">' + modeOptions + '</select>' +
      '<span style="color:#5f6368;font-size:12px">Seul mode supporté : ' +
      escHtml(SCHEDULER_MODES.join(', ')) + '.</span></p>',

    '<p style="margin:0 0 10px">' +
      '<label for="perWeek" style="display:block;margin-bottom:4px;font-weight:600">' +
      'Articles par semaine</label>' +
      '<input type="number" id="perWeek" min="1" max="' + SCHEDULER_MAX_ARTICLES_PER_WEEK +
      '" step="1" value="' + escHtml(s.perWeekRaw) + '" style="width:120px;padding:4px"></p>',

    '<fieldset id="daysBox" style="border:1px solid #dadce0;border-radius:4px;padding:8px 10px;margin:0 0 10px">' +
      '<legend style="font-weight:600;padding:0 4px">Jours de publication</legend>' + dayBoxes + '</fieldset>',

    '<p style="margin:0 0 10px">' +
      '<label for="maxPerRun" style="display:block;margin-bottom:4px;font-weight:600">' +
      'Articles maximum par exécution</label>' +
      '<input type="number" id="maxPerRun" min="1" max="' + SCHEDULER_MAX_ARTICLES_PER_RUN +
      '" step="1" value="' + escHtml(s.maxPerRunRaw) + '" style="width:120px;padding:4px">' +
      '<span style="color:#5f6368;font-size:12px">Une publication porte sur un seul ' +
      'article ; ce plafond n\'est donc pas appliqué.</span></p>',

    '<p style="margin:0 0 10px;color:#5f6368">Fuseau horaire (lecture seule) : ' +
      '<b>' + escHtml(s.timeZone) + '</b> — aligné sur le manifeste.</p>',

    '<p id="summary" aria-live="polite" style="margin:0 0 10px;padding:8px;' +
      'background:#e8f0fe;border-radius:4px;color:#174ea6"></p>',

    '<div id="result" role="status" aria-live="polite" style="margin:0 0 10px;min-height:18px;color:#5f6368"></div>',

    '<div style="display:flex;justify-content:flex-end;gap:8px">' +
      '<button type="button" id="cancelBtn" style="padding:6px 14px">Annuler</button>' +
      '<button type="button" id="saveBtn" style="padding:6px 14px;font-weight:600">Enregistrer</button>',
    '</div>',
    '</div>',
    schedulerClientScript()
  ].join('');

  return html;
}

/** Script client : résumé vivant, contrôle miroir, appel `saveSchedulerConfig`. */
function schedulerClientScript() {
  var lines = [
    '<script>',
    'var DAYS=' + JSON.stringify(PUBLISH_DAY_ORDER) + ';',
    'var MAX_WEEK=' + SCHEDULER_MAX_ARTICLES_PER_WEEK + ';',
    'var MAX_RUN=' + SCHEDULER_MAX_ARTICLES_PER_RUN + ';',
    'function el(id){return document.getElementById(id);}',
    'function isInt(v){return /^[0-9]+$/.test(String(v).trim());}',
    'function selectedDays(){',
    '  var out=[];',
    '  DAYS.forEach(function(d){',
    '    var b=document.querySelector("input[data-day=\'"+d+"\']");',
    '    if(b&&b.checked)out.push(d);',
    '  });',
    '  return out;',
    '}',
    'function dayLabel(d){',
    '  var n=document.querySelector("label[data-day-label=\'"+d+"\']");',
    '  return n?n.textContent:d;',
    '}',
    'function plural(n,word){return n+" "+word+(n>1?"s":"");}',
    'function summarize(){',
    '  var days=selectedDays();',
    '  var raw=el("perWeek").value.trim();',
    '  var n=Number(raw);',
    '  var parts=[];',
    '  if(isInt(raw)&&n>=1)parts.push(plural(n,"article")+" / semaine");',
    '  else parts.push("—");',
    '  if(days.length)parts.push(days.map(dayLabel).join(" + "));',
    '  else parts.push("Aucun jour sélectionné");',
    '  if(isInt(raw)&&n>=1&&days.length){',
    '    var per=n/days.length;',
    '    if(per===Math.floor(per)){',
    '      days.forEach(function(d){parts.push(plural(per,"article")+" "+dayLabel(d).toLowerCase());});',
    '    }else{',
    '      parts.push("Répartition impossible : "+n+" ne se divise pas exactement sur "+days.length+" jour(s).");',
    '    }',
    '  }',
    '  el("summary").textContent=parts.join(" · ");',
    '}',
    'function validate(){',
    '  var e=[];',
    '  var days=selectedDays();',
    '  var raw=el("perWeek").value.trim();',
    '  var n=Number(raw);',
    '  if(!isInt(raw)||n<1||n>MAX_WEEK)e.push({c:"SCHED_PER_WEEK",m:"Articles par semaine : entier entre 1 et "+MAX_WEEK+" attendu."});',
    '  if(isInt(raw)&&n>0&&days.length===0)e.push({c:"SCHED_DAYS_EMPTY",m:"Sélectionnez au moins un jour de publication."});',
    '  if(days.length&&isInt(raw)&&n>0&&n%days.length!==0)e.push({c:"SCHED_DISTRIBUTION",m:"Articles par semaine ("+n+") ne se répartit pas également sur "+days.length+" jour(s) : un multiple de "+days.length+" est requis."});',
    '  var mraw=el("maxPerRun").value.trim();',
    '  var m=Number(mraw);',
    '  if(!isInt(mraw)||m<1||m>MAX_RUN)e.push({c:"SCHED_MAX_PER_RUN",m:"Articles maximum par exécution : entier entre 1 et "+MAX_RUN+" attendu."});',
    '  return e;',
    '}',
    'function clearInvalid(){',
    '  [el("perWeek"),el("maxPerRun"),el("daysBox")].forEach(function(n){if(n)n.removeAttribute("aria-invalid");});',
    '}',
    'function markInvalid(errs){',
    '  clearInvalid();',
    '  errs.forEach(function(e){',
    '    var n=null;',
    '    if(e.c==="SCHED_PER_WEEK")n=el("perWeek");',
    '    else if(e.c==="SCHED_MAX_PER_RUN")n=el("maxPerRun");',
    '    else n=el("daysBox");',
    '    if(n)n.setAttribute("aria-invalid","true");',
    '  });',
    '}',
    'function say(kind,text){',
    '  var n=el("result");',
    '  if(!n)return;',
    '  n.textContent=text;',
    '  n.style.color=kind==="ok"?"#137333":(kind==="ko"?"#c5221f":"#5f6368");',
    '}',
    'function applyTriggerStatus(t){',
    '  var n=el("automationStatus");',
    '  if(!n||!t)return;',
    '  if(t.readable!==true){n.textContent="État des déclencheurs illisible — aucune automatisation en exécution.";return;}',
    '  if(t.count===0){n.textContent="0 déclencheur — aucune automatisation en exécution.";return;}',
    '  n.textContent=t.count+(t.count>1?" déclencheurs":" déclencheur")+" — publication automatique non implémentée dans ce projet.";',
    '}',
    'function save(){',
    '  var errs=validate();',
    '  clearInvalid();',
    '  if(errs.length){markInvalid(errs);say("ko",errs.map(function(e){return e.m;}).join(" "));return;}',
    '  var btn=el("saveBtn");',
    '  btn.disabled=true;',
    '  say("busy","Enregistrement…");',
    '  google.script.run',
    '    .withSuccessHandler(onSaved)',
    '    .withFailureHandler(function(err){btn.disabled=false;say("ko",String(err&&err.message?err.message:err));})',
    '    .saveSchedulerConfig({',
    '      autoPublish:el("autoPublish").checked,',
    '      mode:el("mode").value,',
    '      perWeek:el("perWeek").value,',
    '      days:selectedDays(),',
    '      maxPerRun:el("maxPerRun").value',
    '    });',
    '}',
    'function onSaved(res){',
    '  if(!res||res.ok!==true){',
    '    el("saveBtn").disabled=false;',
    '    var msg=res&&res.message?res.message:"Enregistrement refusé.";',
    '    var list=res&&res.errors&&res.errors.length?res.errors.map(function(e){return e.message;}).join(" "):"";',
    '    if(res&&res.errors)markInvalid(res.errors);',
    '    say("ko",(msg+" "+list).trim());',
    '    return;',
    '  }',
    '  say("ok",res.message);',
    '  var st=res.state;',
    '  if(st){',
    '    el("autoPublish").checked=st.autoPublish===true;',
    '    el("mode").value=st.mode;',
    '    el("perWeek").value=st.perWeekRaw;',
    '    el("maxPerRun").value=st.maxPerRunRaw;',
    '    DAYS.forEach(function(d){var b=document.querySelector("input[data-day=\'"+d+"\']");if(b)b.checked=st.days.indexOf(d)!==-1;});',
    '    applyTriggerStatus(st.triggers);',
    '  }',
    '  summarize();',
    '}',
    'function boot(){',
    '  ["autoPublish","mode","perWeek","maxPerRun"].forEach(function(id){',
    '    var n=el(id);',
    '    if(n)n.addEventListener("change",function(){clearInvalid();summarize();});',
    '    if(n)n.addEventListener("input",function(){clearInvalid();summarize();});',
    '  });',
    '  DAYS.forEach(function(d){',
    '    var b=document.querySelector("input[data-day=\'"+d+"\']");',
    '    if(b)b.addEventListener("change",function(){clearInvalid();summarize();});',
    '  });',
    '  el("saveBtn").addEventListener("click",save);',
    '  el("cancelBtn").addEventListener("click",function(){google.script.host.close();});',
    '  summarize();',
    '}',
    'boot();',
    '</script>'
  ];
  return lines.join('\n');
}
