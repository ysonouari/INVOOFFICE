# Audit — Titre arabe corrompu dans le PDF généré

**Date** : 2026-07-01  
**Auteur** : Audit automatique  
**Fichier analysé** : `facturation/js/pdf.js` (pipeline PDF)

---

## 1. Origine du titre "فاتورة"

Le titre est généré dans `buildPdfHtml()` à la ligne 154 :

```javascript
<div class="pdf-title">${i18next.t('docTypes.' + cfg.i18nKey)}</div>
```

Il est injecté dans le DOM (élément `#pdf-stage`), puis capturé par un **unique appel `html2canvas(pageEl)`** à la ligne 251, qui englobe l'intégralité de la `.pdf-page`. Le titre fait partie du même canvas que le reste du document.

---

## 2. Vérification des appels `pdf.text()`

Il n'existe qu'**un seul** appel `pdf.text()` dans tout le fichier `pdf.js`, à la ligne 306 :

```javascript
pdf.text(el.text, x, pdfY, {
  align: align,
  maxWidth: align === 'left' ? el.w_mm : undefined,
  isRTL: useRtl,
});
```

Cet appel est situé à l'intérieur d'une boucle qui itère sur **tous** les éléments texte collectés par `collectTextElements()`, y compris le titre (sélecteur `.pdf-title`). Le fix `3 Tr` (mode invisible) entoure cette boucle aux lignes 275 et 312 :

```javascript
pdf.internal.write('3 Tr');    // ligne 275 — active le mode invisible
// ... boucle de tous les textes, titre inclus ...
pdf.internal.write('0 Tr');    // ligne 312 — restaure le mode normal
```

**Conclusion : le fix `3 Tr` a bien été appliqué à tous les appels `pdf.text()`, titre inclus. Ce n'est pas un oubli de la couche texte overlay.**

---

## 3. Le problème est dans la couche canvas (html2canvas), pas dans la couche texte overlay

Le titre affiche "فـلك ورة" au lieu de "فاتورة". Comme la couche overlay est invisible (`3 Tr`), elle ne peut pas causer de corruption visuelle. La corruption vient donc du **canvas généré par html2canvas**.

La cause racine est la propriété CSS `letter-spacing` appliquée à `.pdf-title` :

```css
/* styles.css ligne 201 */
.pdf-title {
  text-align: center;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: .05em;   /* <-- PROBLÈME */
  margin: 6px 0 18px;
}
```

`letter-spacing` insère un espace forcé entre chaque glyphe. Sur du texte arabe, cela **casse l'algorithme de shaping contextuel HarfBuzz** : les lettres ne peuvent plus se connecter, le moteur de rendu sélectionne les mauvaises formes contextuelles (isolées au lieu de liées), et le texte apparaît comme des caractères disjoints — exactement le symptôme "فـلك ورة".

Aucun autre élément du PDF n'utilise `letter-spacing`, ce qui explique pourquoi **seul le titre** est corrompu alors que le reste du document arabe fonctionne parfaitement :

| Élément | `letter-spacing` | Arabe correct ? |
|---------|:---:|:---:|
| `.pdf-title` | `0.05em` | ✗ Corrompu |
| `.doc-meta` | — | ✓ Correct |
| `.pdf-client` | — | ✓ Correct |
| `table.pdf-table` | — | ✓ Correct |
| `.pdf-totals` | — | ✓ Correct |
| `.pdf-words` | — | ✓ Correct |
| `.pdf-footer` | — | ✓ Correct |

---

## 4. Pipeline de rendu confirmé

```
buildPdfHtml()
  └─> injecte le HTML complet dans #pdf-stage
       └─> html2canvas(pageEl) capture TOUT (titre + corps) en UN seul canvas
            └─> pdf.addImage(canvas)  ← couche visuelle (affectée par letter-spacing)
            └─> pdf.internal.write('3 Tr')
                 └─> pdf.text(...) pour chaque élément, titre inclus  ← couche invisible (OK)
                 └─> pdf.internal.write('0 Tr')
```

Il n'y a **pas** de `html2canvas` séparé pour le header. Il n'y a **pas** de cache ou d'asset pré-généré. Tout passe par le même pipeline.

---

## 5. Correctif appliqué

Dans `css/rtl.css`, ajout de `letter-spacing: normal` au sélecteur `[dir="rtl"] .pdf-title` :

```css
/* rtl.css ligne 89-92 */
[dir="rtl"] .pdf-title {
  text-align: center;
  letter-spacing: normal;   /* ← FIX : annule le letter-spacing en mode arabe */
}
```

Ce correctif est cohérent avec le pipeline existant : il ne modifie pas l'architecture, il corrige uniquement le rendu canvas du titre en supprimant la propriété CSS incompatible avec l'arabe. Le `letter-spacing` reste actif pour les documents français (LTR).

---

## 6. Test isolé

Un test a été effectué en générant le HTML avec le titre "فاتورة" en mode RTL. Les propriétés CSS calculées confirment que `letter-spacing` est bien à `normal` en mode RTL, et le rendu canvas est désormais correct.

**Résultat** : "فاتورة" s'affiche correctement — lettres connectées, formes contextuelles appropriées, aucun caractère parasite.
