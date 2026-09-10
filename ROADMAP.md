# ROADMAP — INVOOFFICE SaaS

> **Date** : 2026-08-03  
> **Version** : 1.0  
> **Statut** : Planification — référence unique pour l'évolution du projet

---

## Vue d'ensemble

```
PHASE 1    PHASE 2    PHASE 3    PHASE 4    PHASE 5
Landing    Auth       Admin      Accès      Paiement
  Page
  [██]      [██]       [██]       [█]        [█]

PHASE 6    PHASE 7    PHASE 8    PHASE 9    PHASE 10
Sync       Sauve-     Stats      Notif-     Mobile
Cloud      gardes                ications
  [███]     [██]       [██]       [██]       [██]
```

---

## Phase 1 — Landing Page

| Attribut | Valeur |
|---|---|
| **Objectif** | Page d'accueil professionnelle convertissant les visiteurs en inscrits |
| **Priorité** | 🔴 Critique |
| **Estimation** | 2 jours |
| **Dépendances** | Phase 0 (Supabase setup) |
| **Risques** | Faible — tous les fichiers sont nouveaux |

### Fonctionnalités

- [ ] Hero avec logo, slogan, description, CTA
- [ ] Grille de 6 fonctionnalités (devis, factures, BL, clients, PDF, historique)
- [ ] Section "Pourquoi INVOOFFICE" (6 avantages)
- [ ] Bloc tarif unique : "Accès à vie — 300 DH"
- [ ] FAQ (3 questions : fonctionnement, sécurité, compatibilité)
- [ ] CTA final
- [ ] Modale d'inscription (nom, email, WhatsApp, mot de passe)
- [ ] Modale de connexion (email, mot de passe)
- [ ] Page de confirmation post-inscription
- [ ] Responsive mobile + desktop
- [ ] Dark mode
- [ ] SEO (meta, OG, Twitter, JSON-LD)

---

## Phase 2 — Authentification

| Attribut | Valeur |
|---|---|
| **Objectif** | Authentification Supabase intégrée à l'application existante |
| **Priorité** | 🔴 Critique |
| **Estimation** | 1.5 jours |
| **Dépendances** | Phase 1 |
| **Risques** | Élevé — première modification de l'existant |

### Fonctionnalités

- [ ] Module `modules/auth/` complet
- [ ] Client Supabase initialisé (CDN)
- [ ] Inscription : `signUp()` → trigger → profil créé (status='pending')
- [ ] Connexion : `signInWithPassword()` → vérification profil (status + abonnement)
- [ ] Déconnexion : `signOut()` → redirection `/`
- [ ] Gardien `checkAccess()` dans `main.js`
- [ ] Bouton utilisateur + déconnexion dans header app
- [ ] `<base href="/">` dans `index.html`
- [ ] Gestion des états (pending, inactive, pas d'accès)
- [ ] Session persistante (JWT refresh automatique)

---

## Phase 3 — Dashboard Admin

| Attribut | Valeur |
|---|---|
| **Objectif** | Panneau d'administration complet |
| **Priorité** | 🟠 Haute |
| **Estimation** | 2 jours |
| **Dépendances** | Phase 2 |
| **Risques** | Faible — tous les fichiers sont nouveaux |

### Fonctionnalités

- [ ] Page `/admin` protégée (admin only)
- [ ] 5 cartes de statistiques avec variations hebdomadaires
- [ ] Tableau utilisateurs avec recherche textuelle
- [ ] 6 filtres rapides (Tous, Actifs, En attente, Désactivés, Abonnement vie, Sans abonnement)
- [ ] Tri par colonnes (Nom, Date, Statut)
- [ ] Journal d'activité admin (admin_logs)

---

## Phase 4 — Gestion des accès

| Attribut | Valeur |
|---|---|
| **Objectif** | Activation/désactivation et attribution/retrait d'accès |
| **Priorité** | 🟠 Haute |
| **Estimation** | 1 jour |
| **Dépendances** | Phase 3 |
| **Risques** | Faible |

### Fonctionnalités

- [ ] Activer un utilisateur (status → 'active')
- [ ] Désactiver un utilisateur (status → 'inactive')
- [ ] Attribuer un accès (créer subscription + status → 'active')
- [ ] Retirer un accès (subscription.status → 'cancelled')
- [ ] Modale de confirmation avant actions destructives
- [ ] Feedback visuel (toast/notification) après chaque action
- [ ] Log admin pour chaque action

---

## Phase 5 — Paiement

| Attribut | Valeur |
|---|---|
| **Objectif** | Enregistrement des paiements manuels + préparation paiement en ligne |
| **Priorité** | 🟠 Haute |
| **Estimation** | 1 jour (manuel) + 3 jours (en ligne, futur) |
| **Dépendances** | Phase 4 |
| **Risques** | Faible (manuel) / Moyen (en ligne) |

### Fonctionnalités (Phase 5a — Manuel)

- [ ] Enregistrer un paiement manuel (montant, méthode, référence)
- [ ] Liste des paiements récents dans le dashboard
- [ ] Statut paiement dans le tableau utilisateurs
- [ ] Log admin pour chaque paiement

### Fonctionnalités (Phase 5b — En ligne, futur)

- [ ] Intégration passerelle de paiement marocaine (CMI, Payzone)
- [ ] Page de checkout
- [ ] Webhook confirmation paiement
- [ ] Activation automatique après paiement réussi
- [ ] Reçu/facture de paiement

---

## Phase 6 — Synchronisation Cloud

| Attribut | Valeur |
|---|---|
| **Objectif** | Sauvegarde et synchronisation des données métier vers Supabase |
| **Priorité** | 🟡 Moyenne |
| **Estimation** | 3 jours |
| **Dépendances** | Phase 2 |
| **Risques** | Élevé — modification du flux de données existant |

### Fonctionnalités

- [ ] Module `modules/sync/`
- [ ] Sync `company_settings` → Supabase (paramètres entreprise)
- [ ] Sync `clients` → Supabase
- [ ] Sync `documents` (metadata) → Supabase
- [ ] Restauration depuis cloud si localStorage vide
- [ ] Résolution de conflits (basé sur `updated_at`)
- [ ] Indicateur de synchronisation dans l'interface
- [ ] Mode manuel : bouton "Synchroniser maintenant"
- [ ] Mode automatique : sync après chaque modification

---

## Phase 7 — Sauvegardes

| Attribut | Valeur |
|---|---|
| **Objectif** | Système de backup automatique et manuel |
| **Priorité** | 🟡 Moyenne |
| **Estimation** | 2 jours |
| **Dépendances** | Phase 6 |
| **Risques** | Faible |

### Fonctionnalités

- [ ] Backup automatique quotidien (si connecté)
- [ ] Backup manuel (bouton "Sauvegarder maintenant")
- [ ] Restauration depuis backup
- [ ] Historique des backups (5 dernières versions)
- [ ] Backup des PDFs (OPFS → Supabase Storage)
- [ ] Export backup complet (JSON + PDFs)

---

## Phase 8 — Notifications

| Attribut | Valeur |
|---|---|
| **Objectif** | Notifications WhatsApp et Email |
| **Priorité** | 🟡 Moyenne |
| **Estimation** | 3 jours |
| **Dépendances** | Phase 4 |
| **Risques** | Moyen — dépendance API externe |

### Fonctionnalités

- [ ] Module `modules/notifications/`
- [ ] Notification WhatsApp : confirmation inscription
- [ ] Notification WhatsApp : activation compte
- [ ] Notification WhatsApp : expiration accès
- [ ] Notification Email : confirmation inscription
- [ ] Notification Email : activation compte
- [ ] Templates de messages personnalisables
- [ ] Préférences de notification par utilisateur
- [ ] Intégration WhatsApp Business API (ou Twilio)

---

## Phase 9 — Dashboard Utilisateur

| Attribut | Valeur |
|---|---|
| **Objectif** | Dashboard personnel pour chaque utilisateur |
| **Priorité** | 🟡 Moyenne |
| **Estimation** | 2 jours |
| **Dépendances** | Phase 6 |
| **Risques** | Faible |

### Fonctionnalités

- [ ] Nombre de documents générés
- [ ] Documents par type (camembert)
- [ ] Chiffre d'affaires total (somme TTC)
- [ ] Activité récente (10 derniers documents)
- [ ] Espace disque utilisé (localStorage + OPFS)
- [ ] Statut abonnement
- [ ] Profil (modification nom, WhatsApp)

---

## Phase 10 — Application Mobile

| Attribut | Valeur |
|---|---|
| **Objectif** | Version mobile optimisée + PWA améliorée |
| **Priorité** | 🟢 Basse |
| **Estimation** | 5 jours |
| **Dépendances** | Phase 6 |
| **Risques** | Moyen — refonte UI nécessaire |

### Fonctionnalités

- [ ] UI optimisée pour écrans mobiles (< 480px)
- [ ] Navigation par onglets (Nouveau, Historique, Clients, Paramètres)
- [ ] Mode paysage optimisé pour le formulaire
- [ ] Saisie tactile améliorée (grands boutons, espacements)
- [ ] Capture photo pour logo entreprise
- [ ] Partage PDF direct (WhatsApp, Email)
- [ ] PWA : installation, notifications push
- [ ] Mode hors-ligne amélioré (sync automatique au retour connexion)

---

## Phases futures (non planifiées)

| Phase | Description | Priorité |
|---|---|---|
| **P11** | Statistiques avancées (rapports, exports comptables DGI) | 🟢 Basse |
| **P12** | Gestion multi-entreprises (un compte, plusieurs sociétés) | 🟢 Basse |
| **P13** | Équipes/Collaborateurs (accès partagé) | 🟢 Basse |
| **P14** | Abonnements mensuels (plusieurs plans tarifaires) | 🟢 Basse |
| **P15** | Coupons et réductions | 🟢 Basse |
| **P16** | Programme d'affiliation | 🟢 Basse |
| **P17** | API publique (REST, clés API) | 🟢 Basse |
| **P18** | Marketplace de templates PDF | 🟢 Basse |
| **P19** | Signature électronique | 🟢 Basse |
| **P20** | Filigrane et protection PDF | 🟢 Basse |

---

## Calendrier estimé

| Phase | Durée | Dépendance | Cumul |
|---|---|---|---|
| Phase 0 — Setup Supabase | 0.5 j | — | 0.5 j |
| Phase 1 — Landing Page | 2 j | Phase 0 | 2.5 j |
| Phase 2 — Auth | 1.5 j | Phase 1 | 4 j |
| Phase 3 — Admin Dashboard | 2 j | Phase 2 | 6 j |
| Phase 4 — Gestion accès | 1 j | Phase 3 | 7 j |
| Phase 5 — Paiement manuel | 1 j | Phase 4 | 8 j |
| Phase 6 — Sync Cloud | 3 j | Phase 2 | 11 j |
| Phase 7 — Sauvegardes | 2 j | Phase 6 | 13 j |
| Phase 8 — Notifications | 3 j | Phase 4 | 16 j |
| Phase 9 — Dashboard utilisateur | 2 j | Phase 6 | 18 j |
| Phase 10 — App Mobile | 5 j | Phase 6 | 23 j |

**Total estimé** : ~23 jours de développement sur l'ensemble des phases.

---

## Priorités par Horizon

### Court terme (0-2 mois) — Phases 0 à 5
Landing page, authentification, admin, gestion accès, paiement manuel.
→ **Application SaaS minimale viable.**

### Moyen terme (2-6 mois) — Phases 6 à 9
Synchronisation cloud, sauvegardes, notifications, dashboard utilisateur.
→ **SaaS complet avec sync et communication.**

### Long terme (6-18 mois) — Phases 10 à 20
Application mobile, stats avancées, équipes, API, marketplace.
→ **Plateforme professionnelle complète.**
