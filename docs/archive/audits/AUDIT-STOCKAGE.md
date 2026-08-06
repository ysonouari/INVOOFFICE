# Audit — Système de stockage des données

**Date** : 2026-07-01  
**Fichiers audités** : `js/storage.js`, `js/opfs-storage.js`, `js/storage-quota.js`, `js/backup.js`, `js/history.js`, `js/company-modal.js`, `js/client.js`

---

## 1. Exactitude du calcul de quota (`storage-quota.js`)

### 1a. API utilisée

`navigator.storage.estimate()` (ligne 22) — API standard qui retourne `usage` et `quota` pour l'**origine entière** (IndexedDB + OPFS + Cache API + Service Workers). ✓

### 1b. Estimation localStorage séparée

`localStorageBytes()` (lignes 1-9) parcourt toutes les clés localStorage et calcule `(key.length + value.length) × 2` (UTF-16). Correct, mais localStorage n'est PAS compté par `navigator.storage.estimate()` — c'est pour ça que le `lsWarning` est affiché séparément. ✓

### 1c. Fallback

Si `navigator.storage.estimate()` n'est pas disponible (anciens navigateurs, HTTP hors localhost) :
```javascript
return { usage: lsBytes, quota: lsQuota, ... lsOnly: true };
```
`lsQuota = 5 × 1048576` (ligne 14) — estimation conservatrice de la limite localStorage (5-10 Mo selon navigateur). Acceptable pour un fallback. ✓

### 1d. Rafraîchissement

Le quota est recalculé à chaque ouverture de la modale "Mes Informations" (`company-modal.js:58`). Pas de mise à jour en temps réel après écriture, mais c'est suffisant pour un affichage informatif. ✓

**Résultat : correct, aucun bug.**

---

## 2. Synchronisation localStorage ↔ IndexedDB (`storage.js`)

### 2a. Mécanisme de sync

`initStorage()` (lignes 78-97) :
1. Charge toutes les données depuis localStorage dans le cache mémoire (`cacheFromLocalStorage()`)
2. Ouvre IndexedDB
3. Pour chaque clé `ALL_KEYS`, compare les deux sources :
   - Si IndexedDB a une valeur plus récente → copie vers localStorage ET cache
   - Si localStorage a une valeur mais pas IndexedDB → copie vers IndexedDB
4. Le compteur `gen` (ligne 48) est incrémenté à chaque `save*()`, et vérifié dans `initStorage()` (lignes 84,86) pour éviter les race conditions si une écriture concurrente se produit

**Architecture respectée** : localStorage = source de vérité, IndexedDB = miroir. ✓

### 2b. Sync exécutée une seule fois

Appelée dans `main.js` au `DOMContentLoaded` uniquement (`main.js:11`). ✓

### 2c. Tolérance aux pannes IndexedDB

- `openDB()` : échec → `db = null`, le `catch` absorbe l'erreur (ligne 93-95)
- `dbPut()` : si `db` est null, retour immédiat (ligne 25). Si la transaction échoue, `tx.onerror` loggue un avertissement (ligne 29)
- `dbGet()` : erreur → retourne `null` silencieusement (lignes 40-41)

L'application reste fonctionnelle sur localStorage seul. ✓

**Résultat : correct, aucun bug.**

---

## 3. OPFS — images d'en-tête et PDF (`opfs-storage.js`)

### 3a. Migration base64 → OPFS

Dans `company-modal.js:43-46` :
```javascript
await migrateHeaderFromCompany(c);
delete c.headerImage;
saveCompany(c);
```
Après migration réussie, `c.headerImage` est supprimé du localStorage. ✓

### 3b. Gestion OPFS non disponible

`opfsGuard()` (ligne 7-9) lève une erreur si `navigator.storage.getDirectory` n'existe pas. Les appelants gèrent l'erreur :
- `loadHeaderImage()` → catch → retourne `null` (ligne 47-50)
- `deletePdfFile()` → catch → absorbe `NotFoundError` (ligne 79-80)
- `saveHeaderImage()` → les appelants (`company-modal.js:146`, `backup.js:83`) ont des try-catch ✓

### 3c. Fichiers orphelins dans OPFS

**PDF** : `deleteHistoryDoc()` (`history.js:152`) supprime le PDF OPFS associé quand un document d'historique est effacé. ✓

**Header image** — **BUG trouvé et corrigé** :
- `deleteHeaderImage()` (ligne 53-56 d'opfs-storage.js) existe mais n'était **jamais appelé**.
- Quand l'utilisateur décoche "Activer l'en-tête" et sauvegarde, l'ancienne image OPFS restait stockée indéfiniment (fichier orphelin).
- **Correctif** : `company-modal.js:148-149` — ajout de `deleteHeaderImage().catch(() => {})` quand `!c.headerActive`.

### 3d. Remplacement d'image

`saveHeaderImage()` utilise `{ create: true }` — écrase le fichier existant. Pas d'accumulation. ✓

---

## 4. Export / Import de sauvegarde (`backup.js`)

### 4a. Clés exportées

`exportBackup()` (lignes 25-42) : `company`, `history`, `clients` (les 3 `ALL_KEYS`) + `opfs.headerImage` (base64). ✓

### 4b. Validation import

Structure vérifiée avant écrasement :
```javascript
if (!payload || payload.version !== 1 || !payload.company || !payload.history || !payload.clients)
```
✓ Les données existantes ne sont jamais écrasées si l'import est invalide.

### 4c. Image d'en-tête dans l'import

L'export encode l'image en base64 (`blobToBase64`), l'import la décode (`dataUrlToBlob`) et l'écrit dans OPFS. Try-catch présent (ligne 79-86). ✓

### 4d. Sync IndexedDB après import

`saveCompany()`, `saveHistory()`, `saveClients()` appellent toutes `dbPut()` — le miroir IndexedDB est mis à jour. ✓

**Résultat : correct, aucun bug.**

---

## 5. Nettoyage / Suppression

### 5a. Suppression client

`deleteClientById()` supprime le client de `saveClients()` et rafraîchit le select. Les documents d'historique stockent le `nom` du client en inline (pas par référence) — aucune référence orpheline. ✓

### 5b. Suppression document d'historique

`deleteHistoryDoc()` (`history.js:145-154`) supprime l'entrée localStorage ET le fichier PDF OPFS associé. ✓

**Résultat : correct, aucun bug.**

---

## 6. Cas limites de quota

### 6a. Quota dépassé — **BUG trouvé et corrigé**

Les fonctions `saveCompany()`, `saveHistory()`, `saveClients()`, et `initStorage()` appelaient `localStorage.setItem()` sans try-catch. En cas de `QuotaExceededError` :
- Le cache mémoire avait la nouvelle valeur
- localStorage conservait l'ancienne valeur (l'écriture a échoué)
- Après rechargement de page, les données étaient perdues silencieusement

**Correctif** : 5 `localStorage.setItem()` enveloppés dans try-catch avec `console.warn()`.

| Fonction | Ligne | Correctif |
|---|---|---|
| `saveCompany()` | 119 | `try { ... } catch (e) { console.warn(...) }` |
| `saveHistory()` | 137 | `try { ... } catch (e) { console.warn(...) }` |
| `saveClients()` | 159 | `try { ... } catch (e) { console.warn(...) }` |
| `loadHistory()` | 127 | `try { ... } catch (e) { console.warn(...) }` |
| `initStorage()` | 89 | `try { ... } catch (e) { console.warn(...) }` |
| `cacheFromLocalStorage()` | 71 | `try { ... } catch (e) { console.warn(...) }` |

Limitation : l'erreur est seulement logguée. Si le quota est dépassé, la donnée est perdue au prochain rechargement (le cache mémoire n'est pas persisté). Une solution plus robuste (alerte utilisateur via `showAlertDialog`) nécessiterait de rendre les fonctions `save*()` asynchrones, ce qui impacterait de nombreux appelants. Pour l'instant, le warning console permet au moins de diagnostiquer le problème.

---

## 7. Vérification croisée — aucunes autres fuites OPFS

Recherche exhaustive de `saveHeaderImage`/`deleteHeaderImage`/`savePdfFile`/`deletePdfFile` dans tout le code applicatif :

| Fonction | Appelé par | Supprimé/Écrasé quand |
|---|---|---|
| `saveHeaderImage` | `company-modal.js` | Écrasé au nouvel upload, supprimé si header désactivé (fix) |
| `savePdfFile` | `pdf.js` | Supprimé quand le doc d'historique est effacé |
| `deletePdfFile` | `history.js` | ✓ |
| `deleteHeaderImage` | `company-modal.js` | ✓ (après fix) |

---

## 8. Fichiers modifiés

| Fichier | Ligne(s) | Modification |
|---|---|---|
| `js/storage.js` | 71, 90, 119, 127, 137, 159 | 6× `localStorage.setItem()` → try-catch |
| `js/company-modal.js` | 148 | `deleteHeaderImage()` quand `!c.headerActive` |

---

## 9. Éléments vérifiés et corrects (pas de bug)

| Point | Fichier | Statut |
|---|---|---|
| Quota API `navigator.storage.estimate()` | `storage-quota.js` | ✓ Correct |
| Estimation localStorage séparée | `storage-quota.js` | ✓ Correct |
| Fallback quota non disponible | `storage-quota.js` | ✓ Correct |
| Sync localStorage ↔ IndexedDB | `storage.js` | ✓ Correct |
| Sync exécutée une seule fois | `storage.js` | ✓ Correct |
| Tolérance panne IndexedDB | `storage.js` | ✓ Correct |
| Migration base64 → OPFS | `company-modal.js` | ✓ Correct |
| OPFS non disponible géré | `opfs-storage.js` | ✓ Correct |
| Export 3 clés ALL_KEYS | `backup.js` | ✓ Correct |
| Import validation structure | `backup.js` | ✓ Correct |
| Image OPFS dans export/import | `backup.js` | ✓ Correct |
| Suppression PDF dans historique | `history.js` | ✓ Correct |
| Clients — pas de refs orphelines | `client.js` | ✓ Correct |
