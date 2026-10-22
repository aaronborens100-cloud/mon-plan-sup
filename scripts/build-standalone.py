#!/usr/bin/env python3
"""Construit la version tout-en-un de Mon Plan Sup : dist/index.html.

Le CSS, les scripts, les données (data/*.json) et pdf.js (vendor/) sont intégrés
dans un seul fichier HTML, qu'on peut publier comme artefact Claude ou ouvrir
directement depuis le disque (sans serveur).

Usage : python3 scripts/build-standalone.py [fichier_de_sortie]
"""
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent

# Ordre des blocs dans la page (identique à la version d'origine).
DONNEES = ["formations", "questionnaire", "parcoursup", "fusion", "stats", "statuts-stats", "stats-manuelles", "frais-prives", "generees", "filieres",
           "ajustements", "lieux", "metiers", "poursuites", "extrascolaire"]
SCRIPTS = ["store", "bulletin", "moteur", "app"]

LIEN_CSS = '<link rel="stylesheet" href="css/styles.css">\n'


def lire(chemin):
    return (RACINE / chemin).read_text(encoding="utf-8")


def bloc(type_, id_, contenu):
    # Un « </script> » dans le contenu fermerait le bloc avant la fin.
    if "</script" in contenu.lower():
        sys.exit(f"Erreur : « </script> » présent dans le contenu de {id_}.")
    return f'<script type="{type_}" id="{id_}">{contenu}</script>'


def construire():
    page = lire("index.html")

    presents = sorted(p.stem for p in (RACINE / "data").glob("*.json"))
    if presents != sorted(DONNEES):
        sys.exit(f"Erreur : data/ ne correspond pas à la liste DONNEES du script.\n"
                 f"  dans data/ : {presents}\n  attendu    : {sorted(DONNEES)}")

    if LIEN_CSS not in page:
        sys.exit("Erreur : lien vers css/styles.css introuvable dans index.html.")
    page = page.replace(LIEN_CSS, "<style>\n" + lire("css/styles.css") + "\n</style>\n")

    balises = "".join(f'<script src="js/{nom}.js"></script>\n' for nom in SCRIPTS)
    if balises not in page:
        sys.exit("Erreur : balises <script src=\"js/…\"> introuvables (ou dans un autre ordre) dans index.html.")
    integre = "\n".join(
        [bloc("application/json", "data-" + nom, lire(f"data/{nom}.json")) for nom in DONNEES]
        + [bloc("text/plain", "src-pdfjs-worker", lire("vendor/pdfjs.worker.js")),
           bloc("text/plain", "src-pdfjs", lire("vendor/pdfjs.js"))]
    )
    code = "<script>\n" + "\n".join(lire(f"js/{nom}.js") for nom in SCRIPTS) + "\n</script>\n"
    return page.replace(balises, integre + "\n\n" + code)


if __name__ == "__main__":
    sortie = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE / "dist" / "index.html"
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(construire(), encoding="utf-8", newline="")
    print(f"{sortie} : {sortie.stat().st_size / 1e6:.1f} Mo")
