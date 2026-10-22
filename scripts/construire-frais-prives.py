#!/usr/bin/env python3
"""Construit data/frais-prives.json : les frais annuels des formations Parcoursup d'établissements privés.

Source : docs/releves/frais-formations-privees-2026-10-22.csv (une ligne par code gta), relevé à la main sur la
fiche Parcoursup de chaque formation (colonne url_source), consultée les 21 et 22/10/2026. Contrôles :
docs/releves/frais-controle-qualite-2026-10-22.txt (24 fiches revérifiées) et
docs/releves/frais-verification-ciblee-2026-10-22.txt (fiches aux frais très bas revérifiées).

Pour chaque formation retenue (clé = code gta) :
  min, max            montants annuels en euros (min = max pour un montant unique) ;
  nature_fourchette   null si min = max, sinon « annee » (le montant change selon l'année d'études ou le cycle),
                      « revenus » (selon les revenus ou le quotient familial) ou « autre » (voir nature()) ;
  par                 texte de la colonne par_an_ou_cursus (« par an », « par an (1re année) »…) ;
  apprentissage       texte relevé sur l'apprentissage, ou null (« non mentionné ») ;
  libelle             « droits_inscription » (écoles d'infirmiers, travail social et cas semblables : droits
                      d'inscription + participation, voir libelle()) ou « cout » ;
  boursiers_eur       texte relevé pour les boursiers, ou null (gardé pour information, jamais affiché) ;
  source, consulte_le fiche Parcoursup et date de consultation.

On ne garde que les lignes « trouvé » avec un montant en euros PAR AN, minimum et maximum. Restent inconnues
(la règle « établissement privé aux frais inconnus » du moteur continue de s'appliquer), avec leur motif dans
meta.exclus :
  - statut_releve « non trouvé » ou « a_verifier » ;
  - montant dans une autre monnaie (francs CFP, dirhams) : jamais converti ;
  - montant par mois ou par trimestre sans total annuel : jamais multiplié ;
  - « non précisé » (on ne sait pas si le montant est par an ou pour tout le cursus) ;
  - montant pour tout le cursus (jamais divisé par la durée) ;
  - maximum non indiqué (« à partir de… », part variable non chiffrée) : seul un minimum est connu.

Usage : python3 scripts/construire-frais-prives.py            (écrit data/frais-prives.json)
        python3 scripts/construire-frais-prives.py --verifier (vérifie que le fichier est à jour, sans l'écrire)
"""
import argparse
import collections
import csv
import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
CSV_SOURCE = RACINE / "docs" / "releves" / "frais-formations-privees-2026-10-22.csv"
SORTIE = RACINE / "data" / "frais-prives.json"

SOURCE = "Fiches Parcoursup des formations (dossierappel.parcoursup.fr), rubrique « Frais de scolarité », relevé manuel"

# ---------------------------------------------------------------- exclusions
# (« Île-de-France » ne doit pas compter : on cherche « francs CFP », pas « franc »)
MONNAIES_ETRANGERES = re.compile(r"\bCFP\b|\bCPF\b|\bXPF\b|\bMAD\b|dirham|francs? CFP|francs? pacifique", re.I)
# Montant pour toute la formation (« coût du cursus de 3 ans : 10400 € ») ; les montants « pour toute la formation »
# de la formation continue (reconversion), cités dans precision, ne concernent pas l'élève et ne comptent pas
CURSUS = re.compile(r"co[uû]t (total )?du cursus|pour (tout le|l'ensemble du) cursus", re.I)


def montant(texte):
    """Montant en euros (« 1586.40 » → 1586.4, « 3950 » → 3950), ou None si vide."""
    t = (texte or "").strip().replace(",", ".")
    if not t:
        return None
    if not re.fullmatch(r"\d+(\.\d+)?", t):
        raise ValueError(f"montant illisible : {texte!r}")
    v = float(t)
    return int(v) if v.is_integer() else v


def motif_exclusion(l):
    """Motif pour lequel la ligne reste inconnue, ou None si elle est retenue (ordre : le premier motif l'emporte)."""
    if l["statut_releve"] == "non trouvé":
        return "non_trouve"
    if l["statut_releve"] == "a_verifier":
        return "a_verifier"
    if l["statut_releve"] != "trouvé":
        raise ValueError(f"{l['gta']} : statut_releve inconnu {l['statut_releve']!r}")
    par = l["par_an_ou_cursus"].strip()
    if MONNAIES_ETRANGERES.search(l["precision"] + " " + par):
        return "autre_monnaie"
    if par.startswith("par mois") or par.startswith("par trimestre"):
        return "par_mois_ou_trimestre"
    if par.startswith("non précis"):
        return "non_precise"
    if CURSUS.search(l["precision"]) or not par.startswith("par an"):
        return "cursus"
    if montant(l["frais_min_eur"]) is None or montant(l["frais_max_eur"]) is None:
        return "maximum_non_indique"
    return None


# ---------------------------------------------------------------- nature de la fourchette
# « annee » : la parenthèse de par_an_ou_cursus donne au moins deux montants en euros ET les rattache à des années
# d'études ou à des cycles (« 7700 € années 1-2, 8750 € année 3 », « 1640 € en 1re année DN MADE, 2285 € dès la
# 2e année », « 9000 € prépa CII, 10500 € cycle ingénieur », « DTS1 1959 €, DTS2 1820 € », « 7700 € pendant 3 ans,
# 9500 € pendant 2 ans »). Une parenthèse sans montant (« par an (1re année) ») ne suffit pas.
ANNEE = re.compile(r"ann[ée]es?\b|\b\d(re|e|er)\b|\bL[1-3]\b|DN ?MADE ?\d|DTS ?\d|cycle|prépa|\bCPA\b|bachelor|ensuite|pendant \d ans", re.I)
MONTANT_EUR = re.compile(r"\d[\d ]*(,\d+)? ?€")
# « revenus » : montant selon les revenus de la famille (universités catholiques, CPGE privées, DN MADE…), d'après
# la parenthèse, la précision ou la colonne des boursiers
REVENUS = re.compile(r"revenu|quotient|coefficient familial|situation familiale|ressources|imposable|imposition|fiscal|péréquation|même barème", re.I)
# « autre » : tout le reste (fourchette sans critère précisé sur la fiche, selon la mineure ou le parcours, selon le
# nombre de versements, frais pris en charge par la Région…)


def nature(l, mini, maxi):
    if mini == maxi:
        return None
    par = l["par_an_ou_cursus"]
    detail = par[par.find("(") + 1:] if "(" in par else ""
    if len(MONTANT_EUR.findall(detail)) >= 2 and ANNEE.search(detail):
        return "annee"
    if REVENUS.search(detail + " " + l["precision"] + " " + l["boursiers_eur"]):
        return "revenus"
    return "autre"


# ---------------------------------------------------------------- libellé « droits d'inscription »
# Écoles d'infirmiers (IFSI) et diplômes d'État du travail social : en formation initiale, la Région finance la
# formation et l'étudiant paie des droits d'inscription (souvent 178 €), la CVEC et une participation (frais de
# scolarité, contribution forfaitaire). Le site affiche alors « Droits d'inscription et participation annuelle »,
# pas « Coût ». Cas semblables : autre diplôme d'État paramédical (« D.E ») dont le montant reste sous
# SEUIL_DROITS_SEMBLABLES et dont la fiche décrit des droits, la CVEC ou une formation continue bien plus chère.
FORMATIONS_DROITS = re.compile(r"^D\.E\.? ?(Infirmier|Assistant de Service Social|Educateur Spécialisé|Educateur de Jeunes Enfants|"
                               r"Educateur Technique Spécialisé|Moniteur|Conseiller en économie sociale)", re.I)
# Au-delà, le montant n'est plus des droits + participation (frais de formation non pris en charge) : « Coût »
SEUIL_DROITS = 3000
SEUIL_DROITS_SEMBLABLES = 1000
TEXTE_DROITS = re.compile(r"droits?|inscription|CVEC|contribution|participation|formation continue|frais réduits", re.I)


def libelle(l, maxi):
    if FORMATIONS_DROITS.search(l["formation"]) and maxi < SEUIL_DROITS:
        return "droits_inscription"
    if re.match(r"^D\.E\.? ", l["formation"]) and maxi < SEUIL_DROITS_SEMBLABLES and TEXTE_DROITS.search(l["precision"]):
        return "droits_inscription"
    return "cout"


def texte_ou_null(t, vides=("non mentionné", "")):
    t = (t or "").strip()
    return None if t in vides else t


# ---------------------------------------------------------------- construction
def construire():
    with CSV_SOURCE.open(encoding="utf-8", newline="") as fh:
        lignes = list(csv.DictReader(fh))
    gtas = [l["gta"] for l in lignes]
    if len(set(gtas)) != len(gtas):
        sys.exit("Erreur : code gta en double dans le relevé.")
    formations, exclus = {}, collections.defaultdict(list)
    for l in lignes:
        if not re.fullmatch(r"\d+", l["gta"]):
            sys.exit(f"Erreur : code gta illisible {l['gta']!r}.")
        m = motif_exclusion(l)
        if m:
            exclus[m].append(l["gta"])
            continue
        mini, maxi = montant(l["frais_min_eur"]), montant(l["frais_max_eur"])
        if mini > maxi:
            sys.exit(f"Erreur : {l['gta']} : minimum {mini} au-dessus du maximum {maxi}.")
        if not re.match(r"^https://dossierappel\.parcoursup\.fr/", l["url_source"]) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", l["consulte_le"]):
            sys.exit(f"Erreur : {l['gta']} : source ou date de consultation manquante.")
        formations[l["gta"]] = {
            "min": mini, "max": maxi, "nature_fourchette": nature(l, mini, maxi), "par": l["par_an_ou_cursus"].strip(),
            "apprentissage": texte_ou_null(l["apprentissage"]), "libelle": libelle(l, maxi),
            "boursiers_eur": texte_ou_null(l["boursiers_eur"]), "source": l["url_source"], "consulte_le": l["consulte_le"],
        }
    dates = sorted({l["consulte_le"] for l in lignes})
    natures = collections.Counter(f["nature_fourchette"] for f in formations.values() if f["nature_fourchette"])
    return {
        "meta": {
            "source": SOURCE,
            "fichier": str(CSV_SOURCE.relative_to(RACINE)),
            "consulte_le": dates[-1], "consulte_du": dates[0],
            "construit_par": "scripts/construire-frais-prives.py",
            "nb_lignes": len(lignes), "nb_retenues": len(formations),
            "exclus": {k: sorted(v, key=int) for k, v in sorted(exclus.items())},
            "natures": dict(sorted(natures.items())),
            "nb_droits_inscription": sum(1 for f in formations.values() if f["libelle"] == "droits_inscription"),
        },
        "formations": dict(sorted(formations.items(), key=lambda kv: int(kv[0]))),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--verifier", action="store_true", help="vérifie que data/frais-prives.json est à jour")
    a = ap.parse_args()
    d = construire()
    texte = json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n"
    if a.verifier:
        if not SORTIE.exists() or SORTIE.read_text(encoding="utf-8") != texte:
            sys.exit("data/frais-prives.json n'est pas à jour : relancer python3 scripts/construire-frais-prives.py")
        print("data/frais-prives.json est à jour.")
        return
    SORTIE.write_text(texte, encoding="utf-8")
    m = d["meta"]
    print(f"{m['nb_retenues']} formations avec un montant sur {m['nb_lignes']} lignes ; {m['nb_droits_inscription']} en droits d'inscription.")
    for k, v in m["exclus"].items():
        print(f"  inconnues, {k} : {len(v)}")
    for k, v in m["natures"].items():
        print(f"  fourchette « {k} » : {v}")


if __name__ == "__main__":
    main()
