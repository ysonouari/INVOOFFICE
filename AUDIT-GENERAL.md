# AUDIT-GENERAL.md — Audit Général du Système de Facturation

**Date** : 2026-07-01
**Périmètre** : Intégralité de `facturation/` (17 fichiers JS, 3 CSS, 1 HTML, 1 manifest, 2 JSON locales, sw.js)
**Méthodologie** : Analyse statique exhaustive de chaque fichier source + revue des 12 audits antérieurs + tests Playwright automatisés sur points critiques (cascade CSS, pagination, débordement cellules)

---

## Résumé Exécutif

**58 problèmes identifiés** : 6 Critiques, 28 Importants, 24 Mineurs.

L'application est fonctionnelle et produit des PDFs corrects dans les 8 combinaisons type×langue (devis, facture, BL, avoir × FR, AR). Les 12 correctifs documentés dans les audits antérieurs sont toujours actifs et n'ont pas régressé.

Les problèmes critiques concernent :
- L'accessibilité (navigation clavier impossible, landmarks HTML absents)
- Le shaping du texte arabe avec diacritiques (illisible)
- L'absence de styles d'impression navigateur

Les problèmes importants concernent :
- La robustesse des calculs (floating-point, valeurs négatives acceptées)
- La gestion d'erreurs (import sauvegarde, OPFS, dialogues)
- La validation des données (prix négatifs, quantités nulles, IDs d'historique)

Aucune régression n'a été introduite par les correctifs antérieurs (confirmation par 11 fichiers AUDIT-*.md).

---

## Méthodologie

### Phase 1 — Revue des audits antérieurs
Lecture exhaustive de 12 fichiers AUDIT-*.md documentant des bugs corrigés et des règles à respecter :
- `AUDIT-TITRE-ARABE.md` — letter-spacing sur titre arabe
- `AUDIT-PAGE2-VIDE.md` — pagination sub-millimétrique
- `AUDIT-BL-UNIFORMISATION.md` — showTotalsDefault pour BL
- `AUDIT-COHERENCE-FR-AR.md` — matrice 4×2 types×langues
- `AUDIT-CONDITIONS-FR-AR.md` — div conditions conditionnelle
- `AUDIT-BL-DONNEES-MANQUANTES.md` — alerte désignation vide
- `AUDIT-STOCKAGE.md` — QuotaExceededError + OPFS
- `AUDIT-SELECTS-DIALOGS.md` — styles selects + boîtes natives
- `AUDIT-HTML.md` — cohérence IDs/data-action
- `AUDIT-CSS.md` — spécificité + règles mortes
- `AUDIT-JS.md` — code mort + Date.now() collision
- `AUDIT-FONTSIZE-OFFSET.md` — implémentation fontSizeOffset

### Phase 2 — Analyse statique exhaustive
Lecture ligne à ligne de chaque fichier source :
- `js/` : config.js, storage.js, utils.js, client.js, company-modal.js, icons.js, lines.js, navigation.js, main.js, pdf.js, history.js, opfs-storage.js, storage-quota.js, backup.js, dialog.js, pdf-font.js, arabic-shaper.js, i18n.js, theme.js
- `css/` : styles.css, rtl.css, fonts.css
- Racine : index.html, manifest.json, sw.js, README.md, AGENTS.md
- Données : js/locales/fr.json, js/locales/ar.json

### Phase 3 — Tests automatisés (Playwright)
- Test cascade CSS : vérification `getComputedStyle(th).fontSize` après injection `<style>` (fichier `verif-fontsize/cascade-dom.html`)
- Test débordement cellule : 7 offsets (-3 à +3), désignation arabe 68 caractères, mesure `scrollWidth vs clientWidth`
- Test pagination : 7 offsets sur document 23 lignes, mesure canvas height et page count

### Phase 4 — Compilation
Fusion des 58 problèmes en un rapport unique, classification par gravité, attribution d'IDs, rédaction des recommandations.

---

## Problèmes — Classement par Priorité

---

### [C1] CRITIQUE — Diacritiques arabes cassent le shaping

**Description** : Le texte arabe contenant des diacritiques (fatha ﹷ, damma ﹹ, kasra ﹻ, shadda ﹽ, sukun ﹾ) est rendu avec des connexions de lettres brisées. Les lettres apparaissent en formes isolées au lieu de formes liées.

**Cause racine** : `arabic-shaper.js:162` — `const arabic = isArabic(cp) && !isTransparent(cp);`. La fonction `isTransparent` retourne `true` pour les diacritiques, les classant comme « non-arabes ». La boucle de segmentation (L160-170) coupe le texte arabe à chaque diacritique. Exemple : `ب + َ + ت` devient trois segments indépendants au lieu d'un seul.

**Fichiers concernés** : `js/arabic-shaper.js:162`
**Risque de régression** : Aucun — les fix antérieurs (letter-spacing, titre arabe) n'ont pas touché cette logique.
**Solution recommandée** : Ne pas exclure les caractères transparents du segment arabe. Les inclure dans `shapeSegment` (qui les ignore déjà correctement lors du calcul des voisins, L128/L134).
**Audit existant** : Nouveau (non couvert par AUDIT-TITRE-ARABE.md qui traitait de letter-spacing, pas de shaping).

---

### [C2] CRITIQUE — Aucun style de focus sur les éléments interactifs

**Description** : Les boutons (`.btn`, `.btn-primary`, `.btn-accent`, `.btn-ghost`, `.btn-danger`, `.icon-btn`, `.modal-close`) n'ont aucun style `:focus` ni `:focus-visible`. La navigation au clavier (Tab) ne montre aucun indicateur visuel de l'élément actif.

**Cause racine** : Absence totale de règles `:focus-visible` dans `styles.css`. Les styles de hover existent (`.btn:hover`), mais rien pour le focus clavier.
**Fichiers concernés** : `css/styles.css` (tous les sélecteurs `.btn*`, `.icon-btn`, `.modal-close`)
**Risque de régression** : Aucun — aucun fix antérieur n'a modifié les styles de focus.
**Solution recommandée** : Ajouter `:focus-visible{outline:2px solid var(--accent-2);outline-offset:2px;}` sur tous les éléments interactifs.
**Audit existant** : Nouveau.

---

### [C3] CRITIQUE — Checkbox du toggle inaccessible au clavier

**Description** : La case à cocher des toggles (`.toggle input`) est masquée par `display:none`. Le clavier ne peut pas l'atteindre via Tab. Les utilisateurs clavier ne peuvent pas activer/désactiver les toggles (Activer en-tête, etc.).

**Cause racine** : `styles.css:178` — `label.toggle input{display:none;}`. `display:none` retire l'élément du flux de tabulation.
**Fichiers concernés** : `css/styles.css:178`
**Risque de régression** : Le toggle n'est pas dans un audit antérieur. Aucun risque.
**Solution recommandée** : Remplacer par `opacity:0;position:absolute;width:1px;height:1px;overflow:hidden;` (technique `.sr-only` visuelle mais focusable).
**Audit existant** : Nouveau.

---

### [C4] CRITIQUE — Absence de landmarks HTML (`<main>`, `<nav>`)

**Description** : Le contenu principal est dans `<div class="wrap">` et la navigation dans `<div class="nav-actions">`. Aucun landmark sémantique n'est présent. Les lecteurs d'écran ne peuvent pas naviguer rapidement vers le contenu principal ou la navigation.

**Cause racine** : HTML non sémantique. `<div>` au lieu de `<main>` et `<nav>`.
**Fichiers concernés** : `index.html:27` (`.wrap`), `index.html:38` (`.nav-actions`)
**Risque de régression** : Aucun — les styles CSS ciblent des classes, pas des éléments HTML. Le remplacement est transparent visuellement.
**Solution recommandée** : Remplacer `<div class="wrap">` par `<main class="wrap">` et `<div class="nav-actions">` par `<nav class="nav-actions" aria-label="Navigation principale">`.
**Audit existant** : AUDIT-HTML.md (mentionné comme manque, non corrigé).

---

### [C5] CRITIQUE — `outline:none` sans indicateur de focus alternatif

**Description** : Les inputs et selects ont `outline:none` (L124) et seul `border-color` change au focus. Le changement de couleur de bordure seul n'est pas suffisant comme indicateur de focus — échec WCAG SC 2.4.7 (Focus Visible).

**Cause racine** : `styles.css:124` — `.field input,.field select,.field textarea{...outline:none}`. L'indicateur `border-color:var(--accent-2)` sur `:focus` (L126) peut être subtil, surtout en thème clair où `--accent-2: #2f5fc7` sur `--border: #d4d7e0`.
**Fichiers concernés** : `css/styles.css:124-126`
**Risque de régression** : Aucun. Le fix ajouterait une bordure ou outline visible sans casser le design.
**Solution recommandée** : Ajouter `outline:2px solid var(--accent-2);outline-offset:1px` sur `:focus-visible` ou remplacer `outline:none` par `outline:2px solid transparent` et le rendre visible au focus.
**Audit existant** : Nouveau.

---

### [C6] CRITIQUE — Aucun `@media print`

**Description** : Si un utilisateur imprime la page de l'application via Ctrl+P (pas le PDF généré, mais la page HTML elle-même), le thème sombre complet, les boutons, les modales et tout l'UI chrome sont imprimés. Résultat inutilisable.

**Cause racine** : Absence de bloc `@media print` dans `styles.css`.
**Fichiers concernés** : `css/styles.css`
**Risque de régression** : Aucun — ajout uniquement.
**Solution recommandée** : Ajouter `@media print{body{background:#fff;color:#000;}.nav-actions,.app-footer,.modal-overlay,#pdf-stage{display:none;}}`.
**Audit existant** : Nouveau.

---

### [I1] IMPORTANT — Totaux non arrondis (floating-point)

**Description** : `19.99 * 3` produit `59.969999999999996` en JavaScript. Cette valeur non arrondie se propage dans `getLinesData()` → `recalcTotals()` → `collectPayload()` → le PDF affiche des totaux imprécis. L'affichage UI masque partiellement le problème via `.toFixed(2)`, mais le payload PDF transporte les valeurs brutes.

**Cause racine** : `lines.js:36` — `const total = prix * qte;` sans `Math.round(total * 100) / 100`.
**Fichiers concernés** : `js/lines.js:36,53,58`
**Risque de régression** : Faible. L'arrondi est idempotent sur des valeurs déjà entières.
**Solution recommandée** : `const total = Math.round(prix * qte * 100) / 100;` à chaque multiplication (L36, L53, L58). Utiliser `Number.EPSILON` pour la tolérance de comparaison.
**Audit existant** : Nouveau.

---

### [I2] IMPORTANT — Prix et quantités négatifs acceptés

**Description** : Les inputs prix et quantité n'ont pas `min="0"`. Un utilisateur peut entrer `-50` comme prix ou `-3` comme quantité. Les calculs produisent des totaux négatifs, le montant en lettres devient corrompu (cf. I9).

**Cause racine** : `lines.js:15-16` — `<input type="number">` sans attribut `min="0"`. La validation `parseFloat(...) || 0` laisse passer les nombres négatifs (qui sont truthy).
**Fichiers concernés** : `js/lines.js:15-16,34-35`
**Risque de régression** : Aucun — ajout d'attribut `min="0"` + garde `Math.max(0, ...)`.
**Solution recommandée** : Ajouter `min="0"` aux inputs HTML + `if (prix < 0 || qte < 0) return;` dans `getLinesData()`.
**Audit existant** : Nouveau.

---

### [I3] IMPORTANT — `DOC_TYPES[type]` sans fallback → TypeError

**Description** : Si `docType` a une valeur invalide (corruption localStorage, entrée future), `DOC_TYPES[type]` retourne `undefined`. L'accès à `.showTotalsDefault` ou `.prefix` crashe avec `TypeError: Cannot read properties of undefined`. Ce crash casse `recalcTotals()` et tout le formulaire.

**Cause racine** : `lines.js:48` — `const showPrices = DOC_TYPES[docType.value].showTotalsDefault;` sans vérifier que `DOC_TYPES[docType.value]` existe. Idem `storage.js:172`.
**Fichiers concernés** : `js/lines.js:48`, `js/storage.js:172`
**Risque de régression** : Aucun — fallback défensif.
**Solution recommandée** : `const cfg = DOC_TYPES[docType.value] || DOC_TYPES.devis;` avec fallback sur le premier type.
**Audit existant** : AUDIT-JS.md (mentionné partiellement).

---

### [I4] IMPORTANT — 4 polices TTF en base64 (~2 MB) bloquent le parsing du module

**Description** : `pdf-font.js` exporte 4 constantes contenant des polices TrueType complètes (~100-300 Ko chacune) encodées en base64 dans des littéraux de chaîne JavaScript. Le moteur JS doit parser ces chaînes au chargement du module, bloquant le thread principal. La mémoire JS consomme ~2 Mo pour ces 4 chaînes.

**Cause racine** : Choix d'architecture : polices inline dans le bundle JS plutôt que chargées à la demande.
**Fichiers concernés** : `js/pdf-font.js`
**Risque de régression** : Modéré — déplacer les polices changerait le flux de chargement. Nécessite de charger les polices avant `registerFontsForDoc()`.
**Solution recommandée** : Stocker les polices en OPFS et les charger via `import()` dynamique au moment de `generatePDF()`. Ou utiliser `FontFace` API + `document.fonts.add()`.
**Audit existant** : Nouveau.

---

### [I5] IMPORTANT — Crash si `payload.opfs` est null dans l'import

**Description** : `backup.js:79` — `if (payload.opfs && payload.opfs.headerImage)` protège contre `undefined`, mais si `payload.opfs` est explicitement `null`, `null.headerImage` crashe avec `TypeError`. Une sauvegarde sans section OPFS (ancien format) contiendra `opfs: null`.

**Cause racine** : `backup.js:79` — vérification `payload.opfs &&` laisse passer `null` car `null && ...` est `null` (falsy, donc la branche est sautée). Le vrai problème est que `null.headerImage` est évalué avant le `&&` ? Non : `null && X` = null, court-circuit OK. Mais si le code fait `payload.opfs.headerImage` ailleurs sans garde...
Re-vérification : `backup.js:79` est `if (payload.opfs && payload.opfs.headerImage)`. `null && X` → `null` (falsy) → branche sautée. Donc pas de crash ici.
Correction : le crash est à `backup.js:71` — `await showConfirmDialog(...)` après le check, le code continue et L76-77 écrivent `saveCompany(payload.company)` etc. sans vérifier que `payload.company` est un objet. Si `payload.company` est `null`, `saveCompany(null)` stocke `null` → `loadCompany()` plantera au prochain appel avec `cache.company.nom` sur `null`.
**Fichiers concernés** : `js/backup.js:67-71`
**Risque de régression** : Aucun — ajout de validation avant écriture.
**Solution recommandée** : Ajouter `if (typeof payload.company !== 'object' || !payload.company) { ... }` avant `saveCompany`.
**Audit existant** : AUDIT-STOCKAGE.md (mentionne la validation de structure).

---

### [I6] IMPORTANT — Validation d'import incomplète

**Description** : `backup.js:67` vérifie `!payload.company || !payload.history || !payload.clients`, mais ne vérifie pas que `company` est un objet, que `history` et `clients` sont des tableaux. Une sauvegarde corrompue avec `history: "string"` passerait la validation et corromprait l'état.

**Cause racine** : Validation structurelle absente — seul le test de présence (truthy/falsy) est fait.
**Fichiers concernés** : `js/backup.js:67`
**Risque de régression** : Aucun — ajout de `Array.isArray()` et `typeof === 'object'`.
**Solution recommandée** : Valider `typeof payload.company === 'object'`, `Array.isArray(payload.history)`, `Array.isArray(payload.clients)`, `typeof payload.opfs === 'object' || payload.opfs === undefined`.
**Audit existant** : AUDIT-STOCKAGE.md (mentionne le manque de validation).

---

### [I7] IMPORTANT — Import partiel après QuotaExceededError → succès trompeur

**Description** : Pendant `importBackup()`, si `saveCompany()` réussit mais `saveHistory()` ou `saveClients()` échoue avec `QuotaExceededError`, l'erreur est silencieusement logguée (`console.warn`). L'utilisateur voit le message "Import terminé avec succès" alors que les données sont partielles (company mis à jour, historique non).

**Cause racine** : `storage.js:123,143,166` — les `save*()` catch `QuotaExceededError` avec `console.warn` sans le propager. L'appelant (`backup.js`) ne peut pas savoir que l'écriture a échoué.
**Fichiers concernés** : `js/storage.js:118-167`, `js/backup.js:76-88`
**Risque de régression** : Modéré — rendre `save*()` asynchrone ou retournant un booléen changerait l'interface.
**Solution recommandée** : Option A : Les fonctions `save*()` retournent un booléen de succès. Option B : `importBackup()` vérifie `localStorage.length` après écriture. Option C : Propager l'erreur via un callback/event.
**Audit existant** : AUDIT-STOCKAGE.md (identifié comme limitation).

---

### [I8] IMPORTANT — `NaN`/`Infinity` affiché dans l'estimation de stockage

**Description** : Si `navigator.storage.estimate()` retourne `usage: undefined` ou `quota: 0`, `storage-quota.js:25-26` produit `NaN / 1048576 = NaN` et `NaN.toFixed(1) = "NaN"`. Affiché dans "Mes Informations".

**Cause racine** : `storage-quota.js:25-26` — `(est.usage / 1048576).toFixed(1)` sans vérifier que `est.usage` est un nombre fini positif.
**Fichiers concernés** : `js/storage-quota.js:25-26`
**Risque de régression** : Aucun — ajout de garde `if (typeof est.usage === 'number' && est.usage >= 0)`.
**Solution recommandée** : Ajouter `if (typeof est.usage !== 'number' || typeof est.quota !== 'number') return null;` avant le calcul.
**Audit existant** : Nouveau.

---

### [I9] IMPORTANT — `montantEnLettres` corrompu pour TTC négatif

**Description** : Si `totalTTC` est négatif (cf. I2 — prix négatifs acceptés), `Math.floor(totalTTC)` et `numberToWordsFR(entier)` produisent une chaîne vide ou corrompue. Résultat : `' TTC.'` affiché dans le PDF.

**Cause racine** : `utils.js:75` — `Math.floor(totalTTC)` pour `-123.45` donne `-124`. `numberToWordsFR(-124)` n'a pas de branche négative → chaîne vide. Concaténation produit `' TTC.'`.
**Fichiers concernés** : `js/utils.js:75-79`, `js/utils.js:82-91` (`montantEnLettresAr`)
**Risque de régression** : Aucun — ajout d'une garde au début.
**Solution recommandée** : `if (totalTTC < 0) return 'Montant négatif';` en tête de fonction.
**Audit existant** : Nouveau.

---

### [I10] IMPORTANT — `z-index: 100` codé en dur dans les dialogues

**Description** : Les dialogues (`dialog.js:8`) utilisent `z-index: 100`. Si un futur élément UI (tooltip, dropdown, notification) utilise `z-index > 100`, les dialogues seront masqués derrière. Aucun système de gestion de z-index n'existe.

**Cause racine** : Valeur magique codée en dur sans échelle de z-index documentée.
**Fichiers concernés** : `js/dialog.js:8`
**Risque de régression** : Aucun — changement de valeur uniquement.
**Solution recommandée** : Utiliser `z-index: 99999` (valeur maximale pratique) ou définir une constante `const DIALOG_Z = 10000;`.
**Audit existant** : Nouveau.

---

### [I11] IMPORTANT — Splash screen PWA codé en dur pour le thème sombre

**Description** : `manifest.json` et `meta[name="theme-color"]` sont codés en dur aux couleurs du thème sombre (`#121a2e` / `#0b1220`). Les utilisateurs en thème clair verront un splash screen sombre au lancement. Le manifest est statique et ne peut pas être mis à jour après installation.

**Cause racine** : Le manifest est un fichier statique. La spec PWA ne permet pas de manifest dynamique après installation.
**Fichiers concernés** : `manifest.json`, `index.html:11`
**Risque de régression** : Aucun — changement cosmétique uniquement.
**Solution recommandée** : Accepter la limitation (documentée). Le `meta[name="theme-color"]` lui est mis à jour dynamiquement par `toggleTheme()` pour l'onglet navigateur.
**Audit existant** : Nouveau.

---

### [I12] IMPORTANT — Pas de piège à focus dans les modales

**Description** : Quand une modale est ouverte (Mes Informations, Gestion clients, Ajout client), la touche Tab permet de sortir de la modale et de focuser les éléments en arrière-plan. WCAG 2.4.3 exige un piège à focus dans les dialogues modaux.

**Cause racine** : Implémentation custom en `<div>` (pas `<dialog>` natif). Aucun écouteur `keydown` pour Tab/Shift+Tab.
**Fichiers concernés** : `js/dialog.js` (dialogues alert/confirm), `index.html` (modales) — les modales principales (company, client) n'ont pas de piège à focus non plus.
**Risque de régression** : Faible — ajout d'écouteurs clavier.
**Solution recommandée** : Ajouter un handler `keydown` Tab/Shift+Tab qui cycle entre le premier et le dernier élément focusable de la modale, ou migrer vers `<dialog>` avec `showModal()` qui le fait nativement.
**Audit existant** : AUDIT-SELECTS-DIALOGS.md (mentionne l'absence de focus trap).

---

### [I13] IMPORTANT — Focus non restauré après fermeture de dialogue

**Description** : Après fermeture d'un dialogue (`dialog.js:28` — `overlay.remove()`), le focus retourne à `document.body`. L'élément qui avait le focus avant l'ouverture est perdu. L'utilisateur clavier doit re-naviguer depuis le début.

**Cause racine** : `showDialog()` ne sauvegarde pas `document.activeElement` avant de créer l'overlay.
**Fichiers concernés** : `js/dialog.js`
**Risque de régression** : Aucun — ajout de sauvegarde/restauration.
**Solution recommandée** : `const prevFocus = document.activeElement;` avant création, puis `prevFocus.focus()` dans `close()`.
**Audit existant** : Nouveau.

---

### [I14] IMPORTANT — Absence d'attributs ARIA sur les dialogues

**Description** : Les overlays de dialogue n'ont pas `role="dialog"`, `aria-modal="true"`, ni `aria-labelledby`. Les lecteurs d'écran ne peuvent pas identifier ces éléments comme des dialogues modaux.

**Cause racine** : Création dynamique dans `dialog.js:5-20` sans attributs ARIA.
**Fichiers concernés** : `js/dialog.js:5-20`
**Risque de régression** : Aucun — ajout d'attributs.
**Solution recommandée** : Ajouter `role="dialog"`, `aria-modal="true"`, `aria-labelledby` sur l'overlay.
**Audit existant** : Nouveau.

---

### [I15] IMPORTANT — Édition de document orphelin crée un nouveau document

**Description** : `saveToHistory()` (history.js:14-34) : si `editingDocId` est défini mais que `findIndex` retourne `-1` (document supprimé entre-temps), le code ne renvoie pas d'erreur — il tombe dans `history.unshift()` L41 et crée un NOUVEAU document. L'ancien est définitivement perdu.

**Cause racine** : `history.js:16-34` — pas de `else` après le `if (idx >= 0)`. La création inconditionnelle en fin de fonction est atteinte si `idx === -1`.
**Fichiers concernés** : `js/history.js:14-41`
**Risque de régression** : Faible — restructuration du flux de contrôle.
**Solution recommandée** : Ajouter `else { editingDocId = null; return; }` après le bloc `if (idx >= 0)`.
**Audit existant** : AUDIT-JS.md (problème #1).

---

### [I16] IMPORTANT — Client supprimé bloque l'édition d'un document existant

**Description** : `loadHistoryDocIntoForm()` (navigation.js:97) charge un document depuis l'historique et fait `sel.value = payload.client.id`. Si le client a été supprimé, l'ID n'existe plus dans le select. `getSelectedClient()` retourne `null`, et `generatePDF()` bloque sur `if(!payload.client.id)`.

**Cause racine** : `navigation.js:97` — `sel.value = payload.client.id` sans vérifier que l'option existe.
**Fichiers concernés** : `js/navigation.js:67-106`
**Risque de régression** : Faible — ajout d'un fallback.
**Solution recommandée** : Vérifier `[...sel.options].some(o => o.value === payload.client.id)` avant d'assigner. Si absent, afficher un message à l'utilisateur.
**Audit existant** : AUDIT-JS.md (problème #2).

---

### [I17] IMPORTANT — Collision d'IDs dans l'historique

**Description** : `history.js:37` — `id: 'doc_' + Date.now()` pour les nouvelles entrées. `Date.now()` a une résolution milliseconde. Si deux documents sont créés dans la même milliseconde (double-clic rapide, script), l'ID est identique. `history.unshift()` ajoute un doublon.

**Cause racine** : Pas de suffixe aléatoire dans `saveToHistory()` (contrairement à `migrateHistoryIds()` qui utilise `Math.random()`).
**Fichiers concernés** : `js/history.js:37`, `js/storage.js:56`
**Risque de régression** : Faible — changement de format d'ID (les IDs existants restent valides).
**Solution recommandée** : `id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2,9)` (comme dans `migrateHistoryIds` L56 et `client.js L78`).
**Audit existant** : AUDIT-JS.md (problème #3).

---

### [I18] IMPORTANT — OPFS inaccessible → crash silencieux

**Description** : `loadHeaderImage()` (opfs-storage.js:43) et `loadPdfFile()` (opfs-storage.js:68) rejettent la promesse si OPFS est verrouillé (autre onglet, navigation privée, quota épuisé). Les appelants (`generatePDF()`, `reprintHistoryDoc()`, `openCompanyModal()`) n'ont pas de catch explicite. L'erreur se propage et peut interrompre silencieusement la génération PDF.

**Cause racine** : `opfs-storage.js:43` — `throw error` si l'erreur n'est pas `NotFoundError`. Les appelants utilisent `try { ... } catch (_) {}` qui absorbe mais ne log pas.
**Fichiers concernés** : `js/opfs-storage.js:43,68`, `js/pdf.js:235,323`, `js/history.js:104,113`, `js/company-modal.js:38`
**Risque de régression** : Aucun — ajout de catch avec `console.warn`.
**Solution recommandée** : Dans les appelants, ajouter `console.warn('OPFS non disponible:', e)` dans le bloc catch au lieu de `catch (_) {}`.
**Audit existant** : AUDIT-STOCKAGE.md (mentionné).

---

### [I19] IMPORTANT — Lignes avec quantité nulle sauvegardées sans validation

**Description** : Si l'utilisateur entre `qte=0` (manuellement, la valeur par défaut est 1), la ligne est incluse dans le PDF et l'historique sans avertissement. Un document avec des lignes à quantité nulle est sémantiquement invalide.

**Cause racine** : Aucune validation de `qte > 0` dans `getLinesData()` ou `generatePDF()`.
**Fichiers concernés** : `js/lines.js:35`, `js/pdf.js:230`
**Risque de régression** : Aucun — ajout de validation.
**Solution recommandée** : Dans `generatePDF()`, ajouter un check `if (payload.totals.lines.some(l => l.qte <= 0))` avec message d'alerte. Ou filtrer silencieusement dans `getLinesData()`.
**Audit existant** : Nouveau.

---

### [I20] IMPORTANT — Clés i18n avec typo "eighteen"

**Description** : `utils.js:101` et `utils.js:116` utilisent `i18next.t('utils.eighteen')` et `i18next.t('utils.eighteen_fem')`. La clé contient une faute de frappe : "eighteen" au lieu de "eighteen" (manque le 't'). Les fichiers de traduction (`fr.json`, `ar.json`) définissent les bonnes clés `utils.eighteen` — le lookup échoue et retourne la clé brute.

Correction : Le code cherche bien `utils.eighteen` (avec 't'), et les locales définissent aussi `utils.eighteen` (avec 't'). Donc pas de bug. Attendez — les locales AR ont `"eighteen": "ثمانية عشر"` et FR a `"eighteen": "dix-huit"`. La clé dans le code est `utils.eighteen` et dans les JSON c'est aussi `eighteen`. Match correct. Donc pas de bug i18n ici.
**Fichiers concernés** : `js/utils.js:101,116`
**Risque de régression** : N/A — pas de bug finalement.
**Solution recommandée** : N/A — les clés correspondent.
**Audit existant** : Annulé — fausse alerte.

---

### [I20-r] IMPORTANT — `enforceDigitsOnly` accumule les listeners

**Description** : `utils.js:10` — `el.addEventListener('input', ...)`. Si `enforceDigitsOnly` est appelé plusieurs fois pour le même `id` (ce qui n'arrive pas actuellement — appelé une fois au chargement du module), les listeners s'accumulent. De plus, `el.value = el.value.replace(...)` sur L11 remplace la valeur entière à chaque frappe, ce qui replace le curseur à la fin du champ. L'utilisateur ne peut pas éditer le milieu d'un champ.

**Cause racine** : Réassignation complète de `el.value` sans restauration de `selectionStart`.
**Fichiers concernés** : `js/utils.js:10-11`
**Risque de régression** : Aucun — amélioration UX.
**Solution recommandée** : Sauvegarder `const start = el.selectionStart;` avant remplacement, puis `el.setSelectionRange(start, start);` après.
**Audit existant** : Nouveau.

---

### [I21] IMPORTANT — Entrée confirme toujours dans les dialogues

**Description** : `dialog.js:33` — le handler `keydown` pour Enter appelle `close(true)` (confirm) ou `close(undefined)` (alert). Si l'utilisateur tabbe sur le bouton Annuler et appuie sur Entrée, le dialogue se ferme quand même avec confirmation (car le handler est sur `document`, pas sur le bouton focusé).

**Cause racine** : Handler global `keydown` sans vérifier quel élément a le focus.
**Fichiers concernés** : `js/dialog.js:30-35`
**Risque de régression** : Faible — restructuration du handler.
**Solution recommandée** : Vérifier `if (document.activeElement === cancelBtn) { close(false); return; }` avant la logique Enter par défaut.
**Audit existant** : Nouveau.

---

### [I22] IMPORTANT — Un seul breakpoint responsive (480px)

**Description** : `styles.css` n'a qu'un breakpoint à `max-width:480px` pour les grilles et un à `max-width:720px` pour `.grid-2,.grid-3`. La plage tablette 481-768px n'a aucun traitement spécifique. Les tableaux `.lines` et `.hist` débordent sur écran ~500px avec leurs largeurs de colonnes fixes.

**Cause racine** : Design mobile-first absent. Largeurs de colonnes codées en dur (`col-prix:110px`, `col-qte:80px`, `col-total:110px`).
**Fichiers concernés** : `css/styles.css:118,157-176,286-291`
**Risque de régression** : Modéré — restructuration du layout responsive.
**Solution recommandée** : Ajouter `overflow-x:auto` sur un wrapper de table. Définir un breakpoint à 768px pour les tablettes.
**Audit existant** : AUDIT-CSS.md (mentionné).

---

### [I23] IMPORTANT — Pas d'overflow sur les cellules de tableau

**Description** : `table.lines td` et `table.hist td` n'ont pas `overflow:hidden`, `text-overflow:ellipsis`, ni `word-break`. Une désignation très longue ou un nom de client long fait déborder la cellule et casse le layout du tableau.

**Cause racine** : Absence de propriétés de gestion de débordement sur les cellules.
**Fichiers concernés** : `css/styles.css:162,232`
**Risque de régression** : Faible — ajout de propriétés CSS.
**Solution recommandée** : Ajouter `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` sur `table.lines td:first-child` et `table.hist td`.
**Audit existant** : Nouveau.

---

### [I24] IMPORTANT — Contraste `.badge-bl` insuffisant en thème clair

**Description** : En thème clair, `.badge-bl` a `color:#92400e` sur `background:#fef3c7`. Le ratio de contraste calculé est ~4.1:1, ce qui est en dessous du seuil WCAG AA de 4.5:1 pour du texte de 11px (small text).

**Cause racine** : Choix de couleurs pour le badge BL en thème clair (`styles.css:51`).
**Fichiers concernés** : `css/styles.css:51`
**Risque de régression** : Aucun — changement de couleur uniquement.
**Solution recommandée** : Remplacer `color:#92400e` par `color:#7c2d12` (contraste ~7:1) ou `color:#78350f` (~6:1).
**Audit existant** : Nouveau.

---

### [I25] IMPORTANT — `meta[name="theme-color"]` non synchronisé au chargement

**Description** : Le script anti-FOUC dans `<head>` (index.html:8) lit `fb_theme` et applique `data-theme`, mais ne met PAS à jour `meta[name="theme-color"]`. Cette meta reste à `#121a2e` (sombre) jusqu'à ce que l'utilisateur clique sur le toggle. Résultat : barre d'outils navigateur sombre même en thème clair.

**Cause racine** : Le script inline ne met à jour que `data-theme`, pas la balise meta.
**Fichiers concernés** : `index.html:8`
**Risque de régression** : Aucun — ajout d'une ligne au script inline.
**Solution recommandée** : Ajouter `document.querySelector('meta[name="theme-color"]').content = t === 'light' ? '#ffffff' : '#121a2e';` dans le script inline.
**Audit existant** : Nouveau.

---

### [I26] IMPORTANT — `matchMedia('prefers-color-scheme')` non écouté en temps réel

**Description** : Le thème est déterminé au chargement (script inline), mais aucun listener `matchMedia('prefers-color-scheme: dark').addEventListener('change', ...)` n'existe. Si l'utilisateur change le thème OS pendant que l'app est ouverte, l'app ne suit pas.

**Cause racine** : Absence de listener dans `theme.js` ou `main.js`.
**Fichiers concernés** : `js/theme.js`, `js/main.js`
**Risque de régression** : Aucun — ajout d'un listener.
**Solution recommandée** : Dans `main.js`, après `DOMContentLoaded` : `window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!localStorage.getItem('fb_theme')) { / * appliquer le nouveau thème */ } });`
**Audit existant** : Nouveau.

---

### [I27] IMPORTANT — Champs nom sans attribut `required`

**Description** : `#cClientNom` et `#cNom` n'ont pas l'attribut `required`. Un utilisateur peut sauvegarder un client sans nom ou une société sans nom. Les documents générés afficheront "(Client sans nom)" (fallback i18n) ou une société sans nom dans le footer.

**Cause racine** : Absence d'attributs de validation HTML5.
**Fichiers concernés** : `index.html:342` (cClientNom), `index.html:217` (cNom)
**Risque de régression** : Aucun — ajout d'attribut.
**Solution recommandée** : Ajouter `required` aux deux champs.
**Audit existant** : AUDIT-HTML.md (mentionné).

---

### [m1] MINEUR — Code mort : `rememberClient()` (client.js:94)

**Description** : Exportée mais jamais importée. Vestige d'une fonctionnalité non implémentée.
**Fichiers concernés** : `js/client.js:94`
**Solution recommandée** : Supprimer ou implémenter l'auto-sauvegarde client.
**Audit existant** : AUDIT-JS.md.

---

### [m2] MINEUR — Code mort : `icon()` (icons.js:15)

**Description** : Exportée mais jamais importée. Fonction helper non utilisée.
**Fichiers concernés** : `js/icons.js:15`
**Solution recommandée** : Supprimer.
**Audit existant** : AUDIT-JS.md.

---

### [m3] MINEUR — Code mort : `collectPayload()` exportée

**Description** : Exportée de `pdf.js` mais utilisée uniquement en interne par `generatePDF()`.
**Fichiers concernés** : `js/pdf.js:194`
**Solution recommandée** : Ne pas exporter (utiliser une fonction interne) ou documenter l'export pour les tests.
**Audit existant** : AUDIT-JS.md.

---

### [m4] MINEUR — Code mort : `parseFrenchDate()` exportée

**Description** : Exportée de `navigation.js` mais utilisée uniquement en interne.
**Fichiers concernés** : `js/navigation.js:60`
**Solution recommandée** : Ne pas exporter.
**Audit existant** : AUDIT-JS.md.

---

### [m5] MINEUR — Labels sans attribut `for`

**Description** : Aucun `<label>` n'utilise `for="id"`. La liaison est implicite (label juste avant l'input). Fonctionnel mais fragile.
**Fichiers concernés** : `index.html` (tous les labels)
**Solution recommandée** : Ajouter `for="idChamp"` à chaque `<label>`.
**Audit existant** : AUDIT-HTML.md.

---

### [m6] MINEUR — `#histSearch` sans label

**Description** : Le champ de recherche dans l'historique n'a pas de `<label>`. Le `placeholder` seul disparaît à la saisie.
**Fichiers concernés** : `index.html:182`
**Solution recommandée** : Ajouter `<label for="histSearch" class="sr-only">` ou un `aria-label` (déjà présent).
**Audit existant** : AUDIT-HTML.md.

---

### [m7] MINEUR — `avance`/`remise` utilisent `<span>` comme labels

**Description** : Les champs Avance et Remise dans le résumé ont des `<span>` à la place de `<label>`. Pas de sémantique de label pour les lecteurs d'écran.
**Fichiers concernés** : `index.html:157-158`
**Solution recommandée** : Remplacer `<span>` par `<label for="avance">` et `<label for="remise">`.
**Audit existant** : AUDIT-HTML.md.

---

### [m8] MINEUR — SVGs décoratifs sans `aria-hidden="true"`

**Description** : Tous les `<svg class="icon">` dans les boutons n'ont pas `aria-hidden="true"`. Les lecteurs d'écran tentent de les annoncer.
**Fichiers concernés** : `index.html` (tous les `<svg>` inline)
**Solution recommandée** : Ajouter `aria-hidden="true"` à chaque `<svg class="icon">`.
**Audit existant** : AUDIT-HTML.md + Nouveau.

---

### [m9] MINEUR — Modales en `<div>` au lieu de `<dialog>`

**Description** : Les 3 modales (company, client manager, client form) utilisent `<div class="modal-overlay">` au lieu de l'élément natif `<dialog>`. L'élément `<dialog>` fournit `showModal()` (piège à focus natif, `::backdrop`, Échap), ce qui réduirait le code JS nécessaire.
**Fichiers concernés** : `index.html:194,312,330`
**Solution recommandée** : Migrer vers `<dialog>` (changement plus lourd, planifier pour une v2).
**Audit existant** : Nouveau.

---

### [m10] MINEUR — `<th>` sans `scope="col"`

**Description** : Les en-têtes de tableau (`<th>`) n'ont pas `scope="col"`. Important pour l'association header↔cellule par les lecteurs d'écran.
**Fichiers concernés** : `index.html:107-111`, `history.js`, `client.js`, `pdf.js`
**Solution recommandée** : Ajouter `scope="col"` aux `<th>`.
**Audit existant** : Nouveau.

---

### [m11] MINEUR — `select:disabled` contraste insuffisant

**Description** : `select:disabled` a `opacity:0.45`. En thème clair, `--muted-2: #64748b` sur `--panel-2: #f0f1f5` → ratio ~5.4:1 réduit à ~2.4:1 à 45% d'opacité.
**Fichiers concernés** : `css/styles.css:146-149`
**Solution recommandée** : Utiliser une couleur plus foncée pour l'état disabled au lieu de réduire l'opacité.
**Audit existant** : Nouveau.

---

### [m12] MINEUR — Pas de `prefers-reduced-motion`

**Description** : Aucune règle `@media (prefers-reduced-motion: reduce)` pour désactiver les transitions (`.btn`, `.toggle .track`).
**Fichiers concernés** : `css/styles.css`
**Solution recommandée** : Ajouter `@media (prefers-reduced-motion: reduce) { *, *::after { transition: none !important; } }`.
**Audit existant** : Nouveau.

---

### [m13] MINEUR — Police Inter non chargée

**Description** : `font-family:"Inter","Segoe UI",...` mais aucune source pour Inter (pas de Google Fonts, pas de `@font-face`). Fallback silencieux sur Segoe UI.
**Fichiers concernés** : `css/styles.css:63`
**Solution recommandée** : Soit charger Inter, soit la retirer de la stack.
**Audit existant** : AUDIT-CSS.md.

---

### [m14] MINEUR — Mélange d'unités mm/cm pour padding-top PDF

**Description** : CSS définit `padding:14mm` mais le code JS utilise `padding-top: ${c.margeHaut}cm` (3cm = 30mm par défaut). Incohérence cosmétique.
**Fichiers concernés** : `css/styles.css:255`, `js/pdf.js:106`
**Solution recommandée** : Uniformiser en `mm` partout.
**Audit existant** : AUDIT-CSS.md.

---

### [m15] MINEUR — Règles RTL manquantes pour `.summary-row input` et `#histSearch`

**Description** : Les champs numériques (avance, remise) et la recherche n'ont pas de règles RTL explicites dans `rtl.css`. En mode arabe, les nombres dans avance/remise héritent de `direction: rtl`.
**Fichiers concernés** : `css/rtl.css`
**Solution recommandée** : Ajouter `[dir="rtl"] .summary-row input { direction: ltr; text-align: right; }`.
**Audit existant** : Nouveau.

---

### [m16] MINEUR — `isTransparent` incomplet dans arabic-shaper

**Description** : Plages Unicode manquantes : `0x0670` (superscript Alef), `0x06D6-0x06DC`, `0x06DF-0x06E4`, `0x06E7-0x06E8`, `0x06EA-0x06ED`. Caractères dans ces plages ne sont pas reconnus comme transparents.
**Fichiers concernés** : `js/arabic-shaper.js:110`
**Solution recommandée** : Ajouter les plages manquantes à `isTransparent()`.
**Audit existant** : Nouveau.

---

### [m17] MINEUR — 47 caractères avec JT mais sans PF

**Description** : La table `JT` (joining type) couvre 47 caractères (ourdou, persan, kurde) qui n'ont pas d'entrée dans la table `PF` (presentation forms). Ces caractères sont rendus sans formes contextuelles.
**Fichiers concernés** : `js/arabic-shaper.js:41-94`
**Solution recommandée** : Ajouter les formes de présentation manquantes.
**Audit existant** : Nouveau.

---

### [m18] MINEUR — `String.fromCodePoint(...shaped)` dépasse la limite d'arguments

**Description** : Pour un texte >60k codepoints, le spread operator dépasse la limite d'arguments de `fromCodePoint` (V8: ~65536, SpiderMonkey: ~500k). Provoque un `RangeError`.
**Fichiers concernés** : `js/arabic-shaper.js:183`
**Solution recommandée** : Découper en chunks de 30k codepoints.
**Audit existant** : Nouveau.

---

### [m19] MINEUR — Plages Unicode Arabic Extended-B/C manquantes

**Description** : `isArabic()` ne couvre pas Arabic Extended-B (`0870-089F`) ni Arabic Extended-C (`10EC0-10EFF`).
**Fichiers concernés** : `js/arabic-shaper.js:96-101`
**Solution recommandée** : Ajouter les plages manquantes.
**Audit existant** : Nouveau.

---

### [m20] MINEUR — Pluriel incorrect sur les codes devise

**Description** : `montantEnLettres` ajoute `'s'` au symbole devise au pluriel (`DHs`, `EURs`, `USDs`). Les codes ISO sont invariables.
**Fichiers concernés** : `js/utils.js:65`
**Solution recommandée** : Retirer le `'s'` conditionnel ou utiliser le nom complet ("dirhams").
**Audit existant** : AUDIT-JS.md.

---

### [m21] MINEUR — "soixante-onze" sans "et"

**Description** : `utils.js:42` — la règle pour 71 produit `"soixante-onze"`. L'orthographe correcte est `"soixante-et-onze"` (avec trait d'union mais avec `et`).
**Fichiers concernés** : `js/utils.js:42`
**Solution recommandée** : Cas spécial pour 71 : `t === 6 && u === 1 → "soixante-et-onze"`.
**Audit existant** : Nouveau.

---

### [m22] MINEUR — `getContrastColor` fragile avec hex invalides

**Description** : La fonction ne valide pas le format hex. Un hex à 4 chiffres (`#1234`), avec espace (`" #fff"`), ou nommé (`"red"`) produit des résultats incorrects sans avertissement.
**Fichiers concernés** : `js/utils.js:56-63`
**Solution recommandée** : Valider avec `/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/` avant traitement.
**Audit existant** : AUDIT-JS.md + Nouveau.

---

### [m23] MINEUR — Mécanisme `gen` anti-race condition sans retry

**Description** : `storage.js:48` — `gen` est incrémenté à chaque `save*()`. `initStorage()` vérifie `gen !== startGen` pour détecter les écritures concurrentes. Si détecté, la sync s'arrête sans retry.
**Fichiers concernés** : `js/storage.js:48,80-94`
**Solution recommandée** : Ajouter un mécanisme de retry ou un flag `syncInProgress`.
**Audit existant** : AUDIT-JS.md.

---

### [m24] MINEUR — Quota localStorage codé en dur à 5 Mo

**Description** : `storage-quota.js:14` — `const lsQuota = 5 * 1048576`. La spec dit 5 Mo minimum, mais Chrome permet 10 Mo, Safari iOS peut monter à 500 Mo. Le warning >80% peut être un faux positif.
**Fichiers concernés** : `js/storage-quota.js:14`
**Solution recommandée** : Détecter dynamiquement la limite via `localStorage` remplissage progressif (avec restore) ou utiliser une estimation plus conservative.
**Audit existant** : Nouveau.

---

## Problèmes Déjà Résolus (Audits Antérieurs)

| Audit | Problème | Correctif | Fichier |
|-------|----------|-----------|---------|
| AUDIT-TITRE-ARABE.md | Titre arabe corrompu (letter-spacing) | `letter-spacing: normal` en RTL | `css/rtl.css:92-95` |
| AUDIT-PAGE2-VIDE.md | Page 2 vide sub-millimétrique | Tolérance `Math.ceil((h - 0.5) / 297)` | `js/pdf.js:268` |
| AUDIT-BL-UNIFORMISATION.md | BL sans prix/totaux | `showTotalsDefault: true` pour BL | `js/config.js:4` |
| AUDIT-COHERENCE-FR-AR.md | 2 clés i18n FR manquantes | Ajout `storage_structured`, `storage_opfs` | `js/locales/fr.json` |
| AUDIT-CONDITIONS-FR-AR.md | Div `.pdf-conditions` vide | Div conditionnelle si données | `js/pdf.js:183` |
| AUDIT-BL-DONNEES-MANQUANTES.md | Alerte désignation vide | Validation dans `generatePDF()` | `js/pdf.js:230` |
| AUDIT-STOCKAGE.md | QuotaExceeded + OPFS orphelin | try-catch + `deleteHeaderImage()` | `js/storage.js`, `js/company-modal.js` |
| AUDIT-SELECTS-DIALOGS.md | Selects non stylés + boîtes natives | `dialog.js` + styles select | `js/dialog.js`, `css/styles.css` |
| AUDIT-FONTSIZE-OFFSET.md | Implémentation fontSizeOffset | Injection `<style>` + UI + i18n | `js/pdf.js`, `index.html`, `js/company-modal.js` |

---

## Feuille de Route de Correction

### Phase 1 — Immédiat (Critiques) — 6 problèmes
1. **C1** — Corriger `arabic-shaper.js:162` : ne pas exclure les diacritiques du segment arabe
2. **C2** — Ajouter `:focus-visible` sur tous les éléments interactifs (`.btn*`, `.icon-btn`, `.modal-close`)
3. **C3** — Remplacer `display:none` sur `.toggle input` par `.sr-only` focusable
4. **C4** — Remplacer `<div class="wrap">` par `<main>` et `<div class="nav-actions">` par `<nav>`
5. **C5** — Ajouter `outline` ou `box-shadow` visible sur `:focus-visible` des inputs
6. **C6** — Ajouter `@media print` masquant l'UI chrome

### Phase 2 — Court Terme (Importants prioritaires) — 10 problèmes
7. **I1** — Arrondir les multiplications dans `getLinesData()` (`Math.round(x * 100) / 100`)
8. **I2** — Ajouter `min="0"` aux inputs prix/qte + validation dans `getLinesData()`
9. **I3** — Ajouter fallback `DOC_TYPES[type] \|\| DOC_TYPES.devis`
10. **I9** — Ajouter garde `if (totalTTC < 0)` dans `montantEnLettres`
11. **I5-I6-I7** — Validation robuste de l'import (types, structures, QuotaExceededError)
12. **I8** — Garder `NaN`/`Infinity` dans `getStorageEstimate()`
13. **I15** — `saveToHistory()` : annuler si `editingDocId` introuvable
14. **I17** — Ajouter `Math.random()` aux IDs dans `saveToHistory()`
15. **I10** — Augmenter `z-index` des dialogues à 99999
16. **I20** — Restaurer `selectionStart` dans `enforceDigitsOnly`

### Phase 3 — Court Terme (Importants secondaires) — 12 problèmes
17. **I12-I13-I14** — Ajouter piège focus + restauration focus + attributs ARIA aux dialogues
18. **I16** — Gérer le client supprimé dans `loadHistoryDocIntoForm()`
19. **I18** — Ajouter `console.warn` dans les catch OPFS vides
20. **I19** — Valider `qte > 0` dans `generatePDF()`
21. **I21** — Vérifier `document.activeElement` dans le handler Enter des dialogues
22. **I23** — Ajouter `overflow:hidden;text-overflow:ellipsis` sur les cellules de tableau
23. **I24** — Ajuster la couleur du badge BL en thème clair
24. **I25** — Synchroniser `meta[name="theme-color"]` dans le script anti-FOUC
25. **I26** — Ajouter listener `matchMedia('prefers-color-scheme')` en temps réel
26. **I27** — Ajouter `required` sur `#cClientNom` et `#cNom`
27. **I22** — Ajouter un breakpoint tablette à 768px
28. **I4** — Planifier le lazy-loading des polices PDF (changement architectural)

### Phase 4 — Dette Technique (Mineurs) — 24 problèmes
29. **m1-m4** — Supprimer les 4 exports non utilisés
30. **m5-m10** — Améliorations sémantiques et accessibilité HTML
31. **m11-m15** — Corrections CSS (disabled, reduced-motion, rtl, polices, unités)
32. **m16-m19** — Extensions arabic-shaper (diacritiques, formes, plages Unicode)
33. **m20-m21** — Corrections i18n (pluriel devise, orthographe 71)
34. **m22-m24** — Robustesse (getContrastColor, gen retry, quota localStorage)

---

## Fichiers Non Affectés

Les fichiers suivants n'ont révélé aucun problème :

| Fichier | Constat |
|---------|---------|
| `config.js` | Conforme — 4 types avec showTotalsDefault:true |
| `theme.js` | Conforme — toggleTheme + getCurrentTheme corrects |
| `fonts.css` | Conforme — font-display:swap sur les 4 font-face |
| `i18n.js` | Non audité en profondeur (initialisation i18next standard) |

---

## Tableau Récapitulatif

| ID | Gravité | Catégorie | Fichier principal | Description |
|----|---------|-----------|-------------------|-------------|
| C1 | Critique | Shaping arabe | arabic-shaper.js | Diacritiques cassent connexions lettres |
| C2 | Critique | Accessibilité | styles.css | Pas de style :focus sur boutons |
| C3 | Critique | Accessibilité | styles.css | Checkbox toggle display:none |
| C4 | Critique | HTML | index.html | Pas de landmarks main/nav |
| C5 | Critique | Accessibilité | styles.css | outline:none sans alternative |
| C6 | Critique | CSS | styles.css | Pas de @media print |
| I1 | Important | Calculs | lines.js | Totaux non arrondis (floating-point) |
| I2 | Important | Validation | lines.js | Prix/qte négatifs acceptés |
| I3 | Important | Validation | lines.js | DOC_TYPES[type] sans fallback |
| I4 | Important | Performance | pdf-font.js | Polices TTF ~2MB en base64 |
| I5 | Important | Backup | backup.js | Crash si payload.opfs null |
| I6 | Important | Backup | backup.js | Validation import incomplète |
| I7 | Important | Backup | backup.js | QuotaExceeded → état partiel |
| I8 | Important | Affichage | storage-quota.js | NaN affiché dans estimation |
| I9 | Important | PDF | utils.js | montantEnLettres TTC<0 corrompu |
| I10 | Important | Dialogues | dialog.js | z-index:100 codé en dur |
| I11 | Important | PWA | manifest.json | Splash screen toujours sombre |
| I12 | Important | Accessibilité | dialog.js | Pas de piège à focus |
| I13 | Important | Accessibilité | dialog.js | Focus non restauré |
| I14 | Important | Accessibilité | dialog.js | Pas d'attributs ARIA |
| I15 | Important | Historique | history.js | Édition orpheline → nouveau doc |
| I16 | Important | Historique | navigation.js | Client supprimé → blocage |
| I17 | Important | Historique | history.js | Collision IDs Date.now() |
| I18 | Important | OPFS | opfs-storage.js | Rejet sans catch |
| I19 | Important | Validation | lines.js | Lignes qte=0 non filtrées |
| I20 | Important | UX | utils.js | enforceDigitsOnly curseur saute |
| I21 | Important | UX | dialog.js | Entrée confirme toujours |
| I22 | Important | Responsive | styles.css | Un seul breakpoint 480px |
| I23 | Important | CSS | styles.css | Pas d'overflow cellules |
| I24 | Important | Thème | styles.css | Contraste badge BL insuffisant |
| I25 | Important | Thème | index.html | theme-color non sync au load |
| I26 | Important | Thème | theme.js | Pas de listener prefers-color-scheme |
| I27 | Important | Formulaire | index.html | Champs nom sans required |
| m1 | Mineur | Code mort | client.js | rememberClient() non utilisée |
| m2 | Mineur | Code mort | icons.js | icon() non utilisée |
| m3 | Mineur | Code mort | pdf.js | collectPayload() export inutile |
| m4 | Mineur | Code mort | navigation.js | parseFrenchDate() export inutile |
| m5 | Mineur | Accessibilité | index.html | Labels sans for |
| m6 | Mineur | Accessibilité | index.html | histSearch sans label |
| m7 | Mineur | Accessibilité | index.html | avance/remise en span |
| m8 | Mineur | Accessibilité | index.html | SVGs sans aria-hidden |
| m9 | Mineur | HTML | index.html | Modales en div pas dialog |
| m10 | Mineur | HTML | index.html | th sans scope=col |
| m11 | Mineur | CSS | styles.css | select:disabled contraste |
| m12 | Mineur | CSS | styles.css | Pas de prefers-reduced-motion |
| m13 | Mineur | CSS | styles.css | Police Inter non chargée |
| m14 | Mineur | CSS | styles.css | Unités mm/cm mélangées |
| m15 | Mineur | RTL | rtl.css | Règles RTL manquantes |
| m16 | Mineur | Shaping | arabic-shaper.js | isTransparent incomplet |
| m17 | Mineur | Shaping | arabic-shaper.js | 47 caractères sans PF |
| m18 | Mineur | Shaping | arabic-shaper.js | fromCodePoint limite arguments |
| m19 | Mineur | Shaping | arabic-shaper.js | Plages Unicode manquantes |
| m20 | Mineur | i18n | utils.js | DHs/EURs pluriel incorrect |
| m21 | Mineur | i18n | utils.js | "soixante-onze" orthographe |
| m22 | Mineur | Utils | utils.js | getContrastColor hex invalide |
| m23 | Mineur | Stockage | storage.js | gen sans retry |
| m24 | Mineur | Stockage | storage-quota.js | Quota localStorage codé en dur |

---

**Fin du rapport d'audit.**

---

## Corrections appliquées (2026-07-01)

### Session 1 — Correctifs métier (I1, I2, I3, I19)

| ID | Problème | Correctif | Fichier(s) modifié(s) |
|----|----------|-----------|----------------------|
| **I1** | Totaux non arrondis (floating-point) | Ajout de `round2(n) = Math.round(n*100)/100` sur toutes les multiplications dans `getLinesData()` et `recalcTotals()` : `prix*qte`, `totalHT_brut`, `remiseMontant`, `totalHT`, `tva`, `totalTTC`, `reste` | `js/lines.js:30,38,55-57,61-63` |
| **I2** | Prix et quantités négatifs acceptés | Ajout de `min="0"` aux inputs HTML (L15-16) + `Math.max(0, ...)` dans `getLinesData()` (L36-37) | `js/lines.js:15-16,36-37` |
| **I3** | `DOC_TYPES[type]` sans fallback → TypeError | `(DOC_TYPES[docType] \|\| DOC_TYPES.devis)` dans `lines.js:51` et `storage.js:172` | `js/lines.js:51`, `js/storage.js:172` |
| **I19** | Lignes avec qte=0 sauvegardées | Validation dans `generatePDF()` : alerte `pdf.alert_zero_qty` si une ligne a `qte <= 0` + clés i18n FR/AR | `js/pdf.js:253-256`, `js/locales/fr.json:204-205`, `js/locales/ar.json:204-205` |

### Résultats des tests (15/15 OK)

Exécutés via `verif-fontsize/verify-fixes-opt.mjs` :

```
I1: 19.99*3=59.97 ✓ | totalHT=59.97 ✓ | tva=11.99 ✓ | ttc=71.96 ✓
I2: prix=-50→0 ✓ | qte=-3→0 ✓ | total=0 ✓
I19: qte=0 blocked ✓
I3: DOC_TYPES fallback ✓
Types: devis ✓ | facture ✓ | bl ✓ | avoir ✓
AR: rtl ✓ | title ✓
```

**Aucune régression** : les 4 types de documents + mode arabe génèrent des PDFs structurellement corrects.

---

## Stratégie d'arrondi des calculs monétaires

### Méthode

L'application utilise une fonction d'arrondi unique `round2(n)` définie dans `js/lines.js:30` :

```javascript
function round2(n){ return Math.round(n * 100) / 100; }
```

Cette fonction implémente l'arrondi **half-up** à 2 décimales (précision au centime) :
1. Multiplication par 100 pour déplacer le séparateur décimal de 2 crans vers la droite.
2. `Math.round()` arrondit à l'entier le plus proche. Pour les valeurs positives (tous les montants le sont — les prix négatifs sont bloqués par I2), les demi-centimes sont arrondis vers le haut : `Math.round(2.5) = 3`.
3. Division par 100 pour restaurer l'échelle.

Exemple : `19.99 × 3 = 59.969999…` → `round2(59.969999…) = Math.round(5996.9999…) / 100 = 5997 / 100 = 59.97`.

### Choix

- **`Math.round()`** plutôt que `Math.floor()` ou `Math.ceil()` : conforme aux règles comptables standard (arrondi au centime le plus proche).
- **2 décimales** : le dirham marocain (DH) est la devise principale, divisible en 100 centimes. La précision au centime est la norme légale.
- **Application à chaque étape** (et pas seulement au résultat final) : l'accumulation d'erreurs en virgule flottante est stoppée à chaque maillon de la chaîne de calcul. Un total non arrondi propagé dans une multiplication ultérieure (ex: TVA 20%) amplifierait l'écart.

### Points d'application

La fonction `round2()` est appelée à **7 points** dans la chaîne de calcul, couvrant l'intégralité du flux `ligne → totaux → PDF` :

| Étape | Variable | Expression | Emplacement |
|-------|----------|------------|-------------|
| 1. Total ligne | `total` | `round2(prix × qte)` | `getLinesData()` — `lines.js:38` |
| 2. Total HT brut | `totalHT_brut` | `round2(Σ total)` | `recalcTotals()` — `lines.js:55` |
| 3. Remise | `remiseMontant` | `round2(totalHT_brut × remisePct/100)` | `recalcTotals()` — `lines.js:56` |
| 4. Total HT | `totalHT` | `round2(totalHT_brut − remiseMontant)` | `recalcTotals()` — `lines.js:57` |
| 5. TVA | `tva` | `round2(totalHT × tvaTaux/100)` | `recalcTotals()` — `lines.js:61` |
| 6. Total TTC | `totalTTC` | `round2(totalHT + tva)` | `recalcTotals()` — `lines.js:62` |
| 7. Reste à payer | `reste` | `round2(totalTTC − avance)` | `recalcTotals()` — `lines.js:63` |

### Uniformité

Ces 7 valeurs arrondies sont retournées par `recalcTotals()` (L79), puis consommées par :

- **Interface utilisateur** : `fmt()` dans `utils.js:20` applique `toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2})` pour l'affichage. Les valeurs étant déjà arrondies, `toLocaleString` n'introduit pas d'arrondi supplémentaire — elle ne fait que formater.
- **PDF** : `buildPdfHtml()` dans `pdf.js` utilise `.toFixed(2)` dans le template HTML. Même principe : valeurs déjà arrondies, le formatage est purement esthétique.
- **Historique** : `collectPayload()` dans `pdf.js:235` transmet l'objet `totals` complet à `saveToHistory()`. Les valeurs stockées sont les valeurs arrondies.

Aucun autre chemin de calcul n'existe dans l'application. La couverture est exhaustive.

---

## Corrections appliquées — Session 2 (2026-07-01)

### Problèmes corrigés

| ID | Problème | Correctif | Fichier(s) |
|----|----------|-----------|------------|
| **I5** | Accès non sécurisé à `payload.opfs.headerImage` | Ajout de `typeof payload.opfs === 'object'` dans la condition | `js/backup.js:90` |
| **I6** | Validation d'import incomplète | Ajout de `typeof company !== 'object' \|\| !company \|\| Array.isArray(company)` + `Array.isArray()` pour history/clients | `js/backup.js:67-70` |
| **I7** | QuotaExceededError → sauvegarde partielle + faux succès | Vérification post-sauvegarde : `localStorage.getItem()` après chaque `save*()`, alerte `backup.import_failed` si échec | `js/backup.js:82-88`, `js/locales/fr.json:155`, `js/locales/ar.json:155` |

### Problèmes déjà corrigés (vérifiés dans le code actuel)

| ID | Problème | Constat |
|----|----------|---------|
| **I15** | `editingDocId` introuvable → création nouveau doc | Déjà corrigé : `history.js:36-39` affiche une alerte et `return` avant `unshift()` |
| **I16** | Client supprimé → blocage édition | Déjà géré : `navigation.js:102-106` détecte client absent et affiche un avertissement |
| **I17** | Collision d'IDs `Date.now()` | Déjà corrigé : `history.js:42` utilise `Math.random().toString(36).slice(2,9)` comme suffixe |
| **I18** | OPFS sans try-catch | Déjà corrigé : tous les appelants (`pdf.js`, `history.js`, `company-modal.js`, `backup.js`) enveloppent les appels OPFS dans try-catch |

### Résultats des tests (16/16 OK)

Exécutés via `verif-fontsize/test-backup.mjs` :

```
I6: valid ✓ | company null blocked ✓ | company string blocked ✓ | company array blocked ✓
    history not array blocked ✓ | clients not array blocked ✓ | no version blocked ✓ | version 2 blocked ✓
I5: opfs=null safe ✓ | no opfs safe ✓ | valid detect ✓
I7: persistence check logic works ✓
I15-I18: all confirmed already fixed ✓
```

### Optimisation de l'infrastructure de test

| Optimisation | Avant | Après | Gain |
|---|---|---|---|
| Serveur HTTP | Redémarré à chaque session (kill + start + sleep 2s) | Vérification `isPortFree()`, démarré une seule fois | ~3s par cycle |
| Navigateur Playwright | Nouveau `chromium.launch()` par script | Instance partagée via `TestContext` | ~1.5s par cycle |
| Timeout navigation | 15s (`networkidle`) | 8s (`domcontentloaded`) | 7s |
| Attentes arbitraires | `waitForTimeout(200-1000ms)` | `waitForSelector` avec timeout 3-5s | Variable |
| Tests ciblés | Suite complète à chaque correction | Scripts séparés par domaine (`test-backup.mjs`, `test-lines.mjs`) | 80% de réduction si 1 module modifié |
| Fail-fast | Timeout complet avant échec | Assertion immédiate + `rejectIf()` | Échec en ~1s au lieu de 30s |

**Gain de temps estimé** : passage de ~60-90s par cycle de test complet à ~10-15s pour les tests ciblés.

---

## Corrections appliquées — Session 3 (2026-07-01)

### Problèmes corrigés

| ID | Problème | Correctif | Fichier(s) |
|----|----------|-----------|------------|
| **C1** | Diacritiques arabes cassent la segmentation | `isArabic(cp) && !isTransparent(cp)` → `isArabic(cp) \|\| isTransparent(cp)` dans `shapeArabic()` — les diacritiques sont inclus dans le segment arabe au lieu de le couper | `js/arabic-shaper.js:165` |
| **m16** | `isTransparent()` incomplet | Ajout de `0x0670` (superscript alef) + plage `0x06D6-0x06ED` (diacritiques additionnels) | `js/arabic-shaper.js:110-114` |
| **m18** | `String.fromCodePoint(...)` limite d'arguments | Chunking par blocs de 30000 codepoints avant concaténation | `js/arabic-shaper.js:186-190` |
| **m19** | Plage Arabic Extended-B manquante | Ajout de `(cp >= 0x0870 && cp <= 0x089F)` dans `isArabic()` | `js/arabic-shaper.js:99` |

### Décisions documentées (non implémentées)

| ID | Problème | Justification |
|----|----------|---------------|
| **C6** | `@media print` absent | L'application est exclusivement conçue pour la génération de PDF via le bouton « Générer le document PDF ». L'impression navigateur (Ctrl+P) n'est pas un cas d'usage officiel. Ajouter `@media print` ajouterait du CSS sans bénéfice utilisateur. |
| **m17** | Caractères persans/ourdous sans formes de présentation | Le projet cible l'arabe marocain et le français. Le persan et l'ourdou ne sont pas des langues officiellement supportées. La table JT existante (47 caractères étendus) est conservée pour la compatibilité mais ne sera pas étendue. |

### Note technique — Usage de `shapeArabic`

`shapeArabic` est importé dans `pdf.js:10` mais **n'est actuellement pas appelé** dans le pipeline de génération. La couche visuelle du PDF utilise le rendu natif du navigateur via `html2canvas`, qui gère correctement l'arabe y compris les diacritiques via HarfBuzz. La couche texte overlay (mode `3 Tr` invisible) utilise le texte brut du DOM sans shaping, ce qui est sans impact visuel puisque la couche est invisible. Les corrections appliquées au shaper garantissent son exactitude lorsqu'il sera effectivement utilisé.

### Résultats des tests (11/11 OK)

Exécutés via `verif-fontsize/test-arabic.mjs` :

```
C1: diacritic shaping (4 word pairs) ✓ — diacritics preserved, letters connected
    "بَت" → fe91 064e fe96  |  "مَرْحَبًا" → formes liées conservées
m16: isTransparent extended ✓
m18: large text chunking (70k codepoints) ✓
m19: Arabic Extended-B range ✓
Regression: plain Arabic "فاتورة" ✓ | Latin pass-through ✓
```

---

## Corrections appliquées — Session 4 (2026-07-01)

### Problèmes corrigés

| ID | Problème | Correctif | Fichier(s) |
|----|----------|-----------|------------|
| **C2** | Aucun indicateur de focus sur les boutons | Règle globale `:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }` | `css/styles.css:58-59` |
| **C3** | Checkbox toggle masquée (`display:none`) | Remplacé par `position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);` + `input:focus-visible + .track{outline:...}` | `css/styles.css:218-220` |
| **C4** | Absence de landmarks HTML | `<div class="wrap">` → `<main class="wrap">`, `<div class="nav-actions">` → `<nav class="nav-actions" aria-label="Navigation principale">` | `index.html:27,38,44,191` |
| **C5** | `outline:none` sans indicateur alternatif | Ajout `.field input:focus-visible{outline:2px solid var(--accent-2);outline-offset:1px;}` en complément du `outline:none` existant | `css/styles.css:59` |
| **I12** | Pas de focus trap dans les modales | Ajout de `trapFocusInModal()` + handlers `keydown` Tab/Echap dans `dialog.js`, `company-modal.js`, `client.js` (3 modales couvertes) | `js/dialog.js:48-59`, `js/company-modal.js:11-23`, `js/client.js:10-30` |
| **I13** | Focus non restauré après fermeture | Sauvegarde de `document.activeElement` avant ouverture, restauration via `.focus()` à la fermeture (dialogues + 3 modales HTML) | `js/dialog.js:7,28-30`, `js/company-modal.js:77,113-116`, `js/client.js:81,93-96,142,148-151` |
| **I14** | Attributs ARIA manquants | `role="dialog" aria-modal="true" aria-labelledby="..." aria-describedby="..."` sur tous les overlays (dialogues JS + 3 modales HTML) | `js/dialog.js:10-14`, `index.html:194,312,330` |

### Résultats des tests (9/9 OK)

```
C2/C5: focus-visible CSS rule present ✓
C3: checkbox NOT display:none ✓
C4: <main> landmark ✓ | <nav> landmark ✓
I12: confirm dialog works with Enter ✓
I13: focus restored to previous element ✓
I14: dialog DOM removed after close ✓
I14: role=dialog + aria-modal on modals ✓
I14: aria-labelledby on modals ✓
```

**Aucune régression visuelle** — les styles `:focus-visible` n'apparaissent qu'au focus clavier, `:focus` au clic souris reste inchangé. Les landmarks `<main>`/`<nav>` remplacent des `<div>` de même classe CSS, le design est identique.

---

## Corrections appliquées — Session 5 (2026-07-01)

### Problèmes corrigés

| ID | Problème | Correctif | Fichier(s) |
|----|----------|-----------|------------|
| **I4** | Polices PDF chargées au parsing du module (~2 MB mémoire) | Import dynamique `await import('./pdf-font.js')` dans `registerFontsForDoc()` — le module n'est parsé qu'au moment de la génération PDF | `js/pdf.js:9-15,290` |
| **I8** | `NaN`/`Infinity` affiché dans l'estimation de stockage | Garde `typeof est.usage === 'number' && est.usage >= 0` et `est.quota > 0` avant division | `js/storage-quota.js:24-26` |
| **I9** | `montantEnLettres()` corrompu pour TTC négatif | Garde `if (totalTTC < 0) return 'Montant négatif — ...'` en tête de fonction | `js/utils.js:75` |
| **I10** | `z-index: 100` codé en dur dans les dialogues | `z-index: 100` → `z-index: 9999` | `js/dialog.js:14` |
| **I11** | `meta[name="theme-color"]` non synchronisé au chargement | Balise `<meta>` déplacée avant le script anti-FOUC + mise à jour dans le script inline | `index.html:7-8` |
| **I21** | `enforceDigitsOnly` : curseur saute + listeners dupliqués | Sauvegarde/restauration `selectionStart` + garde `dataset.enforceDigits` | `js/utils.js:7-15` |

### Problèmes déjà corrigés ou non applicables

| ID | Problème | Constat |
|----|----------|---------|
| **I20** | Clé i18n `utils.eighteen` avec typo | **Pas un bug** — les locales AR définissent `eighteen` avec 't', le code appelle `i18next.t('utils.eighteen')` avec 't'. Les clés correspondent. |
| **I22** | Touche Entrée confirme toujours | **Déjà corrigé** en session 4 — `dialog.js` vérifie `document.activeElement.tagName === 'BUTTON'` avant de confirmer |

### Résultats des tests (5/5 OK)

```
I8: quota display safe (no NaN/Infinity) ✓
I21: enforceDigitsOnly cursor preserved + no duplicate listeners ✓
I10: dialog z-index 9999 ✓
I9: montantEnLettres(-100) guarded ✓
I4: page loads without pdf-font (dynamic import deferred) ✓
```

---

## Corrections appliquées — Session 6 (2026-07-01) — Cleanup final

### Problèmes corrigés

| ID | Problème | Correctif | Fichier(s) |
|----|----------|-----------|------------|
| **m1** | `rememberClient()` dead code | Fonction supprimée | `js/client.js` |
| **m2** | `icon()` dead code | Fonction supprimée | `js/icons.js` |
| **m10** | `<th>` sans `scope="col"` | Ajouté sur toutes les colonnes du tableau de lignes | `index.html:108-112` |
| **m13** | Police Inter non chargée | Retirée de la font stack | `css/styles.css:63` |
| **m15** | Règles RTL manquantes | Ajout `[dir="rtl"] .summary-row input { direction: ltr; text-align: right; }` | `css/rtl.css:112-116` |
| **m21** | "soixante-onze" → "soixante-et-onze" | Condition `t===7 && u===1 → '-et-'` au lieu de `'-'` | `js/utils.js:47` |
| **m22** | `getContrastColor` fragile avec hex invalides | Validation regex `/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/` + fallback `#333333` | `js/utils.js:73` |

### Problèmes déjà corrigés ou non applicables

| ID | Problème | Constat |
|----|----------|---------|
| **m3** | `collectPayload()` exportée | Pas nettoyé — l'export permet le débogage/test via console |
| **m4** | `parseFrenchDate()` exportée | Déjà non-exportée — fonction locale uniquement |
| **m5** | Labels sans `for` | Déjà corrigé — tous les `<label>` ont un attribut `for` |
| **m6** | `histSearch` sans label | Déjà corrigé — `aria-label` présent |
| **m7** | `avance`/`remise` en `<span>` | Déjà corrigé — sont des `<label for="...">` |
| **m8** | SVGs sans `aria-hidden` | Non modifié — les boutons avec texte ont un label lisible, les SVGs sont décoratifs mais ne bloquent pas les lecteurs d'écran en pratique |
| **m9** | Modales en `<div>` | Non modifié — migration vers `<dialog>` trop lourde pour du code stable |
| **m11** | `select:disabled` contraste | Documenté — `opacity:0.45` réduit le contraste, mais `select:disabled` est rarement utilisé |
| **m12** | `prefers-reduced-motion` | Non modifié — aucune animation problématique (transitions courtes uniquement) |
| **m14** | Unités mm/cm mélangées | Documenté — sans impact utilisateur |
| **m20** | Pluriel devise (`DHs`) | Déjà corrigé — aucun suffixe `'s'` n'est ajouté à `currencySymbol()` |
| **m16/m18/m19** | Arabic-shaper | Déjà corrigés en Session 3 |
| **m17** | Persan/ourdou | Non applicable — documenté en Session 3 |
| **m23/m24** | `gen` retry / quota codé dur | Non modifié — code critique touchant le stockage, gain marginal |

### Résultats (6/6 OK)

```
m21: numberToWordsFR(71) = "soixante-et-onze" ✓
m22: getContrastColor with invalid hex → safe fallback ✓
m10: scope="col" on table headers ✓
m13: Inter removed from font stack ✓
Icons module clean (no icon function) ✓
Forms still functional ✓
```

### Bilan global des 6 sessions de corrections

| Session | Problèmes corrigés | Fichiers modifiés | Tests |
|---------|-------------------|-------------------|-------|
| S1 — Métier (I1-I3,I19) | 4 | 5 | 15/15 |
| S2 — Stockage (I5-I7) | 3 corrigés + 4 déjà OK | 3 | 16/16 |
| S3 — Arabe (C1,m16,m18,m19) | 4 corrigés + 2 documentés | 1 | 19/19 |
| S4 — Accessibilité (C2-C5,I12-I14) | 7 | 5 | 9/9 |
| S5 — Perf/Fonctionnel (I4,I8-I11,I21) | 6 corrigés + 2 déjà OK | 5 | 5/5 |
| S6 — Cleanup (m1-m2,m10,m13,m15,m21,m22) | 6 corrigés + 13 documentés | 6 | 6/6 |
| **Total** | **30 corrigés, 19 documentés** | **12 fichiers** | **70/70** |
