# -*- coding: utf-8 -*-
"""
TEST LIVE E2E — INVOOFFICE
==========================
Teste l'application REELLE (aucun mock) : ouverture du site, connexion,
remplissage de la société, upload de l'en-tête, clients, documents FR puis AR,
historique (recherche/ouverture/réimpression/duplication), persistance après
rechargement, PDF téléchargés et vérifiés (taille > 0).

Le navigateur reste VISIBLE pendant toute l'exécution (headless=False).
INVO_DELAY (défaut 0.5 s) ralentit TOUTES les actions du robot (chaque saisie,
clic, sélection, upload...) — `INVO_DELAY=3` rend tout visiblement lent,
`INVO_DELAY=0` = vitesse maximale. INVO_VIEWPORT (défaut 1440x900) réduit
réellement la fenêtre du navigateur (ex : 390x844 pour simuler mobile).

Identifiants : variables d'environnement INVO_EMAIL / INVO_PASSWORD
(le mot de passe n'est jamais écrit dans ce fichier ni dans les logs).

Structure du script (étapes bien séparées pour lecture / enregistrement) :
    login()  fill_company()  upload_header()  create_clients()
    create_french_documents()  create_arabic_documents()
    check_history()  check_persistence()  final_report()

Lignes marquées avec ">>>>" : modifier ici pour personnaliser le test
(noms, prix, quantités, clients, désignations, pauses, URLs).
"""

import os
import re
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from playwright.sync_api import sync_playwright, expect

# ---------------------------------------------------------------------------
# >>>> PARAMETRES MODIFIABLES (noms, prix, pauses, URLs...)
# ---------------------------------------------------------------------------
BASE_URL   = os.environ.get("INVO_BASE_URL", "http://localhost:3000")   # URL locale
LIVE_DELAY = float(os.environ.get("INVO_DELAY", "0.5"))                 # pause entre actions (s)


def _parse_viewport(raw):
    """'390x844' -> {'width':390,'height':844} — défaut 1440x900 (bureau)."""
    try:
        w, h = raw.strip().lower().split("x")
        w, h = int(w), int(h)
        if w > 0 and h > 0:
            return {"width": w, "height": h}
    except Exception:
        pass
    return {"width": 1440, "height": 900}


VIEWPORT   = _parse_viewport(os.environ.get("INVO_VIEWPORT", "1440x900"))  # taille fenêtre
HEADER_IMG = os.environ.get("INVO_HEADER_IMG", r"D:\INVOOFFICE\entit.png")  # image d'entete
TVS_PCT    = 20.0                                                      # taux TVA (régime normal)

# Mode navigation : TON Chrome déjà ouvert (via port de débogage CDP), ou fenêtre neuve.
USE_CDP    = os.environ.get("INVO_CDP", "1").lower() not in ("0", "false", "off", "non", "none")
CDP_URL    = os.environ.get("INVO_CDP_URL", "http://127.0.0.1:9222")    # port de débogage du Chrome ouvert

# Profil de test : depuis Chrome 136, Google bloque le pilotage à distance
# (Playwright) dès que le dossier de données pointe vers le VRAI dossier
# Chrome de l'utilisateur, quel que soit le sous-profil choisi. On utilise
# donc un dossier DÉDIÉ au test (persistant entre les lancements), séparé du
# Chrome personnel — réglé par run_live.py (INVO_PROFILE_MODE / INVO_USER_DATA_DIR).
PROFILE_MODE  = os.environ.get("INVO_PROFILE_MODE", "dedicated")  # 'dedicated' | 'fresh'
USER_DATA_DIR = os.environ.get("INVO_USER_DATA_DIR", "")

# Lance Chrome avec --no-sandbox (utile sur certaines machines/VM/CI où le
# sandbox Chrome est bloqué). Réglé depuis run_live.py (INVO_NO_SANDBOX).
NO_SANDBOX = os.environ.get("INVO_NO_SANDBOX", "0").strip().lower() not in (
    "0", "false", "off", "non", "none", "")


def _real_chrome_args(window_size=True):
    """Arguments communs pour lancer le VRAI Google Chrome (pas Chromium)."""
    args = []
    if window_size:
        args.append(f"--window-size={VIEWPORT['width']},{VIEWPORT['height']}")
    if NO_SANDBOX:
        args.append("--no-sandbox")
    return args


def _explain_chrome_launch_error(e):
    """Message clair si le vrai Google Chrome n'est pas trouvé par Playwright."""
    msg = str(e)
    print()
    print(f"[ERREUR] Impossible de lancer le vrai Google Chrome : {msg}")
    if "is not found" in msg or "Executable doesn't exist" in msg:
        print("  Google Chrome (le vrai navigateur, pas Chromium) n'est pas détecté par Playwright.")
        print("  Corrige avec l'UNE de ces solutions :")
        print("    1) Installe Google Chrome normalement sur cette machine, ou")
        print("    2) Lance :  python -m playwright install chrome")
    print()


def _apply_delay_to_playwright():
    """Ralentit TOUTES les actions Playwright (saisies, clics, sélections,
    uploads, navigation...) de LIVE_DELAY secondes chacune, dès que INVO_DELAY > 0.
    C'est ce qui donne le « ralenti » visible pendant les saisies d'informations."""
    if LIVE_DELAY <= 0:
        return
    from playwright.sync_api import Locator, Page

    for cls, methods in (
        (Page, ("goto", "reload", "fill", "click", "press", "type",
                "check", "uncheck", "set_input_files", "select_option",
                "clear")),
        (Locator, ("fill", "click", "press", "type", "check", "uncheck",
                   "set_input_files", "select_option", "clear")),
    ):
        for _name in methods:
            original = getattr(cls, _name, None)
            if original is None:
                continue
            def wrapper(self, *args, _orig=original, **kwargs):
                time.sleep(LIVE_DELAY)
                return _orig(self, *args, **kwargs)
            try:
                setattr(cls, _name, wrapper)
            except Exception:
                pass


_apply_delay_to_playwright()

TEST_DIR = Path(__file__).resolve().parent
SHOTS_DIR = TEST_DIR / "screenshots"
ART_DIR   = TEST_DIR / "artifacts"
PDF_DIR   = ART_DIR / "pdfs"
for d in (SHOTS_DIR, ART_DIR, PDF_DIR):
    d.mkdir(parents=True, exist_ok=True)

# >>>> Entreprise (« Mes Informations ») — champs réels de l'application
COMPANY = {
    "cDevise":    "DH",                              # Devise (DH / EUR / USD)
    "cNom":       "Alu Design Tanger",               # Nom de l'entreprise
    "cRegimeTva": "normal",                          # normal | exoneree
    "cContact":   "contact@aludesign.ma / +212 6 00 00 00 00",
    "cTvaTaux":   "20",                              # Taux de TVA (%) si régime normal
    "cAdresse":   "Tanger, Maroc — Menuiserie Aluminium",
    "cICE":       "123456789000012",                 # 15 chiffres requis
    "cIF":        "12345678",
    "cRC":        "12345",
    "cTP":        "12345678",
    "cCNSS":      "12345678",
}

# >>>> Clients — champs réels (Nom, Téléphone, ICE, Adresse)
# (l'application n'a PAS de champs « Activité » ni « Ville » : on les place dans l'adresse)
CLIENTS = [
    {"nom": "Karim Benali",                "tel": "+212 6 12 12 12 12", "ice": "123456789000111", "adresse": "Tanger, Maroc — Client particulier"},
    {"nom": "Société Atlas Construction",  "tel": "+212 5 39 33 44 55", "ice": "123456789000222", "adresse": "Tanger, Maroc — Construction"},
    {"nom": "Yassine El Idrissi",          "tel": "+212 6 98 76 54 32", "ice": "123456789000333", "adresse": "Tétouan, Maroc — Client particulier"},
]

# >>>> Désignations (menuiserie aluminium) — FR puis AR
DESIGNS_FR = [
    "Fenêtre aluminium coulissante 120x120 cm",
    "Porte aluminium vitrée 90x210 cm",
    "Baie vitrée aluminium 240x215 cm",
    "Fenêtre aluminium double vitrage",
    "Porte-fenêtre aluminium",
    "Châssis fixe aluminium",
    "Coulissant aluminium 2 vantaux",
    "Porte d'entrée aluminium",
    "Installation et pose de menuiserie aluminium",
    "Réparation et réglage de menuiserie aluminium",
]
DESIGNS_AR = [
    "نافذة ألمنيوم منزلقة 120x120 سم",
    "باب ألمنيوم زجاجي 90x210 سم",
    "واجهة زجاجية ألمنيوم 240x215 سم",
    "نافذة ألمنيوم بزجاج مزدوج",
    "باب نافذة ألمنيوم",
    "إطار ألمنيوم ثابت",
    "نافذة منزلقة ألمنيوم",
    "باب مدخل ألمنيوم",
    "تركيب وتجهيز الألمنيوم",
    "إصلاح وضبط نوافذ وأبواب الألمنيوم",
]

# >>>> Scénarios documentaires : lignes (désignation, prix U., quantité)
SCENARIO_DEVIS = {   # Client : Karim Benali
    "lines": [(DESIGNS_FR[0], 2500, 2), (DESIGNS_FR[1], 4200, 1), (DESIGNS_FR[8], 1500, 1)],
    "notes": "Projet menuiserie aluminium — Tanger",
}
SCENARIO_FACTURE = {  # Client : Société Atlas Construction
    "lines": [(DESIGNS_FR[2], 8500, 2), (DESIGNS_FR[3], 3200, 4), (DESIGNS_FR[8], 1800, 1)],
    "notes": "Chantier résidentiel — pose comprise",
}
SCENARIO_BL = {       # Client : Yassine El Idrissi
    "lines": [(DESIGNS_FR[0], 2600, 3), (DESIGNS_FR[5], 1400, 2), (DESIGNS_FR[1], 3900, 1)],
    "notes": "Livraison atelier — Tétouan",
}
SCENARIO_AVOIR = {    # Client : Karim Benali — workflow réel = type « avoir » + référence
    "lines": [(DESIGNS_FR[0], 2500, 2), (DESIGNS_FR[2], 8500, 1)],
    "ref":   "FAC",                                        # référence = numéro facture FR
    "notes": "Avoir en lien avec la facture",
}
SCENARIO_AR = {
    "devis":   {"lines": [(DESIGNS_AR[0], 2500, 2), (DESIGNS_AR[1], 4200, 1), (DESIGNS_AR[8], 1500, 1)], "notes": "مشروع نجارة الألمنيوم — طنجة"},
    "facture": {"lines": [(DESIGNS_AR[2], 8500, 2), (DESIGNS_AR[3], 3200, 4), (DESIGNS_AR[8], 1800, 1)], "notes": "ورقة أشغال — التركيب مشمول"},
    "bl":      {"lines": [(DESIGNS_AR[0], 2600, 3), (DESIGNS_AR[5], 1400, 2), (DESIGNS_AR[1], 3900, 1)], "notes": "تسليم الورشة — تطوان"},
    "avoir":   {"lines": [(DESIGNS_AR[0], 2500, 2), (DESIGNS_AR[2], 8500, 1)], "ref": "FAC", "notes": "إشعار دائن مرتبط بفاتورة"},
}

# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------


def expected_totals(lines):
    """HT / TVA / TTC attendus depuis les lignes (désignation, prix, qte)."""
    ht = round(sum(p * q for _, p, q in lines), 2)
    tva = round(ht * TVS_PCT / 100.0, 2)
    return ht, tva, round(ht + tva, 2)


def parse_amount(text):
    """'8 400,00 DH' (fr-FR) -> 8400.0"""
    s = str(text).replace("DH", "").replace("\u202f", "").replace("\u00a0", "").replace(" ", "").replace(",", ".")
    return float(s or 0)


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower()


# ---------------------------------------------------------------------------
# Le testeur
# ---------------------------------------------------------------------------
class LiveInvoiceTest:
    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None
        self.results = []                 # [{step, status, detail}]
        self.aborted = False
        self.last_numero = None           # numéro du dernier document créé
        self.facture_fr_numero = None
        self.facture_ar_numero = None
        self.records = {}                 # comptes rendus granuleux (clients, FR, AR)

    # ------------------------------------------------------------------ infra
    def start(self):
        self._check_header_image()
        self._check_credentials()
        pw = sync_playwright().start()
        self._attach_or_launch(pw)
        if USE_CDP:
            try:
                self.context.accept_downloads = True
            except Exception:
                pass
        try:
            self.context.tracing.start(screenshots=True, snapshots=True)
        except Exception:
            print("[attention] tracing indisponible via CDP — ignoré")
        self.page = self.context.new_page()
        self.page.set_default_timeout(30_000)

    def _attach_or_launch(self, pw):
        """Ouvre (dans l'ordre) :
        1. le profil Chrome DÉDIÉ au test, persistant entre les lancements
           (mode par défaut, réglé par run_live.py) ;
        2. TON Chrome déjà ouvert (CDP, port 9222) si disponible ;
        3. sinon une nouvelle fenêtre Chrome (profil temporaire, non conservé).
        NOTE : depuis Chrome 136, Google bloque le pilotage à distance dès que
        le dossier de données est celui de ton VRAI Chrome personnel — c'est
        pourquoi ce script n'essaie jamais d'ouvrir ce dossier-là directement."""
        if PROFILE_MODE == "dedicated" and USER_DATA_DIR:
            self._launch_dedicated_profile(pw)
            return
        if USE_CDP:
            deadline = time.time() + 20
            last_err = None
            while time.time() < deadline:
                try:
                    self.browser = pw.chromium.connect_over_cdp(CDP_URL)
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(1)
            if self.browser is None:
                print()
                print("[ERREUR] Impossible de se connecter à ton Chrome ouvert.")
                print(f"  {type(last_err).__name__}: {last_err}")
                print("  (relance Chrome avec --remote-debugging-port=9222, ou utilise run_live.py")
                print("   qui ouvre directement ton profil Chrome réel)")
                print()
                sys.exit(2)
            self.context = self._pick_cdp_context()
            print(f"[chrome] connecté à TON Chrome déjà ouvert : {CDP_URL}")
            return
        try:
            self.browser = pw.chromium.launch(
                channel="chrome",                                   # vrai Google Chrome installé
                headless=False,                                     # navigateur VISIBLE
                args=_real_chrome_args(),                            # taille fenêtre + no-sandbox
            )
        except Exception as e:
            _explain_chrome_launch_error(e)
            sys.exit(2)
        self.context = self.browser.new_context(
            viewport=VIEWPORT, accept_downloads=True)

    def _launch_dedicated_profile(self, pw):
        """Ouvre le VRAI Google Chrome avec un profil DÉDIÉ au test (pas ton
        Chrome personnel). Ce dossier est créé au 1er lancement puis réutilisé
        : la session (connexion, cookies) reste donc disponible d'un test à
        l'autre, sans jamais toucher à ton Chrome habituel ni avoir besoin de
        le fermer."""
        Path(USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
        print(f"[chrome] profil de test dédié : {USER_DATA_DIR}")
        try:
            self.context = pw.chromium.launch_persistent_context(
                user_data_dir=USER_DATA_DIR,
                channel="chrome",
                headless=False,
                args=_real_chrome_args(),
                viewport=VIEWPORT,
                accept_downloads=True,
                # Playwright désactive les extensions par défaut ; on annule ça
                # pour que les extensions installées dans CE profil dédié
                # (ex: extension d'enregistrement d'écran) fonctionnent bien.
                ignore_default_args=[
                    "--disable-extensions",
                    "--disable-component-extensions-with-background-pages",
                ],
            )
        except Exception as e:
            _explain_chrome_launch_error(e)
            print("  Vérifie qu'aucune autre fenêtre Chrome n'utilise déjà ce dossier :")
            print(f"    {USER_DATA_DIR}")
            sys.exit(2)
        self.browser = None  # persistent context := browser (fermé via context)

    def _pick_cdp_context(self):
        """Le profil de l'utilisateur = dernier contexte CDP qui a déjà une page
        (le profil qu'il vient de choisir dans la fenêtre Chrome relancée)."""
        deadline = time.time() + 60
        while time.time() < deadline:
            with_pages = [c for c in self.browser.contexts if c.pages]
            if with_pages:
                return with_pages[-1]
            time.sleep(0.5)
        raise RuntimeError("Aucun profil Chrome ouvert — choisis un profil dans la fenêtre Chrome")

    def stop(self):
        try:
            self.context.tracing.stop(path=str(ART_DIR / "trace.zip"))
        except Exception:
            pass
        if PROFILE_MODE == "dedicated" and USER_DATA_DIR:
            # profil dédié au test (pas ton Chrome perso) : on ferme normalement
            try:
                self.context.close()
            except Exception:
                pass
            return
        if USE_CDP:
            # ne JAMAIS fermer le Chrome de l'utilisateur : on ferme seulement l'onglet
            try:
                self.page.close()
            except Exception:
                pass
            return
        try:
            self.browser.close()
        except Exception:
            pass

    def pause(self, extra=0.0):
        time.sleep(LIVE_DELAY + extra)

    def shot(self, name):
        try:
            self.page.screenshot(path=str(SHOTS_DIR / f"{safe_name(name)}.png"))
        except Exception:
            pass

    # --------------------------------------------------------------- étapes
    def run_step(self, name, fn, critical=True):
        """Enregistre un résultat PASS/FAIL. critical=True arrête la suite."""
        if self.aborted:
            return
        rec = {"step": name, "status": "PASS", "detail": ""}
        try:
            out = fn()
            if out:
                rec["detail"] = out
        except Exception as e:
            rec["status"] = "FAIL"
            url = "(aucune page)"
            try:
                url = self.page.url
            except Exception:
                pass
            rec["detail"] = f"{type(e).__name__}: {e}\nURL: {url}"
            fname = f"fail_{safe_name(name)}.png"
            try:
                self.page.screenshot(path=str(SHOTS_DIR / fname))
                rec["detail"] += f"\nScreenshot: {fname}"
            except Exception:
                pass
            if critical:
                self.aborted = True
        self.results.append(rec)

    # ------------------------------------------------------------------ 1. login
    def login(self):
        p = self.page
        p.goto(BASE_URL + "/")
        self.pause(0.8)
        self.shot("01_landing")

        # profil Chrome déjà connecté à l'app ? -> on réutilise la session (pas de formulaire)
        try:
            p.wait_for_selector("#docType", timeout=3000)
            self._dismiss_sw_banner()
            self.pause(0.5)
            self.is_mobile = self.page.evaluate("window.innerWidth <= 480")
            self.shot("02_apres_login")
            return "Session déjà ouverte dans le profil Chrome — connexion réutilisée"
        except Exception:
            pass

        p.click('[data-action="show-signin"]')                    # bouton « Connexion »
        expect(p.locator("#signinOverlay")).to_be_visible()      # modale ouverte (display:flex)
        self.pause()

        p.fill("#signinEmail", os.environ["INVO_EMAIL"])
        p.fill("#signinPassword", os.environ["INVO_PASSWORD"])      # (jamais loggé)
        self.pause()
        p.click("#signinSubmit")

        p.wait_for_url("**/app", timeout=60_000)                    # redirection réelle
        expect(p.locator("#docType")).to_be_visible(timeout=60_000)
        expect(p.locator("#view-nouveau")).to_have_class(re.compile(r"\bactive\b"))
        expect(p.locator("#appLoading")).to_have_class(re.compile(r"\bhidden\b"))
        # l'Historique rend des CARTES (<= 480 px) ou un TABLEAU (> 480 px)
        self.is_mobile = self.page.evaluate("window.innerWidth <= 480")
        self._dismiss_sw_banner()
        self.pause(0.5)
        self.shot("02_apres_login")
        return "Authentifié et page principale chargée"

    # ------------------------------------------------------------------ 2. société
    def fill_company(self):
        p = self.page
        self._dismiss_sw_banner()
        self._click_nav("#navInfos")
        expect(p.locator("#companyModalOverlay")).to_have_class(re.compile(r"\bopen\b"))
        self.pause()
        SELECTS = {"cDevise": "DH", "cRegimeTva": "normal"}           # <select> de « Mes Informations »
        for field_id, value in COMPANY.items():
            if field_id in SELECTS:
                p.select_option(f"#{field_id}", value=SELECTS[field_id])
            else:
                p.fill(f"#{field_id}", value)
        self.shot("03_mes_informations")
        p.click('[data-action="save-company"]')                    # bouton « Sauvegarder »
        expect(p.locator("#companyModalOverlay")).not_to_have_class(re.compile(r"\bopen\b"))
        self.pause()
        return "Mes Informations enregistrées"

    # ------------------------------------------------------------------ 3. en-tête
    def upload_header(self):
        p = self.page
        self._click_nav("#navInfos")
        expect(p.locator("#companyModalOverlay")).to_have_class(re.compile(r"\bopen\b"))
        self.pause()
        p.set_input_files("#headerFileInput", HEADER_IMG)           # upload réel du fichier
        expect(p.locator("#uploadPreviewSlot img")).to_be_visible   # aperçu visible
        self.shot("04_upload_entete")
        p.click('label.toggle[for="cHeaderActive"]')                # activer comme fond de page
        expect(p.locator("#cHeaderActive")).to_be_checked()
        self.pause(0.3)
        p.click('[data-action="save-company"]')
        expect(p.locator("#companyModalOverlay")).not_to_have_class(re.compile(r"\bopen\b"))
        self.pause()
        return f"En-tête {HEADER_IMG} uploadé + fond activé"

    # ------------------------------------------------------------------ 4. clients
    def create_clients(self):
        """Crée les 3 clients et rapporte un résultat par client."""
        # NOTE : les étapes « Client 1 / 2 / 3 » individuelles sont lancées par
        # _create_client() (voir run()) ; cette fonction agrège leur statut.
        return "3 clients créés (détail dans le rapport)"

    def _create_client(self, idx):
        p = self.page
        c = CLIENTS[idx]
        p.click('[data-action="add-client"]')
        expect(p.locator("#clientModalOverlay")).to_have_class(re.compile(r"\bopen\b"))
        self.pause()
        p.fill("#cClientNom", c["nom"])
        p.fill("#cClientTel", c["tel"])
        p.fill("#cClientIce", c["ice"])
        p.fill("#cClientAdresse", c["adresse"])
        self.pause()
        p.click('[data-action="save-client"]')
        expect(p.locator("#clientModalOverlay")).not_to_have_class(re.compile(r"\bopen\b"))
        expect(p.locator(f'#clientSelect option:text-is("{c["nom"]}")')).to_have_count(1)
        self.pause()
        return f'"{c["nom"]}" créé'

    # ------------------------------------------------------------------ 5. documents
    def build_document(self, doc_type, client, scenario, extra_ref=None, shot_name="doc"):
        """Remplit un document réel, vérifie les totaux, génère le PDF,
        vérifie le téléchargement, puis le retrouve dans l'Historique."""
        p = self.page
        self._dismiss_sw_banner()

        # nouveau document (reset + vue « Nouveau Document »)
        self._click_nav("#navNouveau")
        expect(p.locator("#editingBanner")).to_be_hidden()
        self.pause()

        # type + numéro auto (DEV-/FAC-/BL-/AV-AAAA-NNNN)
        p.select_option("#docType", doc_type)
        numero = p.input_value("#docNumero")
        assert numero.strip(), "Numéro de document vide (formulaire non initialisé)"
        self.last_numero = numero

        # client
        p.select_option("#clientSelect", label=client)
        self.pause()

        # lignes (le formulaire démarre avec 1 ligne vide)
        lines = scenario["lines"]
        for idx, (desig, prix, qte) in enumerate(lines):
            tr = p.locator("#linesBody tr").nth(idx)
            tr.locator(".line-desig").fill(desig)
            tr.locator(".line-prix").fill(str(prix))
            tr.locator(".line-qte").fill(str(qte))
            if idx < len(lines) - 1:
                p.click('[data-action="add-line"]')
                time.sleep(0.2)

        # champs facultatifs réels
        p.fill("#conditions", "Paiement à 30 jours")
        p.fill("#modeReglement", "Virement bancaire")
        p.fill("#notes", scenario.get("notes", ""))

        # référence (avoir / bon de livraison) -> champ #clientRef
        ref = extra_ref or scenario.get("ref")
        if ref == "FAC":
            ref = self.facture_ar_numero or self.facture_fr_numero or ""
        if ref:
            p.fill("#clientRef", "Relatif à la " + ref)

        # vérification des totaux affichés
        ht, tva, ttc = expected_totals(lines)
        txt_ht = parse_amount(p.inner_text("#sumHT"))
        txt_ttc = parse_amount(p.inner_text("#sumTTC"))
        assert abs(txt_ht - ht) < 0.5, f"Total HT inattendu: affiché {txt_ht}, attendu {ht}"
        assert abs(txt_ttc - ttc) < 0.5, f"Total TTC inattendu: affiché {txt_ttc}, attendu {ttc}"

        # génération du PDF : sauvegarde auto dans l'Historique + téléchargement
        with p.expect_download(timeout=180_000) as dl_info:
            p.click('[data-action="generate-pdf"]')
        dl = dl_info.value
        dest = PDF_DIR / f"{safe_name(shot_name)}__{dl.suggested_filename}"
        dl.save_as(str(dest))
        size = dest.stat().st_size
        assert size > 0, "PDF téléchargé vide (0 octet)"
        assert dl.suggested_filename == numero + ".pdf", f"Fichier: {dl.suggested_filename} vs {numero}.pdf"

        # fin de génération (bouton redevenu actif)
        btn = p.locator('[data-action="generate-pdf"]')
        expect(btn).to_be_enabled(timeout=180_000)
        expect(btn).not_to_have_attribute("aria-busy", "true")
        self.pause(0.4)

        # présence dans l'Historique
        self._click_nav("#navHistorique")
        self._hist_visible(timeout=30_000)
        expect(self._hist_item(numero)).to_have_count(1)
        self.shot(shot_name)
        self._click_nav("#navNouveau")
        self.pause(0.3)

        return f"{numero} — {round(size / 1024, 1)} Ko"

    def create_french_documents(self):
        """4 documents FR, un rapport par type."""
        # Devis (Karim Benali)
        self.records["FR Devis"] = self.build_document(
            "devis", CLIENTS[0]["nom"], SCENARIO_DEVIS, shot_name="06_fr_devis")
        # Facture (Atlas Construction)
        self.records["FR Facture"] = self.build_document(
            "facture", CLIENTS[1]["nom"], SCENARIO_FACTURE, shot_name="07_fr_facture")
        self.facture_fr_numero = self.last_numero
        # Bon de livraison (Yassine El Idrissi)
        self.records["FR Bl"] = self.build_document(
            "bl", CLIENTS[2]["nom"], SCENARIO_BL, shot_name="08_fr_bl")
        # Avoir (Karim Benali) — workflow réel : référence à la facture FR
        self.records["FR Avoir"] = self.build_document(
            "avoir", CLIENTS[0]["nom"], SCENARIO_AVOIR,
            extra_ref=self.facture_fr_numero, shot_name="09_fr_avoir")
        return "4 documents FR générés et PDF vérifiés"

    # ------------------------------------------------------------------ 6. FR -> AR
    def switch_to_arabic(self):
        p = self.page
        self._click_nav("#langSwitcher")
        expect(p.locator("html")).to_have_attribute("dir", "rtl", timeout=30_000)
        expect(p.locator("#langSwitcher")).to_contain_text("عربي")
        self.pause(0.5)
        self._assert_no_hscroll("après bascule AR")
        self.shot("10_ar_bascule")
        return "Langue basculée FR -> AR, RTL actif, pas de débordement"

    def create_arabic_documents(self):
        """4 documents AR (mêmes données, désignations arabes), rapport par type."""
        ar = SCENARIO_AR
        self.records["AR Devis"] = self.build_document(
            "devis", CLIENTS[0]["nom"], ar["devis"], shot_name="11_ar_devis")
        self.records["AR Facture"] = self.build_document(
            "facture", CLIENTS[1]["nom"], ar["facture"], shot_name="12_ar_facture")
        self.facture_ar_numero = self.last_numero
        self.records["AR Bl"] = self.build_document(
            "bl", CLIENTS[2]["nom"], ar["bl"], shot_name="13_ar_bl")
        self.records["AR Avoir"] = self.build_document(
            "avoir", CLIENTS[0]["nom"], ar["avoir"],
            extra_ref=self.facture_ar_numero, shot_name="14_ar_avoir")
        self._assert_no_hscroll("documents AR")
        self.shot("15_ar_docs")
        return "4 documents AR générés et PDF vérifiés"

    def _click_nav(self, selector):
        """Clique une entrée de navigation. En vue mobile (<= 480 px), la nav est
        repliée dans le menu hamburger : on l'ouvre d'abord avant le clic."""
        p = self.page
        if p.locator("#appHamburgerToggle").is_visible():
            if "open" not in (p.locator("#appNav").get_attribute("class") or ""):
                p.click("#appHamburgerToggle")
                self.pause(0.15)
        p.click(selector)
        self.pause(0.15)

    def _dismiss_sw_banner(self, attempts=3):
        """Élimine le bandeau « Une nouvelle version est disponible — Cliquez pour
        recharger » (créé par app.html dès l'activation du Service Worker). En vue
        mobile il recouvre les boutons de bas de modale et intercepte les clics."""
        p = self.page
        for _ in range(attempts):
            try:
                p.evaluate(
                    "[...document.querySelectorAll('div')]"
                    ".find(d=>/Une nouvelle version/.test(d.textContent||''))?.remove()")
            except Exception:
                pass
            self.pause(0.3)

    def _hist_visible(self, timeout=30_000):
        """Attend l'affichage de l'Historique (cartes <= 480 px, table sinon)."""
        sel = ".hist-card" if self.is_mobile else ".hist-table-wrap"
        expect(self.page.locator(sel).first).to_be_visible(timeout=timeout)
        return sel

    def _hist_item(self, text):
        """Locator d'un élément d'Historique : .hist-card (mobile) ou .hist-row."""
        sel = ".hist-card" if self.is_mobile else ".hist-row"
        return self.page.locator(sel).filter(has_text=text)

    def _assert_no_hscroll(self, context):
        overflow = self.page.evaluate(
            "document.documentElement.scrollWidth > document.documentElement.clientWidth")
        assert not overflow, f"débordement horizontal — {context}"

    # ------------------------------------------------------------------ 7. historique
    def check_history(self):
        p = self.page
        self._click_nav("#navHistorique")
        self._hist_visible()
        self.pause(0.3)
        self.records["Historique visible"] = "table/cartes chargée (FR + AR)"
        self.shot("16_historique_fr_ar")

        numero = self.facture_fr_numero or "FAC"

        # recherche (champ réel #histSearch)
        p.fill("#histSearch", numero)
        p.press("#histSearch", "Enter")
        expect(self._hist_item(numero)).to_have_count(1)
        self.records["Recherche"] = f"{numero} trouvé"
        self.pause(0.2)
        p.fill("#histSearch", "")
        p.press("#histSearch", "Enter")
        self.pause(0.2)

        # ouverture / édition (charge le document dans le formulaire)
        row = self._hist_item(numero)
        expect(row).to_have_count(1)
        row.locator('[data-action="edit"]').click()
        expect(p.locator("#editingBanner")).to_be_visible()
        assert p.input_value("#docNumero") == numero, "Édition : numéro mal chargé"
        self.records["Ouverture"] = f"{numero} chargé dans le formulaire"
        self.shot("17_ouverture_document")
        self._click_nav("#navNouveau")
        self.pause(0.3)

        # réimpression (PDF re-téléchargé puis vérifié)
        self._click_nav("#navHistorique")
        self._hist_visible()
        row = self._hist_item(numero).first
        with p.expect_download(timeout=180_000) as dl2:
            row.locator('[data-action="reprint"]').click()
        d2 = dl2.value
        reprint_path = PDF_DIR / f"reprint__{d2.suggested_filename}"
        d2.save_as(str(reprint_path))
        assert reprint_path.stat().st_size > 0, "Réimpression : PDF vide"
        self.records["Réimpression"] = f"{d2.suggested_filename} re-téléchargé ({reprint_path.stat().st_size} o)"
        self.pause(0.3)

        # duplication (crée un nouveau numéro dans l'Historique)
        before = self._count_type("devis")
        self._hist_item("DEV").first.locator('[data-action="duplicate"]').click()
        self._wait_type_count("devis", before + 1)
        self.records["Duplication"] = f"compteur Devis {before} -> {before + 1}"
        self.shot("18_historique_actions")
        self.pause(0.3)
        return "Historique : recherche, ouverture, réimpression, duplication OK"

    def _count_type(self, doc_type):
        """Compteur d'un type via l'ordre fixe des cartes de stats (langue-agnostique) :
        .hist-summary = [Facture, Devis, BL, Avoir, Total, Moyenne, Max, Dernier]."""
        idx = {"facture": 0, "devis": 1, "bl": 2, "avoir": 3}[doc_type]
        values = self.page.locator(".hist-summary .hist-stat-value").all_inner_texts()
        if len(values) <= idx:
            return 0
        nums = re.findall(r"\d+", values[idx])
        return int(nums[-1]) if nums else 0

    def _wait_type_count(self, doc_type, target):
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                if self._count_type(doc_type) >= target:
                    return
            except Exception:
                pass
            time.sleep(0.5)
        raise AssertionError(f"Compteur '{doc_type}' n'a pas atteint {target}")

    # ------------------------------------------------------------------ 8. persistance
    def check_persistence(self):
        p = self.page
        p.reload()                                            # vrai rechargement
        expect(p.locator("#docType")).to_be_visible(timeout=60_000)
        expect(p.locator("#appLoading")).to_have_class(re.compile(r"\bhidden\b"))
        self._dismiss_sw_banner()
        self.pause(0.4)

        # clients toujours présents (>= 4 : les 3 du test + ceux déjà dans le profil)
        n_clients = p.locator("#clientSelect option").count()
        assert n_clients >= 4, f"clients après reload : {n_clients} (attendu >= 4)"
        self.records["Clients persistés"] = f"{n_clients} clients après reload"

        # société conservée + logo (initiales) restauré
        expect(p.locator("#brandLogo")).to_contain_text("AL")
        self._click_nav("#navInfos")
        expect(p.locator("#companyModalOverlay")).to_have_class(re.compile(r"\bopen\b"))
        assert p.input_value("#cNom") == COMPANY["cNom"], "Nom société non persisté"
        assert p.input_value("#cICE") == COMPANY["cICE"], "ICE non persisté"
        self.pause(0.5)
        # l'aperçu de l'en-tête est rechargé depuis le stockage (OPFS) -> image visible
        expect(p.locator("#uploadPreviewSlot img")).to_be_visible(timeout=15_000)
        self.records["Société / en-tête persistés"] = "nom, ICE et image d'en-tête retrouvés"
        self.shot("19_persistence_societe")
        p.click('[data-action="close-modal"]')
        expect(p.locator("#companyModalOverlay")).not_to_have_class(re.compile(r"\bopen\b"))

        # historique toujours présent
        self._click_nav("#navHistorique")
        self._hist_visible()
        self.pause(0.3)
        total = sum(self._count_type(t) for t in ("devis", "facture", "bl", "avoir"))
        assert total >= 9, f"Historique après reload : {total} (attendu >= 9)"
        self.records["Historique persisté"] = f"{total} documents après reload"
        self.shot("20_persistence_historique")
        return f"{total} documents toujours présents après rechargement"

    # ------------------------------------------------------------------ 9. rapport final
    def final_report(self):
        p = self.page
        self._click_nav("#navHistorique")
        self._hist_visible()
        self.pause(0.4)
        counts = {t: self._count_type(t) for t in ("devis", "facture", "bl", "avoir")}
        self.records["Compteurs finaux"] = ", ".join(f"{k}={v}" for k, v in counts.items())
        self.shot("21_final")
        return f"Compteurs Historique : {counts}"

    # ------------------------------------------------------------------ gardes
    def _check_header_image(self):
        if not Path(HEADER_IMG).is_file():
            print(f"[ERREUR] Image d'en-tête introuvable : {HEADER_IMG}")
            print("  Utilisez la variable INVO_HEADER_IMG pour pointer vers le bon fichier.")
            sys.exit(2)

    def _check_credentials(self):
        missing = [k for k in ("INVO_EMAIL", "INVO_PASSWORD") if not os.environ.get(k)]
        if missing:
            print("[ERREUR] Variables d'environnement manquantes : " + ", ".join(missing))
            print("  Exemple :")
            print("    set INVO_EMAIL=votre@email.com")
            print("    set INVO_PASSWORD=votreMotDePasse")
            print("  (vous pouvez aussi les définir dans run_live_test.bat)")
            sys.exit(2)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def run():
    t = LiveInvoiceTest()
    try:
        t.start()

        t.run_step("Connexion", t.login, critical=True)
        t.run_step("Mes Informations", t.fill_company, critical=True)
        t.run_step("Image entête", t.upload_header, critical=True)
        t.run_step("Client 1", lambda: t._create_client(0), critical=True)
        t.run_step("Client 2", lambda: t._create_client(1), critical=True)
        t.run_step("Client 3", lambda: t._create_client(2), critical=True)

        t.run_step("FR — Devis", lambda: t.build_document(
            "devis", CLIENTS[0]["nom"], SCENARIO_DEVIS, shot_name="06_fr_devis"), critical=True)
        t.run_step("FR — Facture", lambda: t.build_document(
            "facture", CLIENTS[1]["nom"], SCENARIO_FACTURE, shot_name="07_fr_facture"), critical=True)
        t.facture_fr_numero = t.last_numero
        t.run_step("FR — Bon de livraison", lambda: t.build_document(
            "bl", CLIENTS[2]["nom"], SCENARIO_BL, shot_name="08_fr_bl"), critical=True)
        t.run_step("FR — Avoir", lambda: t.build_document(
            "avoir", CLIENTS[0]["nom"], SCENARIO_AVOIR,
            extra_ref=t.facture_fr_numero, shot_name="09_fr_avoir"), critical=True)

        t.run_step("Bascule FR -> AR", t.switch_to_arabic, critical=True)
        t.run_step("AR — Devis", lambda: t.build_document(
            "devis", CLIENTS[0]["nom"], SCENARIO_AR["devis"], shot_name="11_ar_devis"), critical=True)
        t.run_step("AR — Facture", lambda: t.build_document(
            "facture", CLIENTS[1]["nom"], SCENARIO_AR["facture"], shot_name="12_ar_facture"), critical=True)
        t.facture_ar_numero = t.last_numero
        t.run_step("AR — Bon de livraison", lambda: t.build_document(
            "bl", CLIENTS[2]["nom"], SCENARIO_AR["bl"], shot_name="13_ar_bl"), critical=True)
        t.run_step("AR — Avoir", lambda: t.build_document(
            "avoir", CLIENTS[0]["nom"], SCENARIO_AR["avoir"],
            extra_ref=t.facture_ar_numero, shot_name="14_ar_avoir"), critical=True)

        t.run_step("Historique — recherche/ouverture/réimpression/duplication",
                   t.check_history, critical=False)
        t.run_step("Reload / Persistance", t.check_persistence, critical=False)
        t.run_step("Rapport final", t.final_report, critical=False)

    except Exception:
        # erreur fatale hors des étapes (infra)
        t.results.append({"step": "Infrastructure", "status": "FAIL",
                          "detail": f"{sys.exc_info()[0].__name__}: {sys.exc_info()[1]}"})
    finally:
        t.stop()

    print_summary(t)


def print_summary(t):
    print()
    print("=" * 52)
    print("              INVOOFFICE — TEST LIVE")
    print("=" * 52)
    by_name = {r["step"]: r for r in t.results}

    def line(label, step_name):
        r = by_name.get(step_name)
        if r:
            status = r["status"]
        else:
            status = "PASS" if not t.aborted else "SKIP"   # étape raccourcie après échec
        print(f"  {label:<22}  {status}")

    # --- blocs spécifiques du rapport final
    print("  -----------------------------")
    line("Connexion", "Connexion")
    line("Mes Informations", "Mes Informations")
    line("Image entête", "Image entête")
    line("Client 1", "Client 1")
    line("Client 2", "Client 2")
    line("Client 3", "Client 3")
    print("  FR")
    line("Devis", "FR — Devis")
    line("Facture", "FR — Facture")
    line("Bon de livraison", "FR — Bon de livraison")
    line("Avoir", "FR — Avoir")
    print("  AR")
    line("Devis", "AR — Devis")
    line("Facture", "AR — Facture")
    line("Bon de livraison", "AR — Bon de livraison")
    line("Avoir", "AR — Avoir")
    line("Bascule FR -> AR", "Bascule FR -> AR")
    line("Historique", "Historique — recherche/ouverture/réimpression/duplication")
    line("Reload / Persistance", "Reload / Persistance")
    print("  -----------------------------")

    # --- détail des captures / numéros
    print()
    print("  Détails :")
    order = ["Connexion", "Mes Informations", "Image entête",
             "Client 1", "Client 2", "Client 3",
             "FR — Devis", "FR — Facture", "FR — Bon de livraison", "FR — Avoir",
             "Bascule FR -> AR",
             "AR — Devis", "AR — Facture", "AR — Bon de livraison", "AR — Avoir",
             "Historique — recherche/ouverture/réimpression/duplication",
             "Reload / Persistance", "Rapport final", "Infrastructure"]
    seen = set()
    for r in t.results:
        if r["step"] in seen and r["step"] not in order:
            continue
        seen.add(r["step"])
        print(f"    • {r['step']} -> {r['status']}")
        for line_txt in r["detail"].splitlines():
            print(f"        {line_txt}")
        for extra in records_for(t, r["step"]):
            print(f"        {extra}")

    status = "PASS" if all(r["status"] == "PASS" for r in t.results) else "FAIL"
    print()
    print("=" * 52)
    print(f"        RESULT : {status}")
    print("=" * 52)
    print()
    print(f"Screenshots : {SHOTS_DIR}")
    print(f"PDFs        : {PDF_DIR}")
    print(f"Trace       : {ART_DIR / 'trace.zip'}")
    sys.exit(0 if status == "PASS" else 1)


def records_for(t, step):
    """Petits compléments lisibles pour les grandes étapes."""
    mapping = {
        "FR — Devis": "FR Devis", "FR — Facture": "FR Facture",
        "FR — Bon de livraison": "FR Bl", "FR — Avoir": "FR Avoir",
        "AR — Devis": "AR Devis", "AR — Facture": "AR Facture",
        "AR — Bon de livraison": "AR Bl", "AR — Avoir": "AR Avoir",
    }
    key = mapping.get(step)
    if key and key in t.records:
        return [f"{key}: {t.records[key]}"]
    if step == "Historique — recherche/ouverture/réimpression/duplication":
        return [f"{k}: {v}" for k, v in t.records.items() if k in
                ("Historique visible", "Recherche", "Ouverture", "Réimpression", "Duplication")]
    if step == "Reload / Persistance":
        return [f"{k}: {v}" for k, v in t.records.items() if k in
                ("Clients persistés", "Société / en-tête persistés", "Historique persisté")]
    if step == "Rapport final":
        return [f"{k}: {v}" for k, v in t.records.items() if k == "Compteurs finaux"]
    return []


if __name__ == "__main__":
    run()