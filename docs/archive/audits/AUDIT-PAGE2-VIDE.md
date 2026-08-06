# Audit — Page 2 vide générée dans le PDF

**Date** : 2026-07-01  
**Auteur** : Audit automatique  
**Fichier analysé** : `facturation/js/pdf.js`

---

## 1. Symptôme

Le PDF généré produit **2 pages** alors que tout le contenu tient sur **1 page**.
- Page 1 : contenu complet et correct
- Page 2 : entièrement blanche

Le bug se manifeste même avec un document minimal (1 ligne d'article).

---

## 2. Cause racine

### Ligne responsable

`pdf.js:262` — calcul du nombre de pages :

```javascript
const totalPages = Math.ceil(imgHeight / pageHeight);
```

### Violation d'une règle documentée

Le fichier `AGENTS.md` (lignes 78-79) documentait explicitement ce cas :

> *html2canvas at scale 2 rounds canvas dimensions to integers. A 0.1mm height discrepancy between canvas and A4 (297mm) can trigger a second page.*

Et la règle associée :

> *Pagination tolerance: Use `> 0.5` (not `> 0`) in PDF page-splitting loop.*

### Mécanisme exact

```
Élément CSS       : 210 × 297 mm → 793.7 × 1122.5 px (96 dpi)
Rendu navigateur  : 794 × 1123 px (arrondi aux entiers)
html2canvas ×2    : 1588 × 2246 px

imgHeight PDF     : 2246 × 210 / 1588 = 297.038 mm
Math.ceil(297.038 / 297) = Math.ceil(1.00013) = 2  ← page 2 créée pour 0.038 mm
```

`html2canvas` à `scale: 2` double les dimensions en pixels entiers. Une page A4 de 297 mm fait 1122.52 px à 96 dpi, arrondi à 1123 px par le navigateur. La conversion px → mm produit `297.038 mm`, soit **0.038 mm de trop**. `Math.ceil()` sans tolérance interprète ce dépassement submétrique comme une deuxième page.

---

## 3. Origine de la régression

Le code original utilisait une boucle `while` avec tolérance :

```javascript
// Code original
let heightLeft = imgHeight;
pdf.addImage(...);
heightLeft -= pageHeight;
while (heightLeft > 0.5) {   // ← tolérance de 0.5 mm
  pdf.addPage();
  pdf.addImage(...);
  heightLeft -= pageHeight;
}
```

Une réécriture ultérieure a remplacé la boucle `while` par une boucle `for` plus lisible, mais a perdu la tolérance :

```javascript
// Réécriture (bug)
const totalPages = Math.ceil(imgHeight / pageHeight);   // ← tolérance 0 mm
for (let p = 0; p < totalPages; p++) { ... }
```

---

## 4. Correctif appliqué

**Fichier** : `facturation/js/pdf.js`, ligne 262

**Avant** :
```javascript
const totalPages = Math.ceil(imgHeight / pageHeight);
```

**Après** :
```javascript
const totalPages = Math.max(1, Math.ceil((imgHeight - 0.5) / pageHeight));
```

### Justification de la valeur 0.5 mm

| Dépassement | `(h - 0) / 297` | `(h - 0.5) / 297` | Comportement |
|---|---:|---:|---|
| 0.04 mm (arrondi) | 1.0001 → **2 pages** | 0.998 → **1 page** | Bug corrigé |
| 0.6 mm (réel) | 1.002 → **2 pages** | 1.0003 → **2 pages** | Pagination conservée |
| 297 mm (pleine page) | 2.000 → **2 pages** | 1.998 → **2 pages** | Pagination conservée |
| 297.5 mm | 2.002 → **3 pages** | 2.000 → **2 pages** | Limite acceptable |

La marge de 0.5 mm est :
- **Suffisamment grande** pour absorber l'erreur d'arrondi navigateur (~0.04 mm à 0.1 mm selon DPI)
- **Suffisamment petite** pour ne jamais « fusionner » deux vraies pages (jamais d'écart proche des 297 mm d'une page complète)

---

## 5. Vérifications

### Check n°1 — Document minimal (1 ligne)
| État | Résultat |
|---|---|
| Avant fix | 2 pages (page 2 vide) |
| Après fix | 1 page |

### Check n°2 — Document long (multi-pages légitime)
La tolérance de 0.5 mm ne masque pas une vraie pagination :

| Lignes | Hauteur estimée | Pages avant | Pages après |
|---|---:|---:|---:|
| 1 | ~297 mm | 2 | **1** |
| 15 | ~590 mm | 2 | 2 |
| 30 | ~880 mm | 3 | 3 |
| 45 | ~1180 mm | 4 | 4 |

### Check n°3 — Indépendance du fix titre arabe
| Fix | Fichier | Couche | Mécanisme |
|---|---|---|---|
| Titre arabe | `rtl.css:91` | Rendu canvas | `letter-spacing: normal` |
| Page 2 vide | `pdf.js:262` | Pagination jsPDF | Tolérance `Math.ceil()` |

Les deux fixes agissent sur des couches **orthogonales** du pipeline (`CSS → canvas` vs `canvas → PDF`). Aucune interférence possible.
