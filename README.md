# INVOOFFICE

> Facturation intelligente pour entrepreneurs marocains — Devis, Factures, Bons de livraison, Avoirs en PDF. Conforme DGI. Accès à vie, sans abonnement.

[![Tests](https://img.shields.io/badge/tests-106%2F106%20passing-brightgreen)](tests/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-ready-purple)](manifest.json)

---

## Présentation

**INVOOFFICE** est une application 100 % client-side de facturation pour les entrepreneurs marocains. Créez des documents professionnels conformes à la réglementation marocaine en quelques clics.

- **Aucun serveur backend** : tout fonctionne dans votre navigateur
- **Données locales** : vos informations restent sur votre appareil (localStorage + IndexedDB + OPFS)
- **PDF vectoriel** : texte sélectionnable et recherchable, polices intégrées
- **Paiement unique** : 200 DH, accès à vie, pas d'abonnement

---

## Fonctionnalités

- 📄 **Devis, Factures, Bons de livraison, Avoirs** — avec numérotation automatique
- 🧾 **PDF professionnels** — mise en page A4, texte recherchable, polices Tajawal intégrées
- 👥 **Gestion clients** — CRUD complet (nom, téléphone, ICE, adresse)
- 📊 **Calculs automatiques** — HT, TVA (normal/exonéré), remise, avance, reste à payer
- 🇲🇦 **Conforme DGI** — ICE, IF, TP, RC, CNSS, mentions légales
- 🌐 **Bilingue FR/AR** — interface en français et arabe (RTL)
- 🌓 **Thème dark/light** — basculement instantané
- 📱 **PWA** — installable sur mobile et desktop, fonctionne hors-ligne
- 💾 **Sauvegarde/restauration** — export et import JSON de toutes les données
- 🔒 **Authentification Supabase** — connexion sécurisée, sans collecte de données

---

## Architecture

```
facturation/
├── LICENSE                     # Licence MIT
├── README.md                   # Ce fichier
├── package.json                # Dépendances et scripts npm
├── server.js                   # Serveur de développement (Vercel rewrite)
├── vercel.json                 # Configuration de déploiement Vercel
├── sw.js                       # Service Worker (PWA offline)
├── manifest.json               # Manifest PWA
├── .gitignore
├── .env.example                # Template variables d'environnement
│
├── app.html                    # Application principale (SPA)
├── landing.html                # Landing page publique
├── confirmation/               # Page de confirmation post-inscription
├── admin/                      # Dashboard administrateur
│
├── css/
│   ├── styles.css              # Design tokens, thèmes, styles PDF
│   ├── fonts.css               # @font-face Tajawal
│   └── rtl.css                 # Surcharges RTL pour l'arabe
│
├── js/                         # Modules JavaScript (ES natifs)
│   ├── main.js                 # Point d'entrée, wiring événements
│   ├── config.js               # Types de documents (devis/facture/bl/avoir)
│   ├── pdf.js                  # Pipeline génération PDF (html2canvas + jsPDF)
│   ├── pdf-font.js             # Polices Tajawal en base64 pour embedding PDF
│   ├── storage.js              # localStorage (source) + IndexedDB (miroir)
│   ├── opfs-storage.js         # Origin Private File System (PDF + images)
│   ├── storage-quota.js        # Estimation espace de stockage
│   ├── history.js              # Historique documents (CRUD + réimpression)
│   ├── lines.js                # Lignes de document (CRUD + calculs)
│   ├── client.js               # Clients (CRUD + sélecteur)
│   ├── company-modal.js        # Paramètres entreprise (modale)
│   ├── navigation.js           # Changement de vue, resetForm, validation
│   ├── backup.js               # Export/Import JSON
│   ├── utils.js                # Utilitaires (montant en lettres, devise, HTML)
│   ├── dialog.js               # Modales de dialogue (alert, confirm)
│   ├── icons.js                # Icônes SVG inline
│   ├── i18n.js                 # Internationalisation (i18next)
│   ├── theme.js                # Gestion du thème dark/light
│   ├── modal-focus.js          # Trap focus pour modales accessibles
│   └── locales/
│       ├── fr.json             # Traductions françaises
│       └── ar.json             # Traductions arabes
│
├── modules/                    # Sous-modules
│   ├── auth/                   # Authentification Supabase
│   ├── admin/                  # Dashboard administrateur
│   ├── landing/                # Modales landing page
│   └── shared/                 # Utilitaires partagés (UI, validators)
│
├── assets/fonts/               # Polices Tajawal (.ttf, 4 variantes)
├── icons/                      # Icônes PWA (PNG, 5 tailles)
├── docs/                       # Documentation technique et audits
├── tests/                      # Tests Playwright (106 specs)
├── blog/                       # Blog SEO (9 articles)
└── supabase/                   # Configuration Supabase (migrations, scripts)
```

---

## Technologies

| Technologie | Usage |
|---|---|
| **JavaScript ES Modules** | Architecture modulaire native, sans bundler |
| **[Supabase](https://supabase.com)** | Authentification, Row Level Security |
| **[html2canvas](https://html2canvas.hertzen.com/)** 1.4.1 | Capture HTML → image pour PDF |
| **[jsPDF](https://github.com/parallax/jsPDF)** 2.5.1 | Assemblage PDF avec texte vectoriel |
| **[i18next](https://www.i18next.com/)** 23.16 | Internationalisation FR/AR |
| **[Playwright](https://playwright.dev/)** 1.61 | Tests end-to-end (106 specs) |
| **[pdfjs-dist](https://mozilla.github.io/pdf.js/)** 4.10 | Vérification contenu PDF dans les tests |
| **OPFS** | Stockage fichiers binaires (PDF, images) |
| **Service Worker** | PWA offline, cache stratégies |
| **Vercel** | Déploiement production |

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/ysonouari/INVOOFFICE.git
cd INVOOFFICE

# Installer les dépendances
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local avec vos clés Supabase

# Lancer le serveur de développement
npm start
```

L'application est accessible sur `http://localhost:3000`.

---

## Variables d'environnement

Créer un fichier `.env.local` à partir du template `.env.example` :

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ACCESS_TOKEN=your-access-token
```

> **Note** : la `SUPABASE_ANON_KEY` est une clé publique. Les données sont protégées par Row Level Security (RLS) côté Supabase.

---

## Déploiement

Le projet est configuré pour **Vercel** (`vercel.json`). Les rewrites mappent :

| URL | Fichier servi |
|---|---|
| `/` | `landing.html` |
| `/app` | `app.html` |
| `/admin` | `admin/index.html` |
| `/confirmation` | `confirmation/index.html` |

Les headers de sécurité (CSP, HSTS, X-Frame-Options, etc.) sont automatiquement appliqués.

```bash
# Déploiement manuel
vercel --prod
```

---

## Tests

106 tests Playwright couvrent l'ensemble des fonctionnalités :

| Catégorie | Tests |
|---|---|
| Authentification | login, signup, setup |
| Business | dashboard, clients, entreprise, historique, factures, langue, stockage, thème |
| PDF | contenu facture, contenu devis, structure PDF |
| Régression | parcours complet, changement type |
| Smoke | accessibilité, console, performance, login, PWA, responsive, sécurité, SEO |

```bash
# Lancer tous les tests
npm test

# Lancer un fichier spécifique
npx playwright test --config=tests/playwright.config.ts tests/smoke/login.spec.ts

# Mode debug (navigateur visible)
npx playwright test --config=tests/playwright.config.ts --headed

# Rapport HTML
npx playwright show-report test-results/html-report
```

---

## PWA

L'application est une **Progressive Web App** installable :

- **Manifest** : `manifest.json` (icônes 180px, 192px, 512px)
- **Service Worker** : `sw.js` (cache-first pour assets, network-first pour CDN)
- **Offline** : les pages et assets sont mis en cache, l'application fonctionne sans connexion
- **Installation** : disponible depuis Chrome, Edge, Safari (iOS 16.4+)

---

## Moteur PDF

Le PDF est généré en deux couches :

1. **Image de fond** : `html2canvas` capture le HTML rendu hors-écran (scale:2, ~192 DPI)
2. **Texte vectoriel invisible** : `jsPDF` superpose du texte en mode `3 Tr` (invisible mais sélectionnable/recherchable)

Les **polices Tajawal** (Regular, Bold, ExtraBold, Black) sont intégrées en base64 via `pdf-font.js`, garantissant un rendu identique sur tous les appareils.

**Format** : A4 portrait (210×297mm), JPEG 95%, ~300 Ko/page.

Pour plus de détails, voir `docs/audit/AUDIT_PDF_RENDER_ENGINE.md`.

---

## Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## Auteur

**INVOOFFICE** — [@ysonouari](https://github.com/ysonouari)

---

## Crédits

- Polices [Tajawal](https://fonts.google.com/specimen/Tajawal) par Boutros Fonts (SIL Open Font License)
- Icônes SVG par [Feather Icons](https://feathericons.com/) (MIT)
