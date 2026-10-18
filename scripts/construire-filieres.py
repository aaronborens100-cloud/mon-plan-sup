#!/usr/bin/env python3
"""Construit data/filieres.json : une entrée par filière Parcoursup (code « nmc ») du périmètre.

Chaque entrée porte les attributs que le moteur (js/moteur.js) compare au questionnaire :
type, domaines, profil, spécialités, charge, poids du dossier, durée, langue, métiers,
poursuites, niveau d'anglais, frais publics. Ces attributs sont éditoriaux et décrivent
la filière, pas un établissement.

Deux origines :
  - « famille_existante » : les familles de data/generees.json, reprises telles quelles ;
  - « deduit_intitule »   : déduit de l'intitulé officiel Parcoursup de la filière (champs
    nm / fl) et de sa catégorie Parcoursup (tf), avec les règles de ce script.

Aucun chiffre n'est ajouté : pas de taux, de moyenne, de frais ni de salaire. Les chiffres
des fiches viennent des statistiques officielles de chaque formation (data/stats.json).
Les frais publics ne sont repris que des familles existantes (sourcés) ; pour les filières
déduites, cout_public vaut null.

Les corrections à la main sont dans scripts/filieres-corrections.json : le script les relit
et les applique en dernier. Ne jamais modifier data/filieres.json à la main.

Usage : python3 scripts/construire-filieres.py
"""
import collections
import json
import pathlib
import re
import sys
import unicodedata

RACINE = pathlib.Path(__file__).resolve().parent.parent
DATA = RACINE / "data"
CORRECTIONS = RACINE / "scripts" / "filieres-corrections.json"
SORTIE = DATA / "filieres.json"

VERSION = "2026-10-18"
URL_CARTO = "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-cartographie_formations_parcoursup/"
SOURCE_CARTO = {"url": URL_CARTO, "consulte_le": VERSION, "fichier": "data/parcoursup.json",
                "objet": "intitulé officiel (nm, fl) et catégorie (tf) de la filière, lus dans l'extrait local de la cartographie Parcoursup 2026"}


def lire(nom):
    return json.loads((DATA / nom).read_text(encoding="utf-8"))


def sans_accents(t):
    t = unicodedata.normalize("NFD", str(t))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower().replace("’", "'")


# ---------------------------------------------------------------- lecture de Parcoursup
def decoder_parcoursup(c):
    """Même décodage que decodePs() dans js/app.js, limité aux champs utiles ici."""
    K, S = c["meta"]["cles"], c["s"]
    utiles = ("tf", "nm", "fl", "nmc", "gta", "tc")
    lignes = []
    for L in c["l"]:
        r = {}
        for k, v in zip(K, L):
            if k not in utiles:
                continue
            r[k] = None if v is None else [S[i] for i in v] if isinstance(v, list) else S[v]
        lignes.append(r)
    return lignes


# ---------------------------------------------------------------- types de formation
# Types déjà connus (data/generees.json) + types ajoutés pour les filières sans équivalent.
TYPES_AJOUTES = {
    "deust": "DEUST (diplôme universitaire bac + 2)",
    "dcg": "DCG (comptabilité et gestion)",
    "certificat_specialisation": "Certificat de spécialisation ou FCIL",
    "jeunesse_sport": "Diplôme du sport et de l'animation (BPJEPS, DEJEPS)",
    "formation_pro": "Formation ou titre professionnel",
    "annee_preparatoire": "Année préparatoire ou de mise à niveau",
    "diplome_etablissement": "Diplôme d'université ou d'établissement",
    "architecture": "École d'architecture, du paysage ou du patrimoine",
    "ecole_veterinaire": "École vétérinaire",
}

# Gabarits par genre de filière : type, profil {maths, ecrit, international, encadrement,
# pratique, poly} (0 à 3, poly 0 à 2), charge, poids du dossier, durée par défaut.
# Valeurs éditoriales alignées sur les familles existantes du même type (generees.json).
P = lambda m, e, i, c, p, y: {"maths": m, "ecrit": e, "international": i, "encadrement": c, "pratique": p, "poly": y}
GABARITS = {
    "licence":        ("licence", P(1, 2, 1, 1, 1, 0), "moyenne", "faible", 3),
    "licence_select": ("licence", P(1, 2, 1, 1, 1, 0), "moyenne", "moyen", 3),
    "licence_pro":    ("licence", P(1, 1, 1, 1, 2, 0), "moyenne", "moyen", 3),
    "cmi":            ("licence", P(2, 1, 1, 2, 2, 1), "forte", "moyen", 5),
    "cpes":           ("licence", P(1, 2, 1, 3, 0, 2), "forte", "moyen", 3),
    "cupge":          ("licence", P(2, 1, 1, 2, 0, 1), "forte", "moyen", 3),
    "cpge":           ("prepa_scientifique", P(2, 1, 1, 3, 0, 1), "tres_forte", "moyen", 2),
    "sante":          ("sante_social", P(1, 1, 0, 2, 3, 0), "moyenne", "moyen", 3),
    "social":         ("sante_social", P(1, 2, 0, 2, 3, 0), "moyenne", "moyen", 3),
    "deust":          ("deust", P(1, 1, 0, 2, 2, 0), "moyenne", "moyen", 2),
    "dcg":            ("dcg", P(2, 2, 0, 2, 1, 0), "forte", "moyen", 3),
    "cs":             ("certificat_specialisation", P(0, 0, 0, 2, 3, 0), "moyenne", "moyen", 1),
    "jeps":           ("jeunesse_sport", P(0, 1, 0, 2, 3, 0), "moyenne", "moyen", 1),
    "fp":             ("formation_pro", P(1, 1, 0, 2, 3, 0), "moyenne", "moyen", 2),
    "prepa_annee":    ("annee_preparatoire", P(1, 1, 0, 3, 1, 1), "moyenne", "moyen", 1),
    "du":             ("diplome_etablissement", P(1, 1, 1, 2, 2, 0), "moyenne", "moyen", 3),
    "architecture":   ("architecture", P(1, 2, 1, 2, 2, 1), "forte", "fort", 5),
    "art":            ("ecole_art", P(0, 1, 1, 2, 2, 0), "moyenne", "fort", 3),
    "ingenieur":      ("ecole_ingenieur", P(2, 1, 1, 2, 2, 1), "moyenne", "moyen", 5),
    "commerce":       ("ecole_commerce", P(1, 1, 2, 2, 2, 1), "moyenne", "moyen", 5),
    "hotellerie":     ("ecole_specialisee", P(1, 1, 2, 2, 3, 1), "moyenne", "moyen", 3),
    "veterinaire":    ("ecole_veterinaire", P(2, 1, 1, 2, 2, 0), "forte", "moyen", 6),
    "sciencespo":     ("college_universitaire", P(1, 3, 2, 2, 1, 2), "forte", "moyen", 3),
    "specialisee":    ("ecole_specialisee", P(1, 1, 1, 2, 2, 0), "moyenne", "moyen", 3),
}

# Filières à intitulé générique (le code regroupe des formations très différentes) :
# les domaines sont déduits de l'ensemble des intitulés de leurs formations, confiance basse.
# Diplômes courts et professionnels : pas de métier d'ingénieur comme débouché direct.
SANS_INGENIEUR = {"cs", "fp", "deust", "jeps"}

GENERIQUES = {"FCIL", "DE", "DE-App", "DU", "AnP", "L1-Pluri", "EI-BAC4", "LP", "LP-App", "LP-SHS", "LP-STS"}


def genre(nmc, tfs, lib):
    """Genre de filière (clé de GABARITS) d'après le code nmc, la catégorie tf et l'intitulé."""
    n, t, l = nmc, " | ".join(tfs), sans_accents(lib)
    if n.startswith("CMI-"):
        return "cmi"
    if n.startswith(("CPES-", "CEPS-")):
        return "cpes"
    if n.startswith("CUPGE"):
        return "cupge"
    if n.startswith("CPGE-") or n.startswith("ECG-"):
        return "cpge"
    if n.startswith("LP"):
        return "licence_pro"
    if n.startswith("L1-") or n in ("PASS", "LAS"):
        return "licence_select" if t == "Licence sélective" else "licence"
    if n.startswith("DCG"):
        return "dcg"
    if n.startswith("DEUST"):
        return "deust"
    if n.startswith(("BPJEPS", "DEJEPS", "DEPJPS", "CS-ESS", "CS-ECSAAN")):
        return "jeps"
    if n.startswith(("CS-", "CSA-")) or n == "FCIL":
        return "cs"
    if n.startswith(("FP", "TP")):
        return "fp"
    if n.startswith(("AnP", "CLPES", "MAN-")):
        return "prepa_annee"
    if n.startswith(("DU", "DSP")) or n in ("DE", "DE-App"):
        return "du"
    if n.startswith(("ENSA-", "EA-")):
        return "architecture"
    if n == "ENV":
        return "veterinaire"
    if "Sciences Po" in t:
        return "sciencespo"
    if "Etudes de santé" in t:
        return "sante"
    if "travail social" in t:
        return "social"
    if "art, de design et du spectacle" in t:
        return "art"
    if "écoles d'ingénieurs" in t:
        return "ingenieur"
    if "écoles de commerce" in t:
        return "commerce"
    if "hôtellerie" in t:
        return "hotellerie"
    return "specialisee"


# ---------------------------------------------------------------- domaines d'après l'intitulé
# (motif sur l'intitulé sans accents, domaines, spécialités conseillées, métiers)
# Les métiers sont des id de data/metiers.json ; le script vérifie qu'ils existent.
REGLES = [
    (r"\bveterinaire|\bveto\b", ["vivant", "sante"], ["SVT", "physique_chimie"], ["veterinaire"]),
    (r"orthophon", ["sante", "sciences_humaines"], ["SVT", "HLP"], ["orthophoniste"]),
    (r"infirmi", ["sante"], ["SVT"], ["infirmier"]),
    (r"ergotherap", ["sante"], ["SVT"], ["ergotherapeute"]),
    (r"psychomotri", ["sante"], ["SVT"], ["psychomotricien"]),
    (r"kinesither", ["sante"], ["SVT", "physique_chimie"], ["kinesitherapeute"]),
    (r"orthoptiste|audioprothes|pedicure|podolog|orthopediste|prothese dentaire", ["sante"], ["SVT", "physique_chimie"], []),
    (r"electroradiolog|imagerie medicale|radiolog", ["sante", "ingenierie_tech"], ["SVT", "physique_chimie"], []),
    (r"laboratoire medical|analyse des milieux biologiques|techniques de laboratoire", ["sante", "vivant"], ["SVT", "physique_chimie"], ["technicien_laboratoire"]),
    (r"pharmac", ["sante"], ["SVT", "physique_chimie"], ["technicien_laboratoire"]),
    (r"sciences? (pour la |de la )?sante|biomedic|secretariat medical|sanitaires? et soci|sante environnement", ["sante"], ["SVT", "physique_chimie"], []),
    (r"assistant de service social", ["sante", "sciences_humaines"], ["SES"], ["assistant_social"]),
    (r"jeunes enfants", ["sante", "sciences_humaines"], ["SES"], ["educateur_jeunes_enfants"]),
    (r"educateur specialise|educateur technique specialise", ["sante", "sciences_humaines"], ["SES"], ["educateur_specialise"]),
    (r"intervention sociale|inadaptations sociales|mediations? citoyenne|services au domicile|insertion professionnelle", ["sante", "sciences_humaines"], ["SES"], ["educateur_specialise"]),
    (r"professeur de danse", ["arts"], ["arts", "EPPCS"], ["danseur", "enseignant"]),
    (r"professeur de musique", ["arts"], ["arts"], ["musicien", "enseignant"]),
    (r"professeur de theatre", ["arts"], ["arts", "HLP"], ["comedien", "enseignant"]),
    (r"staps|activites physiques|educateur sportif|sportif|sportives?\b|natation|aquatiques?|activites de la forme|metiers de la forme|judo|cyclisme|du velo|canoe|equitation|athletisme|\bvoile\b", ["sport", "sante"], ["EPPCS", "SVT"], ["coach_sportif"]),
    (r"animation socio|animateur", ["sciences_humaines", "sante"], ["SES"], []),
    (r"\bdroit\b|juridi|clerc|notari", ["droit"], ["HGGSP", "SES", "HLP"], ["juriste", "avocat"]),
    (r"science politique|sciences politiques|instituts? d'etudes politiques|\biep\b|administration publique|administrations|collectivites territoriales", ["sciences_politiques"], ["HGGSP", "SES"], ["charge_mission_politique", "fonctionnaire_territorial"]),
    (r"securite publique|securite et de la gendarmerie|metiers de la securite|securite civile|agent de securite", ["sciences_politiques"], ["HGGSP"], ["sous_officier"]),
    (r"europeennes|internationa|import.export|echanges internationaux", ["international", "langues"], ["LLCER_anglais", "HGGSP"], ["commercial", "diplomate"]),
    (r"econom(?!ie de la construction)", ["economie"], ["SES", "maths"], ["economiste"]),
    (r"comptab|financ|\bpaie\b|fiscal", ["finance", "gestion_commerce"], ["maths", "SES"], ["audit", "controle_gestion"]),
    (r"ressources humaines|recrutement|formateur", ["gestion_commerce", "sciences_humaines"], ["SES"], ["rh"]),
    (r"immobili", ["gestion_commerce", "droit"], ["SES"], ["commercial"]),
    (r"commerc|\bvente\b|vendeur|negociat|marketing|business|retail|affaires|merchandis|clientele|e.commerce|barista", ["gestion_commerce"], ["SES"], ["commercial", "marketing"]),
    (r"gestion|management|manager|administrati|entreprise|direction|organisations|petite et moyenne|etablissement marchand|unite commerciale|developpement commercial|du developpement", ["gestion_commerce"], ["SES", "maths"], ["controle_gestion", "entrepreneur"]),
    (r"transport|logistiq|supply chain|ferroviaire", ["gestion_commerce", "ingenierie_tech"], ["maths"], []),
    (r"journalis|medias", ["communication", "sciences_humaines"], ["HLP", "SES"], ["journaliste"]),
    (r"communication|evenementiel|webmarketing|community", ["communication", "gestion_commerce"], ["HLP", "SES"], ["communicant", "community_manager"]),
    (r"cybersecu|securite informatique|reseaux et (cyber)?securite|systemes,? (et )?reseaux", ["data_informatique"], ["NSI", "maths"], ["expert_cybersecurite"]),
    (r"intelligence artificielle|\bia\b|data|donnees|statisti|optimisation", ["data_informatique", "maths"], ["maths", "NSI"], ["data_analyst", "data_scientist"]),
    (r"informati|numerique|digital|\bweb\b|internet|reseaux (informatiques|et telecom)|telecommunications|logiciel|applications|full stack|multimedia|systemes communicants|infrastructure", ["data_informatique"], ["NSI", "maths"], ["developpeur", "ingenieur_logiciel"]),
    (r"mathemat", ["maths"], ["maths"], ["professeur_maths", "statisticien"]),
    (r"aeronaut|avions|helicopteres|avionique", ["ingenierie_tech"], ["SI", "physique_chimie"], ["technicien_superieur", "ingenieur_aeronautique"]),
    (r"electroni|electri|energ|automati|nucleaire|ascensor|capteurs|renouvelables", ["ingenierie_tech"], ["SI", "physique_chimie", "maths"], ["technicien_superieur", "ingenieur_electronique"]),
    (r"mecani|mecatroni|soudage|chaudronn|tuyauter|oleohydraul|maintenance|controle non destructif|controle technique|structures metalliques|composites|plasturgi|fabrication additive|impression 3d|industri|production|apres-vente|vehicules|motocycles", ["ingenierie_tech"], ["SI", "physique_chimie"], ["technicien_superieur", "ingenieur_mecanique"]),
    (r"batiment|travaux publics|conducteur de travaux|finitions|\bbtp\b|construction|chantier|genie civil|gros.oeuvre|topograph|\bbim\b|chauffage|renovation|cordiste|genie urbain", ["ingenierie_tech"], ["SI", "physique_chimie", "maths"], ["technicien_superieur"]),
    (r"sciences? (pour|de) l'ingenieur|\bingenieri|\bingenieur", ["ingenierie_tech", "maths"], ["SI", "physique_chimie", "maths"], ["ingenieur_rd"]),
    (r"\bphysique\b|sciences physiques|acoustique", ["ingenierie_tech", "maths"], ["physique_chimie", "maths"], ["physicien"]),
    (r"chimi|parfum|cosmeti|aromes", ["ingenierie_tech", "vivant"], ["physique_chimie"], ["chimiste", "technicien_laboratoire"]),
    (r"qualite|hygiene", ["ingenierie_tech", "vivant"], ["physique_chimie", "SVT"], ["charge_environnement"]),
    (r"agric|agro|elevage|bovin|ovin|caprin|porcin|avicole|maraich|arboricult|vigne|vins?\b|apicult|betail|grains|fermiers|equides|cynegeti|bucheron|machines agricoles|plantes|methanisation|laiti|espaces verts|sols sportifs|paysageres|genie ecologique|arboriste", ["vivant"], ["bio_eco", "SVT"], ["conseiller_agricole"]),
    (r"sciences de la terre|geolog|oceanograph|ressources marines|mer et du littoral|maritime|peche", ["vivant", "ingenierie_tech"], ["SVT", "physique_chimie"], ["geologue", "charge_environnement"]),
    (r"environnement|ecologi|transition ecologique|durable|dechets|nature|milieu naturel|\beau\b", ["vivant"], ["SVT", "bio_eco"], ["charge_environnement"]),
    (r"sciences de la vie|biolog|biotechnolog|bio-industries|(?<!spectacle )\bvivant", ["vivant"], ["SVT", "physique_chimie"], ["biologiste", "technicien_laboratoire"]),
    (r"tourisme|voyages|accueil|reception|hotel|(?<!conservation-)restaura(nt|tion)(?! (des biens|meubles))|\bbar\b|sommell|hebergement|loisirs|hospitalit|arts culinaires|luxe", ["gestion_commerce", "langues"], ["LLCER_anglais", "SES"], ["agent_tourisme"]),
    (r"langues|langue\b|anglais|allemand|espagnol|chinois|arabe|multilingue|traduct|lea\b", ["langues", "international"], ["LLCER_anglais", "LLCER_autre"], ["traducteur"]),
    (r"lettres|litterat|litterai|humanites|francais", ["sciences_humaines", "langues"], ["HLP"], ["enseignant", "editeur"]),
    (r"philosoph|theolog|aumonerie", ["sciences_humaines"], ["HLP"], ["enseignant", "chercheur"]),
    (r"histoire de l'art|archeolog|patrimoine|conservation", ["sciences_humaines", "arts"], ["HGGSP", "arts"], ["conservateur", "mediateur_culturel"]),
    (r"histoire", ["sciences_humaines"], ["HGGSP", "HLP"], ["historien", "enseignant"]),
    (r"geograph|amenagement(?! finitions)|territori|cartograph|urbain", ["sciences_humaines", "vivant"], ["HGGSP", "SES"], ["geographe", "urbaniste"]),
    (r"sociolog|anthropolog|ethnolog|sciences sociales|societ|sciences de l'homme|sciences humaines", ["sciences_humaines"], ["SES", "HGGSP"], ["chercheur"]),
    (r"psycholog|cognitiv", ["sciences_humaines", "sante"], ["SVT", "SES"], ["psychologue"]),
    (r"enseignement|professorat|education|mediation", ["sciences_humaines"], ["HLP", "SES"], ["enseignant"]),
    (r"bibliotheques|documentation|livre|edition", ["sciences_humaines", "communication"], ["HLP"], ["editeur", "mediateur_culturel"]),
    (r"cultur", ["sciences_humaines", "arts"], ["HLP", "arts"], ["mediateur_culturel"]),
    (r"architecte d'interieur", ["arts"], ["arts"], ["architecte_interieur"]),
    (r"architecture|architecte", ["arts", "ingenierie_tech"], ["arts", "maths", "physique_chimie"], ["architecte"]),
    (r"paysag", ["arts", "vivant"], ["arts", "SVT"], ["urbaniste"]),
    (r"conservation-restauration|restauration meubles|dorure|peintre decorateur|maquettes|prototypes|haute couture", ["arts"], ["arts"], ["artisan_art", "restaurateur_art"]),
    (r"(?<!geo)(?<!carto)graphi", ["arts", "communication"], ["arts"], ["graphiste"]),
    (r"design", ["arts"], ["arts"], ["designer_produit", "designer_ux"]),
    (r"cinema|audiovisuel|monteur|son et de l'image|cine-photo", ["arts", "communication"], ["arts"], ["realisateur"]),
    (r"son du spectacle", ["arts", "ingenierie_tech"], ["arts", "physique_chimie"], ["regisseur"]),
    (r"theatr|comedien|acteur", ["arts"], ["arts", "HLP"], ["comedien"]),
    (r"cirque", ["arts", "sport"], ["arts", "EPPCS"], []),
    (r"danse", ["arts"], ["arts", "EPPCS"], ["danseur"]),
    (r"musique|musicien", ["arts"], ["arts"], ["musicien"]),
    (r"modeliste|\bmode\b", ["arts"], ["arts"], ["styliste", "costumier"]),
    (r"plastiques|spectacle", ["arts"], ["arts"], ["artiste_plasticien"]),
]
# Règles de repli : appliquées seulement si aucune règle ci-dessus ne correspond
# (« Sciences sociales » ne doit pas devenir une filière scientifique).
REPLI = [
    (r"\barts?\b", ["arts"], ["arts"], ["artiste_plasticien"]),
    (r"\bsciences?\b|scientifique", ["ingenierie_tech", "maths"], ["maths", "physique_chimie"], []),
]
REGLES = [(re.compile(m), d, s, mt) for m, d, s, mt in REGLES]
REPLI = [(re.compile(m), d, s, mt) for m, d, s, mt in REPLI]

# Libellés sans contenu disciplinaire : retirés avant d'appliquer les règles.
BRUIT = re.compile(r"^(l1|lp-[a-z]+|lp|cs|csa|fp|tp|dsp|du|de|deust|dcg|bpjeps|dejeps|cpge|man|ea-bac\d|d-etab|c\.m\.i|cupge|dn made)\s*-\s*|"
                   r"cycle pluridisciplinaire d'etudes superieures( [a-z]+)?\s*-?|classe preparatoire aux etudes superieures\s*-|"
                   r"formation professionnelle\s*-|titre professionnel\s*-?|\(\s*bac\s*\+\s*\d\s*\)|bac\s*\+\s*\d|"
                   r"diplome d'(universite|etablissement)|- en apprentissage|specialite educateur sportif - mention|"
                   r"specialite perfectionnement sportif - mention|licence professionnelle")


def regles_sur(texte):
    """Règles qui correspondent à un texte, dans l'ordre d'apparition dans le texte."""
    t = BRUIT.sub(" ", sans_accents(texte))
    trouvees = []
    for jeu in (REGLES, REPLI):
        for i, (motif, dom, spe, met) in enumerate(jeu):
            m = motif.search(t)
            if m:
                trouvees.append((m.start(), i, m.group(0).strip(), dom, spe, met))
        if trouvees:
            break
    trouvees.sort()
    return trouvees


def fusionner(trouvees, max_dom=3, max_spe=3, max_met=4):
    dom, spe, met = [], [], []
    for _, _, _, d, s, mt in trouvees:
        for x in d:
            if x not in dom:
                dom.append(x)
        for x in s:
            if x not in spe:
                spe.append(x)
        for x in mt:
            if x not in met:
                met.append(x)
    return dom[:max_dom], spe[:max_spe], met[:max_met]


def domaines_generiques(intitules):
    """Filière générique : règles appliquées à chaque formation, domaines les plus fréquents."""
    cpt_d, cpt_s, cpt_m, n = collections.Counter(), collections.Counter(), collections.Counter(), 0
    for t in intitules:
        tr = regles_sur(t)
        if not tr:
            continue
        n += 1
        d, s, m = fusionner(tr, 2, 2, 2)
        cpt_d.update(d); cpt_s.update(s); cpt_m.update(m)
    top = lambda c, k: [x for x, _ in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]
    return top(cpt_d, 3), top(cpt_s, 3), top(cpt_m, 3), n


# ---------------------------------------------------------------- ajustements du profil
def ajuster_profil(profil, g, dom):
    """Accorde maths / écrit aux domaines (pour les licences et cycles universitaires)."""
    p = dict(profil)
    if g in ("licence", "licence_select", "licence_pro", "cmi", "cpes", "cupge", "du", "prepa_annee"):
        d0 = dom[0] if dom else None
        if d0 in ("maths", "data_informatique") or (d0 == "ingenierie_tech" and "maths" in dom):
            p["maths"], p["ecrit"] = max(p["maths"], 2), min(p["ecrit"], 1)
        elif d0 in ("economie", "finance"):
            p["maths"] = max(p["maths"], 2)
        elif d0 in ("ingenierie_tech", "vivant", "sante", "sport"):
            p["ecrit"] = min(p["ecrit"], 1)
        elif d0 in ("sciences_humaines", "droit", "sciences_politiques", "langues", "communication"):
            p["maths"], p["ecrit"] = min(p["maths"], 1), max(p["ecrit"], 2)
        if "international" in dom or "langues" in dom:
            p["international"] = max(p["international"], 2)
    return p


def duree_intitule(lib, defaut):
    m = re.search(r"bac\s*\+\s*(\d)", sans_accents(lib))
    return int(m.group(1)) if m else defaut


# ---------------------------------------------------------------- construction
def construire():
    ps = decoder_parcoursup(lire("parcoursup.json"))
    fu = lire("fusion.json")
    gen = lire("generees.json")
    met_ok = {m["id"] for m in lire("metiers.json")["metiers"]}
    pou_ok = {p["id"] for p in lire("poursuites.json")["poursuites"]}
    corr = json.loads(CORRECTIONS.read_text(encoding="utf-8")) if CORRECTIONS.exists() else {"corrections": {}}

    masquees = fu["meta"]["perimetre"]["categories_masquees"]
    perimetre = [r for r in ps if not any(t in masquees for t in r["tf"])]
    par_nmc = collections.defaultdict(list)
    for r in perimetre:
        par_nmc[r["nmc"]].append(r)
    familles = {f["nmc"]: f for f in gen["familles"]}
    types_label = dict(gen["meta"]["types_label"], **TYPES_AJOUTES)

    def libelle_de(rs):
        cpt = collections.Counter(x for r in rs for x in (r["fl"] or []))
        if not cpt:
            cpt = collections.Counter(r["nm"][0] for r in rs)
        (lib, n), *autres = sorted(cpt.items(), key=lambda kv: (-kv[1], kv[0]))
        # un autre intitulé présent dans au moins 20 % des formations, et absent des formations de l'intitulé principal
        partage = [a for a, k in autres if k >= 0.2 * len(rs) and not all(a in r["fl"] and lib in r["fl"] for r in rs if a in r["fl"])]
        return lib, partage

    filieres, deduites = {}, {}
    # 1. familles existantes, reprises telles quelles
    for nmc, rs in par_nmc.items():
        if nmc not in familles:
            continue
        f = familles[nmc]
        lib, _ = libelle_de(rs)
        e = {"nmc": nmc, "libelle": lib, "origine": "famille_existante", "confiance": "haute" if f["nb"] >= 2 else "moyenne"}
        e.update({k: v for k, v in f.items() if k != "nmc"})
        e["sources"] = [SOURCE_CARTO, {"url": None, "fichier": "data/generees.json", "consulte_le": gen["meta"]["consulte_le"],
                                       "objet": f"attributs repris de la famille {nmc} : valeur la plus fréquente parmi {f['nb']} fiche(s) Mon Plan Sup de la filière (fiches citant leurs propres sources)"}]
        e["justification"] = f"Famille existante de data/generees.json ({f['nb']} fiche(s) Mon Plan Sup de la même filière)."
        filieres[nmc] = e

    # 2. filières déduites de l'intitulé
    def deduire(nmc, rs, lib_force=None):
        tfs = collections.Counter(t for r in rs for t in r["tf"])
        tf_princ = [t for t, _ in tfs.most_common()]
        lib, partage = libelle_de(rs)
        if lib_force:   # variante d'un code nmc partagé : on déduit depuis son propre intitulé
            lib, partage = lib_force, []
        base = re.sub(r"-(App|APP)$", "", nmc)
        notes = []
        # 2a. variante en apprentissage d'une filière connue : mêmes attributs que la filière de base
        if base != nmc and base in par_nmc:
            src = filieres.get(base) or deduites.get(base) or deduire(base, par_nmc[base])
            e = {k: (json.loads(json.dumps(v)) if isinstance(v, (dict, list)) else v) for k, v in src.items()}
            e.update({"nmc": nmc, "libelle": lib, "origine": "deduit_intitule",
                      "confiance": "haute" if src["origine"] == "famille_existante" and src["confiance"] == "haute" else src["confiance"],
                      "justification": f"Même diplôme que la filière {base}, préparé en apprentissage : attributs repris de {base} ({src['origine']})."})
            e.pop("nb", None); e.pop("exemples", None)
            e["sources"] = [SOURCE_CARTO] + [s for s in src["sources"] if s is not SOURCE_CARTO]
            return e
        g = genre(nmc, tf_princ, lib)
        type_, profil, charge, dossier, duree = GABARITS[g]
        if nmc in GENERIQUES:
            dom, spe, met, n = domaines_generiques([r["nm"][0] for r in rs])
            notes.append(f"intitulé générique : domaines les plus fréquents parmi les intitulés de {n} formation(s) sur {len(rs)}")
            confiance = "basse"
        else:
            tr = regles_sur(lib)
            if not tr:   # intitulé de filière muet : on essaie les intitulés des formations
                dom, spe, met, n = domaines_generiques([r["nm"][0] for r in rs])
                notes.append(f"intitulé de filière sans mot-clé reconnu : domaines tirés des intitulés de {n} formation(s)")
                confiance = "basse"
            else:
                dom, spe, met = fusionner(tr)
                notes.append("mots-clés : " + ", ".join(f"« {mot} »" for _, _, mot, *_ in tr))
                confiance = "moyenne"
        variantes = {}
        for a in partage:
            # code nmc partagé par plusieurs intitulés officiels (ex. L1-SS : « Sciences pour la santé » et
            # « Sciences sociales ») : les formations de l'autre intitulé reçoivent leurs propres attributs,
            # sauf si l'intitulé n'est qu'une autre graphie (mêmes attributs déduits).
            rs_a = [r for r in rs if a in (r["fl"] or []) and lib not in (r["fl"] or [])]
            v = deduire(nmc, rs_a, lib_force=a) if rs_a else None
            if v is None or not v["domaines"] or sans_accents(a) == sans_accents(lib) or (v["type"], v["domaines"], v["specialites"]["recommandees"]) == (type_, dom, spe):
                notes.append(f"le code {nmc} couvre aussi l'intitulé « {a} », autre graphie de la même filière")
            else:
                notes.append(f"le code {nmc} couvre aussi l'intitulé « {a} » ({len(rs_a)} formation(s)) : attributs propres dans « variantes »")
                variantes[a] = v
        if not dom:
            confiance = "basse"
        e = {"nmc": nmc, "libelle": lib, "origine": "deduit_intitule", "confiance": confiance, "type": type_,
             "profil": ajuster_profil(profil, g, dom), "domaines": dom, "charge": charge, "dossier_poids": dossier,
             "metiers": [m for m in met if m in met_ok and not (g in SANS_INGENIEUR and m.startswith("ingenieur_") and "ingenieur" not in sans_accents(lib))],
             "poursuites": [],
             "duree_ans": duree_intitule(lib, duree), "langue": "français",
             "specialites": {"maths_expertes": None, "obligatoires": [], "recommandees": spe},
             "anglais_cecrl": None, "cout_public": None, "sources": [SOURCE_CARTO],
             "justification": f"Genre « {g} » (code {nmc}, catégorie Parcoursup « {' | '.join(tf_princ)} ») ; " + " ; ".join(notes) + "."}
        if len(dom) >= 2 and g.startswith("licence") and re.search(r"[,/]", lib):
            e["profil"]["poly"] = max(e["profil"]["poly"], 1)   # licence bi-disciplinaire
        if variantes:
            e["variantes"] = variantes
        return e

    for nmc, rs in sorted(par_nmc.items()):
        if nmc in filieres:
            continue
        deduites[nmc] = deduire(nmc, rs)
    filieres.update(deduites)

    # 2b. familles existantes dont le code nmc couvre aussi un autre intitulé (ex. L1-AP : « Arts plastiques » et
    #     « Administration publique ») : la famille reste telle quelle, l'autre intitulé reçoit une variante déduite.
    for nmc, e in filieres.items():
        if e["origine"] != "famille_existante":
            continue
        lib, partage = libelle_de(par_nmc[nmc])
        for a in partage:
            rs_a = [r for r in par_nmc[nmc] if a in (r["fl"] or []) and lib not in (r["fl"] or [])]
            v = deduire(nmc, rs_a, lib_force=a) if rs_a else None
            if v and v["domaines"] and v["domaines"] != e["domaines"] and sans_accents(a) != sans_accents(lib):
                e.setdefault("variantes", {})[a] = v
                e["justification"] += f" Le code {nmc} couvre aussi l'intitulé « {a} » ({len(rs_a)} formation(s)) : attributs propres dans « variantes »."

    # 3. corrections à la main (scripts/filieres-corrections.json)
    for nmc, c in corr["corrections"].items():
        if nmc not in filieres:
            sys.exit(f"Erreur : correction pour {nmc}, absent du périmètre.")
        e = filieres[nmc]
        if e["origine"] == "famille_existante":
            sys.exit(f"Erreur : {nmc} est une famille existante, reprise telle quelle (pas de correction ici).")
        for k, v in c.items():
            if k in ("note", "sources"):
                continue
            if k == "profil":
                e["profil"] = dict(e["profil"], **v)
            elif k == "specialites":
                e["specialites"] = dict(e["specialites"], **v)
            else:
                e[k] = v
        e["sources"] = e["sources"] + c.get("sources", [])
        e["justification"] += f" Corrigé à la main : {c['note']}"
        # les variantes en apprentissage suivent la correction de leur filière de base
        for nm2, e2 in filieres.items():
            if nm2 != nmc and re.sub(r"-(App|APP)$", "", nm2) == nmc and nm2 not in corr["corrections"]:
                for k in c:
                    if k not in ("note", "sources", "confiance", "justification"):
                        e2[k] = json.loads(json.dumps(e[k]))
                e2["confiance"] = e["confiance"]
                e2["justification"] += f" Correction de {nmc} reportée."

    # 4. « valide » : la filière peut entrer dans les listes de vœux. Faux par défaut en confiance basse ;
    #    passe à vrai par scripts/filieres-corrections.json après relecture.
    toutes = [(nmc, e) for nmc, e in filieres.items()] + [(f"{nmc} [{a}]", v) for nmc, e in filieres.items() for a, v in e.get("variantes", {}).items()]
    for _, e in toutes:
        e.setdefault("valide", e["confiance"] != "basse")

    # 5. contrôles
    erreurs = []
    for nmc, e in toutes:
        if e["type"] not in types_label:
            erreurs.append(f"{nmc} : type inconnu {e['type']}")
        if not e["domaines"]:
            erreurs.append(f"{nmc} : aucun domaine (le moteur a besoin d'au moins un domaine)")
        if any(m not in met_ok for m in e["metiers"]):
            erreurs.append(f"{nmc} : métier absent de metiers.json")
        if any(p not in pou_ok for p in e["poursuites"]):
            erreurs.append(f"{nmc} : poursuite absente de poursuites.json")
        if e["confiance"] not in ("haute", "moyenne", "basse"):
            erreurs.append(f"{nmc} : confiance invalide")
    if set(filieres) != set(par_nmc):
        erreurs.append("les filières ne couvrent pas exactement le périmètre")
    if erreurs:
        sys.exit("Erreur :\n  " + "\n  ".join(erreurs))

    ordre = ["nmc", "libelle", "origine", "confiance", "valide", "type", "type_label", "domaines", "profil", "specialites", "charge",
             "dossier_poids", "duree_ans", "langue", "metiers", "poursuites", "anglais_cecrl", "cout_public", "nb", "exemples",
             "justification", "sources", "variantes"]
    trier = lambda e: {k: ({a: trier(v) for a, v in sorted(e[k].items())} if k == "variantes" else e[k]) for k in ordre if k in e}
    sortie = {nmc: trier(filieres[nmc]) for nmc in sorted(filieres)}
    cpt = collections.Counter((e["origine"], e["confiance"]) for e in sortie.values())
    meta = {
        "version": VERSION,
        "consulte_le": VERSION,
        "regle": "Une entrée par filière Parcoursup (code nmc) du périmètre affiché (BTS et BUT exclus). Attributs éditoriaux au niveau "
                 "de la filière (estimation, pas propres à un établissement) : « famille_existante » = famille de data/generees.json "
                 "reprise telle quelle (valeur la plus fréquente parmi les fiches Mon Plan Sup de la filière) ; « deduit_intitule » = "
                 "déduit de l'intitulé officiel Parcoursup (nm, fl) et de la catégorie Parcoursup (tf) par les règles de "
                 "scripts/construire-filieres.py, corrigé par scripts/filieres-corrections.json. Aucun chiffre (taux, moyenne, frais, "
                 "salaire) ne vient de cette table : les chiffres des fiches viennent des statistiques officielles de chaque formation.",
        "valide": "true : la filière peut entrer dans les listes de vœux (wishlist) et servir d'ancre aux propositions à l'étranger. "
                  "false par défaut en confiance basse ; à passer à true dans scripts/filieres-corrections.json après relecture.",
        "variantes": "Code nmc partagé par plusieurs intitulés officiels : les formations dont un intitulé (fl) est une clé de « variantes » "
                     "prennent les attributs de cette variante.",
        "confiance": {"haute": "famille existante d'au moins 2 fiches, ou variante en apprentissage d'une telle famille",
                      "moyenne": "famille existante d'une seule fiche, ou intitulé de filière précis reconnu par les règles",
                      "basse": "intitulé générique, intitulé sans mot-clé reconnu, ou code nmc partagé par plusieurs intitulés : à relire"},
        "attendus_nationaux": "Non utilisés : le cadrage national des attendus de licence (enseignementsup-recherche.gouv.fr) n'a pas pu être "
                              "consulté lors de la construction (accès réseau refusé le 2026-10-18). Les spécialités indiquées sont seulement "
                              "« conseillées », jamais « obligatoires », pour les filières déduites.",
        "cout_public": "Repris des familles existantes (droits nationaux sourcés) ; null pour les filières déduites (frais non relevés).",
        "types_label": types_label,
        "sources": [SOURCE_CARTO],
        "nb_filieres": len(sortie),
        "repartition": {f"{o}/{c}": n for (o, c), n in sorted(cpt.items())},
        "construit_par": "scripts/construire-filieres.py",
    }
    return {"meta": meta, "filieres": sortie}


if __name__ == "__main__":
    t = construire()
    SORTIE.write_text(json.dumps(t, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{SORTIE.relative_to(RACINE)} : {t['meta']['nb_filieres']} filières")
    for k, n in t["meta"]["repartition"].items():
        print(f"  {k} : {n}")
