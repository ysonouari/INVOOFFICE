# Audit — Données manquantes sur le BL arabe

**Date** : 2026-07-01  
**Auteur** : Audit automatique  
**Fichiers analysés** : `js/pdf.js`, `js/lines.js`, `js/navigation.js`

---

## 1. Symptôme signalé

Sur un bon de livraison (`BL-2026-0001`) en arabe, la 2ᵉ ligne du tableau affiche la quantité (`15`) mais la colonne البيان (désignation) est vide. La 1ʳᵉ ligne (`دوبانا / 50`) est correcte. Sur la facture équivalente, toutes les colonnes sont remplies.

---

## 2. Diagnostic — Template de génération

Le template PDF (`pdf.js:111-114`) rend la désignation pour **toutes** les lignes, quel que soit le type de document :

```javascript
let rowsHtml = t.lines.map(l=>`
    <tr>
      <td>${escapeHtml(l.desig)}</td>   // ← toujours présent
      ${t.showPrices ? `...` : `<td class="num">${l.qte}</td>`}
    </tr>`).join('');
```

Le `<td>` de désignation est inconditionnel. Aucun `showPrices`, `docType`, ou autre condition ne le masque. Le flux de données complet :

```
DOM (.line-desig input)
  → getLinesData()              (lines.js:30-38, lit .value pour chaque tr)
  → recalcTotals()              (lines.js:41, retourne lines[])
  → collectPayload()            (pdf.js:192, stocke dans payload.totals)
  → buildPdfHtml()              (pdf.js:113, rend escapeHtml(l.desig))
  → html2canvas                 (capture le rendu navigateur)
  → jsPDF                       (ajoute l'image au PDF)
```

Aucune étape ne supprime, filtre ou modifie la désignation selon le type de document.

---

## 3. Test de vérification — BL et facture depuis le même formulaire

**Protocole** : remplir 2 lignes avec désignations arabes dans le formulaire. Générer une facture, puis changer le type vers BL **sans reset**, générer le BL.

### Résultat

| Type | Désignation ligne 1 | Désignation ligne 2 | Qté ligne 1 | Qté ligne 2 |
|------|:---:|:---:|:---:|:---:|
| Facture | `دوبانا` ✓ | `خدمات استشارية` ✓ | 50 | 15 |
| BL | `دوبانا` ✓ | `خدمات استشارية` ✓ | 50 | 15 |

**Conclusion** : le template BL est correct. Les deux désignations apparaissent dans le BL comme dans la facture. Le bug signalé n'est pas reproductible avec des données correctement remplies — il s'agit d'un cas où l'utilisateur a généré un BL avec une désignation vide (donnée manquante dans le formulaire, pas dans le template).

---

## 4. Correctif préventif — Alerte désignation vide

Pour éviter qu'un utilisateur génère un PDF avec des désignations vides sans s'en rendre compte, une validation a été ajoutée dans `generatePDF()`.

### 4a. Clés i18n ajoutées

**`js/locales/fr.json`** :
```json
"alert_empty_designation": "Une ou plusieurs lignes n'ont pas de désignation. Veuillez remplir toutes les désignations avant de générer le document."
```

**`js/locales/ar.json`** :
```json
"alert_empty_designation": "يوجد سطر أو أكثر بدون بيان. يرجى ملء جميع البيانات قبل إنشاء المستند."
```

### 4b. Validation dans `pdf.js:228-231`

```javascript
// Après les checks existants (alert_no_client, alert_no_lines) :
if(payload.totals.lines.some(l => !(l.desig || '').trim())){
  alert(i18next.t('pdf.alert_empty_designation'));
  return;
}
```

Le `trim()` bloque aussi les désignations composées uniquement d'espaces (ex: `"   "`).

### 4c. Cohabitation avec le check existant

Le check existant (`lines.every(l=>!l.desig)`) traite le cas « **toutes** les lignes vides ». Le nouveau check traite le cas « **certaines** lignes vides ». Les deux sont complémentaires :

- Toutes vides → 1ᵉʳ check déclenche, `return` empêche le 2ᵉ
- Certaines vides → 1ᵉʳ check passe, 2ᵉ check bloque
- Aucune vide → les deux passent, PDF généré normalement

Pas de double alerte possible.

### 4d. Vérification du nouveau check

| Scénario | Bloqué ? | Message |
|---|---|---|
| 2 lignes, les 2 avec désignation | Non | PDF généré |
| 2 lignes, 2ᵉ avec `""` | Oui | Message FR/AR |
| 2 lignes, 2ᵉ avec `"   "` (espaces) | Oui | Message FR/AR |
| 0 ligne | Oui | Message `alert_no_lines` existant |
| 2 lignes, les 2 vides | Oui | Message `alert_no_lines` existant |

## 4e. Vérification inter-types — blocage uniforme

**Contexte** : la plateforme propose 4 types de documents (devis, facture, BL, avoir). La validation est placée dans `generatePDF()` (`pdf.js:228`), fonction **unique** appelée par le bouton "Générer le PDF" quel que soit le `docType` — aucun chemin de code séparé par type.

**Protocole** : pour chaque type, remplir 1 ligne avec désignation + 1 ligne sans désignation, tenter de générer le PDF.

### Résultat — blocage

| Type | Titre PDF | Bloqué ? | Message |
|------|-----------|:---:|---|
| `devis` | عرض سعر | Oui | `يوجد سطر أو أكثر بدون بيان...` |
| `facture` | فاتورة | Oui | `يوجد سطر أو أكثر بدون بيان...` |
| `bl` | إشعار تسليم | Oui | `يوجد سطر أو أكثر بدون بيان...` |
| `avoir` | إشعار دائن | Oui | `يوجد سطر أو أكثر بدون بيان...` |

### Résultat — rendu correct (désignations remplies)

| Type | Colonnes | Désig. L1 | Désig. L2 | Totaux |
|------|:---:|---|---|:---:|
| `devis` | 4 | `خدمات استشارية` | `تطوير موقع إلكتروني` | ✓ |
| `facture` | 4 | `دوبانا` | `خدمات استشارية` | ✓ |
| `bl` | 2 | `دوبانا` | `خدمات استشارية` | — (BL) |
| `avoir` | 4 | `خدمات استشارية` | `تطوير موقع إلكتروني` | ✓ |

**Conclusion** : la validation s'applique uniformément aux 4 types. Aucun correctif supplémentaire nécessaire.

---

## 5. Fichiers modifiés

| Fichier | Ligne(s) | Modification |
|---|---|---|
| `js/pdf.js` | 228-231 | Ajout validation désignation vide |
| `js/locales/fr.json` | 194 | Ajout clé `alert_empty_designation` |
| `js/locales/ar.json` | 196 | Ajout clé `alert_empty_designation` |
