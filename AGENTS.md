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
| **Tests Playwright** | **117/117 passent** | Dernier run complet (pagination PDF réelle par page A4 + test multi-pages) |
| **Bugs P0** | **0** | Tous corrigés (cf. `docs/audit/P0_FIX_REPORT.md`) |
| **Bugs P1** | **3** mineurs : duplication `esc()` admin, import mort `signOut`, export mort `renderClientList` | `docs/audit/EXCELLENCE_AUDIT.md` |
| **Score global** | **8.5/10** | Dernier audit d'excellence |
| **npm audit** | 0 vulnérabilité | |
| **Métriques PDF** | Scale 2 (192 DPI) / 3 (288 DPI) / 3.125 (300 DPI), pagination HTML réelle (1 `.pdf-page` = 1 page A4), overlay invisible searchable, `renderPagesToPdf()` unifie `generatePDF()` + `reprintHistoryDoc()` | `docs/audit/DECISION_VECTOR_TEXT_AR.md` |

---

## Règles "NE PAS CASSER"

### PDF
- **Phase PDF stabilisée** — Ne pas modifier le pipeline sans nouvelle étude (cf. `docs/audit/DECISION_VECTOR_TEXT_AR.md`)
- **Pagination** : **1 `.pdf-page` HTML = 1 page A4** (hauteur fixe 297 mm, `overflow:hidden`). Le contenu est paginé **avant** html2canvas (`buildPages()`), chaque page porte son propre fond d'en-tête et son propre footer. html2canvas capture **page par page**, jsPDF reçoit **1 image = 1 page** (`addImage(img, 0, 0, 210, 297)`).
- **Zone de sécurité footer** : `SAFETY_MM = 8` mm réservés avant le footer (via `padding-bottom:8mm` sur `.pdf-content`). Détection de débordement : `scrollHeight > clientHeight` (jamais soustraire la marge dans la comparaison — `scrollHeight` est borné inférieurement par `clientHeight`).
- **Bloc final insécable** : totaux + montant en lettres + conditions + note dans un nœud DOM unique `.pdf-final-block`, déplacé en tant que nœud (pas de manipulation de chaînes).
- **Polices** : mesurer les hauteurs **après** `await document.fonts.ready` (Tajawal `font-display:swap`).
- **Qualité PDF** : `company.pdfQuality` — `2` = Standard (~192 DPI, défaut), `3` = Qualité Pro (~288 DPI), `3.125` = Impression (300 DPI). Configurable dans "Mes Informations" > "Qualité du PDF"
- **Polices** : Tajawal en base64 dans `js/pdf-font.js` (4 variantes), enregistrées via VFS jsPDF
- **Overlay texte** : utilisé par `generatePDF()` **et** `reprintHistoryDoc()` via le helper commun `renderPagesToPdf()` (helpers internes `prepareTextElements()` + `writePageOverlay()`)
- **Mode BL** : `showTotalsDefault: true`
- **Mode exonéré** : `getRegimeConfig('exoneree')` → pas de HT ni TVA
- **`#pdf-stage`** : positionné à `left:-99999px` (LTR) ou `right:-99999px` (RTL)

### Storage
- **localStorage = source de vérité**, IndexedDB = backup. Ne pas inverser
- **Clés** : `fb_company`, `fb_history`, `fb_clients`, `fb_lang`, `fb_theme`
- **`fb_company.pdfQuality`** : `2` (défaut), `3` ou `3.125` — résolution d'export PDF (192/288/300 DPI)
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
npm test             # lancer les 117 tests Playwright
npm run dev          # alias de start
npx playwright test --config=tests/playwright.config.ts --headed  # mode debug
```

---

## Structure clé

```
js/           → 19 modules (cœur métier : pdf, storage, history, lines, client...)
modules/      → auth, admin, landing, shared
css/          → styles.css (design tokens), fonts.css, rtl.css
tests/        → 28 specs Playwright (117 tests)
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
