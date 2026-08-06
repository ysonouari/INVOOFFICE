# Audit — Uniformisation du bon de livraison avec les autres types

**Date** : 2026-07-01  
**Fichier modifié** : `js/config.js`

---

## 1. Contexte

Les 4 types de documents avaient une incohérence : devis, facture et avoir affichaient prix/TVA/totaux/montant en lettres, mais le bon de livraison (BL) n'affichait que désignation et quantité.

---

## 2. Cause

Le flag `showTotalsDefault` dans `js/config.js` était à `false` pour le type `bl` :

```javascript
bl: { ..., showTotalsDefault: false, ... }
```

Ce flag est utilisé à 5 endroits dans `pdf.js` pour masquer conditionnellement :
- Les colonnes Prix U. et Total dans le tableau (`pdf.js:114,168,173`)
- La section totaux HT/TVA/TTC (`pdf.js:118`)
- Le montant en toutes lettres (`pdf.js:132`)

Et dans `lines.js:70` pour masquer les lignes de résumé dans l'UI du formulaire.

---

## 3. Correction

```diff
- bl: { ..., showTotalsDefault: false, ... }
+ bl: { ..., showTotalsDefault: true, ... }
```

Une seule ligne modifiée (`js/config.js:4`).

---

## 4. Vérification — BL en FR et AR

| Section | FR (avant) | FR (après) | AR (après) |
|---|:---:|:---:|:---:|
| Désignation / البيان | ✓ | ✓ | ✓ |
| Prix U. / ثمن الوحدة | ✗ | ✓ | ✓ |
| Qté / الكمية | ✓ | ✓ | ✓ |
| Total ligne / المجموع | ✗ | ✓ | ✓ |
| Total HT / المجموع الجزافي | ✗ | ✓ | ✓ |
| TVA / الضريبة | ✗ | ✓ | ✓ |
| Total TTC / المجموع الكلي | ✗ | ✓ | ✓ |
| Montant en lettres | ✗ | ✓ | ✓ |
| Conditions / الشروط | ✓ | ✓ | ✓ |
| Mode de paiement / الدفع | ✓ | ✓ | ✓ |

**Le BL affiche désormais exactement les mêmes sections que devis/facture/avoir.** Seul le titre (`Bon de livraison` / `إشعار تسليم`) et le préfixe de numérotation (`BL-`) le distinguent.

---

## 5. Impact sur le code existant

| Fichier | Utilisation de `showPrices` | Impact |
|---|---|---|
| `lines.js:70` | Masque les lignes résumé dans l'UI | S'affichent désormais pour BL |
| `history.js:25,46` | Affiche `totalTTC` dans l'historique | S'affiche désormais pour BL ; les anciennes entrées (sans prix) restent `null` — aucune erreur |
| `pdf.js` (5 occurrences) | Colonnes, totaux, mots | Tout s'affiche désormais pour BL |

Aucun autre code ne dépendait de `showTotalsDefault: false` pour le BL. Aucune régression.

---

## 6. Fichiers modifiés

| Fichier | Ligne | Modification |
|---|---|---|
| `js/config.js` | 4 | `showTotalsDefault: false` → `true` pour `bl` |
