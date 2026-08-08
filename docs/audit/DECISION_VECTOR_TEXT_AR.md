# DÉCISION TECHNIQUE : Texte visible vectoriel + shaping arabe

> **Date** : 2026-08-08  
> **Verdict** : **NO-GO** — Pas d'implémentation maintenant  
> **Portée** : `js/pdf.js`, `js/history.js`, architecture PDF

---

## Question étudiée

« Peut-on remplacer le texte visible JPEG par du texte vectoriel visible dans le PDF, tout en conservant un shaping arabe identique à celui du navigateur ? »

## Contexte

Le pipeline PDF actuel fonctionne ainsi :

```
HTML/CSS → #pdf-stage (Tajawal, RTL)
    ↓
Navigateur shape l'arabe (HarfBuzz/Uniscribe)
    ↓
html2canvas(scale:2 ou 3) → JPEG
    ↓
overlay texte invisible (3 Tr) → PDF searchable
```

Le texte arabe visible est rasterisé (JPEG). Le texte vectoriel existe en overlay invisible uniquement pour la searchability.

## Solutions étudiées

| Solution | Shaping arabe | Complexité | Taille dépendance | Verdict |
|---|---|---|---|---|
| **harfbuzzjs** (HarfBuzz WASM) | ✅ Parfait (identique navigateur) | 🔴 Très élevée | +1.2 Mo | Techniquement possible |
| **opentype.js** | ⚠️ Partiel (pas de lam-alef, pas de GPOS) | 🟡 Moyenne | ~120 KB | Insuffisant |
| **jsPDF natif** | ❌ Formes isolées uniquement | ✅ Aucune | 0 | Inacceptable |
| **pdf-lib** | ❌ Même limitation que jsPDF | 🟡 Moyenne | ~300 KB | Inacceptable |

## Seule solution viable : harfbuzzjs

HarfBuzz WASM est **le même moteur de shaping que le navigateur**. Il produirait des glyphes identiques.

**MAIS** la chaîne complète est complexe :

```
Unicode → BiDi → HarfBuzz → GSUB/GPOS → Glyphes → Paths → PDF
              ↑                                  ↑
         blocage 1                          blocage 2
```

1. **BiDi** : HarfBuzz ne gère pas le BiDi — nécessite un pré-traitement JavaScript ou l'utilisation de `Intl.Segmenter`
2. **Glyphes → Paths** : La conversion est lente (~0.1-0.5 ms/glyphe) et produit des PDFs volumineux
3. **Searchability** : Les paths ne sont pas du texte → l'overlay invisible actuel doit être maintenu

## Pourquoi NO-GO

| Facteur | Impact |
|---|---|
| Poids applicatif | +1.2 Mo WASM → double le poids total |
| Performance | 2-3× plus lent que le pipeline actuel |
| Taille PDF | +75-100% (paths vs JPEG) |
| Complexité | 2-4 semaines de développement estimées |
| Risque régression | Élevé (positionnement, BiDi, chemins, pagination) |
| Bénéfice utilisateur | Faible — le JPEG 288 DPI couvre déjà 99% des usages |
| Tests | 116/116 passent actuellement — toute modification les menace |

## Architecture cible documentée (futur)

Si un jour le projet nécessite cette évolution, la piste technique est :

```
harfbuzzjs pour le shaping → glyphes/paths pour le rendu vectoriel
    +
overlay invisible (3 Tr) pour la searchability
    +
jsPDF natif pour le texte français/latin
```

## Pipeline PDF actuel — Stabilisé

```
                    INVOOFFICE PDF
                          │
              ┌───────────┴───────────┐
              │                       │
         Rendu visible           Texte PDF
              │                       │
        html2canvas              Overlay 3 Tr
              │                       │
        JPEG scale 2/3          searchable
              │                       │
              └───────────┬───────────┘
                          ↓
                     PDF final
```

- Scale 2 : ~192 DPI (Standard, défaut)
- Scale 3 : ~288 DPI (Qualité Pro)
- Tajawal 4 variantes
- Shaping arabe parfait (navigateur)
- RTL complet
- PDF searchable (overlay)
- Réimpression searchable
- 116/116 tests

## Conclusion

Le texte vectoriel arabe est **techniquement possible** avec harfbuzzjs.  
Le rapport coût/bénéfice ne le justifie **pas aujourd'hui**.

Le pipeline actuel est **stable, testé et optimal** pour le cas d'usage cible (facturation marocaine).
