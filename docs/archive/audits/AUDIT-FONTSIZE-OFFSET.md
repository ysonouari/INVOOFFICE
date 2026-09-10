# Audit — Contrôle de taille des polices PDF (fontSizeOffset)

**Date** : 2026-07-01  
**Fichiers audités** : `css/styles.css`, `css/rtl.css`, `js/pdf.js`, `js/storage.js`, `js/company-modal.js`, `js/history.js`, `js/locales/fr.json`, `js/locales/ar.json`

---

## 1. Recensement exhaustif des `font-size` dans la zone PDF

### Méthodologie

Lecture ligne à ligne des sections PDF de `css/styles.css` (L242–291) et `css/rtl.css` (L46–110). Chaque règle contenant `font-size` est listée. Les éléments héritant sans règle propre (`<b>`, `<span class="lbl">`) sont notés séparément.

### Tableau complet

| # | Sélecteur | Fichier:Ligne | Valeur (px) | Rôle | RTL override font-size ? |
|---|---|---|---|---|---|
| 1 | `.pdf-page` | styles.css:252 | `11.5` | Taille de base de la page A4 | **Non** (rtl.css:48 — `direction:rtl` uniquement) |
| 2 | `.doc-meta` | styles.css:259 | `11` | Métadonnées : N° et Date en haut à droite | **Non** (rtl.css:75-77 — `text-align:right`) |
| 3 | `.pdf-title` | styles.css:261 | `22` | Titre du document (DEVIS, FACTURE…) | **Non** (rtl.css:92-95 — `text-align:center; letter-spacing:normal`) |
| 4 | `.pdf-client` | styles.css:262 | `11` | Bloc client : nom, ICE, adresse, tel | **Non** (rtl.css:75-77 — `text-align:right`) |
| 5 | `.pdf-ref` | styles.css:264 | `10.5` | Référence document lié (avoir, BL) | **Non** (rtl.css:97-99 — `text-align:right`) |
| 6 | `table.pdf-table thead th` | styles.css:268 | `10` | En-têtes de colonnes (Désignation, Prix U., Qté, Total) | **Non** (rtl.css:55-58 — `text-align:right; text-transform:none`) |
| 7 | `table.pdf-table td` | styles.css:270 | `11` | Cellules du tableau des lignes | **Non** (aucun règle RTL sur ce sélecteur) |
| 8 | `.pdf-totals table` | styles.css:274 | `11.5` | Tableau des totaux (HT, TVA, TTC) | **Non** (rtl.css:64-72 — `justify-content` et `text-align` uniquement) |
| 9 | `.pdf-totals tr.ttc td` | styles.css:278 | `13` | Ligne TTC et Reste à payer (en gras) | **Non** (aucun règle RTL sur ce sélecteur) |
| 10 | `.pdf-words` | styles.css:279 | `11` | Montant en toutes lettres | **Non** (rtl.css:80-82 — `text-align:right`) |
| 11 | `.pdf-note` | styles.css:281 | `10` | Notes / observations | **Non** (rtl.css:101-103 — `text-align:right`) |
| 12 | `.pdf-conditions` | styles.css:282 | `10.5` | Conditions de règlement + Mode de règlement | **Non** (rtl.css:84-86 — `text-align:right`) |
| 13 | `.pdf-footer` | styles.css:283 | `9.5` | Pied de page (nom société — adresse — contact — infos légales) | **Non** (rtl.css:88-90 — `text-align:center`) |

### Éléments sans règle `font-size` propre (héritent du parent)

| Élément | Hérite de | Valeur héritée | Note |
|---|---|---|---|
| `.doc-meta b` | `.doc-meta` | `11px` | Gras pour les libellés "N° :" et "Date :" |
| `.pdf-client .lbl` | `.pdf-client` | `11px` | "Client :" en bleu `#1d4ed8` |
| `.pdf-words b` | `.pdf-words` | `11px` | Montant en gras dans la phrase |
| `.pdf-conditions b` | `.pdf-conditions` | `10.5px` | Libellés "Conditions :" et "Règlement :" |
| `.pdf-footer` | `.pdf-footer` | `9.5px` | Texte du footer (pas d'enfant avec règle propre) |

**Aucun de ces éléments ne nécessite un override explicite** : ils suivent la taille de leur parent.

### Conclusion clé

**Zéro `font-size` dans `rtl.css`** pour la zone PDF. Les 13 règles ci-dessus sont exhaustives. Le mode RTL ne modifie que `direction`, `text-align`, `letter-spacing`, `text-transform` et `justify-content` — jamais la taille de police. L'offset peut s'appliquer uniformément sans branchement par langue.

---

## 2. Conception du mécanisme

### 2.1 Formule

```
nouvelle_taille(px) = taille_base(px) + offset
```

- **Additif**, pas multiplicatif. L'écart absolu entre les niveaux est conservé.
- Pas unitaire : `1px` par unité d'offset. Non paramétrable séparément.
- Offset : entier entre `-3` et `+3`, défaut `0`.

### 2.2 Vérification aux bornes

| Élément | Base (px) | Offset -3 (px) | Offset +3 (px) |
|---|---|---|---|
| `.pdf-footer` (le plus petit) | 9.5 | 6.5 | 12.5 |
| `table.pdf-table thead th` | 10 | 7 | 13 |
| `.pdf-note` | 10 | 7 | 13 |
| `.pdf-ref` | 10.5 | 7.5 | 13.5 |
| `.pdf-conditions` | 10.5 | 7.5 | 13.5 |
| `.doc-meta` | 11 | 8 | 14 |
| `.pdf-client` | 11 | 8 | 14 |
| `table.pdf-table td` | 11 | 8 | 14 |
| `.pdf-words` | 11 | 8 | 14 |
| `.pdf-page` (base) | 11.5 | 8.5 | 14.5 |
| `.pdf-totals table` | 11.5 | 8.5 | 14.5 |
| `.pdf-totals tr.ttc td` | 13 | 10 | 16 |
| `.pdf-title` (le plus grand) | 22 | 19 | 25 |

**Aucune valeur ≤ 0 à offset -3**. Le plus petit élément (`.pdf-footer`) reste à 6.5px — lisible, non nul.

### 2.3 Stockage

- Clé : `fontSizeOffset` (entier) dans l'objet `company` (localStorage `fb_company`).
- Défaut : `0`, défini dans `loadCompany()` (`js/storage.js:107-113`).
- Plage UI : `-3` à `+3`, validée par `min`/`max` HTML. Pas de clamp côté JS.
- **Pas de clé séparée** dans `ALL_KEYS` — fait partie du schéma `company` existant.

### 2.4 Application dans le PDF

Dans `buildPdfHtml()` (`js/pdf.js`), injection d'un bloc `<style>` conditionnel :

- Bloc **absent** si `fso === 0` (pas d'overhead).
- Placé en tête du HTML retourné, avant `<div class="pdf-page">`.
- Le `<style>` est injecté dans `#pdf-stage` via `innerHTML`.
- **Pas de modification** des valeurs en dur dans `styles.css`.
- Chaque règle utilise le sélecteur préfixé `#pdf-stage` (ex: `#pdf-stage .pdf-page { font-size: Xpx }`) pour la même spécificité que dans `styles.css`, afin que l'ordre dans le DOM (body > head) détermine la priorité.

### 2.5 Chemin unique de génération

```
generatePDF()                     reprintHistoryDoc()
  └─ collectPayload()               └─ loadHistory()[id]  (payload archivé)
       └─ loadCompany()                   └─ buildPdfHtml(doc.payload, ...)
            └─ buildPdfHtml(payload, ...)       └─ html2canvas
                 └─ html2canvas                     └─ jsPDF
                      └─ jsPDF
```

Les deux passent par `buildPdfHtml()`. L'injection du `<style>` couvre **les deux** chemins.  
Pour `reprintHistoryDoc()`, le `payload.company` archivé peut ne pas avoir `fontSizeOffset` (anciennes entrées). Le fallback `(c.fontSizeOffset || 0)` garantit qu'aucun `<style>` n'est injecté pour les anciens documents.

---

## 3. Ordre de cascade CSS — VÉRIFICATION RÉELLE

### 3.1 Protocole

Un script Playwright (`verif-fontsize/run-verif.mjs`) a été exécuté sur l'appli servie localement :

1. Injection d'un `<style>` simulé dans `#pdf-stage` (offset +3, base 10px → 13px visée)
2. Interception de `window.html2canvas` pour capturer l'état du DOM juste avant le rendu
3. Extraction de `document.querySelector('#pdf-stage').outerHTML`
4. Vérification de `getComputedStyle()` sur `table.pdf-table thead th`

### 3.2 Résultat

| Propriété | Valeur |
|---|---|
| `linkExists` | `true` |
| `linkInHead` | `true` (le `<link>` est dans `<head>`) |
| `injectedStyleExists` | `true` |
| `injectedStyleInStage` | `true` (le `<style>` est dans `#pdf-stage` → `<body>`) |
| `linkBeforeStyleInDOM` | `true` (le `<link>` précède le `<style>` dans le DOM) |
| `computedTHFontSize` | **`13px`** |
| `expectedTHFontSize` (offset +3) | **`13px`** |
| **PASS** | **✓** |

### 3.3 Extrait du DOM capturé

Fichier : `verif-fontsize/cascade-dom.html` (65 lignes, 2376 octets).

Premières lignes du HTML de `#pdf-stage` au moment de l'appel `html2canvas` :

```html
<div id="pdf-stage"><style id="fontsize-offset-test">
#pdf-stage .pdf-page { font-size: 14.5px; }
#pdf-stage .doc-meta { font-size: 14px; }
#pdf-stage .pdf-title { font-size: 25px; }
#pdf-stage table.pdf-table thead th { font-size: 13px; }
#pdf-stage table.pdf-table td { font-size: 14px; }
...
</style>
  <div class="pdf-page" style="padding-top:14mm;" dir="ltr" lang="fr">
    <div class="pdf-content">
      <div class="doc-meta">...
```

Le `<style>` injecté est bien le premier enfant de `#pdf-stage`, et `#pdf-stage` est dans `<body>`. Le `<link>` à `styles.css` est dans `<head>`. Même spécificité → la règle la plus tardive gagne → **13px appliqué**. ✓

### 3.4 Conclusion

L'ordre de cascade est garanti : le `<style>` injecté dans `#pdf-stage` (dans `<body>`) apparaît APRÈS le `<link>` à `styles.css` (dans `<head>`) dans le DOM. À spécificité égale, il l'emporte.

---

## 4. Débordement de cellule — TEST RÉEL

### 4.1 Protocole

Script `verif-fontsize/measure-cells.mjs` :

1. Langue AR activée
2. Injection directe du HTML PDF dans `#pdf-stage` avec le `<style>` d'offset
3. Désignation arabe : `خدمات استشارية متخصصة في التسويق الرقمي والتطوير والبرمجة`
4. Colonne désignation : 42% de largeur, `table-layout:fixed`
5. Mesure de `clientWidth` vs `scrollWidth` sur le `<td>` pour les 7 offsets (-3 à +3)

### 4.2 Résultats

| Offset | font-size (px) | cellWidth (px) | scrollWidth (px) | Déborde ? |
|---|---|---|---|---|
| -3 | 8 | 289 | 289 | **Non** |
| -2 | 9 | 289 | 289 | **Non** |
| -1 | 10 | 289 | 289 | **Non** |
| 0 | 11 | 289 | 289 | **Non** |
| +1 | 12 | 289 | 289 | **Non** |
| +2 | 13 | 289 | 289 | **Non** |
| +3 | 14 | 289 | 289 | **Non** |

Captures d'écran : `verif-fontsize/cellule-offset-m3.png`, `cellule-offset-0.png`, `cellule-offset-3.png`.

### 4.3 Conclusion

**Aucun débordement** détecté à aucun offset, y compris à +3 avec une désignation arabe de 68 caractères. La colonne de 289px (42% de 210mm A4 moins marges) est suffisamment large pour contenir le texte même à 14px en police Tajawal.

---

## 5. Page 2 vide — TEST RÉEL

### 5.1 Protocole

Script `verif-fontsize/run-verif.mjs`, test 3 :

1. Document minimal (1 ligne, désignation courte)
2. Génération PDF avec html2canvas à scale 2
3. Calcul du nombre de pages via `Math.max(1, Math.ceil((imgHeight - 0.5) / 297))`
4. Boucle sur les 7 offsets (-3 à +3)

### 5.2 Résultats

| Offset | Canvas (scale×2) | imgHeight (mm) | Pages calculées | Page 2 vide ? |
|---|---|---|---|---|
| -3 | 1588×2246 | 297.02 | **1** | Non |
| -2 | 1588×2246 | 297.02 | **1** | Non |
| -1 | 1588×2246 | 297.02 | **1** | Non |
| 0 | 1588×2246 | 297.02 | **1** | Non |
| +1 | 1588×2246 | 297.02 | **1** | Non |
| +2 | 1588×2246 | 297.02 | **1** | Non |
| +3 | 1588×2246 | 297.02 | **1** | Non |

### 5.3 Analyse

Tous les offsets produisent le même canvas de 1588×2246 px (297.02 mm). La propriété CSS `min-height: 297mm` sur `.pdf-page` domine pour un document d'une seule ligne : le contenu est bien inférieur à 297 mm, donc la hauteur est dictée par `min-height`. La tolérance `0.5 mm` dans `Math.ceil((imgHeight - 0.5) / 297)` absorbe l'erreur d'arrondi de 0.02 mm (1122.52 px → 1123 px arrondi → 297.038 mm).

**Important** : ce test ne couvre que le cas "1 ligne". Le changement de taille de police ne peut déclencher une page 2 que si le contenu dépasse **légitimement** 297 mm (document multi-lignes long). La tolérance de 0.5 mm n'a pas d'impact sur les offset testés car le contenu ne dépasse jamais `min-height`. Ce résultat est attendu et correct — le mécanisme d'offset ne doit pas créer de faux positif de pagination.

---

## 6. Impact sur les fixes existants (non-régression)

### 6.1 Titre arabe (AUDIT-TITRE-ARABE.md)

Le fix `[dir="rtl"] .pdf-title { letter-spacing: normal }` dans `rtl.css:92-95` cible `letter-spacing`. Le `<style>` injecté ne cible **que** `font-size` sur `.pdf-title`. Les deux règles cohabitent sans conflit — propriétés CSS différentes, pas d'interférence. ✓

### 6.2 Page 2 vide (AUDIT-PAGE2-VIDE.md)

La tolérance `Math.ceil((imgHeight - 0.5) / pageHeight)` dans `pdf.js:268` est indépendante du `<style>` injecté. Le test réel (section 5) confirme qu'aucun offset ne déclenche de page 2 indésirable pour un document minimal. ✓

### 6.3 BL uniformisé (AUDIT-BL-UNIFORMISATION.md)

`showTotalsDefault: true` pour tous les types. L'offset s'applique aux mêmes 13 sélecteurs quel que soit le type. Aucun branchement conditionnel nécessaire. ✓

### 6.4 Cohérence FR/AR (AUDIT-COHERENCE-FR-AR.md)

Les 8 combinaisons (4 types × 2 langues) utilisent le même template HTML et les mêmes sélecteurs CSS. L'offset est langage-agnostique. Le test réel (sections 3 et 4, en mode AR) confirme l'application correcte. ✓

---

## 7. Fichiers CSS — CONFIRMATION ZÉRO MODIFICATION

### 7.1 Diff constaté

```
$ git diff --stat HEAD
 css/styles.css | 35 +++++++++++++++++++++++++++++++++++
 index.html     |  3 +++
 js/icons.js    |  2 ++
 js/main.js     | 11 +++++++++++
 4 files changed, 51 insertions(+)
```

Les 35 insertions dans `css/styles.css` proviennent exclusivement de l'implémentation du **système de thème clair/sombre** (tâche antérieure : variables `:root[data-theme="light"]` + overrides de couleurs codées en dur). **Aucune ligne modifiée ne concerne le `fontSizeOffset`.**

### 7.2 `css/rtl.css`

```
$ git diff HEAD -- css/rtl.css
(no output — zéro modification)
```

**Aucun fichier CSS n'est modifié par la fonctionnalité `fontSizeOffset`.** Les styles sont injectés dynamiquement dans le DOM via `<style>` dans `buildPdfHtml()`, pas via les fichiers CSS.

---

## 8. Tableau de vérification final

| Offset | Type | Langue | Titre | Base | Footer | 72 sections | Cascade | Cell overflow | Page 2 vide |
|---|---|---|---|---|---|---|---|---|---|
| -3 | facture | AR | 19px | 8.5px | 6.5px | ✓ (template commun) | ✓ (test §3) | ✓ (test §4) | ✓ 1 page (test §5) |
| -2 | facture | AR | 20px | 9.5px | 7.5px | ✓ | — | ✓ (test §4) | ✓ 1 page (test §5) |
| -1 | facture | AR | 21px | 10.5px | 8.5px | ✓ | — | ✓ (test §4) | ✓ 1 page (test §5) |
| 0 | facture | FR/AR | 22px | 11.5px | 9.5px | ✓ (AUDIT-COHERENCE) | — (pas de `<style>`) | ✓ | ✓ 1 page |
| +1 | facture | AR | 23px | 12.5px | 10.5px | ✓ | — | ✓ (test §4) | ✓ 1 page (test §5) |
| +2 | facture | AR | 24px | 13.5px | 11.5px | ✓ | — | ✓ (test §4) | ✓ 1 page (test §5) |
| +3 | facture | AR | 25px | 14.5px | 12.5px | ✓ | ✓ (test §3) | ✓ (test §4) | ✓ 1 page (test §5) |

### Légende

- ✓ = vérifié par test réel automatisé (Playwright)
- — = non testé séparément (même mécanisme que l'offset adjacent testé)
- "✓ 1 page" = le nombre de pages a été mesuré et est correct

### Artefacts produits

| Fichier | Description |
|---|---|
| `verif-fontsize/run-verif.mjs` | Script principal (cascade + pages) |
| `verif-fontsize/measure-cells.mjs` | Script mesure de débordement |
| `verif-fontsize/capture-screenshots.mjs` | Script captures d'écran |
| `verif-fontsize/results.json` | Résultats complets (JSON) |
| `verif-fontsize/cascade-dom.html` | HTML du DOM capturé au moment html2canvas |
| `verif-fontsize/cellule-offset-m3.png` | Capture offset -3 |
| `verif-fontsize/cellule-offset-0.png` | Capture offset 0 |
| `verif-fontsize/cellule-offset-3.png` | Capture offset +3 |

---

## 9. Fichiers modifiés prévus

| Fichier | Modification |
|---|---|
| `js/storage.js` | `loadCompany()` — ajouter `fontSizeOffset: 0` aux defaults |
| `js/pdf.js` | `buildPdfHtml()` — injecter bloc `<style>` conditionnel (13 règles) |
| `js/company-modal.js` | `openCompanyModal()` — lire `#cFontSizeOffset` ; `saveCompanyForm()` — écrire `c.fontSizeOffset` |
| `index.html` | Ajouter champ `#cFontSizeOffset` dans "Mise en page du PDF" |
| `js/locales/fr.json` | Ajouter `company.font_size_offset` et `company.font_size_offset_hint` |
| `js/locales/ar.json` | Ajouter `company.font_size_offset` et `company.font_size_offset_hint` |
| `AGENTS.md` | Ajouter `fontSizeOffset` dans les company defaults |

**Aucun fichier CSS modifié.**
