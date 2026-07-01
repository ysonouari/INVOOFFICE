# SEO-ARCHITECTURE.md — Architecture SEO INVOOFFICE

**Projet** : INVOOFFICE — Système de Facturation  
**Domaine** : https://www.invooffice.com  
**Marché** : Maroc  
**Langues** : Français (primaire), Arabe (secondaire)  
**Public** : TPE, auto-entrepreneurs, freelances, commerçants, artisans, prestataires de services  
**Philosophie** : L'accueil est une **application**, pas une page marketing. Le SEO vit dans des pages satellites.  
**Date** : Juillet 2026  
**Version** : 4.0

---

## Philosophie du Projet

### Ce qu'est INVOOFFICE

INVOOFFICE est un générateur de documents commerciaux — devis, factures, bons de livraison, avoirs. L'utilisateur arrive, remplit son document, génère son PDF et repart. Rien de plus.

La génération des documents s'effectue **entièrement dans le navigateur** de l'utilisateur, via les APIs standard du web (html2canvas, jsPDF). Aucun document, aucune donnée utilisateur ne transite par nos serveurs.

### Nos convictions

Nous pensons qu'un outil de facturation ne devrait pas :

- vous imposer de créer un compte,
- vous imposer un abonnement mensuel,
- collecter vos données clients,
- stocker vos documents sur un cloud que vous ne contrôlez pas,
- afficher des publicités intrusives entre vous et votre travail.

Nous pensons qu'un outil de facturation devrait :

- être disponible immédiatement, sans friction,
- respecter votre vie privée,
- vous laisser le contrôle total de vos données,
- être rapide, simple, fiable,
- être conçu pour les entrepreneurs marocains, en français et en arabe.

### Ce que INVOOFFICE est

- ✅ Une application web légère de génération de documents PDF
- ✅ Un outil 100% gratuit, sans fonctionnalité payante cachée
- ✅ Un outil sans inscription, sans compte, sans mot de passe
- ✅ Une application où vos données restent dans votre navigateur (LocalStorage, IndexedDB)
- ✅ Un outil disponible en français et en arabe
- ✅ Une application qui fonctionne même hors ligne (PWA)

### Ce que INVOOFFICE n'est pas

- ❌ Pas un SaaS avec backend — vos documents ne sont jamais envoyés à nos serveurs
- ❌ Pas un outil de comptabilité complet
- ❌ Pas un ERP ou un logiciel de gestion
- ❌ Pas une plateforme collaborative
- ❌ Pas un service de stockage cloud

### Avantage concurrentiel

Dans un marché dominé par les SaaS qui imposent des comptes, collectent des données utilisateur et verrouillent les fonctionnalités derrière des abonnements, INVOOFFICE se différencie par :

1. **La simplicité radicale** — zéro friction à l'entrée, zéro friction à l'usage
2. **La confidentialité absolue** — tout reste sur votre appareil
3. **La gratuité permanente** — pas de modèle freemium qui se dégrade avec le temps
4. **L'indépendance** — pas de dépendance à une connexion Internet ou à un serveur distant

---

## Règles fondamentales

1. **L'accueil est l'application.** Aucun bloc marketing, aucun pavé SEO, aucun contenu parasite n'est ajouté à l'interface de l'outil.
2. **Le SEO vit dans les pages satellites.** Blog, guides, modèles, FAQ, documentation — tout le contenu optimisé pour les moteurs de recherche réside dans ces pages dédiées.
3. **Chaque page satellite renvoie vers l'application.** Le trafic SEO est capté par les pages de contenu, puis redirigé naturellement vers l'outil via des CTA.
4. **Le message est cohérent.** Gratuité, confidentialité, simplicité, local-first — ces valeurs sont rappelées sur toutes les pages.

---

## Architecture Générale

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   https://www.invooffice.com                                 │
│   ┌──────────────────────────────────────────────────────┐   │
│   │                                                      │   │
│   │            APPLICATION DE FACTURATION                │   │
│   │            (SPA inchangée)                           │   │
│   │                                                      │   │
│   │            Interface de création de documents         │   │
│   │                                                      │   │
│   └──────────────────────────────────────────────────────┘   │
│   ┌──────────────────────────────────────────────────────┐   │
│   │  ✅ 100% gratuit  🔒 Données locales  🚫 Aucune pub  │   │
│   └──────────────────────────────────────────────────────┘   │
│   ┌──────────────────────────────────────────────────────┐   │
│   │  Pourquoi │ Fonctionnalités │ Blog │ Modèles │ ...   │   │
│   └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘

           ↑                     ↑                     ↑
    Trafic Google ───────► Pages SEO ─────────► Application
```

---

## 1. Structure des URLs

```
invooffice.com/
│
├── index.html                          ← APPLICATION (interface inchangée)
│
├── pourquoi-invooffice.html            ← STRATÉGIQUE : La philosophie
├── fonctionnalites.html                ← STRATÉGIQUE : Ce que fait l'outil
├── confidentialite.html                ← STRATÉGIQUE : Où vont vos données
├── a-propos.html                       ← À propos
├── mentions-legales.html               ← Obligations légales
│
├── blog/                               ← BLOG SEO
│   ├── index.html                      ← Accueil blog
│   ├── comment-creer-facture-maroc.html
│   ├── modele-devis-gratuit.html
│   ├── bon-de-livraison-guide.html
│   ├── facture-auto-entrepreneur-maroc.html
│   ├── tva-maroc-guide.html
│   ├── ice-explication.html
│   ├── if-identifiant-fiscal.html
│   ├── patente-maroc.html
│   ├── facturation-electronique-maroc.html
│   ├── mentions-obligatoires-facture.html
│   ├── numerotation-factures.html
│   ├── relance-facture-impayee.html
│   ├── difference-devis-facture.html
│   ├── comment-faire-facture-pdf.html
│   ├── logiciel-facturation-maroc.html
│   ├── facture-proforma.html
│   ├── modele-facture-word.html
│   ├── modele-facture-excel.html
│   └── ar/
│       ├── index.html
│       ├── فاتورة-المغرب.html
│       ├── نموذج-عرض-سعر.html
│       ├── الضريبة-المغرب.html
│       ├── شرح-ICE.html
│       └── فاتورة-الكترونية-المغرب.html
│
├── guides/                             ← GUIDES LONGS (piliers)
│   ├── index.html
│   ├── facturation-maroc-guide-complet.html
│   └── auto-entrepreneur-guide.html
│
├── modeles/                            ← GALERIE TEMPLATES
│   ├── index.html
│   ├── auto-entrepreneur.html
│   ├── moderne.html
│   ├── simple.html
│   └── prestation-service.html
│
├── faq/                                ← FAQ
│   ├── index.html
│   └── ar/index.html
│
├── documentation/                      ← DOC TECHNIQUE
│   └── index.html
│
├── sitemap.xml
├── robots.txt
├── manifest.json
└── ads.txt
```

---

## 2. Page d'accueil — Ce qui change et ce qui ne change pas

### 2.1 Inchangé

L'interface de l'outil reste **strictement identique**. Aucun bloc SEO, aucun pavé texte, aucune section marketing n'est inséré dans la zone applicative.

### 2.2 Barre de valeurs (sous l'application)

```html
<div class="trust-bar">
  <span>✅ 100% gratuit — Sans abonnement</span>
  <span>🔒 Données stockées sur votre navigateur — Aucun transfert vers nos serveurs</span>
  <span>🚫 Aucune publicité — Aucun compte requis</span>
</div>
```

### 2.3 Navigation secondaire (après le footer)

```html
<nav class="secondary-nav" aria-label="Navigation secondaire">
  <a href="/pourquoi-invooffice.html">Pourquoi INVOOFFICE</a>
  <a href="/fonctionnalites.html">Fonctionnalités</a>
  <a href="/blog/">Blog</a>
  <a href="/modeles/">Modèles</a>
  <a href="/faq/">FAQ</a>
  <a href="/documentation/">Documentation</a>
  <a href="/confidentialite.html">Confidentialité</a>
</nav>
```

### 2.4 Meta tags

```html
<title>INVOOFFICE — Générateur de factures, devis et avoirs gratuit en ligne</title>
<meta name="description" content="Créez des factures, devis, bons de livraison et avoirs en PDF gratuitement. Sans inscription, sans publicité. Vos documents et données restent sur votre navigateur.">
<link rel="canonical" href="https://www.invooffice.com/">
<meta name="robots" content="index, follow">
```

Note — formulation corrigée : « Vos documents et données restent sur votre navigateur » plutôt que « aucun serveur », qui serait techniquement inexact (le site est bien hébergé).

### 2.5 JSON-LD WebApplication

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "INVOOFFICE",
  "url": "https://www.invooffice.com",
  "description": "Générateur de factures, devis, bons de livraison et avoirs en PDF. 100% gratuit, sans inscription, sans publicité. Vos documents restent sur votre appareil.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "browserRequirements": "JavaScript requis. Fonctionne hors ligne.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "MAD" },
  "featureList": [
    "Génération de factures PDF",
    "Génération de devis",
    "Bon de livraison",
    "Avoir",
    "Multi-devise (DH, EUR, USD)",
    "Calcul automatique de TVA",
    "Historique local sécurisé",
    "Fonctionne hors ligne",
    "Export et import de sauvegarde",
    "Interface en français et en arabe"
  ]
}
</script>
```

### 2.6 Exclusions

- ❌ Aucun bloc de mots-clés (→ `/blog/`)
- ❌ Aucun pavé "Pourquoi INVOOFFICE" (→ `/pourquoi-invooffice.html`)
- ❌ Aucune section "Fonctionnalités" (→ `/fonctionnalites.html`)
- ❌ Aucune FAQ (→ `/faq/`)
- ❌ Aucun extrait de blog
- ❌ Aucun témoignage

---

## 3. Pages stratégiques

### 3.1 `/pourquoi-invooffice.html` — Pourquoi INVOOFFICE

**Objectif** : Raconter la philosophie du projet. Convaincre par les valeurs, pas par les arguments commerciaux. Ton humain, sincère.

**Mots-clés cibles** : logiciel facturation gratuit, générateur facture sans inscription, alternative facture Excel, facture en ligne gratuite, outil facturation confidentiel

**Structure Hn** :

```
H1 : Pourquoi nous avons créé INVOOFFICE

  H2 : Parce que la facturation ne devrait pas être compliquée
    Un entrepreneur qui veut créer une facture ne devrait pas avoir à
    créer un compte, choisir un abonnement, vérifier son email, accepter
    des CGV de 15 pages. Il devrait pouvoir arriver, remplir, générer, et
    repartir. C'est ce que fait INVOOFFICE.

  H2 : Parce que vos données vous appartiennent
    Nous ne voulons pas de vos données. Nous n'en avons pas besoin.
    Vos clients, votre historique, vos documents — tout cela reste
    dans votre navigateur. Pas de sauvegarde cloud imposée, pas de
    synchronisation non sollicitée. Vous gardez le contrôle.

  H2 : Parce que gratuit ne devrait pas vouloir dire "limité"
    INVOOFFICE est gratuit. Pas de version d'essai de 14 jours.
    Pas de fonctionnalités bloquées derrière un paywall.
    Gratuit aujourd'hui. Gratuit dans un an. Gratuit pour toujours.
    Nous pensons qu'un outil de facturation de base est un besoin
    universel qui ne devrait pas être monétisé.

  H2 : Parce que le Maroc mérite des outils pensés pour lui
    ICE, IF, TP, RC, CNSS — ces identifiants sont spécifiques au
    système fiscal marocain. INVOOFFICE les intègre nativement.
    L'interface est disponible en français et en arabe. Les devises
    incluent le dirham marocain par défaut.

  H2 : Parce que la simplicité est la plus grande des fonctionnalités
    Pas de menu complexe, pas de dashboard, pas de rapports, pas de
    pipeline de validation. Un formulaire, un PDF. C'est tout ce dont
    un entrepreneur a besoin 90% du temps.

  H2 : Ce que nous ne ferons jamais
    - Vous imposer un compte
    - Vous imposer un abonnement
    - Collecter ou revendre vos données
    - Afficher des publicités dans l'interface de création
    - Envoyer vos documents vers un serveur tiers

  CTA final : Essayez INVOOFFICE maintenant — c'est gratuit.
```

**Schema** : `Article` + `Organization`

**Liens internes** : `/fonctionnalites.html`, `/confidentialite.html`, `/`

**Ton** : Humain, pas commercial. On explique des choix, on ne vend pas un produit.

---

### 3.2 `/fonctionnalites.html` — Fonctionnalités

**Objectif** : Permettre à un utilisateur de savoir exactement ce que fait l'outil avant de l'essayer. Organisé par catégories claires.

**Mots-clés cibles** : générateur facture, logiciel devis, outil facturation maroc, faire un avoir, bon livraison PDF

**Structure Hn** :

```
H1 : Tout ce que vous pouvez faire avec INVOOFFICE

  H2 : Création de documents
    H3 : Facture — générez une facture conforme en PDF
      Désignation, prix unitaire, quantité, total ligne, total HT,
      TVA réglable, total TTC, montant en lettres.
    H3 : Devis — créez un devis professionnel
      Mêmes champs que la facture. Idéal pour les prestataires de service.
    H3 : Bon de livraison — document de livraison
      Désignation et quantité. Accompagne la livraison physique.
    H3 : Avoir — générez un avoir correctif
      Annulez ou corrigez une facture avec un avoir conforme.

  H2 : Personnalisation
    H3 : Informations de l'entreprise
      Nom, adresse, contact, ICE (15 chiffres), IF (8 chiffres),
      RC, TP, CNSS — tous les identifiants légaux marocains.
    H3 : En-tête de page
      Ajoutez votre logo ou une image comme fond de page PDF.
      La marge supérieure est ajustable.
    H3 : Couleurs
      Personnalisez la couleur de fond et la couleur du texte
      de l'en-tête du tableau.
    H3 : Taille des polices
      Ajustez globalement la taille des polices du PDF de -3 à +3.

  H2 : Calculs automatiques
    H3 : TVA — taux personnalisable ou exonération
      Gérez la TVA au taux marocain (20%) ou tout autre taux.
      Activez l'exonération si votre activité est non assujettie.
    H3 : Remise
      Appliquez une remise en pourcentage, déduite automatiquement.
    H3 : Avance et reste à payer
      Saisissez une avance déjà versée, le reste à payer est calculé.
    H3 : Montant en lettres
      Le total TTC est automatiquement converti en toutes lettres,
      en français et en arabe.

  H2 : Export et formats
    H3 : PDF — format standard
      PDF haute qualité, police Tajawal, mise en page A4 professionnelle.
    H3 : Pagination automatique
      Les documents longs sont automatiquement répartis sur plusieurs pages.

  H2 : Gestion des données
    H3 : Stockage local
      Vos données (entreprise, clients, historique) sont stockées
      uniquement dans le LocalStorage de votre navigateur.
    H3 : Pas de transfert vers un serveur
      Aucun document, aucune donnée n'est envoyée à nos serveurs.
      La génération du PDF est entièrement locale.
    H3 : Sauvegarde et restauration
      Exportez toutes vos données en un fichier JSON. Importez-les
      sur un autre appareil ou restaurez-les après réinstallation.
    H3 : Historique
      Retrouvez tous vos documents générés. Réimprimez un PDF à tout moment.
    H3 : Gestion des clients
      Enregistrez vos clients récurrents (nom, téléphone, ICE, adresse).
      Réutilisez-les d'un document à l'autre.
    H3 : Suppression des données
      Vous pouvez à tout moment supprimer vos données locales.
      Voir notre guide sur la page Confidentialité.

  H2 : Interface et accessibilité
    H3 : Multi-langue
      Interface en français et en arabe. Basculez via le bouton FR/AR.
      Les documents sont générés dans la langue active, avec la
      direction de texte appropriée (gauche-à-droite ou droite-à-gauche).
    H3 : Multi-devise
      Dirham marocain (DH), Euro (€), Dollar US ($).
    H3 : Thème clair et sombre
      Choisissez le thème qui vous convient. Le choix est mémorisé.
    H3 : Accessibilité
      Navigation complète au clavier. Attributs ARIA sur les modales.
      Labels explicites sur tous les champs.

  CTA final : Créez votre premier document — c'est gratuit
```

**Schema** : `Article` + `ItemList`

**Liens internes** : `/pourquoi-invooffice.html`, `/confidentialite.html`, `/`

---

### 3.3 `/confidentialite.html` — Confidentialité des données

**Objectif** : Expliquer de façon pédagogique comment fonctionne INVOOFFICE, pourquoi c'est différent d'un SaaS, et comment l'utilisateur garde le contrôle. C'est la page la plus importante pour la confiance.

**Mots-clés cibles** : facture confidentielle, outil facturation sans collecte données, générateur facture vie privée, facture sans compte, logiciel facturation local

**Structure Hn** :

```
H1 : Comment INVOOFFICE protège vos données

  H2 : Où sont stockées vos données ?
    Toutes vos données sont stockées dans votre navigateur, et uniquement
    dans votre navigateur. Nous utilisons deux mécanismes standards du web :
    H3 : Le LocalStorage
      C'est un espace de stockage intégré à votre navigateur (Chrome,
      Firefox, Edge, Safari). Il contient vos informations d'entreprise,
      votre liste de clients, et l'historique de vos documents. Ces
      données ne sont accessibles que par votre navigateur, sur votre
      appareil, pour le domaine invoooffice.com.
    H3 : L'IndexedDB
      C'est une base de données plus avancée, également intégrée à votre
      navigateur. Nous l'utilisons comme miroir de sauvegarde du
      LocalStorage, pour plus de fiabilité.

  H2 : Comment fonctionne la génération du PDF ?
    Quand vous cliquez sur "Générer le document PDF", voici ce qui se
    passe, étape par étape :
    1. L'application construit le document au format HTML dans une zone
       invisible de la page.
    2. La bibliothèque html2canvas capture cette zone et la transforme
       en image.
    3. La bibliothèque jsPDF convertit cette image en fichier PDF.
    4. Le PDF est téléchargé directement sur votre ordinateur.
    H3 : Tout se passe dans votre navigateur
      À aucun moment le contenu de votre document (client, lignes,
      montants) n'est envoyé à un serveur. La bibliothèque html2canvas
      et la bibliothèque jsPDF sont chargées une fois depuis un CDN
      (cdnjs.cloudflare.com), puis elles s'exécutent entièrement sur
      votre machine.

  H2 : Pourquoi aucun compte n'est nécessaire ?
    Parce que nous n'avons pas de base de données utilisateurs.
    Votre navigateur est votre base de données. Vous n'avez pas besoin
    de vous identifier auprès d'un serveur, car il n'y a pas de serveur
    qui stocke vos informations. L'absence de compte est une conséquence
    directe de notre architecture : si nous n'avons pas de backend,
    nous n'avons pas besoin de vous authentifier.

  H2 : Quelles données sont stockées localement ?
    Uniquement les données nécessaires au fonctionnement de l'application :
    H3 : Informations de votre entreprise
      Nom, adresse, contact, devise, régime TVA, identifiants légaux
      (ICE, IF, RC, TP, CNSS), préférences d'affichage.
    H3 : Votre liste de clients
      Noms, téléphones, ICE, adresses — les clients que vous avez
      enregistrés pour les réutiliser.
    H3 : L'historique de vos documents
      La liste des documents que vous avez générés, avec leur type,
      numéro, date, client, et le PDF associé.
    H3 : Vos préférences
      Langue (français ou arabe) et thème (clair ou sombre).
    H3 : Ce que nous ne stockons PAS
      - Aucune donnée bancaire
      - Aucun mot de passe
      - Aucune adresse email
      - Aucune adresse IP
      - Aucun cookie de tracking
      - Aucune donnée de navigation

  H2 : Qui peut accéder à vos données ?
    Vous, et uniquement vous.
    H3 : Sur votre appareil
      Les données sont dans le navigateur que vous utilisez. Une autre
      personne utilisant le même ordinateur mais un navigateur différent
      ne verra pas vos données. Une personne utilisant le même navigateur
      mais un autre profil utilisateur (Windows/Mac) ne verra pas non plus
      vos données.
    H3 : Pas d'accès administrateur
      Il n'y a pas de compte administrateur, pas de "super-utilisateur",
      pas de backdoor. Nous n'avons aucun moyen technique d'accéder aux
      données stockées dans votre navigateur.
    H3 : Pas de partage avec des tiers
      Nous ne partageons aucune donnée avec des tiers pour la simple
      raison que nous n'y avons pas accès.

  H2 : Comment sauvegarder vos données ?
    H3 : Export en un clic
      Dans "Mes Informations" > "Exporter une sauvegarde", vous obtenez
      un fichier JSON contenant toutes vos données structurées
      (entreprise, clients, historique) ainsi que votre image d'en-tête.
    H3 : Import sur un autre appareil
      Utilisez "Importer une sauvegarde" pour restaurer vos données
      sur un autre ordinateur ou après avoir vidé votre navigateur.

  H2 : Comment supprimer toutes vos données ?
    H3 : Méthode simple
      Ouvrez les outils de développement de votre navigateur (F12),
      allez dans l'onglet "Application" > "Stockage local", trouvez
      le domaine invoooffice.com, et supprimez toutes les entrées
      commençant par "fb_".
    H3 : Méthode alternative
      Videz complètement les données de navigation de votre navigateur
      (cela supprimera également les données d'autres sites).
    H3 : Suppression du PDF sauvegardé
      L'application utilise également l'OPFS (Origin Private File System)
      pour stocker vos PDF générés et votre image d'en-tête. Ces fichiers
      sont automatiquement supprimés quand vous videz les données du site.

  H2 : Tableau comparatif : INVOOFFICE vs une application SaaS classique

    | Critère | INVOOFFICE | SaaS classique |
    |---------|-----------|----------------|
    | Création de compte | Aucune requise | Obligatoire |
    | Abonnement | Gratuit, sans limite | Payant (mensuel/annuel) |
    | Stockage des documents | Sur votre appareil uniquement | Sur les serveurs du fournisseur |
    | Accès à vos données | Vous seul | Vous + le fournisseur + ses sous-traitants |
    | Collecte de données | Aucune | Email, IP, usage, parfois contenu des documents |
    | Fonctionne hors ligne | Oui (après premier chargement) | Rarement |
    | Dépendance au fournisseur | Aucune — vous pouvez exporter vos données | Forte — vos données sont sur leur infrastructure |
    | Suppression des données | Vous seul décidez | Doit être demandée au fournisseur |
    | Publicité | Aucune | Variable selon le modèle économique |
    | Mise à jour | Transparente (la page se recharge) | Automatique ou manuelle selon le fournisseur |

    Ce tableau compare INVOOFFICE à un SaaS de facturation typique, sans citer
    de concurrents. Il décrit des différences architecturales factuelles, pas
    des jugements de valeur.

  H2 : Conformité et transparence
    H3 : Pas de cookies de tracking
      Nous n'utilisons pas de cookies à des fins de suivi publicitaire
      ou d'analyse d'audience. Le seul cookie présent est celui de
      Google AdSense (à des fins de diffusion d'annonces), si vous
      avez consenti via le bandeau cookies.
    H3 : Pas de collecte d'email
      Nous ne collectons pas d'adresses email. Il n'y a pas de newsletter.
    H3 : Hébergement
      Le site web (les fichiers HTML, CSS, JavaScript) est hébergé sur
      un serveur web standard. Mais vos documents et données, eux, ne
      sont jamais envoyés à ce serveur.

  CTA final : Utilisez INVOOFFICE en toute confiance — vos données vous appartiennent.
```

**Schema** : `Article` + `Organization`

**Liens internes** : `/pourquoi-invooffice.html`, `/fonctionnalites.html`, `/faq/`, `/`

**Ton** : Pédagogique, transparent, rassurant.

---

## 4. Pages SEO — Cocon sémantique

### 4.1 Structure

```
                        ┌──────────────────────┐
                        │     APPLICATION       │
                        │   invoooffice.com    │
                        └──────────┬───────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼───────┐ ┌────────────────▼────────────────┐ ┌───────▼───────┐
│   STRATÉGIQUES│ │           BLOG (pilier 1)       │ │    MODÈLES    │
│               │ │          /blog/                 │ │   (pilier 2)  │
│ Pourquoi      │ │  18 articles SEO                │ │   /modeles/   │
│ Fonctionnalités│ │                                │ │  5 templates  │
│ Confidentialité│ │                                │ │               │
└───────┬───────┘ └────────────────┬───────────────┘ └───────┬───────┘
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
            ┌───────▼───────┐ ┌────▼────┐ ┌───────▼───────┐
            │    GUIDES     │ │   FAQ   │ │ DOCUMENTATION │
            │   /guides/    │ │  /faq/  │ │    /docs/     │
            └───────────────┘ └─────────┘ └───────────────┘
```

### 4.2 Blog — 18 articles

| # | URL | Titre | Mot-clé principal | Intention |
|---|-----|-------|-------------------|-----------|
| 1 | `/blog/comment-creer-facture-maroc.html` | Comment créer une facture au Maroc | créer une facture maroc | Info |
| 2 | `/blog/modele-devis-gratuit.html` | Modèle de devis gratuit | modèle devis gratuit | Transaction |
| 3 | `/blog/bon-de-livraison-guide.html` | Bon de livraison : guide complet | bon de livraison | Info |
| 4 | `/blog/facture-auto-entrepreneur-maroc.html` | Facture auto-entrepreneur Maroc | facture auto entrepreneur maroc | Info |
| 5 | `/blog/tva-maroc-guide.html` | TVA au Maroc : guide complet | tva maroc | Info |
| 6 | `/blog/ice-explication.html` | ICE Maroc : explication complète | ice maroc | Info |
| 7 | `/blog/if-identifiant-fiscal.html` | IF Maroc : tout savoir | if maroc | Info |
| 8 | `/blog/patente-maroc.html` | Patente au Maroc : guide complet | patente maroc | Info |
| 9 | `/blog/facturation-electronique-maroc.html` | Facturation électronique au Maroc | facturation électronique maroc | Info |
| 10 | `/blog/mentions-obligatoires-facture.html` | Mentions obligatoires sur une facture | mentions obligatoires facture | Info |
| 11 | `/blog/numerotation-factures.html` | Numérotation des factures | numérotation factures | Info |
| 12 | `/blog/relance-facture-impayee.html` | Relance facture impayée : modèle | relance facture impayée | Transaction |
| 13 | `/blog/difference-devis-facture.html` | Devis et facture : différences | différence devis facture | Info |
| 14 | `/blog/comment-faire-facture-pdf.html` | Comment faire une facture en PDF | faire facture pdf | Transaction |
| 15 | `/blog/logiciel-facturation-maroc.html` | Logiciel de facturation Maroc | logiciel facturation maroc | Commerciale |
| 16 | `/blog/facture-proforma.html` | Facture proforma : définition, modèle | facture proforma | Info |
| 17 | `/blog/modele-facture-word.html` | Modèle facture Word gratuit | modèle facture word | Transaction |
| 18 | `/blog/modele-facture-excel.html` | Modèle facture Excel gratuit | modèle facture excel | Transaction |

### 4.3 Modèles — 5 templates

| # | URL | Titre | Mot-clé |
|---|-----|-------|---------|
| 1 | `/modeles/index.html` | Modèles de facture gratuits | modèle facture gratuit |
| 2 | `/modeles/auto-entrepreneur.html` | Modèle facture auto-entrepreneur | modèle facture auto entrepreneur |
| 3 | `/modeles/moderne.html` | Modèle facture moderne | modèle facture moderne |
| 4 | `/modeles/simple.html` | Modèle facture simple | modèle facture simple |
| 5 | `/modeles/prestation-service.html` | Modèle facture prestation service | modèle facture prestation service |

### 4.4 Maillage interne type

```
/blog/ice-explication.html
  ├── Breadcrumb : Accueil > Blog > ICE Maroc
  ├── ↑ Pilier : /blog/comment-creer-facture-maroc.html
  ├── ↔ Latéral : /blog/if-identifiant-fiscal.html
  ├── ↔ Latéral : /blog/patente-maroc.html
  ├── ↔ Stratégique : /pourquoi-invooffice.html
  ├── ↔ Stratégique : /confidentialite.html
  └── CTA : Créez votre facture avec ICE → /
```

---

## 5. Données structurées (Schema.org)

| Page | Schema | Rôle |
|------|--------|------|
| `/` (accueil) | `WebApplication` | Signal "application web" à Google |
| `/pourquoi-invooffice.html` | `Article` + `Organization` | Rich result + Knowledge Graph |
| `/fonctionnalites.html` | `Article` + `ItemList` | Liste structurée de fonctionnalités |
| `/confidentialite.html` | `Article` | Page de contenu |
| `/blog/*` | `BlogPosting` | Articles |
| `/guides/*` | `Article` + `HowTo` | Guides pratiques |
| `/modeles/index.html` | `ItemList` | Galerie |
| `/faq/index.html` | `FAQPage` | Featured snippets |
| `/documentation/index.html` | `TechArticle` | Documentation |

---

## 6. Multilingue (FR/AR)

| Page FR | Page AR | Mot-clé arabe cible |
|---------|---------|---------------------|
| `/blog/comment-creer-facture-maroc.html` | `/blog/ar/فاتورة-المغرب.html` | انشاء فاتورة المغرب |
| `/blog/modele-devis-gratuit.html` | `/blog/ar/نموذج-عرض-سعر.html` | نموذج عرض سعر مجاني |
| `/blog/tva-maroc-guide.html` | `/blog/ar/الضريبة-المغرب.html` | الضريبة المغرب |
| `/blog/ice-explication.html` | `/blog/ar/شرح-ICE.html` | ICE المغرب |
| `/blog/facturation-electronique-maroc.html` | `/blog/ar/فاتورة-الكترونية-المغرب.html` | فاتورة الكترونية المغرب |
| `/faq/index.html` | `/faq/ar/index.html` | أسئلة شائعة فواتير |
| `/pourquoi-invooffice.html` | `/ar/pourquoi-invooffice.html` | لماذا INVOOFFICE |

Hreflang bidirectionnel sur chaque page :

```html
<link rel="alternate" hreflang="fr" href="https://www.invooffice.com/blog/ice-explication.html">
<link rel="alternate" hreflang="ar" href="https://www.invooffice.com/blog/ar/شرح-ICE.html">
<link rel="alternate" hreflang="x-default" href="https://www.invooffice.com/blog/ice-explication.html">
```

---

## 7. Fichiers techniques

### `robots.txt`

```
User-agent: *
Allow: /
Allow: /blog/
Allow: /guides/
Allow: /modeles/
Allow: /faq/
Allow: /documentation/
Disallow: /css/
Disallow: /js/
Disallow: /assets/
Disallow: /verif-fontsize/

Sitemap: https://www.invooffice.com/sitemap.xml
```

### `sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.invooffice.com/sitemap-fr.xml</loc></sitemap>
  <sitemap><loc>https://www.invooffice.com/sitemap-ar.xml</loc></sitemap>
</sitemapindex>
```

---

## 8. Roadmap SEO pluriannuelle

### Année 1 — Fondations (Juillet 2026 — Juin 2027)

**Q3 2026 — Mise en ligne et indexation**

| Mois | Actions |
|------|---------|
| Juillet | Barre de valeurs + footer liens sur l'accueil. JSON-LD WebApplication. Optimisation title/meta description. `robots.txt` + `sitemap.xml`. Google Search Console. |
| Août | Pages stratégiques : `pourquoi-invooffice.html`, `fonctionnalites.html`, `confidentialite.html`. Page `a-propos.html` + `mentions-legales.html`. |
| Septembre | FAQ française (`faq/index.html`) avec FAQPage schema. Page documentation (`documentation/index.html`). |

**Q4 2026 — Premières pages de contenu**

| Mois | Actions |
|------|---------|
| Octobre | Blog : 4 articles prioritaires (facture Maroc, devis gratuit, ICE, TVA). |
| Novembre | Blog : 4 articles supplémentaires (bon de livraison, mentions obligatoires, numérotation, différence devis/facture). Modèles : `modeles/index.html` + 2 templates. |
| Décembre | Blog : 2 articles. Guide pilier : `facturation-maroc-guide-complet.html`. |

**Q1 2027 — Expansion arabe**

| Mois | Actions |
|------|---------|
| Janvier | Blog arabe : 3 premiers articles. FAQ arabe. |
| Février | Blog : 2 articles. Modèles : 2 templates supplémentaires. |
| Mars | Blog : 2 articles. Guide : `auto-entrepreneur-guide.html`. |

**Q2 2027 — Consolidation**

| Mois | Actions |
|------|---------|
| Avril | Blog : 2 articles. Blog arabe : 1 article. |
| Mai | Blog : 2 articles. Pages stratégiques en arabe. |
| Juin | Bilan Année 1. Mise à jour des guides pour 2027. Audit backlinks. |

### Année 2 — Croissance (Juillet 2027 — Juin 2028)

- Blog : 2 articles/mois (24 articles/an)
- Blog arabe : 1 article/mois (12 articles/an)
- Mise à jour annuelle de tous les guides (dates, chiffres, réglementation)
- Outreach backlinks : 3-5 backlinks/mois depuis des sites marocains (.ma)
- Enrichissement des pages existantes (FAQ, documentation, templates)
- Tests A/B sur les CTA des pages stratégiques
- Intégration Google Business Profile (si adresse physique)
- Premier rapport Google Search Console trimestriel

### Année 3 — Autorité (Juillet 2028 — Juin 2029)

- Blog : maintien du rythme 2 articles/mois
- Création de contenus avancés : comparatifs, études de cas, interviews
- Expansion des modèles : 10 templates au total
- Vidéos tutoriel (YouTube) liées depuis les pages guides
- Partenariats de contenu avec des cabinets comptables marocains
- Positionnement comme la référence "facturation Maroc" sur Google

### Métriques cibles par année

| Métrique | Départ | Fin A1 | Fin A2 | Fin A3 |
|----------|--------|--------|--------|--------|
| Pages indexées | 1 | 30 | 55 | 80+ |
| Pages AR indexées | 0 | 8 | 15 | 25+ |
| Articles blog | 0 | 18 | 42 | 66 |
| Mots-clés top 10 | 0 | 3-5 | 10-15 | 25+ |
| Mots-clés top 100 | 0-5 | 100-200 | 300-500 | 600+ |
| Trafic organique/mois | 0-10 | 1500-3000 | 5000-10000 | 15000-30000 |
| Rich results | 0 | 5 | 12 | 20+ |
| Backlinks .ma | 0 | 10-20 | 40-60 | 80+ |

---

## 9. Résumé exécutif

**Ce que ce document définit :**

- Une architecture SEO où **l'accueil reste l'application**, sans surcharge marketing
- **3 pages stratégiques** qui incarnent la philosophie du projet (Pourquoi, Fonctionnalités, Confidentialité)
- **18 articles de blog** ciblant des mots-clés à forte intention au Maroc
- **5 templates** pour capter le trafic "modèle facture"
- **2 guides longs** servant de piliers sémantiques
- Une **présence arabe** complète avec ses propres URLs indexables
- Un **message cohérent** autour de la gratuité, la confidentialité et la simplicité
- Une **roadmap sur 3 ans** avec des métriques cibles mesurables

**Ce que ce document ne fait pas :**

- Il ne modifie pas l'interface de l'application
- Il n'ajoute pas de contenu SEO sur la page d'accueil
- Il ne propose pas de changer l'architecture technique du projet
- Il n'impose pas de dépendance à un CMS ou un framework

**Prochaine étape :** Validation du document, puis implémentation de la Phase 1 (fondations).
