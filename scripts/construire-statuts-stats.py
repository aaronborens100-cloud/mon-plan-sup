#!/usr/bin/env python3
"""Classe les formations Parcoursup du périmètre qui n'ont pas de statistiques 2025 dans data/stats.json.

Produit :
  - data/statuts-stats.json : un statut par code gta sans statistiques 2025 :
      « nouvelle_2026 » : formation qui n'a jamais eu de session Parcoursup ;
      « avec_stats »    : statistiques retrouvées dans la session SESSION_RECENTE (2024) : elles servent
                          comme des statistiques normales (« statistiques de la session 2024 ») ;
      « sans_stats »    : formation qui existait, mais dont les statistiques ne sont pas publiées,
                          pas retrouvées, ou plus anciennes que 2024 (affichées pour information seulement).
    avec une certitude :
      « verifiee » : le code a été cherché dans les fichiers officiels des sessions antérieures ;
      « probable » : seulement d'après le code (sans les sessions antérieures) : les codes gta sont
                     attribués dans l'ordre de création, un code plus grand que le plus grand code
                     de stats.json (session 2025) désigne très probablement une formation créée
                     pour la session 2026.
  - docs/formations-sans-stats.csv : les « sans_stats » sans relevé manuel (hors formations affichées
    avec une fiche de data/formations.json), triées par priorité,
    avec le lien vers la fiche Parcoursup et des colonnes vides au format de data/stats-manuelles.json.

Vérifie aussi data/stats-manuelles.json (relevés faits à la main) : une entrée sans source, sans date
de consultation ou mal formée arrête le script avec un message d'erreur.

Sessions antérieures (facultatif) : --historique DOSSIER, où DOSSIER contient les exports CSV
(séparateur « ; ») du jeu officiel « Parcoursup : vœux de poursuite d'études et réponses des
établissements » pour chaque session, par exemple :
  https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/download/?format=csv
  (et fr-esr-parcoursup_2024, fr-esr-parcoursup_2023… pour les sessions précédentes)
Chaque fichier doit avoir les colonnes « session » et « cod_aff_form » (code gta). Avec la session 2025,
le script compare aussi stats.json au fichier 2025 complet et signale les lignes perdues.
Préciser la date de téléchargement avec --consulte-le AAAA-MM-JJ.

Aucun chiffre n'est estimé : sans fichier officiel ni relevé sourcé, la formation n'a pas de chiffres.

Usage : python3 scripts/construire-statuts-stats.py [--historique DOSSIER --consulte-le AAAA-MM-JJ]
"""
import argparse
import csv
import datetime
import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
DATA = RACINE / "data"
SORTIE = DATA / "statuts-stats.json"
MANUELLES = DATA / "stats-manuelles.json"
CSV_SORTIE = RACINE / "docs" / "formations-sans-stats.csv"

URL_STATS = "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/"
FICHE = "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod={}&typeBac=0&originePc=0"

# Priorité des relevés manuels, d'après la catégorie Parcoursup (tf) de la formation
PRIORITE_1 = {"Licence", "Licence sélective", "LPE - Licence Professorat des Ecoles", "Etudes de santé",
              "Formations des écoles d'ingénieurs", "C.M.I - Cursus Master en Ingénierie",
              "Formations des écoles de commerce et de management", "I.A.E - Instituts d'administration des entreprises",
              "Sciences Po - Instituts d'études politiques", "CPGE"}
PRIORITE_2 = {"Formations diplômantes du travail social", "DCG", "DEUST",
              "Formations d'art, de design et du spectacle vivant", "Formations d'architecture, du paysage et du patrimoine"}

# Format d'une entrée de data/stats-manuelles.json (même ordre que les colonnes vides du CSV)
CHAMPS_MANUELS = ["taux", "places", "voeux", "admis", "session", "source", "consulte_le", "statut"]
# Session antérieure la plus ancienne dont les statistiques rendent la formation éligible aux listes
SESSION_RECENTE = "2024"
# Colonnes du fichier officiel reprises pour les sessions antérieures
COLS_HISTO = {"taux": "taux_acces_ens", "places": "capa_fin", "voeux": "voe_tot", "admis": "acc_tot"}


def lire(chemin):
    return json.loads(chemin.read_text(encoding="utf-8"))


def ecrire_json(chemin, obj):
    chemin.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def decoder_parcoursup(c):
    """Même décodage que decodePs() dans js/app.js, limité aux champs utiles ici."""
    K, S = c["meta"]["cles"], c["s"]
    utiles = ("tf", "nm", "gta", "app", "etab_nom", "commune", "departement")
    lignes = []
    for L in c["l"]:
        r = {}
        for k, v in zip(K, L):
            if k not in utiles:
                continue
            r[k] = [S[i] for i in v] if isinstance(v, list) else (S[v] if isinstance(v, int) else v)
        lignes.append(r)
    return lignes


def date_valide(t):
    try:
        return datetime.date.fromisoformat(t) <= datetime.date.today() and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", t))
    except (TypeError, ValueError):
        return False


def verifier_manuelles(man, perimetre, stats, fusionnees):
    """Renvoie la liste des erreurs de data/stats-manuelles.json (vide : fichier valide)."""
    erreurs = []
    for g, e in (man.get("formations") or {}).items():
        o = f"stats-manuelles.json, code {g}"
        if g not in perimetre:
            erreurs.append(f"{o} : code inconnu dans la cartographie Parcoursup 2026 (ou formation hors périmètre).")
        if g in fusionnees:
            erreurs.append(f"{o} : formation affichée avec une fiche de data/formations.json (fusion), qui n'utilise pas ces relevés.")
        if g in stats:
            erreurs.append(f"{o} : cette formation a déjà des statistiques officielles 2025 dans stats.json.")
        if not isinstance(e, dict):
            erreurs.append(f"{o} : l'entrée doit être un objet."); continue
        inconnus = set(e) - set(CHAMPS_MANUELS)
        if inconnus:
            erreurs.append(f"{o} : champ(s) inconnu(s) {sorted(inconnus)} (champs attendus : {CHAMPS_MANUELS}).")
        if not isinstance(e.get("source"), str) or not re.match(r"https?://\S+$", e["source"]):
            erreurs.append(f"{o} : « source » manquante ou qui n'est pas une adresse web (https://…).")
        if not date_valide(e.get("consulte_le")):
            erreurs.append(f"{o} : « consulte_le » manquante ou invalide (date AAAA-MM-JJ, pas dans le futur).")
        if e.get("statut") != "releve_manuel":
            erreurs.append(f"{o} : « statut » doit valoir \"releve_manuel\".")
        if not isinstance(e.get("session"), str) or not re.fullmatch(r"20(1[89]|2\d)", e["session"]):
            erreurs.append(f"{o} : « session » manquante ou invalide (année entre guillemets, par exemple \"2025\").")
        t = e.get("taux")
        if isinstance(t, bool) or not isinstance(t, (int, float)) or not 0 <= t <= 100:
            erreurs.append(f"{o} : « taux » manquant ou invalide (nombre entre 0 et 100).")
        for c in ("places", "voeux", "admis"):
            v = e.get(c)
            if v is not None and (isinstance(v, bool) or not isinstance(v, int) or v < 0):
                erreurs.append(f"{o} : « {c} » doit être un nombre entier positif ou null.")
    return erreurs


def nombre(t):
    t = (t or "").strip().replace(",", ".")
    if not t:
        return None
    x = float(t)
    return int(x) if x.is_integer() else x


def lire_historique(dossier):
    """{session: {gta: ligne}} à partir des exports CSV officiels."""
    sessions = {}
    fichiers = sorted(pathlib.Path(dossier).glob("*.csv"))
    if not fichiers:
        sys.exit(f"Erreur : aucun fichier .csv dans {dossier}.")
    for f in fichiers:
        with f.open(encoding="utf-8-sig", newline="") as fh:
            lecteur = csv.DictReader(fh, delimiter=";")
            if not lecteur.fieldnames or "session" not in lecteur.fieldnames or "cod_aff_form" not in lecteur.fieldnames:
                sys.exit(f"Erreur : {f.name} n'a pas les colonnes « session » et « cod_aff_form ».")
            for L in lecteur:
                g = (L["cod_aff_form"] or "").strip()
                if g:
                    sessions.setdefault(str(L["session"]).strip(), {})[g] = L
    return sessions


def priorite(r):
    tf = set(r["tf"])
    return 1 if tf & PRIORITE_1 else 2 if tf & PRIORITE_2 else 3


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--historique", help="dossier des exports CSV fr-esr-parcoursup (toutes sessions)")
    ap.add_argument("--consulte-le", help="date de téléchargement des exports (AAAA-MM-JJ)")
    a = ap.parse_args()
    if a.historique and not date_valide(a.consulte_le):
        sys.exit("Erreur : avec --historique, préciser --consulte-le AAAA-MM-JJ (date de téléchargement).")

    ps = decoder_parcoursup(lire(DATA / "parcoursup.json"))
    stats = lire(DATA / "stats.json")["rows"]
    fu = lire(DATA / "anciennes-fiches.json")
    masquees = fu["meta"]["perimetre"]["categories_masquees"]
    # formations Parcoursup affichées avec une fiche de data/formations.json : hors des relevés manuels
    fusionnees = {x["g"] for x in fu["anciennes"].values() if x.get("m") == "C"}
    man = lire(MANUELLES)
    perimetre = {r["gta"]: r for r in ps if not any(t in masquees for t in r["tf"])}

    erreurs = verifier_manuelles(man, perimetre, stats, fusionnees)
    if erreurs:
        sys.exit("Relevés manuels refusés :\n  " + "\n  ".join(erreurs))

    max2025 = max(int(g) for g in stats)
    sans = [r for r in perimetre.values() if r["gta"] not in stats]
    histo = lire_historique(a.historique) if a.historique else {}
    controle = None
    if "2025" in histo:
        tous = {r["gta"] for r in ps}
        perdus = sorted((g for g in histo["2025"] if g in tous and g not in stats), key=int)
        controle = {"perdus": perdus, "nb_perdus": len(perdus)}
        if perdus:
            print(f"Attention : {len(perdus)} ligne(s) 2025 du fichier officiel absentes de stats.json "
                  f"(codes présents dans la cartographie 2026) : {', '.join(perdus[:20])}{' …' if len(perdus) > 20 else ''}")

    formations = {}
    for r in sorted(sans, key=lambda r: int(r["gta"])):
        g = r["gta"]
        trouve = next(((s, histo[s][g]) for s in sorted(histo, reverse=True) if g in histo[s]), None)
        if trouve:
            s, L = trouve
            e = {"stats": "avec_stats" if s >= SESSION_RECENTE else "sans_stats", "certitude": "verifiee",
                 "anciennes": {**{k: nombre(L.get(c)) for k, c in COLS_HISTO.items()}, "session": s,
                               "source": URL_STATS, "consulte_le": a.consulte_le, "statut": "officiel"}}
        elif histo:
            e = {"stats": "nouvelle_2026" if int(g) > max2025 else "sans_stats", "certitude": "verifiee" if int(g) > max2025 else "probable"}
        else:
            e = {"stats": "nouvelle_2026" if int(g) > max2025 else "sans_stats", "certitude": "probable"}
        formations[g] = e

    nb = {}
    for e in formations.values():
        k = f'{e["stats"]}_{e["certitude"]}'
        nb[k] = nb.get(k, 0) + 1
    nb["sessions_anterieures_retrouvees"] = sum("anciennes" in e for e in formations.values())
    meta = {
        "description": "Statut des formations Parcoursup du périmètre (hors BTS et BUT) sans statistiques 2025 dans stats.json. "
                       "nouvelle_2026 : jamais de session Parcoursup ; sans_stats : formation qui existait, statistiques non publiées ou non retrouvées.",
        "methode": ("Codes cherchés dans les fichiers officiels des sessions " + ", ".join(sorted(histo)) + "."
                    if histo else
                    "Sessions antérieures non consultées (réseau bloqué vers data.enseignementsup-recherche.gouv.fr) : statut déduit du code gta. "
                    f"Code > {max2025} (plus grand code de stats.json, session 2025) : nouvelle_2026 probable ; sinon : sans_stats probable."),
        "max_gta_2025": max2025,
        "sessions_consultees": sorted(histo),
        "source_stats": URL_STATS,
        "construit_par": "scripts/construire-statuts-stats.py",
        "construit_le": datetime.date.today().isoformat(),
        "nb": nb,
    }
    if controle is not None:
        meta["controle_stats_2025"] = controle
    ecrire_json(SORTIE, {"meta": meta, "formations": formations})

    # liste des relevés à faire : « sans_stats » sans relevé manuel
    faits = set((man.get("formations") or {}))
    a_relever = [perimetre[g] for g, e in formations.items() if e["stats"] == "sans_stats" and g not in faits and g not in fusionnees]
    a_relever.sort(key=lambda r: (priorite(r), bool(r.get("app")), r["tf"][0], r["nm"][0], int(r["gta"])))
    CSV_SORTIE.parent.mkdir(exist_ok=True)
    with CSV_SORTIE.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["priorite", "gta", "intitule", "etablissement", "commune", "categorie", "apprentissage", "fiche_parcoursup"] + CHAMPS_MANUELS)
        for r in a_relever:
            w.writerow([priorite(r), r["gta"], r["nm"][0], r["etab_nom"], r.get("commune") or r.get("departement") or "",
                        " · ".join(r["tf"]), "oui" if r.get("app") else "non", FICHE.format(r["gta"])] + [""] * len(CHAMPS_MANUELS))

    print(f"{len(formations)} formations sans statistiques 2025 : " + ", ".join(f"{k} {v}" for k, v in sorted(nb.items())))
    print(f"Relevés manuels valides : {len(faits)} ; à relever : {len(a_relever)} (docs/formations-sans-stats.csv)")


if __name__ == "__main__":
    main()
