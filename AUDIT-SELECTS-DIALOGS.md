# Audit — Style des selects et remplacement des boîtes natives `confirm()`/`alert()`

**Date** : 2026-07-01  
**Fichiers modifiés** : `css/styles.css`, `css/rtl.css`, `js/dialog.js` (nouveau), `js/pdf.js`, `js/history.js`, `js/client.js`, `js/backup.js`, `js/locales/fr.json`, `js/locales/ar.json`

---

## 1. Diagnostic — Selects

### 1a. Recensement des `<select>` dans l'application

| ID | Emplacement | Contenu |
|---|---|---|
| `docType` | Formulaire principal | 4 types de document |
| `docStatus` | Formulaire principal | Brouillon / Final |
| `clientSelect` | Formulaire principal | Liste des clients |
| `cDevise` | Modale « Mes Informations » | Devise (DH/EUR/USD) |
| `cRegimeTva` | Modale « Mes Informations » | Régime TVA |

Tous sont dans des `<div class="field">` (le style `.field select` s'applique).

### 1b. Style existant avant correction

```css
/* styles.css:34 — uniquement la police */
input,select,textarea{font-family:inherit;}

/* styles.css:86-91 — fond, bordure, couleur (via background shorthand) */
.field input,.field select,.field textarea{
  width:100%;background:var(--panel-2);border:1px solid var(--border);
  color:var(--text);border-radius:var(--radius);padding:10px 12px;...
}
```

Le `background:` shorthand (`styles.css:87`) écrasait implicitement toute `background-image` définie ailleurs, empêchant l'affichage d'une flèche custom. Résultat : flèche et options héritaient du style natif du navigateur (fond blanc, flèche noire).

---

## 2. Correctif — Style custom des selects

### 2a. Nouvelle règle globale `select` (`styles.css`)

```css
select{
  -webkit-appearance:none;
  -moz-appearance:none;
  appearance:none;
  background-image:url("data:image/svg+xml,..."); /* chevron SVG gris */
  background-repeat:no-repeat;
  background-position:right 10px center;
  background-size:16px 16px;
  padding-right:32px;
  cursor:pointer;
}
select option{
  background:var(--panel);
  color:var(--text);
}
select:disabled{
  opacity:.45;
  cursor:not-allowed;
}
```

Le chevron utilise la couleur `var(--muted)` (`#94a3b8`) encodée dans l'URL SVG.

### 2b. Correction de la cascade — `background` → `background-color`

Deux règles utilisaient `background:` shorthand, qui écrasait le `background-image:`. Remplacé par `background-color:` :

```css
/* styles.css:87 — .field select */
background-color:var(--panel-2);

/* styles.css:103 — table.lines select */
background-color:var(--panel-2);
```

### 2c. RTL — flèche à gauche (`rtl.css`)

```css
[dir="rtl"] select {
  background-position: left 10px center;
  padding-right: 12px;
  padding-left: 32px;
}
```

### 2d. Vérification

| Propriété | LTR (FR) | RTL (AR) |
|---|---|---|
| `appearance` | `none` | `none` |
| Background SVG | ✓ | ✓ |
| Arrow position | `calc(100% - 10px)` (droite) | `10px` (gauche) |
| Padding arrow side | `12px` droite | `32px` gauche |

**Limite technique** : le style des `<option>` dans le menu déroulé dépend partiellement de l'OS/navigateur. Les règles `option { background, color }` fonctionnent sur Chromium/Edge mais peuvent être ignorées sur Firefox/Safari.

---

## 3. Diagnostic — Boîtes natives `confirm()`/`alert()`

### 3a. Recensement

| Fichier | Ligne | Type | Usage |
|---|---|---|---|
| `history.js` | 35 | `alert` | Document orphelin |
| `history.js` | 145 | `confirm` | Supprimer document |
| `client.js` | 63 | `alert` | Nom client requis |
| `client.js` | 139 | `confirm` | Supprimer client |
| `backup.js` | 62 | `alert` | JSON invalide |
| `backup.js` | 67 | `alert` | Structure invalide |
| `backup.js` | 71 | `confirm` | Confirmer import |
| `backup.js` | 87 | `alert` | Import réussi |
| `pdf.js` | 222 | `alert` | Client non sélectionné |
| `pdf.js` | 226 | `alert` | Aucune ligne |
| `pdf.js` | 230 | `alert` | Désignation vide |

**11 appels** : 7 `alert()`, 4 `confirm()`.

### 3b. Limite des boîtes natives

`window.confirm()` et `window.alert()` sont rendues par le navigateur **en dehors du DOM**. Impossible de les styliser en CSS.

---

## 4. Correctif — Modale de confirmation custom

### 4a. Nouveau fichier `js/dialog.js`

Deux fonctions exportées :

```javascript
// Alerte simple — bouton OK, pas de valeur de retour
showAlertDialog(message) → Promise<void>

// Confirmation — boutons OK/Annuler, retourne true/false
showConfirmDialog(message) → Promise<boolean>
```

Caractéristiques :
- Overlay z-index:100 (au-dessus des modales existantes, z-index:50)
- Clavier : Échap = Annuler, Entrée = Confirmer
- Traductions via i18n : `dialog.ok`, `dialog.cancel`, `dialog.confirm_title`
- `white-space: pre-wrap` pour les messages multi-lignes
- Styles inline cohérents avec le dark theme (design tokens CSS)
- Nettoyage automatique du DOM après fermeture

### 4b. Clés i18n ajoutées

```json
// fr.json + ar.json
"dialog": {
  "ok": "OK" / "حسناً",
  "cancel": "Annuler" / "إلغاء",
  "confirm_title": "Confirmation" / "تأكيد"
}
```

### 4c. Remplacement des appels

Tous les `window.confirm()`/`window.alert()` remplacés par `await showConfirmDialog()`/`await showAlertDialog()`. Fonctions rendues `async` quand nécessaire :

| Fichier | Fonction modifiée | Changement |
|---|---|---|
| `pdf.js` | `generatePDF()` | 3 `alert` → `await showAlertDialog` |
| `history.js` | `saveToHistory()` | `alert` → `await showAlertDialog` + `async` |
| `history.js` | `deleteHistoryDoc()` | `confirm` → `await showConfirmDialog` + `async` |
| `client.js` | `saveClientForm()` | `alert` → `await showAlertDialog` + `async` |
| `client.js` | `deleteClientById()` | `confirm` → `await showConfirmDialog` + `async` |
| `backup.js` | `importBackup()` | 3 `alert` + 1 `confirm` → `await` (déjà `async`) |

### 4d. Vérification

| Test | Résultat |
|---|---|
| Alert OK button | Résout `undefined` |
| Confirm OK button | Résout `true` |
| Confirm Cancel button | Résout `false` |
| RTL (arabe) | Direction `rtl`, bouton "حسناً" |
| DOM nettoyage | Overlay retiré après fermeture |

---

## 5. Fichiers modifiés

| Fichier | Modification |
|---|---|
| `css/styles.css` | Nouveau bloc `select` (chevron SVG), `background` → `background-color` |
| `css/rtl.css` | `[dir="rtl"] select` (flèche à gauche) |
| `js/dialog.js` | **Nouveau** — `showAlertDialog` / `showConfirmDialog` |
| `js/pdf.js` | 3 `alert` → `await showAlertDialog` |
| `js/history.js` | 2 appels → await + async |
| `js/client.js` | 2 appels → await + async |
| `js/backup.js` | 4 appels → await |
| `js/locales/fr.json` | Clés `dialog.*` |
| `js/locales/ar.json` | Clés `dialog.*` |

---

## 6. Limites techniques

- **Style des `<option>`** : le fond et la couleur sont appliqués via CSS mais peuvent être ignorés selon le navigateur/OS (Firefox sur macOS ignore `option { background }`). Le comportement est amélioré sur Chromium/Edge.
- **Modale de confirmation** : contrairement au `confirm()` natif qui bloque l'exécution JavaScript, la version custom est asynchrone (Promise). Les fonctions appelantes doivent utiliser `await`.
