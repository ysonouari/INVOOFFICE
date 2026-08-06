# Audit — Cohérence FR/AR des sections par type de document

**Date** : 2026-07-01  
**Auteur** : Audit automatique  
**Fichiers analysés** : `js/pdf.js`, `js/locales/fr.json`, `js/locales/ar.json`

---

## 1. Symptôme signalé

Bon de livraison français (`BL-2026-0003`) : pas de section Conditions/Mode de paiement.
Bon de livraison arabe (`BL-2026-0001`) : section Conditions/Mode de paiement présente.

---

## 2. Diagnostic

### 2a. Template — identique pour les deux langues

La section conditions est générée dans `buildPdfHtml()` (`pdf.js:182-185`) **sans aucune condition de langue ou de docType** :

```javascript
${(payload.conditions || payload.modeReglement) ? `
  <div class="pdf-conditions">
    ${payload.conditions ? `<div>...</div>` : ''}
    ${payload.modeReglement ? `<div>...</div>` : ''}
  </div>` : ''}
```

La section s'affiche si et seulement si `conditions` **ou** `modeReglement` est non-vide dans le payload.

### 2b. Source des données — DOM form

`collectPayload()` (`pdf.js:210-211`) lit les champs du formulaire :

```javascript
conditions: document.getElementById('conditions').value,
modeReglement: document.getElementById('modeReglement').value,
```

Ces champs sont les mêmes quel que soit le docType ou la langue. Aucune discrimination langagière n'existe dans le code.

### 2c. Cause de la divergence

La divergence FR/AR sur le BL est **purement data-driven** : le champ `conditions` et/ou `modeReglement` était rempli dans le formulaire arabe mais vide dans le formulaire français au moment de la génération.

Scénarios possibles :
- Le BL français a été créé via « Nouveau Document » (qui appelle `resetForm()` → vide `conditions` et `modeReglement`)
- Le BL arabe a été édité depuis l'historique (qui charge les données sauvegardées)
- L'utilisateur n'a tout simplement pas rempli les champs en français

---

## 3. Vérification — matrice complète 4 types × 2 langues

Chaque combinaison testée avec `conditions = "Paiement comptant"` et `modeReglement = "Virement"`.

| Type | Langue | DocMeta | Client | Ref | Table | Cols | Totaux | Words | Conditions | Notes | Footer |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Devis | FR | ✓ | ✓ | ✓ | ✓ | 4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Facture | FR | ✓ | ✓ | ✓ | ✓ | 4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| BL | FR | ✓ | ✓ | ✓ | ✓ | 2 | — | — | ✓ | ✓ | ✓ |
| Avoir | FR | ✓ | ✓ | ✓ | ✓ | 4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Devis | AR | ✓ | ✓ | ✓ | ✓ | 4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Facture | AR | ✓ | ✓ | ✓ | ✓ | 4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| BL | AR | ✓ | ✓ | ✓ | ✓ | 2 | — | — | ✓ | ✓ | ✓ |
| Avoir | AR | ✓ | ✓ | ✓ | ✓ | 4 | ✓ | ✓ | ✓ | ✓ | ✓ |

**Aucune différence structurelle entre FR et AR pour un même type.** Les seules variations sont légitimes (BL : 2 colonnes au lieu de 4, pas de totaux, pas de montant en lettres — dû à `showTotalsDefault: false` dans la config).

---

## 4. Correctif mineur — div `.pdf-conditions` vide

L'ancien code rendait toujours `<div class="pdf-conditions"></div>`, même quand les deux champs étaient vides :

```javascript
// Avant — div toujours présente, vide si pas de données
<div class="pdf-conditions">
  ${payload.conditions ? ... : ''}
  ${payload.modeReglement ? ... : ''}
</div>
```

**Fix** : la div wrapper est maintenant conditionnelle, comme `.pdf-note` l'est déjà :

```javascript
// Après — div absente si les deux champs sont vides
${(payload.conditions || payload.modeReglement) ? `
  <div class="pdf-conditions">
    ${payload.conditions ? ... : ''}
    ${payload.modeReglement ? ... : ''}
  </div>` : ''}
```

**Vérification** :

| conditions | modeReglement | Div `.pdf-conditions` | Contenu |
|---|---|:---:|---|
| `""` | `""` | Non | — |
| `"Paiement comptant"` | `""` | Oui | الشروط: Paiement comptant |
| `""` | `"Virement"` | Oui | الدفع: Virement |
| `"Paiement comptant"` | `"Virement"` | Oui | Les deux |

---

## 5. Fichiers modifiés

| Fichier | Ligne | Modification |
|---|---|---|
| `js/pdf.js` | 182-185 | Div `.pdf-conditions` conditionnelle (cohérente avec `.pdf-note`) |

---

## 6. Conclusion

Le template PDF produit une **structure identique** pour tous les types de documents, quelle que soit la langue. La divergence FR/AR signalée était due à des données différentes dans le formulaire (conditions non remplies en français), pas à un bug de code.
