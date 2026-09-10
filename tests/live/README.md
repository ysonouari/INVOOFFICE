# Test LIVE E2E — INVOOFFICE

Ce dossier contient un **test de bout en bout de l'application réelle** (aucun mock,
aucune simulation) joué dans un **navigateur Chromium visible** à la main, contre
`http://localhost:3000/`.

Il crée réellement : société « Alu Design Tanger », upload de l'en-tête, 3 clients,
4 documents **FR** (devis, facture, bon de livraison, avoir) puis 4 documents **AR**
(après bascule de langue), vérifie les totaux et les **PDF téléchargés** (taille > 0),
l'**Historique** (recherche, ouverture/édition, réimpression, duplication) et la
**persistance** après rechargement.

## Prérequis

1. **Python 3.9+** installé.
2. **Playwright Python** — installé automatiquement par `run_live_test.bat`, sinon :
   ```bat
   python -m pip install playwright
   python -m playwright install chromium
   ```
3. **Serveur** local lancé :
   ```bat
   npm start
   ```
4. **Identifiants** d'un compte valide (variables d'environnement, jamais en clair
   dans les fichiers) :
   ```bat
   set INVO_EMAIL=votre@email.com
   set INVO_PASSWORD=votreMotDePasse
   ```
5. **Image d'en-tête** `D:\INVOOFFICE\entit.png` (ou surcharger :
   `set INVO_HEADER_IMG=chemin\image.png`).

## Lancement

```bat
run_live_test.bat
```

Le navigateur s'ouvre et les étapes s'enchaînent avec une petite pause
(`INVO_DELAY`, défaut `0.5` s) pour suivre le robot.

## Configuration

Tout est modifiable en tête de `live_invoice_test.py` (blocs `>>>>`) :

| Variable d'environnement | Défaut | Rôle |
|---|---|---|
| `INVO_BASE_URL` | `http://localhost:3000` | URL du site |
| `INVO_EMAIL` / `INVO_PASSWORD` | — | connexion réelle |
| `INVO_DELAY` | `0.5` | ralentit **toutes** les actions (chaque saisie, clic, sélection) ; `0` = vitesse max |
| `INVO_VIEWPORT` | `1440x900` | taille de fenêtre `LARGEURxHAUTEUR` (la **vraie** fenêtre du navigateur est réduite), ex. `390x844` pour simuler mobile |
| `INVO_HEADER_IMG` | `D:\INVOOFFICE\entit.png` | image d'en-tête à uploader |

Dans le script : société (`COMPANY`), clients (`CLIENTS`), désignations FR/AR
(`DESIGNS_FR` / `DESIGNS_AR`), scénarios (`SCENARIO_*`), taux de TVA (`TVS_PCT`)
(la pause et la taille de la fenêtre se règlent par variables d'environnement,
cf. tableau ci-dessus).

## Structure (simple, lisible)

Étapes du fichier : `login()`, `fill_company()`, `upload_header()`,
`create_clients()` (détail par client), `build_document()`, `switch_to_arabic()`,
`create_french_documents()`, `create_arabic_documents()`, `check_history()`,
`check_persistence()`, `final_report()`.

## Résultats

- **Rapport** : tableau PASS/FAIL imprimé à la fin + code de sortie (0 = tout vert).
- **Captures** : `tests/live/screenshots/` (une par étape + captures d'erreur).
- **PDF téléchargés** : `tests/live/artifacts/pdfs/` (documents créés + réimpression).
- **Trace Playwright** : `tests/live/artifacts/trace.zip` (rejouable dans `npx playwright show-trace`).

## Garanties

- Aucun fichier de production modifié — le test ne touche que `tests/live/`.
- Aucun accès direct à Supabase / localStorage pour « simuler » : tout passe par l'UI réelle.
- Les données créées sont réelles dans le navigateur ; un compte de test/la purge de
  l'Historique est recommandée si l'on rejoue plusieurs fois.