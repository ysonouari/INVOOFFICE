# Système de Facturation

Application 100 % front-end de génération de documents (devis, facture, bon de livraison, avoir) en PDF, avec historique localStorage (source de vérité), mirror IndexedDB (cache), et OPFS (images d'en-tête, PDF sauvegardés). Aucun backend requis.

## Lancement

Ouvrir `index.html` dans un navigateur (double-clic, `file://`, ou via un petit serveur statique) :

```bash
npx serve .
# ou
python -m http.server
# ou
npx live-server
```

## Architecture

```
facturation/
├── index.html              # Markup HTML (aucune logique)
├── css/
│   └── styles.css          # Design tokens, layout, styles PDF
├── js/
│   ├── config.js           # DOC_TYPES (devis/facture/bl/avoir)
│   ├── storage.js          # localStorage + IndexedDB mirror (company, history, clients)
│   ├── opfs-storage.js     # OPFS : images d'en-tête et fichiers PDF sauvegardés
│   ├── storage-quota.js    # Estimation de l'espace de stockage utilisé
│   ├── utils.js            # escapeHtml, currencySymbol, montantEnLettres
│   ├── lines.js            # Lignes du document (CRUD, calculs des totaux)
│   ├── client.js           # Clients (CRUD + sélecteur déroulant)
│   ├── company-modal.js    # Modale "Mes Informations" (entreprise, TVA, mise en page PDF)
│   ├── pdf.js              # Construction HTML du PDF, capture html2canvas+jsPDF
│   ├── history.js          # Historique des documents (CRUD + réimpression)
│   ├── navigation.js       # Changement de vue, resetForm, initForm
│   ├── icons.js            # SVG icon strings
│   └── main.js             # Point d'entrée (imports + addEventListener)
└── README.md
```

Les modules ES natifs (`<script type="module">`) sont utilisés sans bundler. Les CDN html2canvas et jsPDF sont chargés via `<script>` classique avant le module.

- **Dual storage :** `localStorage` est la source de vérité ; `IndexedDB` le miroir (cache). `initStorage()` synchronise localStorage → IndexedDB au premier chargement.
- **OPFS** (Origin Private File System) : stocke les images d'en-tête et les fichiers PDF sauvegardés.
- **Numérotation :** `nextNumero()` est une fonction pure qui scanne `loadHistory()` pour trouver le numéro MAX par type et année, via une regex `^PREFIX-YYYY-(\d+)$`. Pas de compteur séparé, pas d'effet de bord d'incrémentation.

## Dépendances

| Bibliothèque | CDN |
|---|---|
| [html2canvas](https://html2canvas.hertzen.com/) | `//cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js` |
| [jsPDF](https://github.com/parallax/jsPDF) | `//cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` |

## Règles clés

- **Tolérance de pagination :** utiliser `> 0.5` (pas `> 0`) dans la boucle de découpage des pages PDF (`generatePDF()` et `reprintHistoryDoc()`). html2canvas arrondit les hauteurs en pixels ; un débordement inférieur au millimètre peut créer une page blanche intempestive.
- **`resetForm()`** ne réinitialise PAS `docType` — le type de document est conservé pour la saisie en série. Positionne `clientSelect.value = ''` directement, pas via `refreshClientsSelect()`.
- **Mode BL** (Bon de livraison) : `showTotalsDefault: false` dans la configuration masque les colonnes prix/total dans le tableau et le bloc de totaux. `collectPayload()` construit quand même l'objet `totals` complet ; le PDF ignore les chapping non pertinents via `t.showPrices`.
- **Champ "ref client"** visible uniquement pour les types `avoir` et `bl`.
- **Migration base64 → OPFS :** `company-modal.js` vérifie d'abord OPFS, puis tombe sur `c.headerImage` (base64) en fallback. Après migration, recharger l'aperçu depuis OPFS — ne pas relire `c.headerImage` (supprimé après migration).

## Schéma de stockage

- **Company defaults** (retournés par `loadCompany()` quand vide) :
  `{ nom:'', contact:'', adresse:'', devise:'DH', regimeTva:'exoneree', tvaTaux:20, ice:'', if_:'', rc:'', tp:'', cnss:'', tableColor:'#eef1f6', margeHaut:3, headerImage:'', headerActive:false }`
- **Clients :** un `id` auto-assigné et un champ `ice: ''` par défaut sont ajoutés automatiquement au chargement s'ils sont absents.
- **Historique :** tableau d'objets payload sauvegardés avec le nom du fichier PDF.
- **Clés de stockage :** `ALL_KEYS = ['company', 'history', 'clients']` (pas de clé `counters`). Les clés localStorage sont préfixées `fb_*`.

## À terminer

- **Authentification / multi-utilisateur + sync cloud réelle** : le sélecteur "Mode de stockage" du mock d'origine a été retiré ; tout est en localStorage pour l'instant.
- **Page "Gestion du Stock" / "Clients"** : volontairement retirées de la navigation, à implémenter si besoin.
- **Gestion multi-devise réelle** : le champ devise n'affecte que le libellé ("DH/€/$"), pas les calculs.
- **Édition d'un document existant** : l'historique permet de regénérer le PDF mais pas de recharger le formulaire en mode édition (voir `loadHistoryDocIntoForm()` si besoin futur).
