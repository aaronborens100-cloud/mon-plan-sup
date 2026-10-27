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
  libelle             « droits_inscription » (droits d'inscription, CVEC et participation seulement, voir libelle())
                      ou « cout » ;
  correction          raison d'une correction de min ou de max tirée du texte du relevé (CORRECTIONS), si besoin ;
  boursiers_eur       texte relevé pour les boursiers, ou null (gardé pour information, jamais affiché) ;
  annee_tarifs        année des tarifs indiquée sur la fiche (« 2025-2026 »), seulement quand elle est connue ;
  selon_revenus       true pour un montant UNIQUE qui dépend des revenus (« 4500 €/an suivant revenus familiaux ») : c'est
                      un plafond (« jusqu'à X € »), jamais un minimum d'exclusion pour le budget (décision du fondateur,
                      issue #49, 22/10/2026) ;
  source, consulte_le fiche Parcoursup et date de consultation.

On ne garde que les lignes « trouvé » avec un montant en euros PAR AN, minimum et maximum. Restent inconnues
(la règle « établissement privé aux frais inconnus » du moteur continue de s'appliquer), avec leur motif dans
meta.exclus :
  - statut_releve « non trouvé » ou « a_verifier » ;
  - montant dans une autre monnaie (francs CFP, dirhams) : jamais converti ;
  - montant par mois ou par trimestre sans total annuel : jamais multiplié ;
  - « non précisé » (on ne sait pas si le montant est par an ou pour tout le cursus) ;
  - montant pour tout le cursus (jamais divisé par la durée), ou « par an (sur 3 ans) » (annuel ou pour 3 ans ?) ;
  - fiche mise en doute à la relecture et non revérifiée (A_REVERIFIER) ;
  - maximum non indiqué (« à partir de… », part variable non chiffrée) : seul un minimum est connu. Il est gardé à
    part, dans « a_partir_de » (gta → { min, source, consulte_le }) : le moteur exclut la formation pour un budget
    serré inférieur à ce minimum (décision du fondateur du 22/10/2026) ; sinon les frais restent inconnus.

Deux cas restent dans meta.exclus (le montant ANNUEL reste inconnu pour le moteur : « frais inconnus », ou exclusion
pour la 1re année) mais ont leur montant relevé, affiché tel quel (issue #49, décisions du fondateur du 22/10/2026) :
  - par_mois : « 110 €/mois sur 10 mois » (nombre de mois donné par la fiche) : affiché « 110 € par mois », jamais
    multiplié ; pour le budget (annuel), règle « frais inconnus » ;
  - premiere_annee : « 10 400 € la 1re année, 2e et 3e années gratuites (apprentissage) » : montant de la 1re année,
    qui sert à exclure la formation d'un budget serré (GOBELINS 37012).

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


# Fiches mises en doute à la relecture de la PR #46 (22/10/2026), sans revérification possible (fiche Parcoursup
# inaccessible depuis l'environnement de construction) : laissées inconnues plutôt que devinées.
A_REVERIFIER = {
    "26091": "psychomotricien à 230 €/an sans détail, très en dessous de la formation continue (15 030 €)",
}

# Corrections d'un montant, tirées du texte du relevé lui-même (jamais d'estimation) : un montant qui concerne un autre
# public que l'élève qui candidate en formation initiale sous statut étudiant est retiré de la fourchette.
CORRECTIONS = {
    "39147": {"max": 11100, "nature": "annee",
              "raison": "12 700 €/an est le tarif des candidats des lycées français de l'étranger (L.F.E.) ; pour les autres : 10 900 € (L1), 11 000 € (L2), 11 100 € (L3)"},
    "43500": {"min": 7500,
              "raison": "4 450 € est le tarif d'une 2e année dont le 2e semestre est en apprentissage ; sous statut étudiant, le relevé ne donne que 7 500 € (DN MADE 1)"},
    "43502": {"min": 7500,
              "raison": "4 450 € est le tarif d'une 2e année dont le 2e semestre est en apprentissage ; sous statut étudiant, le relevé ne donne que 7 500 € (DN MADE 1)"},
}


# Montant mensuel avec le nombre de mois donné par la fiche : « par an (110 €/mois sur 10 mois) ». Les autres montants
# mensuels (fourchette, « à partir de », nombre de mois non précisé) et les montants par trimestre restent inconnus.
PAR_MOIS = re.compile(r"^par an \((\d+) ?€ ?/ ?mois sur (\d+) mois\)$")
# Montant unique qui dépend des revenus ou du quotient familial (« suivant revenus familiaux », « modulation des frais
# selon le quotient familial », « réduction possible selon les revenus »). « ressources matérielles » (frais annexes
# d'un établissement) et « réduction sur justificatifs » ne comptent pas : aucun lien écrit avec les revenus.
SELON_REVENUS = re.compile(r"(selon|suivant|en fonction d[eu]s?|prise en compte d[eu]s?)\s[^;»]*?(revenus?|quotient familial|ressources)", re.I)
ANNEE_TARIFS = re.compile(r"^(\d{4})[/-](\d{4})$")


def annee_tarifs(texte):
    """Année des tarifs sous la forme « 2025-2026 », ou None si la fiche ne la donne pas (« non précisée », « 2026 »)."""
    m = ANNEE_TARIFS.match((texte or "").strip())
    return f"{m.group(1)}-{m.group(2)}" if m and int(m.group(2)) == int(m.group(1)) + 1 else None


def par_mois(l):
    """{montant, mois} d'un montant mensuel avec nombre de mois, ou None."""
    m = PAR_MOIS.match(l["par_an_ou_cursus"].strip())
    return {"montant": int(m.group(1)), "mois": int(m.group(2))} if m else None


def premiere_annee(l):
    """Montant de la 1re année seule (« 1re année seulement », années suivantes gratuites en apprentissage), ou None."""
    mini, maxi = montant(l["frais_min_eur"]), montant(l["frais_max_eur"])
    if l["par_an_ou_cursus"].strip() == "1re année seulement" and mini is not None and mini == maxi and re.search(r"gratuit", l["apprentissage"], re.I):
        return {"montant": mini}
    return None


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
    # montant donné par mois ou par trimestre, même avec le nombre de mois (« par an (110 €/mois sur 10 mois) ») :
    # jamais multiplié, même quand le relevé donne déjà le produit (3346, 6392)
    if par.startswith("par mois") or par.startswith("par trimestre") or re.search(r"€ ?/ ?mois|par mois", par):
        return "par_mois_ou_trimestre"
    if par.startswith("non précis"):
        return "non_precise"
    # « par an (sur 3 ans) » : on ne sait pas si le montant est annuel ou pour les 3 ans (12043, 12051, 27159, 35153)
    if re.search(r"\bsur \d+ ans\b", par):
        return "an_ou_cursus_incertain"
    # fiches dont le relevé est mis en doute à la relecture et qu'on n'a pas pu revérifier : inconnues
    if l["gta"] in A_REVERIFIER:
        return "a_reverifier"
    if CURSUS.search(l["precision"]) or not par.startswith("par an"):
        return "cursus"
    if montant(l["frais_min_eur"]) is None or montant(l["frais_max_eur"]) is None:
        return "maximum_non_indique"
    return None


# ---------------------------------------------------------------- nature de la fourchette
# Ordre des règles (la première qui s'applique) :
#   1. « autre » si la précision entre parenthèses de par_an_ou_cursus (« détail ») parle d'une autre population ou
#      d'une autre option que l'année d'études (campus, L.F.E., hors UE, internationaux, parcours, mineure, versements)
#      ou si la précision ou la colonne des boursiers parlent de mineure ou de parcours (Institut Saint-Pie X) ;
#   2. « annee » si le détail donne au moins deux montants en euros rattachés à des années ou des cycles
#      (« 7700 € années 1-2, 8750 € année 3 », « 9000 € prépa CII, 10500 € cycle ingénieur », « DTS1 1959 € ») ;
#      mais « autre » si le détail dit aussi que l'un des montants dépend des revenus (Icam : « 4500 € suivant revenus
#      familiaux, 9700 € en cycle ingénieur » : le min change avec les revenus ET le max avec le cycle) ;
#   3. « revenus » si le détail, la précision ou la colonne des boursiers parlent de revenus, quotient familial… ;
#   4. « autre » sinon (critère non précisé sur la fiche, prise en charge par la Région…).
# Un montant d'une autre population retenu à tort comme max (39147, 47277) est corrigé dans CORRECTIONS.
ANNEE = re.compile(r"ann[ée]es?\b|\b\d(re|e|er)\b|\bL[1-3]\b|DN ?MADE ?\d|DTS ?\d|cycle|prépa|\bCPA\b|bachelor|ensuite|pendant \d ans", re.I)
MONTANT_EUR = re.compile(r"\d[\d ]*(,\d+)? ?€")
AUTRE_OPTION = re.compile(r"campus|L\.?F\.?E\.?\b|hors (UE|Schengen)|internationa|parcours\b|mineure|versements?\b|\ben \d (ou \d )?versements", re.I)
AUTRE_OPTION_PRECISION = re.compile(r"mineure|parcours\b", re.I)
REVENUS = re.compile(r"revenu|quotient|coefficient familial|situation familiale|ressources|imposable|imposition|fiscal|péréquation|même barème", re.I)


def nature(l, mini, maxi):
    if mini == maxi:
        return None
    par = l["par_an_ou_cursus"]
    detail = par[par.find("(") + 1:] if "(" in par else ""
    if AUTRE_OPTION.search(detail) or AUTRE_OPTION_PRECISION.search(l["precision"] + " " + l["boursiers_eur"]):
        return "autre"
    if len(MONTANT_EUR.findall(detail)) >= 2 and ANNEE.search(detail):
        return "autre" if REVENUS.search(detail) else "annee"
    if REVENUS.search(detail + " " + l["precision"] + " " + l["boursiers_eur"]):
        return "revenus"
    return "autre"


# ---------------------------------------------------------------- libellé « droits d'inscription »
# Écoles d'infirmiers (IFSI), diplômes d'État paramédicaux et du travail social : en formation initiale, la Région
# finance la formation et l'étudiant paie des droits d'inscription (souvent 178 €), la CVEC et parfois une
# contribution ou une participation forfaitaire. Le site affiche alors « Droits d'inscription et participation
# annuelle », pas « Coût ». La précision ne doit détailler QUE ces postes :
#   - intitulé d'un diplôme d'État (« D.E ») et montant maximum sous SEUIL_DROITS ;
#   - texte lu : la précision avant la note de revérification (« vérif. fiche … »), sans la formation continue
#     (reconversion, autre public) ni les tarifs d'autres publics (étrangers, extracommunautaires) ;
#   - aucun autre poste (FRAIS_AUTRES : frais pédagogiques, scolarité, formation, gestion, service, dossier, tenues,
#     matériel, montant « non détaillé », montant global « dont » ou « incluant » des droits sans le reste) ;
#   - chaque montant en euros est rattaché à des droits, une inscription, la CVEC, une contribution ou une
#     participation (TEXTE_DROITS) ; « 720 € + 105 € de CVEC » (720 € sans nature) reste un « Coût ». Exception :
#     la revérification ciblée du 22/10/2026 a classé la fiche « seulement droits d'inscription/CVEC ».
SEUIL_DROITS = 1300
TEXTE_DROITS = re.compile(r"\bdroits?\b|inscription|CVEC|contribution|participation", re.I)
FRAIS_AUTRES = re.compile(r"scolarit|pédagogique|de formation\b|gestion|frais de service|dossier|tenues?\b|matériel|non détaillé|sans détail|\bdont\b|incluant|y compris", re.I)
AUTRE_PUBLIC = re.compile(r"formation continue|extracommunautaire|étrangers|internationa", re.I)
VERIF_DROITS = "(seulement droits d'inscription/CVEC)"


def libelle(l, maxi):
    if not re.match(r"^D\.E\.? ", l["formation"]) or maxi >= SEUIL_DROITS:
        return "cout"
    principal = l["precision"].split("vérif. fiche")[0]
    morceaux = [m for m in re.split(r";", principal) if not AUTRE_PUBLIC.search(m)]
    texte = ";".join(morceaux)
    if FRAIS_AUTRES.search(texte):
        return "cout"
    verifie = VERIF_DROITS in l["precision"]
    for m in re.split(r"[+;]", texte):
        if MONTANT_EUR.search(m) and not TEXTE_DROITS.search(m) and not verifie:
            return "cout"
    return "droits_inscription" if TEXTE_DROITS.search(texte) or verifie else "cout"


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
    formations, exclus, a_partir_de, mensuels, premieres = {}, collections.defaultdict(list), {}, {}, {}

    def piece(l, extra):
        """Source, date de consultation et année des tarifs (si connue) d'une ligne."""
        d = dict(extra, source=l["url_source"], consulte_le=l["consulte_le"])
        if annee_tarifs(l["annee"]):
            d["annee_tarifs"] = annee_tarifs(l["annee"])
        return d

    for l in lignes:
        if not re.fullmatch(r"\d+", l["gta"]):
            sys.exit(f"Erreur : code gta illisible {l['gta']!r}.")
        m = motif_exclusion(l)
        if m:
            exclus[m].append(l["gta"])
            if m == "maximum_non_indique" and montant(l["frais_min_eur"]) is not None:
                a_partir_de[l["gta"]] = piece(l, {"min": montant(l["frais_min_eur"])})
            if m == "par_mois_ou_trimestre" and par_mois(l):
                mensuels[l["gta"]] = piece(l, dict(par_mois(l), apprentissage=texte_ou_null(l["apprentissage"])))
            if m == "cursus" and premiere_annee(l):
                premieres[l["gta"]] = piece(l, dict(premiere_annee(l), apprentissage=texte_ou_null(l["apprentissage"])))
            continue
        mini, maxi = montant(l["frais_min_eur"]), montant(l["frais_max_eur"])
        corr = CORRECTIONS.get(l["gta"], {})
        mini, maxi = corr.get("min", mini), corr.get("max", maxi)
        if mini > maxi:
            sys.exit(f"Erreur : {l['gta']} : minimum {mini} au-dessus du maximum {maxi}.")
        if not re.match(r"^https://dossierappel\.parcoursup\.fr/", l["url_source"]) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", l["consulte_le"]):
            sys.exit(f"Erreur : {l['gta']} : source ou date de consultation manquante.")
        formations[l["gta"]] = {
            "min": mini, "max": maxi, "nature_fourchette": corr.get("nature") if "nature" in corr and mini < maxi else nature(l, mini, maxi), "par": l["par_an_ou_cursus"].strip(),
            "apprentissage": texte_ou_null(l["apprentissage"]), "libelle": libelle(l, maxi),
            "boursiers_eur": texte_ou_null(l["boursiers_eur"]), "source": l["url_source"], "consulte_le": l["consulte_le"],
        }
        if annee_tarifs(l["annee"]):
            formations[l["gta"]]["annee_tarifs"] = annee_tarifs(l["annee"])
        if mini == maxi and SELON_REVENUS.search(l["precision"]):
            formations[l["gta"]]["selon_revenus"] = True
        if corr:
            formations[l["gta"]]["correction"] = corr["raison"]
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
            "corrections": {g: c["raison"] for g, c in sorted(CORRECTIONS.items(), key=lambda kv: int(kv[0]))},
            "a_reverifier": A_REVERIFIER,
            "nb_droits_inscription": sum(1 for f in formations.values() if f["libelle"] == "droits_inscription"),
            "selon_revenus": sorted((g for g, f in formations.items() if f.get("selon_revenus")), key=int),
            "annees_tarifs": dict(sorted(collections.Counter(f["annee_tarifs"] for f in formations.values() if "annee_tarifs" in f).items())),
        },
        "formations": dict(sorted(formations.items(), key=lambda kv: int(kv[0]))),
        "a_partir_de": dict(sorted(a_partir_de.items(), key=lambda kv: int(kv[0]))),
        "par_mois": dict(sorted(mensuels.items(), key=lambda kv: int(kv[0]))),
        "premiere_annee": dict(sorted(premieres.items(), key=lambda kv: int(kv[0]))),
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
    print(f"  montant unique selon les revenus : {len(m['selon_revenus'])} ; années des tarifs : {m['annees_tarifs']}")
    print(f"  montants par mois affichés : {len(d['par_mois'])} ; montants de 1re année : {len(d['premiere_annee'])}")


if __name__ == "__main__":
    main()
