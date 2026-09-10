# -*- coding: utf-8 -*-
"""
LANCEUR INTERACTIF — TEST LIVE INVOOFFICE
=========================================
Double-clique ce fichier : il affiche les réglages du test, tu les ajustes,
puis il lance le test (navigateur visible, VRAI Google Chrome) avec ces réglages.

Réglages mémorisés dans  tests/live/live_config.json  (créé au 1er lancement) :
    INVO_EMAIL           adresse de connexion
    INVO_DELAY           pause entre actions (s)   ex : 0 , 1 , 3
    INVO_VIEWPORT        taille de fenêtre LARGEURxHAUTEUR   ex : 390x844 (mobile)
    INVO_BASE_URL        URL du site (défaut serveur local)
    INVO_HEADER_IMG      chemin de l'image d'en-tête
    INVO_PROFILE_MODE    'dedicated' (recommandé) ou 'fresh'
    INVO_NO_SANDBOX      '1' = lance Chrome avec --no-sandbox

À PROPOS DU PROFIL CHROME
--------------------------
Depuis Chrome 136, Google BLOQUE le pilotage à distance (ce qu'utilise
Playwright) dès que le dossier de données pointe vers TON vrai dossier
Chrome (celui de tes navigations quotidiennes) — quel que soit le sous-profil
choisi (Default, Profile 1, ...). C'est une protection de sécurité, pas un
bug : ce script ne peut donc PAS piloter ton Chrome perso directement.

À la place, deux modes sont proposés :
  - "dedicated" (recommandé) : un profil Chrome DÉDIÉ au test, séparé de ton
    Chrome perso, mais qui reste enregistré entre deux lancements (cookies,
    session). Comme le test se connecte déjà automatiquement avec ton email
    et mot de passe à chaque lancement, tu ne perds rien.
  - "fresh" : une fenêtre Chrome toute neuve à chaque lancement (rien n'est
    conservé d'une fois sur l'autre).

Dans les deux cas, c'est le VRAI Google Chrome qui s'ouvre (pas un
navigateur simplifié) — tu n'as pas besoin de fermer ton Chrome habituel.

Le MOT DE PASSE n'est JAMAIS enregistré ni affiché : saisi à chaque lancement.
"""
import getpass
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
TEST_SCRIPT = ROOT / "tests" / "live" / "live_invoice_test.py"
CONFIG_FILE = ROOT / "tests" / "live" / "live_config.json"
DEDICATED_PROFILE_DIR = ROOT / "tests" / "live" / "chrome_profile"

# Valeurs proposées au premier lancement (>>>: à modifier ici si besoin)
DEFAULTS = {
    "INVO_EMAIL": "",
    "INVO_DELAY": "3",
    "INVO_VIEWPORT": "390x844",
    "INVO_BASE_URL": "http://localhost:3000",
    "INVO_HEADER_IMG": str(ROOT / "entit.png"),
    "INVO_PROFILE_MODE": "dedicated",     # 'dedicated' (recommandé) ou 'fresh'
    "INVO_NO_SANDBOX": "1",               # '1' = lance Chrome avec --no-sandbox
}


def load_config():
    cfg = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            for k in DEFAULTS:
                if data.get(k):
                    cfg[k] = str(data[k])
        except Exception:
            pass
    return cfg


def save_config(cfg):
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(
            json.dumps({k: cfg[k] for k in DEFAULTS if k != "INVO_PASSWORD"},
                       ensure_ascii=False, indent=2),
            encoding="utf-8")
    except Exception as e:
        print(f"[attention] réglages non mémorisés : {e}")


def ask(label, current, secret=False):
    if secret:
        v = getpass.getpass(f"  {label} : ").strip()
        return v
    prompt = f"  {label} [invio = {current or 'vide'}]: "
    v = input(prompt).strip()
    return v or current


def choose_profile_mode(cfg):
    """'dedicated' (profil dédié persistant, recommandé) ou 'fresh' (fenêtre neuve à chaque fois)."""
    current = cfg.get("INVO_PROFILE_MODE", "dedicated")
    print("  Profil Chrome à utiliser pour le test :")
    print("    d = dédié et persistant (recommandé — session conservée entre les tests)")
    print("    f = neuf à chaque lancement (rien n'est conservé)")
    default_letter = "d" if current != "fresh" else "f"
    choice = ask("Choix (d/f)", default_letter).strip().lower()
    if choice in ("f", "fresh", "neuf"):
        return "fresh"
    return "dedicated"


def main():
    env = dict(os.environ)
    cfg = load_config()

    print()
    print("=" * 56)
    print("   INVOOFFICE - TEST LIVE - RÉGLAGES")
    print("   (appuie sur Ctrl+C à tout moment pour quitter)")
    print("=" * 56)

    # 1. Identifiants (le mot de passe reste secret, jamais enregistré)
    print()
    print("  Identifiants de connexion")
    email = ask("Email", env.get("INVO_EMAIL") or cfg["INVO_EMAIL"])
    pwd = ask("Mot de passe", "(saisie masquée)", secret=True)
    if not email or not pwd:
        print("\n[ERREUR] Email et mot de passe sont obligatoires.")
        input("\nAppuyez sur Entrée pour fermer...")
        sys.exit(2)

    # 2. Réglages du test
    print()
    print("  Réglages du test")
    delay = ask("Pause entre actions (s)", cfg["INVO_DELAY"])
    viewport = ask("Fenêtre LARGEURxHAUTEUR (ex 1920x1080, 390x844)", cfg["INVO_VIEWPORT"])
    url = ask("URL du site", env.get("INVO_BASE_URL") or cfg["INVO_BASE_URL"])
    header = ask("Image d'en-tête (chemin)", cfg["INVO_HEADER_IMG"])
    no_sandbox = ask("Lancer Chrome en mode --no-sandbox (o/n)",
                      "o" if cfg.get("INVO_NO_SANDBOX", "1") == "1" else "n").strip().lower()
    no_sandbox = "1" if no_sandbox in ("o", "oui", "y", "yes", "1", "") else "0"
    print()
    profile_mode = choose_profile_mode(cfg)

    # 3. Mémorisation (tout sauf le mot de passe)
    cfg["INVO_EMAIL"] = email
    cfg["INVO_DELAY"] = delay
    cfg["INVO_VIEWPORT"] = viewport
    cfg["INVO_BASE_URL"] = url
    cfg["INVO_HEADER_IMG"] = header
    cfg["INVO_PROFILE_MODE"] = profile_mode
    cfg["INVO_NO_SANDBOX"] = no_sandbox
    save_config(cfg)

    env["INVO_EMAIL"] = email
    env["INVO_PASSWORD"] = pwd
    env["INVO_DELAY"] = delay
    env["INVO_VIEWPORT"] = viewport
    env["INVO_BASE_URL"] = url
    env["INVO_HEADER_IMG"] = header
    env["INVO_NO_SANDBOX"] = no_sandbox
    env["INVO_CDP"] = "0"
    env["INVO_PROFILE_MODE"] = profile_mode
    if profile_mode == "dedicated":
        env["INVO_USER_DATA_DIR"] = str(DEDICATED_PROFILE_DIR)

    print()
    print("=" * 56)
    print("   Lancement du test live (navigateur visible)...")
    print(f"   INVO_DELAY     = {delay}")
    print(f"   INVO_VIEWPORT  = {viewport}")
    print(f"   INVO_BASE_URL  = {url}")
    print(f"   INVO_HEADER_IMG= {header}")
    profil_label = ("dédié (" + str(DEDICATED_PROFILE_DIR) + ")") if profile_mode == "dedicated" \
        else "nouvelle fenêtre à chaque fois"
    print(f"   PROFIL CHROME  = {profil_label}")
    print(f"   NO_SANDBOX     = {'oui' if no_sandbox == '1' else 'non'}")
    print("=" * 56)
    print()

    code = subprocess.call([sys.executable, str(TEST_SCRIPT)],
                           cwd=str(ROOT), env=env)

    print()
    if code == 0:
        print("==== SUCCES : tous les PASS verifies ====")
    else:
        print("==== ECHEC : consultez le rapport + screenshots/artifacts ====")
    input("\nAppuyez sur Entrée pour fermer...")
    sys.exit(code if code in (0, 1) else 1)


if __name__ == "__main__":
    main()
