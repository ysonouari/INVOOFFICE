# INVOOFFICE — AGENTS.md

> Source de vérité unique pour les agents IA (opencode, Claude Code, etc.).
> Mis à jour en continu. Ne pas créer de nouveau fichier d'audit à la racine.

---

## Résumé

**INVOOFFICE** — Application SaaS de facturation 100% client-side pour entrepreneurs marocains.
Crée des devis, factures, bons de livraison et avoirs en PDF conformes DGI.
Stack : JavaScript ES modules, Supabase (auth), html2canvas + jsPDF (PDF), localStorage/IndexedDB/OPFS (stockage), PWA (Service Worker), Vercel (déploiement).

---

## Architecture

| Couche | Technologie | Détail |
|---|---|---|
| **Frontend** | ES modules natifs, sans bundler | `js/` (19 modules), `modules/` (auth, admin, landing) |
| **Auth** | Supabase | RLS, rate limiting client-side + honeypot |
| **Stockage** | localStorage (source) + IndexedDB (miroir) + OPFS (PDF/images) | `fb_company`, `fb_history`, `fb_clients` |
| **PDF** | html2canvas (capture) + jsPDF (assembly) | Double couche : JPEG fond + texte vectoriel invisible |
| **PWA** | Service Worker | Cache-first assets, skip cross-origin (CDN loads natively), precache 61 fichiers |
| **i18n** | i18next | FR/AR avec RTL |
| **CSS** | Design tokens (variables) | Dark/light mode, pas de couleur hardcodée |
| **Tests** | Playwright 1.61 | 116 specs, config dans `tests/playwright.config.ts` |

---

## État actuel réel (2026-08-12)

| Métrique | Valeur | Source |
|---|---|---|
| **Prix officiel** | **300 DH** (paiement unique, accès à vie) | |
| **Tests Playwright** | **121/121 passent** | Dernier run complet (ajout 10 tests historique + correction toggle headerActive) |
| **Bugs P0** | **0** | Tous corrigés (cf. `docs/audit/P0_FIX_REPORT.md`) |
| **Bugs P1** | **3** mineurs : duplication `esc()` admin, import mort `signOut`, export mort `renderClientList` | `docs/audit/EXCELLENCE_AUDIT.md` |
| **Score global** | **8.5/10** | Dernier audit d'excellence |
| **npm audit** | 0 vulnérabilité | |
| **Métriques PDF** | Scale 2 (192 DPI) / Scale 3 (288 DPI), overlay invisible searchable, `generatePDF()` + `reprintHistoryDoc()` unifiés | `docs/audit/DECISION_VECTOR_TEXT_AR.md` |

---

## Règles "NE PAS CASSER"

### PDF
- **Phase PDF stabilisée** — Ne pas modifier le pipeline sans nouvelle étude (cf. `docs/audit/DECISION_VECTOR_TEXT_AR.md`)
- **Tolérance pagination** : `> 0.5` mm (pas `> 0`) — évite les pages blanches intempestives causées par les arrondis html2canvas
- **Qualité PDF** : `company.pdfQuality` — `2` = Standard (~192 DPI, défaut), `3` = Qualité Pro (~288 DPI). Configurable dans "Mes Informations" > "Qualité du PDF"
- **Polices** : Tajawal en base64 dans `js/pdf-font.js` (4 variantes), enregistrées via VFS jsPDF
- **Overlay texte** : utilisé par `generatePDF()` **et** `reprintHistoryDoc()` via les helpers communs `prepareTextElements()` + `writePageTextOverlay()`
- **Mode BL** : `showTotalsDefault: true`
- **Mode exonéré** : `getRegimeConfig('exoneree')` → pas de HT ni TVA
- **`#pdf-stage`** : positionné à `left:-99999px` (LTR) ou `right:-99999px` (RTL)

### Storage
- **localStorage = source de vérité**, IndexedDB = backup. Ne pas inverser
- **Clés** : `fb_company`, `fb_history`, `fb_clients`, `fb_lang`, `fb_theme`
- **`fb_company.pdfQuality`** : `2` (défaut) ou `3` — résolution d'export PDF
- **OPFS** : `facturation/pdfs/` et `facturation/header.png`
- **Mutex historique** : `withHistoryLock()` sérialise les écritures — ne pas contourner

### i18n / RTL
- **`letter-spacing`** : supprimé en RTL (arabe) — `[dir="rtl"] .pdf-title { letter-spacing: normal }`
- **Direction** : `document.documentElement.dir` = `rtl` pour arabe, `ltr` sinon
- **Cache busting** : `Date.now()` sur les locales — les fichiers JSON ne sont PAS en cache SW

### Tests
- **Commande** : `npm test` (alias `npx playwright test --config=tests/playwright.config.ts`)
- **Auth** : `tests/auth.setup.ts` crée la session → `tests/.auth/user.json`
- **Config** : `tests/playwright.config.ts` — `fullyParallel: false`, `workers: 4`

### Déploiement
- **Vercel** : `vercel.json` — rewrites `/`→`landing.html`, `/app`→`app.html`, `/admin`→`admin/index.html`, `/confirmation`→`confirmation/index.html`
- **CSP** : `script-src 'unsafe-inline'` nécessaire pour le inline theme script (anti-FOUC)

---

## Commandes utiles

```bash
npm install          # installer les dépendances
npm start            # lancer le serveur (port 3000)
npm test             # lancer les 116 tests Playwright
npm run dev          # alias de start
npx playwright test --config=tests/playwright.config.ts --headed  # mode debug
```

---

## Structure clé

```
js/           → 19 modules (cœur métier : pdf, storage, history, lines, client...)
modules/      → auth, admin, landing, shared
css/          → styles.css (design tokens), fonts.css, rtl.css
tests/        → 27 specs Playwright (116 tests)
docs/         → documentation technique
docs/audit/   → audits (les plus récents font autorité)
docs/archive/ → audits historiques (peuvent être périmés — vérifier la date)
assets/fonts/ → Tajawal .ttf (4 variantes)
icons/        → icônes PWA (5 PNG)
supabase/     → config, migrations, scripts admin
```

---

## Règle de maintenance

Toute correction, tout audit, toute nouvelle information sur l'état du projet doit **mettre à jour CE fichier directement**, pas créer un nouveau fichier .md à la racine. Les rapports détaillés ponctuels vont dans `docs/audit/`. Les archives historiques vont dans `docs/archive/`.

Si un fichier devient obsolète (ex: test count ou score périmé), le déplacer dans `docs/archive/` plutôt que de le laisser dans `docs/audit/` où il pourrait être confondu avec l'état actuel.
