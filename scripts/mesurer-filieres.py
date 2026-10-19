#!/usr/bin/env python3
"""Mesure la fiabilité de data/filieres.json, sans rien y changer.

1. Test à l'aveugle : les règles de scripts/construire-filieres.py sont appliquées aux filières
   « famille_existante » (écrites à la main, data/generees.json) comme si elles étaient inconnues :
   sans les familles de generees.json et sans scripts/filieres-corrections.json. La version déduite
   est comparée, champ par champ, à la version écrite à la main.
2. Effet sur les listes de vœux : le vrai site est chargé dans Node (tests/charger-site.js) avec la
   vraie table puis avec une table temporaire où les familles sont remplacées par leur version
   déduite. Les listes de 10 vœux des profils de tests/profils.js sont comparées. La table
   temporaire est écrite dans un dossier temporaire, jamais dans data/.
3. Échantillon à relire : 30 filières déduites tirées au hasard (graine fixe), uniquement parmi celles qui ont
   au moins une formation recommandable (CapEngine.horsListe faux, calculé avec le vrai site), avec une
   probabilité proportionnelle au nombre de ces formations, écrites dans docs/relecture-filieres.csv. Le fichier
   n'est écrit que s'il n'existe pas (ou avec --echantillon), pour ne pas effacer une relecture en cours.

Le rapport docs/mesure-table-filieres.md garde le texte écrit à la main ; seule la partie entre
les balises <!-- debut resultats --> et <!-- fin resultats --> est réécrite par ce script.

Usage : python3 scripts/mesurer-filieres.py [--sans-voeux] [--echantillon]
"""
import collections
import copy
import csv
import importlib.util
import json
import pathlib
import random
import re
import subprocess
import sys
import tempfile

RACINE = pathlib.Path(__file__).resolve().parent.parent
DATA = RACINE / "data"
RAPPORT = RACINE / "docs" / "mesure-table-filieres.md"
CSV_RELECTURE = RACINE / "docs" / "relecture-filieres.csv"
DEBUT, FIN = "<!-- debut resultats -->", "<!-- fin resultats -->"

GRAINE = 20261019
TAILLE_ECHANTILLON = 30
DIMENSIONS = ["maths", "ecrit", "international", "encadrement", "pratique", "poly"]
# Champs comparés en partie 1 : ce sont eux qui sont remplacés dans la table temporaire « attributs ».
CHAMPS = ["type", "domaines", "profil", "specialites", "charge", "dossier_poids", "duree_ans", "metiers", "poursuites"]
# Règles de construire-filieres.py qui visent nommément un code nmc (genre() et GENERIQUES).
# Les familles visées sont exclues du test à l'aveugle : la règle a pu être écrite en les connaissant.
CODES_VISES_PAR_REGLE = {"PASS": "genre() : `n in (\"PASS\", \"LAS\")` → licence"}

# Seuils proposés (partie 4) : c'est au responsable du projet de les adopter ou non.
SEUILS = [
    ("premier domaine correct", "dom1", 0.90),
    ("type de formation correct", "type", 0.90),
    ("profil maths à ±1", "maths_pm1", 0.85),
    ("profil écrit à ±1", "ecrit_pm1", 0.85),
    ("aucune spécialité obligatoire inventée", "oblig_inventees", 0),
    ("vœux inchangés (table « attributs »)", "voeux_inchanges", 0.80),
]


def charger_construction():
    spec = importlib.util.spec_from_file_location("construire_filieres", RACINE / "scripts" / "construire-filieres.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def lire(nom):
    return json.loads((DATA / nom).read_text(encoding="utf-8"))


def table_a_l_aveugle(mod):
    """Table construite par les mêmes règles, sans familles existantes ni corrections : tout est déduit."""
    lire_orig, corr_orig = mod.lire, mod.CORRECTIONS

    def lire_sans_familles(nom):
        d = lire_orig(nom)
        if nom == "generees.json":
            d = dict(d, familles=[])   # on garde meta (libellés des types), on retire les valeurs écrites à la main
        return d

    # Sans corrections, certaines filières n'ont aucun domaine déduit : le contrôle final du script refuse alors
    # d'écrire la table. Ici on note ces erreurs (c'est un résultat de la mesure) ; toute autre erreur arrête tout.
    sans_domaine = []

    class Sortie:
        @staticmethod
        def exit(msg):
            autres = [l.strip() for l in str(msg).splitlines()[1:] if "aucun domaine" not in l]
            if not str(msg).startswith("Erreur :\n") or autres:
                sys.exit(msg)
            sans_domaine.extend(l.strip().split(" : ")[0] for l in str(msg).splitlines()[1:])

    mod.lire = lire_sans_familles
    mod.CORRECTIONS = pathlib.Path(tempfile.gettempdir()) / "aucune-correction-mesure-filieres.json"
    mod.sys = Sortie
    try:
        assert not mod.CORRECTIONS.exists()
        return mod.construire()["filieres"], sans_domaine
    finally:
        mod.lire, mod.CORRECTIONS, mod.sys = lire_orig, corr_orig, sys


# ---------------------------------------------------------------- partie 1 : comparaison
def gabarit_de(e):
    m = re.search(r"Genre « ([a-z_]+) »", e.get("justification", ""))
    return m.group(1) if m else None


def regle_domaine(mod, nmc, e, aveugle):
    """Règle de construire-filieres.py qui a donné le premier domaine déduit."""
    base = re.sub(r"-(App|APP)$", "", nmc)
    if base != nmc and base in aveugle:
        return regle_domaine(mod, base, aveugle[base], aveugle) + f" (repris de {base}, apprentissage)"
    if nmc in mod.GENERIQUES:
        return "domaines_generiques() : intitulé générique"
    tr = mod.regles_sur(e["libelle"])
    if not tr:
        return "domaines_generiques() : intitulé sans mot-clé reconnu"
    _, i, mot, dom, *_ = tr[0]
    t = mod.BRUIT.sub(" ", mod.sans_accents(e["libelle"]))
    jeu = "REGLES" if any(r[0].search(t) for r in mod.REGLES) else "REPLI"
    return f"{jeu}[{i}] (mot-clé « {mot} » → {', '.join(dom)})"


def desaccords(ref, ded):
    """Liste des désaccords entre la version écrite à la main (ref) et la version déduite (ded)."""
    D = []
    ajoute = lambda champ, grav, r, d: D.append({"champ": champ, "gravite": grav, "ref": r, "ded": d})
    if ded["type"] != ref["type"]:
        ajoute("type", "grave", ref["type"], ded["type"])
    if (ded["domaines"] or [None])[0] != (ref["domaines"] or [None])[0]:
        ajoute("premier domaine", "grave", ref["domaines"][:1], ded["domaines"][:1])
    if set(ded["domaines"][1:3]) != set(ref["domaines"][1:3]):
        ajoute("domaines secondaires", "moyen", ref["domaines"][1:3], ded["domaines"][1:3])
    so_r, so_d = ref["specialites"]["obligatoires"], ded["specialites"]["obligatoires"]
    for s in so_d:
        if s not in so_r:
            ajoute("spécialité obligatoire inventée", "grave", so_r, s)
    for s in so_r:
        if s not in so_d:
            ajoute("spécialité obligatoire oubliée", "grave", s, so_d)
    for k in DIMENSIONS:
        ecart = abs(ded["profil"][k] - ref["profil"][k])
        if ecart >= 2:
            ajoute(f"profil {k}", "grave" if k in ("maths", "ecrit") else "moyen", ref["profil"][k], ded["profil"][k])
        elif ecart == 1:
            ajoute(f"profil {k}", "léger", ref["profil"][k], ded["profil"][k])
    if set(ded["specialites"]["recommandees"]) != set(ref["specialites"]["recommandees"]):
        ajoute("spécialités recommandées", "léger", ref["specialites"]["recommandees"], ded["specialites"]["recommandees"])
    if ded["specialites"]["maths_expertes"] != ref["specialites"]["maths_expertes"]:
        ajoute("option maths expertes", "léger", ref["specialites"]["maths_expertes"], ded["specialites"]["maths_expertes"])
    for k in ("charge", "dossier_poids", "duree_ans"):
        if ded[k] != ref[k]:
            ajoute(k, "léger", ref[k], ded[k])
    for k in ("metiers", "poursuites"):
        if not ded[k] and ref[k]:
            ajoute(f"{k} absents", "léger", ref[k], ded[k])
    return D


def comparer(mod, reelle, aveugle, nb_formations):
    codes = sorted(k for k, e in reelle.items() if e["origine"] == "famille_existante")
    exclus = [c for c in codes if c in CODES_VISES_PAR_REGLE]
    testes = [c for c in codes if c not in exclus]
    n = len(testes)
    acc = collections.Counter()
    part_dom3, part_reco = [], []
    lignes = []
    for c in testes:
        ref, ded = reelle[c], aveugle[c]
        acc["type"] += ded["type"] == ref["type"]
        acc["dom1"] += ded["domaines"][:1] == ref["domaines"][:1]
        r3 = set(ref["domaines"][:3])
        part_dom3.append(len(r3 & set(ded["domaines"][:3])) / len(r3))
        for k in DIMENSIONS:
            e = abs(ded["profil"][k] - ref["profil"][k])
            acc[k + "_exact"] += e == 0
            acc[k + "_pm1"] += e <= 1
        rr = set(ref["specialites"]["recommandees"])
        if rr:
            part_reco.append(len(rr & set(ded["specialites"]["recommandees"])) / len(rr))
        acc["oblig_inventees"] += sum(s not in ref["specialites"]["obligatoires"] for s in ded["specialites"]["obligatoires"])
        acc["oblig_oubliees"] += sum(s not in ded["specialites"]["obligatoires"] for s in ref["specialites"]["obligatoires"])
        acc["ref_avec_oblig"] += bool(ref["specialites"]["obligatoires"])
        acc["mexp"] += ded["specialites"]["maths_expertes"] == ref["specialites"]["maths_expertes"]
        acc["ref_avec_mexp"] += bool(ref["specialites"]["maths_expertes"])
        for k in ("charge", "dossier_poids", "duree_ans"):
            acc[k] += ded[k] == ref[k]
        acc["metiers_vides"] += not ded["metiers"]
        acc["poursuites_vides"] += not ded["poursuites"]
        acc["ref_metiers_vides"] += not ref["metiers"]
        acc["ref_poursuites_vides"] += not ref["poursuites"]
        acc["valide_perdu"] += ref.get("valide", True) and not ded.get("valide", True)
        D = desaccords(ref, ded)
        for d in D:
            if d["champ"] == "type":
                d["regle"] = f"genre() → gabarit « {gabarit_de(ded) or '?'} »"
            elif d["champ"] == "premier domaine":
                d["regle"] = regle_domaine(mod, c, ded, aveugle)
            elif d["champ"].startswith("profil"):
                g = gabarit_de(ded) or gabarit_de(aveugle.get(re.sub(r"-(App|APP)$", "", c), {})) or "?"
                d["regle"] = f"GABARITS[« {g} »] + ajuster_profil()"
            elif d["champ"].startswith("spécialité obligatoire"):
                d["regle"] = "deduire() : « obligatoires » toujours vide pour une filière déduite"
        lignes.append({"nmc": c, "libelle": ref["libelle"], "nb_formations": nb_formations.get(c, 0), "ref": ref, "ded": ded, "desaccords": D})
    taux = {k: v / n for k, v in acc.items() if k in ("type", "dom1", "mexp", "charge", "dossier_poids", "duree_ans") or k.endswith(("_exact", "_pm1"))}
    taux["dom3"] = sum(part_dom3) / n
    taux["reco"] = sum(part_reco) / len(part_reco) if part_reco else None
    return {"codes": codes, "exclus": exclus, "n": n, "acc": acc, "taux": taux, "nb_reco": len(part_reco), "lignes": lignes}


# ---------------------------------------------------------------- partie 2 : listes de vœux
JS_VOEUX = r"""
"use strict";
const path = require("path");
const fs = require("fs");
const RACINE = process.argv[2];
const { chargerSite } = require(path.join(RACINE, "tests", "charger-site.js"));
const { DATE_TEST } = require(path.join(RACINE, "tests", "instantane.js"));
const PROFILS = require(path.join(RACINE, "tests", "profils.js"));
(async () => {
  const sortie = {};
  for (const [nom, fichier] of JSON.parse(process.argv[3])) {
    const site = await chargerSite(fichier ? { "data/filieres.json": JSON.parse(fs.readFileSync(fichier, "utf8")) } : {});
    const { E, DATA, QUEST } = site;
    const parId = new Map(DATA.formations.map((f) => [f.id, f]));
    const decrire = (id) => { const f = parId.get(id) || {}; return { id, nom: f.nom, etab: f.etablissement, ville: f.ville, type: f.type,
      nmc: f.__nmc || (f.__gen && f.__gen.fam && f.__gen.fam.nmc) || null, table: !!f.__gen }; };
    sortie[nom] = {};
    for (const p of PROFILS) {
      const A = E.recommander(DATA.formations, p.profil, QUEST, p.reponses);
      const W = E.wishlist(A.resultats, 10, A.interets);
      const X = E.etranger(A.resultats, W, A.interets, DATE_TEST);
      sortie[nom][p.id] = {
        voeux: W.liste.map((x) => Object.assign(decrire(x.f.id), { categorie: x.categorie })),
        top40: A.resultats.slice(0, 40).map((x) => x.f.id),
        etranger: JSON.parse(JSON.stringify(X, (k, v) => (v && typeof v === "object" && v.f && v.f.id ? v.f.id : v instanceof Set ? [...v] : v))),
      };
    }
  }
  process.stdout.write(JSON.stringify(sortie));
})().catch((e) => { console.error(e); process.exit(1); });
"""


def tables_temporaires(table_reelle, aveugle, codes):
    """« attributs » : seuls les champs comparés en partie 1 sont remplacés (valide, frais, variantes restent) ;
    « complete » : l'entrée déduite remplace l'entrée entière (y compris valide = false en confiance basse)."""
    t_attr, t_comp = copy.deepcopy(table_reelle), copy.deepcopy(table_reelle)
    for c in codes:
        for k in CHAMPS:
            t_attr["filieres"][c][k] = copy.deepcopy(aveugle[c][k])
        t_comp["filieres"][c] = copy.deepcopy(aveugle[c])
    return t_attr, t_comp


def mesurer_voeux(table_reelle, aveugle, codes):
    t_attr, t_comp = tables_temporaires(table_reelle, aveugle, codes)
    with tempfile.TemporaryDirectory(prefix="mesure-filieres-") as tmp:
        tmp = pathlib.Path(tmp)
        (tmp / "voeux.js").write_text(JS_VOEUX, encoding="utf-8")
        (tmp / "attributs.json").write_text(json.dumps(t_attr, ensure_ascii=False), encoding="utf-8")
        (tmp / "complete.json").write_text(json.dumps(t_comp, ensure_ascii=False), encoding="utf-8")
        arg = json.dumps([["reelle", None], ["attributs", str(tmp / "attributs.json")], ["complete", str(tmp / "complete.json")]])
        res = subprocess.run(["node", str(tmp / "voeux.js"), str(RACINE), arg], capture_output=True, text=True, check=True)
    R = json.loads(res.stdout)
    # contrôle : avec la vraie table, on retrouve les vœux des références de tests/reference/
    for pid, v in R["reelle"].items():
        ref = json.loads((RACINE / "tests" / "reference" / f"{pid}.json").read_text(encoding="utf-8"))
        if [x["id"] for x in v["voeux"]] != [x["id"] for x in ref["voeux"]["liste"]]:
            sys.exit(f"Erreur : les vœux calculés pour {pid} avec la vraie table diffèrent de tests/reference/ (npm test échoue-t-il ?).")
    return R


def comparer_voeux(R, variante, codes):
    out = []
    for pid, v in R["reelle"].items():
        a, b = v["voeux"], R[variante][pid]["voeux"]
        ia, ib = [x["id"] for x in a], [x["id"] for x in b]
        sortis = [x for x in a if x["id"] not in ib]
        entres = [x for x in b if x["id"] not in ia]
        deplaces = sum(1 for i, x in enumerate(ia) if x in ib and ib.index(x) != i)
        cat = sum(1 for x in a for y in b if x["id"] == y["id"] and x["categorie"] != y["categorie"])
        top_a, top_b = R["reelle"][pid]["top40"], R[variante][pid]["top40"]
        # même filière dans un autre établissement : changement moins grave qu'un changement de filière
        fa = collections.Counter(x["nmc"] or x["id"] for x in a)
        fb = collections.Counter(x["nmc"] or x["id"] for x in b)
        out.append({"profil": pid, "change": len(sortis), "change_filiere": sum((fa - fb).values()), "deplaces": deplaces, "categorie": cat, "sortis": sortis, "entres": entres,
                    "top40_communs": len(set(top_a) & set(top_b)),
                    "voeux_famille": sum(1 for x in a if x["nmc"] in codes),
                    "etranger_identique": json.dumps(v["etranger"], sort_keys=True) == json.dumps(R[variante][pid]["etranger"], sort_keys=True)})
    return out


# ---------------------------------------------------------------- partie 3 : échantillon
# Formations « recommandables » : fiches du catalogue notées par la table (f.__gen.fam) qui peuvent entrer dans
# une liste de vœux, c'est-à-dire pour lesquelles CapEngine.horsListe(f) est faux. Calculé avec le vrai site.
JS_RECOMMANDABLES = r"""
"use strict";
const path = require("path");
const RACINE = process.argv[2];
const { chargerSite } = require(path.join(RACINE, "tests", "charger-site.js"));
(async () => {
  const { E, DATA } = await chargerSite({});
  const parNmc = {};
  let total = 0;
  for (const f of DATA.formations) {
    if (f.pays !== "France" || E.horsListe(f)) continue;
    total += 1;
    if (!(f.__gen && f.__gen.fam)) continue;   // fiche éditoriale ou reprise d'un modèle : la table ne sert pas
    const nmc = f.__nmc || f.__gen.fam.nmc;
    (parNmc[nmc] = parNmc[nmc] || []).push(String(f.__gen.gta));
  }
  process.stdout.write(JSON.stringify({ total, parNmc }));
})().catch((e) => { console.error(e); process.exit(1); });
"""


def formations_recommandables():
    """{nmc: [gta des formations recommandables notées par la table]} et nombre total de formations recommandables
    en France (toutes origines de fiche confondues)."""
    with tempfile.TemporaryDirectory(prefix="mesure-filieres-") as tmp:
        js = pathlib.Path(tmp) / "recommandables.js"
        js.write_text(JS_RECOMMANDABLES, encoding="utf-8")
        res = subprocess.run(["node", str(js), str(RACINE)], capture_output=True, text=True, check=True)
    R = json.loads(res.stdout)
    return R["parNmc"], R["total"]


def echantillon(table_reelle, lignes_ps, reco, total_reco):
    par_nmc = collections.defaultdict(list)
    for r in lignes_ps:
        par_nmc[r["nmc"]].append(r)
    F = table_reelle["filieres"]
    base = lambda k: re.sub(r"-(App|APP)$", "", k)
    toutes = sorted(k for k, e in F.items() if e["origine"] == "deduit_intitule")
    familles = sorted(k for k, e in F.items() if e["origine"] == "famille_existante")
    # variantes en apprentissage d'une famille écrite à la main : attributs recopiés de la famille, aucune règle
    # d'intitulé n'est appliquée ; les relire reviendrait à relire la famille. Elles sont exclues du tirage.
    copies = [k for k in toutes if base(k) != k and F.get(base(k), {}).get("origine") == "famille_existante"]
    deduites = [k for k in toutes if k not in copies]
    # Seules les filières qu'un élève peut voir dans sa liste de vœux comptent : au moins une formation recommandable.
    poids = {k: len(reco.get(k, [])) for k in deduites if reco.get(k)}
    cat = {k: collections.Counter(t for r in par_nmc[k] for t in r["tf"]).most_common(1)[0][0] for k in deduites}
    # Tirage sans remise, probabilité proportionnelle au nombre de formations recommandables (tirages successifs :
    # à chaque tirage, une filière restante est choisie avec une probabilité proportionnelle à son poids).
    rng = random.Random(GRAINE)
    restantes = sorted(poids)
    choisies = []
    for _ in range(min(TAILLE_ECHANTILLON, len(restantes))):
        u = rng.random() * sum(poids[k] for k in restantes)
        for k in restantes:
            u -= poids[k]
            if u < 0:
                break
        restantes.remove(k)
        choisies.append(k)
    lignes_par_gta = {str(r["gta"]): r for r in lignes_ps}
    tires = []
    for k in sorted(choisies, key=lambda k: (cat[k], k)):
        # formation d'exemple tirée parmi les formations recommandables de la filière (celles qu'un élève peut voir)
        gta = rng.choice(sorted(reco[k], key=int))
        tires.append((k, cat[k], lignes_par_gta[gta], poids[k]))
    rep = collections.defaultdict(lambda: [0, 0, 0, 0])   # filières déduites, dont recommandables, tirées, formations reco tirées
    for k in deduites:
        rep[cat[k]][0] += 1
        rep[cat[k]][1] += k in poids
    for k, c, _, p in tires:
        rep[c][2] += 1
        rep[c][3] += p
    couverture = {
        "nb_deduites": len(deduites),
        "nb_deduites_reco": len(poids),
        "reco_deduites": sum(poids.values()),
        "reco_copies": sum(len(reco.get(k, [])) for k in copies),
        "reco_familles": sum(len(reco.get(k, [])) for k in familles),
        "nb_familles_reco": sum(1 for k in familles if reco.get(k)),
        "reco_table": sum(len(v) for v in reco.values()),
        "reco_total": total_reco,
        "reco_echantillon": sum(p for *_, p in tires),
    }
    return tires, {c: tuple(rep[c]) for c in sorted(rep)}, (len(toutes), copies), couverture


def ecrire_csv(table_reelle, tires):
    F = table_reelle["filieres"]
    entete = ["nmc", "intitule_officiel", "categorie_parcoursup", "fiche_parcoursup", "formation_exemple", "confiance", "valide",
              "type", "domaine_1", "domaine_2", "domaine_3"] + [f"profil_{k}" for k in DIMENSIONS] + \
             ["specialites_obligatoires", "specialites_recommandees", "maths_expertes", "autres_intitules_du_code", "attributs_repris_de",
              "formations_recommandables", "correct (oui/non)", "champ faux", "commentaire"]
    with CSV_RELECTURE.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(entete)
        for k, c, r, p in tires:
            e = F[k]
            dom = (e["domaines"] + ["", "", ""])[:3]
            sp = e["specialites"]
            w.writerow([k, e["libelle"], c, r.get("fiche") or "", f"{r['nm'][0]} ({r.get('commune') or ''})", e["confiance"],
                        "oui" if e.get("valide") else "non", e["type"], *dom, *[e["profil"][d] for d in DIMENSIONS],
                        " ".join(sp["obligatoires"]), " ".join(sp["recommandees"]), sp["maths_expertes"] or "",
                        " | ".join(sorted(e.get("variantes", {}))),
                        (re.search(r"attributs repris de ([^ ]+) ", e["justification"]) or [None, ""])[1], p, "", "", ""])


# ---------------------------------------------------------------- rapport
def pc(x):
    return "—" if x is None else f"{100 * x:.0f} %"


def court(v):
    if isinstance(v, list):
        return ", ".join(map(str, v)) or "(aucun)"
    return "(aucun)" if v is None else str(v)


def section_resultats(C, V, ech):
    n, t, a = C["n"], C["taux"], C["acc"]
    L = []
    L.append("_Partie générée par `python3 scripts/mesurer-filieres.py` : ne pas modifier à la main._\n")
    L.append(f"### 1. Test à l'aveugle sur les familles écrites à la main\n")
    L.append(f"{len(C['codes'])} familles existantes ; {len(C['exclus'])} exclue(s) parce qu'une règle du script vise nommément son code : "
             + ", ".join(f"**{c}** ({CODES_VISES_PAR_REGLE[c]})" for c in C["exclus"]) + f". **{n} familles testées.**\n")
    L.append("| Champ | Accord |\n|---|---|")
    L.append(f"| Type de formation identique | {pc(t['type'])} ({a['type']}/{n}) |")
    L.append(f"| Premier domaine identique | {pc(t['dom1'])} ({a['dom1']}/{n}) |")
    L.append(f"| Part des 3 premiers domaines (référence) retrouvés dans les 3 déduits | {pc(t['dom3'])} (moyenne) |")
    L.append(f"| Spécialités recommandées de la référence retrouvées | {pc(t['reco'])} (moyenne sur {C['nb_reco']} familles qui en ont) |")
    L.append(f"| Spécialités obligatoires inventées | {a['oblig_inventees']} |")
    L.append(f"| Spécialités obligatoires oubliées | {a['oblig_oubliees']} (sur {a['ref_avec_oblig']} familles qui en ont) |")
    L.append(f"| Option maths expertes identique | {pc(t['mexp'])} ({a['mexp']}/{n} ; {a['ref_avec_mexp']} familles de référence la demandent) |")
    for k, lib in (("charge", "Charge"), ("dossier_poids", "Poids du dossier"), ("duree_ans", "Durée")):
        L.append(f"| {lib} identique | {pc(t[k])} ({a[k]}/{n}) |")
    L.append(f"| Déduction sans aucun métier | {pc(a['metiers_vides'] / n)} ({a['metiers_vides']}/{n} ; référence sans métier : {a['ref_metiers_vides']}) |")
    L.append(f"| Déduction sans aucune poursuite d'études | {pc(a['poursuites_vides'] / n)} ({a['poursuites_vides']}/{n} ; référence sans poursuite : {a['ref_poursuites_vides']}) |")
    L.append(f"| Famille qui deviendrait « non valide » (confiance basse) | {a['valide_perdu']}/{n} |")
    L.append(f"| Famille sans aucun domaine déduit (la construction réelle s'arrêterait) | {len(C['sans_domaine'])}/{n}"
             + (f" : {', '.join(C['sans_domaine'])}" if C["sans_domaine"] else "") + " |")
    L.append("\n**Profil, dimension par dimension**\n\n| Dimension | Identique | À ±1 près |\n|---|---|---|")
    for k in DIMENSIONS:
        L.append(f"| {k} | {pc(t[k + '_exact'])} | {pc(t[k + '_pm1'])} |")
    tous = [d for l in C["lignes"] for d in l["desaccords"]]
    g = collections.Counter(d["gravite"] for d in tous)
    fil = collections.Counter(max((d["gravite"] for d in l["desaccords"]), key=["léger", "moyen", "grave"].index, default="aucun") for l in C["lignes"])
    L.append(f"\n**Désaccords par gravité** : {g['grave']} graves, {g['moyen']} moyens, {g['léger']} légers "
             f"({len(tous)} au total). Par famille, pire désaccord : {fil['grave']} familles avec au moins un désaccord grave, "
             f"{fil['moyen']} au pire moyen, {fil['léger']} au pire léger, {fil['aucun']} sans désaccord.\n")
    L.append("| Champ | Grave | Moyen | Léger |\n|---|---|---|---|")
    pc_champ = collections.defaultdict(collections.Counter)
    for d in tous:
        pc_champ[d["champ"]][d["gravite"]] += 1
    for ch in sorted(pc_champ, key=lambda c: (-pc_champ[c]["grave"], -pc_champ[c]["moyen"], c)):
        L.append(f"| {ch} | {pc_champ[ch]['grave']} | {pc_champ[ch]['moyen']} | {pc_champ[ch]['léger']} |")

    # 10 désaccords graves les plus importants : familles classées par nombre de formations concernées
    L.append("\n**Les 10 familles aux désaccords graves les plus importants** (classées par nombre de formations Parcoursup "
             "de la filière, donc par nombre de fiches touchées dans le moteur)\n")
    L.append("| Filière | Formations | Champ | Écrit à la main | Déduit | Règle en cause |\n|---|---|---|---|---|---|")
    graves = sorted((l for l in C["lignes"] if any(d["gravite"] == "grave" for d in l["desaccords"])), key=lambda l: (-l["nb_formations"], l["nmc"]))
    for l in graves[:10]:
        for i, d in enumerate(x for x in l["desaccords"] if x["gravite"] == "grave"):
            tete = f"**{l['nmc']}** {l['libelle']}" if i == 0 else ""
            L.append(f"| {tete} | {l['nb_formations'] if i == 0 else ''} | {d['champ']} | {court(d['ref'])} | {court(d['ded'])} | {d['regle']} |")
    L.append("\n<details><summary>Version complète, côte à côte, de ces 10 familles</summary>\n")
    for l in graves[:10]:
        r, d = l["ref"], l["ded"]
        L.append(f"\n**{l['nmc']}** — {l['libelle']}\n\n| | Écrit à la main | Déduit |\n|---|---|---|")
        L.append(f"| type | {r['type']} | {d['type']} |")
        L.append(f"| domaines | {court(r['domaines'])} | {court(d['domaines'])} |")
        L.append(f"| profil (m/é/i/e/p/poly) | {'/'.join(str(r['profil'][k]) for k in DIMENSIONS)} | {'/'.join(str(d['profil'][k]) for k in DIMENSIONS)} |")
        L.append(f"| obligatoires | {court(r['specialites']['obligatoires'])} | {court(d['specialites']['obligatoires'])} |")
        L.append(f"| recommandées | {court(r['specialites']['recommandees'])} | {court(d['specialites']['recommandees'])} |")
        L.append(f"| maths expertes | {court(r['specialites']['maths_expertes'])} | {court(d['specialites']['maths_expertes'])} |")
        L.append(f"| charge / dossier / durée | {r['charge']} / {r['dossier_poids']} / {r['duree_ans']} | {d['charge']} / {d['dossier_poids']} / {d['duree_ans']} |")
    L.append("\n</details>\n")

    regles = collections.Counter(d["regle"] for d in tous if d["gravite"] == "grave")
    L.append("**Règles de `construire-filieres.py` qui produisent le plus de désaccords graves**\n\n| Règle | Désaccords graves |\n|---|---|")
    for rg, k in regles.most_common(12):
        L.append(f"| {rg} | {k} |")

    if V:
        L.append("\n### 2. Effet sur les listes de 10 vœux\n")
        for variante, titre in (("attributs", "Table « attributs » (seuls les champs comparés en partie 1 sont remplacés)"),
                                ("complete", "Table « complète » (l'entrée déduite remplace tout, y compris `valide`)")):
            res = V[variante]
            tot = sum(x["change"] for x in res)
            L.append(f"**{titre}** : {tot} vœux changent sur {10 * len(res)}, dont {sum(x['change_filiere'] for x in res)} changements de filière "
                     f"(les autres : même filière, autre établissement) ; "
                     f"profils qui gardent exactement les mêmes 10 formations : {sum(1 for x in res if x['change'] == 0)} sur {len(res)}.\n")
            L.append("| Profil | Vœux tirés des familles (vraie table) | Vœux remplacés | dont filière changée | Vœux déplacés | Catégorie changée | Top 40 en commun | Étranger identique |\n|---|---|---|---|---|---|---|---|")
            for x in res:
                L.append(f"| {x['profil']} | {x['voeux_famille']} | {x['change']} | {x['change_filiere']} | {x['deplaces']} | {x['categorie']} | {x['top40_communs']}/40 | {'oui' if x['etranger_identique'] else 'non'} |")
            L.append("")
            for x in res:
                if x["change"]:
                    L.append(f"- **{x['profil']}** : sortent " + " ; ".join(f"{s['nom']} ({s['etab']}, {s['nmc'] or 'fiche éditoriale'})" for s in x["sortis"])
                             + " — entrent " + " ; ".join(f"{s['nom']} ({s['etab']}, {s['nmc'] or 'fiche éditoriale'})" for s in x["entres"]) + ".")
            L.append("")

    tires, rep, (nded, copies), cv = ech
    L.append(f"### 3. Échantillon à relire\n\n{nded} filières déduites, moins {len(copies)} variantes en apprentissage qui recopient "
             f"une famille écrite à la main ({', '.join(copies)}) : {cv['nb_deduites']} filières passent par les règles d'intitulé. "
             f"**{cv['nb_deduites_reco']} d'entre elles seulement ont au moins une formation recommandable** (fiche notée par la "
             "table, en France, pour laquelle `CapEngine.horsListe(f)` est faux, calculé avec le vrai site chargé par "
             "`tests/charger-site.js`) ; les autres n'apparaissent dans aucune liste de vœux.\n")
    pt = lambda a, b: f"{100 * a / b:.1f} %".replace(".", ",") if b else "—"
    L.append("| Formations recommandables | Nombre | Part |\n|---|---|---|")
    L.append(f"| Toutes, en France (toutes origines de fiche) | {cv['reco_total']} | 100 % |")
    L.append(f"| Notées par la table `data/filieres.json` | {cv['reco_table']} | {pt(cv['reco_table'], cv['reco_total'])} |")
    L.append(f"| … par les 87 familles écrites à la main ({cv['nb_familles_reco']} familles en ont) | {cv['reco_familles']} | {pt(cv['reco_familles'], cv['reco_total'])} |")
    L.append(f"| … par les {cv['nb_deduites_reco']} filières déduites tirables | {cv['reco_deduites']} | {pt(cv['reco_deduites'], cv['reco_total'])} |")
    L.append(f"| … par les variantes en apprentissage qui recopient une famille (exclues du tirage) | {cv['reco_copies']} | {pt(cv['reco_copies'], cv['reco_total'])} |")
    L.append(f"| **Couvertes par l'échantillon de {len(tires)} filières** | **{cv['reco_echantillon']}** | "
             f"**{pt(cv['reco_echantillon'], cv['reco_deduites'])} des formations recommandables des filières déduites** |")
    L.append(f"\nTirage : {len(tires)} filières parmi les {cv['nb_deduites_reco']}, sans remise, avec une probabilité proportionnelle "
             f"au nombre de formations recommandables (tirages successifs), graine `{GRAINE}` : `docs/relecture-filieres.csv`. "
             "La formation d'exemple de chaque ligne est tirée parmi les formations recommandables de la filière.\n")
    L.append("| Catégorie Parcoursup | Filières déduites | dont avec formation recommandable | Tirées | Formations recommandables des filières tirées |\n|---|---|---|---|---|")
    for c, (k, kr, m, p) in rep.items():
        L.append(f"| {c} | {k} | {kr} | {m} | {p} |")

    L.append("\n### 4. Seuils proposés, appliqués à cette mesure\n\n| Critère | Seuil proposé | Mesuré | Atteint |\n|---|---|---|---|")
    mes = {"dom1": t["dom1"], "type": t["type"], "maths_pm1": t["maths_pm1"], "ecrit_pm1": t["ecrit_pm1"], "oblig_inventees": a["oblig_inventees"]}
    if V:
        mes["voeux_inchanges"] = 1 - sum(x["change"] for x in V["attributs"]) / (10 * len(V["attributs"]))
    for lib, k, s in SEUILS:
        if k not in mes:
            continue
        if k == "oblig_inventees":
            L.append(f"| {lib} | 0 | {mes[k]} | {'oui' if mes[k] <= s else 'non'} |")
        else:
            L.append(f"| {lib} | ≥ {pc(s)} | {pc(mes[k])} | {'oui' if mes[k] >= s else 'non'} |")
    return "\n".join(L)


def main():
    args = set(sys.argv[1:])
    mod = charger_construction()
    table = lire("filieres.json")
    reelle = table["filieres"]
    aveugle, sans_domaine = table_a_l_aveugle(mod)
    lignes_ps = mod.decoder_parcoursup(lire("parcoursup.json"))
    # decoder_parcoursup ne garde que quelques champs : on relit la fiche et la commune pour l'échantillon
    c = lire("parcoursup.json")
    K, S = c["meta"]["cles"], c["s"]
    fiche_type = "https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod={}&typeBac=0&originePc=0"
    for r, L in zip(lignes_ps, c["l"]):
        v = L[K.index("fiche")]   # même encodage que decodePs() dans js/app.js : 0 = adresse type, sinon S[v - 1]
        r["fiche"] = fiche_type.format(r["gta"]) if v == 0 else S[v - 1]
        v = L[K.index("commune")]
        r["commune"] = None if v is None else S[v]
    masquees = lire("fusion.json")["meta"]["perimetre"]["categories_masquees"]
    lignes_ps = [r for r in lignes_ps if not any(t in masquees for t in r["tf"])]
    nb_formations = collections.Counter(r["nmc"] for r in lignes_ps)

    # contrôle : sans correction à la main, la construction à l'aveugle redonne les filières déduites non corrigées
    corr = json.loads(mod.CORRECTIONS.read_text(encoding="utf-8"))["corrections"]
    familles = {k for k, e in reelle.items() if e["origine"] == "famille_existante"}
    for k, e in reelle.items():
        base = re.sub(r"-(App|APP)$", "", k)
        if e["origine"] == "deduit_intitule" and k not in corr and base not in corr and base not in familles:
            for ch in CHAMPS:
                if e[ch] != aveugle[k][ch]:
                    sys.exit(f"Erreur : la construction à l'aveugle ne redonne pas {k}.{ch} ; le script de mesure n'est plus à jour.")

    C = comparer(mod, reelle, aveugle, nb_formations)
    C["sans_domaine"] = sorted(c for c in sans_domaine if c in C["codes"] and c not in C["exclus"])
    testes = [l["nmc"] for l in C["lignes"]]
    V = None
    if "--sans-voeux" not in args:
        R = mesurer_voeux(table, aveugle, testes)
        V = {v: comparer_voeux(R, v, set(testes)) for v in ("attributs", "complete")}
    reco, total_reco = formations_recommandables()
    ech = echantillon(table, lignes_ps, reco, total_reco)
    if "--echantillon" in args or not CSV_RELECTURE.exists():
        ecrire_csv(table, ech[0])
        print(f"{CSV_RELECTURE.relative_to(RACINE)} écrit ({len(ech[0])} filières).")
    else:
        print(f"{CSV_RELECTURE.relative_to(RACINE)} existe déjà : non réécrit (option --echantillon pour le refaire).")

    texte = section_resultats(C, V, ech)
    if RAPPORT.exists() and DEBUT in RAPPORT.read_text(encoding="utf-8"):
        avant, reste = RAPPORT.read_text(encoding="utf-8").split(DEBUT, 1)
        apres = reste.split(FIN, 1)[1]
        RAPPORT.write_text(f"{avant}{DEBUT}\n{texte}\n{FIN}{apres}", encoding="utf-8")
        print(f"{RAPPORT.relative_to(RACINE)} : résultats mis à jour.")
    else:
        print(texte)


if __name__ == "__main__":
    main()
