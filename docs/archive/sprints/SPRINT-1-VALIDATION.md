# SPRINT 1 — VALIDATION

> **Sprint** : 1 — Landing Page  
> **Date** : 2026-08-03  
> **Statut** : ✅ Terminé  
> **Auteur** : Équipe INVOOFFICE

---

## 1. Résumé

Création d'une Landing Page professionnelle pour INVOOFFICE. La page présente l'application, ses fonctionnalités, le tarif (300 DH — accès à vie) et une FAQ. Les boutons d'inscription et de connexion affichent une modale "Bientôt disponible" en attendant le Sprint 2.

**Aucun fichier de l'application existante modifié.**

---

## 2. Fichiers créés

| Fichier | Type | Description |
|---|---|---|
| `landing.html` | HTML | Landing page complète avec 8 sections |
| `css/landing.css` | CSS | Styles spécifiques à la landing page |
| `modules/landing/faq.js` | JS | Accordéon FAQ avec accessibilité |
| `modules/landing/modals.js` | JS | Modale "Bientôt disponible" |
| `modules/shared/ui.js` | JS | Utilitaires UI partagés |
| `modules/shared/validators.js` | JS | Fonctions de validation |

**Total** : 6 fichiers créés

---

## 3. Fichiers modifiés

Aucun.

---

## 4. Structure de la Landing Page

| Section | ID | Contenu |
|---|---|---|
| Header | `lp-header` | Logo, navigation (#features, #pricing, #faq), bouton Connexion |
| Hero | `hero` | Titre "Votre facturation, simplement", description, boutons Commencer/Connexion, mockup application |
| Fonctionnalités | `features` | 8 cartes : Devis, Factures, BL, Avoirs, Clients, PDF, Hors-ligne, Conforme Maroc |
| Pourquoi | `why` | 6 avantages : Simple, Rapide, Moderne, Hors-ligne, Sécurisé, Gain de temps |
| Tarif | `pricing` | Carte premium "Accès à vie — 300 DH" avec 7 avantages |
| FAQ | `faq` | 5 questions en accordéon : Fonctionnement, Sécurité, Mobile, Conformité, Achat |
| CTA | `cta` | Appel à l'action final avec boutons Créer mon compte / Se connecter |
| Footer | `lp-footer` | Navigation secondaire (identique aux autres pages) |

---

## 5. Choix graphiques

| Élément | Décision | Réutilisation |
|---|---|---|
| **Variables CSS** | `styles.css` design tokens | ✅ `--bg`, `--panel`, `--text`, `--accent`, `--accent-2`, `--muted`, etc. |
| **Polices** | Segoe UI system stack | ✅ Identique à l'application |
| **Logo** | Initiales "IN" dans cercle | ✅ Même composant `.brand .logo` |
| **Boutons** | `.btn`, `.btn-accent`, `.btn-ghost` | ✅ Classes existantes étendues avec `.btn-lg`, `.btn-block` |
| **Couleurs** | Indigo (#6d6cf0) + Bleu (#3b6fe0) | ✅ Accents existants |
| **Dark/Light** | `data-theme` sur `<html>` | ✅ Même mécanisme que l'app |
| **Footer** | `.app-footer` + `.secondary-nav` | ✅ Identique à l'existant |
| **Mockup** | Illustration CSS pure (pas d'image) | Nouveau, cohérent avec le panel styling |
| **Dégradé** | `linear-gradient(var(--accent), var(--accent-2))` sur le hero | Nouveau, premium |

---

## 6. SEO

| Balise | Valeur |
|---|---|
| `<title>` | INVOOFFICE — Facturation gratuite pour entrepreneurs marocains |
| `<meta description>` | Créez des devis, factures, BL et avoirs en PDF. Simple, rapide, conforme Maroc. |
| `canonical` | `https://www.invooffice.com/` |
| `hreflang` | `fr` |
| `og:title` | ✅ |
| `og:description` | ✅ |
| `og:url` | ✅ |
| `og:type` | `website` |
| `twitter:card` | `summary_large_image` |
| `JSON-LD` | `WebApplication` schema |
| `H1` | Logo INVOOFFICE (header) |
| `H2` | Chaque section a un H2 unique |

---

## 7. Accessibilité

| Critère | Statut |
|---|---|
| `aria-label` sur navigation | ✅ |
| `aria-expanded` sur FAQ | ✅ |
| `aria-modal` sur la modale | ✅ |
| `aria-labelledby` sur la modale | ✅ |
| `aria-describedby` sur la modale | ✅ |
| `role="dialog"` sur la modale | ✅ |
| Navigation au clavier (FAQ) | ✅ |
| Échap pour fermer la modale | ✅ |
| Contraste texte/fond (dark/light) | ✅ |
| `hidden` attribut pour réponses FAQ | ✅ |
| Focus visible `:focus-visible` | ✅ (hérité de styles.css) |

---

## 8. Responsive

| Breakpoint | Comportement |
|---|---|
| > 960px | Hero en 2 colonnes (texte + mockup), features 4 colonnes, why 3 colonnes |
| 640-960px | Hero 1 colonne (mockup au-dessus), features 2 colonnes, why 2 colonnes |
| < 640px | Hero 1 colonne compact, features 1 colonne, why 1 colonne, typographie réduite |

---

## 9. Vérifications

| Vérification | Statut |
|---|---|
| Page valide HTML5 | ✅ |
| CSS sans erreur | ✅ |
| JS sans erreur (modules ES natifs) | ✅ |
| Dark mode fonctionnel | ✅ (détection `fb_theme` + `prefers-color-scheme`) |
| Light mode fonctionnel | ✅ (via `data-theme="light"`) |
| Modale "Bientôt disponible" | ✅ (tous les boutons concernés) |
| Footer année dynamique | ✅ |
| Aucune dépendance Supabase | ✅ |
| Application existante inchangée | ✅ |
| Cohérence graphique avec l'app | ✅ (mêmes tokens CSS) |
| FAQ accordéon fonctionnel | ✅ (ouverture/fermeture, une seule question ouverte à la fois) |
| Fermeture modale au clic extérieur | ✅ |
| Fermeture modale avec Échap | ✅ |

---

## 10. Recommandations pour le Sprint 2

1. **Remplacer** la modale "Bientôt disponible" par les vraies modales inscription/connexion
2. **Intégrer** le CDN Supabase dans `landing.html`
3. **Connecter** les modales à `modules/auth/signup.js` et `modules/auth/signin.js`
4. **Créer** `confirmation/` — déjà prêt structurellement
5. **Ajouter** `landing.html` au `PRECACHE_URLS` du Service Worker
6. **Tester** le flux complet : landing → inscription → confirmation
7. **Ne pas modifier** la landing page (ajouter uniquement les fonctionnalités auth)
