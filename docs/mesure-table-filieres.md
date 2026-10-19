# Mesure de la fiabilité de `data/filieres.json`

Mesure faite le 2026-10-19 sur `main` (commit `dad0b55`), sans rien changer à la table, au moteur ni au site.
Script : `python3 scripts/mesurer-filieres.py` (Python 3 et Node 20 ou plus, aucune dépendance). Il se relance après
chaque modification de la table : il réécrit seulement la partie « Résultats » ci-dessous. Le texte écrit à la main
(résumé, lecture, limites) ne se met pas à jour tout seul : à relire après une nouvelle mesure.

## Méthode

1. **Test à l'aveugle.** Les 87 filières « famille_existante » ont des valeurs écrites à la main
   (`data/generees.json`). On reconstruit toute la table avec les règles de `scripts/construire-filieres.py`, mais
   sans les familles de `generees.json` (on garde seulement la liste des libellés de types) et sans
   `scripts/filieres-corrections.json`. Les 87 filières passent donc par les mêmes règles que les 460 autres.
   On compare ensuite la version déduite à la version écrite à la main, champ par champ.
   - Une seule règle vise nommément un code des 87 familles : `genre()` traite `PASS` (et `LAS`) à part. **PASS est
     exclu du test**, qui porte donc sur **86 familles**. Les autres règles visent des préfixes de codes (`CPGE-`,
     `L1-`, `CMI-`…) ou des mots de l'intitulé, sans viser un code des familles.
   - Contrôle intégré : sans corrections, la construction à l'aveugle redonne exactement les filières déduites
     non corrigées de la vraie table (sinon le script s'arrête).
   - Gravité de chaque désaccord (effet sur le moteur) : **grave** = type faux, premier domaine faux, spécialité
     obligatoire inventée ou oubliée, écart de 2 ou plus sur le profil maths ou écrit ; **moyen** = autre écart de
     profil de 2 ou plus, domaines secondaires (2ᵉ et 3ᵉ) différents ; **léger** = le reste (écart de profil de 1,
     spécialités recommandées, option maths expertes, charge, poids du dossier, durée, métiers ou poursuites absents).
2. **Effet sur les listes de vœux.** Le vrai site est chargé dans Node (`tests/charger-site.js`) avec la vraie
   table, puis avec deux tables temporaires (écrites dans un dossier temporaire, jamais dans `data/`) où les 86
   familles sont remplacées par leur version déduite :
   - « attributs » : seuls les champs comparés (type, domaines, profil, spécialités, charge, poids du dossier,
     durée, métiers, poursuites) sont remplacés ; `valide`, frais et variantes restent ceux de la vraie table.
     C'est la mesure principale : elle isole l'effet des descriptions ;
   - « complète » : l'entrée déduite remplace toute l'entrée (y compris `valide = false` quand la confiance est basse).

   Pour les 10 profils de `tests/profils.js`, on compare les listes de 10 vœux (et, en plus, les 40 premières
   recommandations et les propositions à l'étranger). Contrôle intégré : avec la vraie table, on retrouve
   exactement les vœux de `tests/reference/`.
3. **Échantillon à relire** : `docs/relecture-filieres.csv`, à remplir par un humain (voir la partie 3).

## Résumé

- **Description des filières : moyenne, inégale selon le champ.** Le profil est bon (maths à ±1 : 99 %, écrit à
  ±1 : 95 %) et aucune spécialité obligatoire n'est inventée (le script n'en déduit jamais). Mais le **type est
  faux pour 36 % des familles** et le **premier domaine pour 21 %**. 39 familles sur 86 ont au moins un désaccord
  grave.
- **Une bonne part des désaccords graves vient de quelques défauts de règles, pas de l'intitulé** : 28 des 31 types
  faux sont des types que les gabarits ne savent pas produire (`dn_made`, `prepa_ecg`, `prepa_litteraire`,
  `prepa_bl`, `double_licence`, `bachelor_france`, `iep`) ; 3 viennent de `genre()` qui se laisse entraîner par une
  catégorie Parcoursup minoritaire (dont `FECM-B3`, compté dans les deux) ; les 5 spécialités obligatoires oubliées
  viennent du choix de ne jamais déduire d'obligatoire.
- **Effet sur les vœux : réel.** Avec la table « attributs », 31 vœux sur 100 changent et 9 profils sur 10 voient
  leur liste modifiée. 21 de ces 31 vœux sont remplacés par une autre filière ; les 10 autres sont la même filière
  dans un autre établissement. Seul le profil vide ne bouge pas.
- **Conclusion provisoire** : sur les familles les plus courantes, la table déduite n'atteint pas les seuils
  proposés pour le type et le premier domaine. Le résultat sur les 460 filières réellement déduites sera
  probablement moins bon (voir les limites). La relecture humaine de l'échantillon dira de combien.

## Résultats

<!-- debut resultats -->
_Partie générée par `python3 scripts/mesurer-filieres.py` : ne pas modifier à la main._

### 1. Test à l'aveugle sur les familles écrites à la main

87 familles existantes ; 1 exclue(s) parce qu'une règle du script vise nommément son code : **PASS** (genre() : `n in ("PASS", "LAS")` → licence). **86 familles testées.**

| Champ | Accord |
|---|---|
| Type de formation identique | 64 % (55/86) |
| Premier domaine identique | 79 % (68/86) |
| Part des 3 premiers domaines (référence) retrouvés dans les 3 déduits | 75 % (moyenne) |
| Spécialités recommandées de la référence retrouvées | 75 % (moyenne sur 86 familles qui en ont) |
| Spécialités obligatoires inventées | 0 |
| Spécialités obligatoires oubliées | 5 (sur 5 familles qui en ont) |
| Option maths expertes identique | 95 % (82/86 ; 4 familles de référence la demandent) |
| Charge identique | 90 % (77/86) |
| Poids du dossier identique | 87 % (75/86) |
| Durée identique | 95 % (82/86) |
| Déduction sans aucun métier | 7 % (6/86 ; référence sans métier : 0) |
| Déduction sans aucune poursuite d'études | 100 % (86/86 ; référence sans poursuite : 79) |
| Famille qui deviendrait « non valide » (confiance basse) | 14/86 |
| Famille sans aucun domaine déduit (la construction réelle s'arrêterait) | 4/86 : CPGE-BCPST, CPGE-MPSI, CPGE-PCSI, DNM-Instrument |

**Profil, dimension par dimension**

| Dimension | Identique | À ±1 près |
|---|---|---|
| maths | 78 % | 99 % |
| ecrit | 73 % | 95 % |
| international | 88 % | 93 % |
| encadrement | 92 % | 100 % |
| pratique | 67 % | 99 % |
| poly | 74 % | 94 % |

**Désaccords par gravité** : 59 graves, 61 moyens, 181 légers (301 au total). Par famille, pire désaccord : 39 familles avec au moins un désaccord grave, 21 au pire moyen, 12 au pire léger, 14 sans désaccord.

| Champ | Grave | Moyen | Léger |
|---|---|---|---|
| type | 31 | 0 | 0 |
| premier domaine | 18 | 0 | 0 |
| spécialité obligatoire oubliée | 5 | 0 | 0 |
| profil ecrit | 4 | 0 | 19 |
| profil maths | 1 | 0 | 18 |
| domaines secondaires | 0 | 49 | 0 |
| profil international | 0 | 6 | 4 |
| profil poly | 0 | 5 | 17 |
| profil pratique | 0 | 1 | 27 |
| charge | 0 | 0 | 9 |
| dossier_poids | 0 | 0 | 11 |
| duree_ans | 0 | 0 | 4 |
| metiers absents | 0 | 0 | 6 |
| option maths expertes | 0 | 0 | 4 |
| poursuites absents | 0 | 0 | 7 |
| profil encadrement | 0 | 0 | 7 |
| spécialités recommandées | 0 | 0 | 48 |

**Les 10 familles aux désaccords graves les plus importants** (classées par nombre de formations Parcoursup de la filière, donc par nombre de fiches touchées dans le moteur)

| Filière | Formations | Champ | Écrit à la main | Déduit | Règle en cause |
|---|---|---|---|---|---|
| **FI-BAC5** Formation d'ingénieur Bac + 5 | 626 | type | ecole_ingenieur | college_universitaire | genre() → gabarit « sciencespo » |
|  |  | profil ecrit | 1 | 3 | GABARITS[« sciencespo »] + ajuster_profil() |
| **FECM-B3** Formation des écoles de commerce et de management Bac + 3 | 175 | type | bachelor_france | ecole_ingenieur | genre() → gabarit « ingenieur » |
| **CPGE-PCSI** CPGE - PCSI | 138 | premier domaine | ingenierie_tech | (aucun) | domaines_generiques() : intitulé sans mot-clé reconnu |
| **L1-LPE** L1 - Professorat des Ecoles | 126 | premier domaine | maths | sciences_humaines | REGLES[58] (mot-clé « professorat » → sciences_humaines) |
|  |  | profil maths | 3 | 1 | GABARITS[« licence »] + ajuster_profil() |
| **CPGE-MPSI** CPGE - MPSI | 124 | premier domaine | maths | (aucun) | domaines_generiques() : intitulé sans mot-clé reconnu |
| **CPGE-AL** CPGE - Lettres | 99 | type | prepa_litteraire | prepa_scientifique | genre() → gabarit « cpge » |
|  |  | profil ecrit | 3 | 1 | GABARITS[« cpge »] + ajuster_profil() |
| **ECG-Mapp-ESH** CPGE - ECG - Mathématiques appliquées + ESH | 95 | type | prepa_ecg | prepa_scientifique | genre() → gabarit « cpge » |
|  |  | premier domaine | economie | maths | REGLES[36] (mot-clé « mathemat » → maths) |
|  |  | spécialité obligatoire oubliée | maths | (aucun) | deduire() : « obligatoires » toujours vide pour une filière déduite |
| **EI-BAC3** Formation Bac + 3 | 75 | premier domaine | vivant | ingenierie_tech | domaines_generiques() : intitulé sans mot-clé reconnu |
| **DNM-Graphisme** DN MADE - Graphisme | 72 | type | dn_made | ecole_art | genre() → gabarit « art » |
| **ECG-MA-HGG** CPGE - ECG - Mathématiques approfondies + HGG | 65 | type | prepa_ecg | prepa_scientifique | genre() → gabarit « cpge » |
|  |  | premier domaine | economie | maths | REGLES[36] (mot-clé « mathemat » → maths) |
|  |  | spécialité obligatoire oubliée | maths | (aucun) | deduire() : « obligatoires » toujours vide pour une filière déduite |

<details><summary>Version complète, côte à côte, de ces 10 familles</summary>


**FI-BAC5** — Formation d'ingénieur Bac + 5

| | Écrit à la main | Déduit |
|---|---|---|
| type | ecole_ingenieur | college_universitaire |
| domaines | ingenierie_tech | ingenierie_tech, maths |
| profil (m/é/i/e/p/poly) | 2/1/1/2/2/1 | 1/3/2/2/1/2 |
| obligatoires | (aucun) | (aucun) |
| recommandées | maths, physique_chimie | SI, physique_chimie, maths |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | moyenne / moyen / 5 | forte / moyen / 5 |

**FECM-B3** — Formation des écoles de commerce et de management Bac + 3

| | Écrit à la main | Déduit |
|---|---|---|
| type | bachelor_france | ecole_ingenieur |
| domaines | gestion_commerce | gestion_commerce |
| profil (m/é/i/e/p/poly) | 1/1/2/2/2/1 | 2/1/1/2/2/1 |
| obligatoires | (aucun) | (aucun) |
| recommandées | maths, SES, LLCER_anglais, LLCER_autre | SES, maths |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | moyenne / moyen / 3 | moyenne / moyen / 3 |

**CPGE-PCSI** — CPGE - PCSI

| | Écrit à la main | Déduit |
|---|---|---|
| type | prepa_scientifique | prepa_scientifique |
| domaines | ingenierie_tech, maths | (aucun) |
| profil (m/é/i/e/p/poly) | 2/1/1/3/0/1 | 2/1/1/3/0/1 |
| obligatoires | (aucun) | (aucun) |
| recommandées | physique_chimie, maths | (aucun) |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | tres_forte / moyen / 2 | tres_forte / moyen / 2 |

**L1-LPE** — L1 - Professorat des Ecoles

| | Écrit à la main | Déduit |
|---|---|---|
| type | licence | licence |
| domaines | maths, sciences_humaines | sciences_humaines |
| profil (m/é/i/e/p/poly) | 3/1/1/1/0/0 | 1/2/1/1/1/0 |
| obligatoires | (aucun) | (aucun) |
| recommandées | maths | HLP, SES |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | moyenne / faible / 3 | moyenne / faible / 3 |

**CPGE-MPSI** — CPGE - MPSI

| | Écrit à la main | Déduit |
|---|---|---|
| type | prepa_scientifique | prepa_scientifique |
| domaines | maths, ingenierie_tech | (aucun) |
| profil (m/é/i/e/p/poly) | 3/1/1/3/0/1 | 2/1/1/3/0/1 |
| obligatoires | (aucun) | (aucun) |
| recommandées | maths, physique_chimie | (aucun) |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | tres_forte / moyen / 2 | tres_forte / moyen / 2 |

**CPGE-AL** — CPGE - Lettres

| | Écrit à la main | Déduit |
|---|---|---|
| type | prepa_litteraire | prepa_scientifique |
| domaines | sciences_humaines, langues | sciences_humaines, langues |
| profil (m/é/i/e/p/poly) | 2/3/1/3/0/1 | 2/1/1/3/0/1 |
| obligatoires | (aucun) | (aucun) |
| recommandées | HLP, HGGSP, LLCER_anglais, LLCER_autre | HLP |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | tres_forte / moyen / 2 | tres_forte / moyen / 2 |

**ECG-Mapp-ESH** — CPGE - ECG - Mathématiques appliquées + ESH

| | Écrit à la main | Déduit |
|---|---|---|
| type | prepa_ecg | prepa_scientifique |
| domaines | economie, maths, gestion_commerce, finance, sciences_humaines | maths |
| profil (m/é/i/e/p/poly) | 3/2/1/3/0/2 | 2/1/1/3/0/1 |
| obligatoires | maths | (aucun) |
| recommandées | SES, HGGSP | maths |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | tres_forte / faible / 2 | tres_forte / moyen / 2 |

**EI-BAC3** — Formation Bac + 3

| | Écrit à la main | Déduit |
|---|---|---|
| type | ecole_ingenieur | ecole_ingenieur |
| domaines | vivant, ingenierie_tech | ingenierie_tech, maths, data_informatique |
| profil (m/é/i/e/p/poly) | 2/1/1/2/2/1 | 2/1/1/2/2/1 |
| obligatoires | (aucun) | (aucun) |
| recommandées | SVT, physique_chimie, maths | SI, physique_chimie, maths |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | moyenne / moyen / 5 | moyenne / moyen / 3 |

**DNM-Graphisme** — DN MADE - Graphisme

| | Écrit à la main | Déduit |
|---|---|---|
| type | dn_made | ecole_art |
| domaines | arts, sciences_humaines, langues | arts, communication |
| profil (m/é/i/e/p/poly) | 0/1/1/2/3/0 | 0/1/1/2/2/0 |
| obligatoires | (aucun) | (aucun) |
| recommandées | arts | arts |
| maths expertes | (aucun) | (aucun) |
| charge / dossier / durée | moyenne / fort / 3 | moyenne / fort / 3 |

**ECG-MA-HGG** — CPGE - ECG - Mathématiques approfondies + HGG

| | Écrit à la main | Déduit |
|---|---|---|
| type | prepa_ecg | prepa_scientifique |
| domaines | economie, maths, gestion_commerce, finance, sciences_humaines | maths |
| profil (m/é/i/e/p/poly) | 3/2/1/3/0/2 | 2/1/1/3/0/1 |
| obligatoires | maths | (aucun) |
| recommandées | SES, HGGSP | maths |
| maths expertes | indispensable | (aucun) |
| charge / dossier / durée | tres_forte / faible / 2 | tres_forte / moyen / 2 |

</details>

**Règles de `construire-filieres.py` qui produisent le plus de désaccords graves**

| Règle | Désaccords graves |
|---|---|
| genre() → gabarit « art » | 14 |
| domaines_generiques() : intitulé sans mot-clé reconnu | 7 |
| genre() → gabarit « cpge » | 6 |
| deduire() : « obligatoires » toujours vide pour une filière déduite | 5 |
| genre() → gabarit « licence » | 5 |
| REGLES[36] (mot-clé « mathemat » → maths) | 4 |
| genre() → gabarit « sciencespo » | 3 |
| GABARITS[« cpge »] + ajuster_profil() | 2 |
| GABARITS[« sciencespo »] + ajuster_profil() | 2 |
| REGLES[59] (mot-clé « livre » → sciences_humaines, communication) | 1 |
| REGLES[35] (mot-clé « numerique » → data_informatique) | 1 |
| REGLES[53] (mot-clé « patrimoine » → sciences_humaines, arts) | 1 |

### 2. Effet sur les listes de 10 vœux

**Table « attributs » (seuls les champs comparés en partie 1 sont remplacés)** : 31 vœux changent sur 100, dont 21 changements de filière (les autres : même filière, autre établissement) ; profils qui gardent exactement les mêmes 10 formations : 1 sur 10.

| Profil | Vœux tirés des familles (vraie table) | Vœux remplacés | dont filière changée | Vœux déplacés | Catégorie changée | Top 40 en commun | Étranger identique |
|---|---|---|---|---|---|---|---|
| vide | 9 | 0 | 0 | 0 | 0 | 40/40 | oui |
| eco-excellent-decide | 7 | 2 | 1 | 2 | 0 | 13/40 | non |
| eco-moyen | 6 | 3 | 1 | 6 | 0 | 2/40 | oui |
| sciences-ingenieur | 8 | 5 | 4 | 0 | 0 | 38/40 | non |
| droit-sciencespo | 6 | 2 | 1 | 0 | 0 | 40/40 | oui |
| sante-svt | 6 | 5 | 2 | 3 | 0 | 5/40 | oui |
| indecis | 3 | 2 | 2 | 1 | 0 | 12/40 | non |
| fragile | 5 | 2 | 2 | 3 | 0 | 28/40 | oui |
| international-langues | 6 | 4 | 4 | 0 | 0 | 13/40 | oui |
| premiere-arts | 9 | 6 | 4 | 1 | 0 | 17/40 | non |

- **eco-excellent-decide** : sortent Diplôme de Comptabilité et de Gestion (Lycée Turgot, DCG-DPECF) ; Licence - Mathématiques - Mathématiques fondamentales et appliquées - Campus Grands Moulins (Université Paris Cité, L1-Math) — entrent Diplôme de Comptabilité et de Gestion (Lycée Ozenne, DCG-DPECF) ; Formation des écoles de commerce et de management Bac + 5 (IPAG Business School - Programme Grande Ecole - Main track - Campus de Paris, FECM-B5).
- **eco-moyen** : sortent Formation des écoles de commerce et de management Bac + 3 - Bachelor en Management (BeM) (South Champagne Business School (Y Schools) - Campus de Troyes, FECM-B3) ; Formation des écoles de commerce et de management Bac + 4 - Global Business Track (100% English) (INSEEC International BBA - Campus de Bordeaux, FECM-B4) ; Licence - Administration publique - Parcours Management Public (Aix-Marseille Université - Site d'Aix-en-Provence (Centre Ville), L1-AP) — entrent Licence - Economie et gestion - Parcours Licence d'Economie et Gestion - Campus Toulon Centre Ville (Université de Toulon, L1-EG) ; Formation des écoles de commerce et de management Bac + 4 (KEDGE Business School - International BBA - Campus de Marseille, FECM-B4) ; Formation des écoles de commerce et de management Bac + 3 (IDRAC Business School - Campus de GRENOBLE, FECM-B3).
- **sciences-ingenieur** : sortent Licence - Informatique (Université Paris 8, L1-Info) ; Formation d'ingénieur post-bac (bac général) (INSA Centre-Val de Loire, FI-BAC5) ; Double licence Mathématiques / Informatique (Le Mans Université, L1-Math) ; Licence - Physique - Parcours Enseigner la Physique-Chimie (Université Paris Cité, L1-Physique) ; CPGE - MPSI (Lycée F Philibert Dessaignes, CPGE-MPSI) — entrent Cycle préparatoire intégré CapECL (ingénieur) (Centrale Lyon – ENISE, fiche éditoriale) ; Licence Mathématiques – parcours DEFI (Université de Rennes, L1-Math) ; Licence - Mathématiques et informatique appliquées aux sciences humaines et sociales -  Accès Santé (LAS) (Université Paris Cité, L1-MIASHS) ; Licence - Sciences pour l'ingénieur (Université Paris- Est-Créteil Val de Marne - UPEC (Paris 12), L1-SPI) ; DN MADE - Numérique - Spécialité : design d'interaction : web, applications, interface des objets connectés (Lycée Jean Monnet, DNM-Numérique).
- **droit-sciencespo** : sortent Licence - Science politique - Science Politique - Martinique -  Accès Santé (LAS) (Université des Antilles - Pôle Martinique, L1-SCIPO) ; Double diplôme  Sciences Po Lyon (Grade Master) - Licence d’Economie (Université Jean Monnet/ Saint-Étienne School of Economics) (Sciences Po Lyon - Institut d'Etudes Politiques - campus de Saint-Etienne, ScPo) — entrent Licence Science politique (UCO – Facultés libres de l'Ouest (Brest), L1-SCIPO) ; Bachelor du Collège universitaire (Sciences Po, fiche éditoriale).
- **sante-svt** : sortent DEUST - Santé environnement : Techniques de laboratoire (Université de Lille, DEUST-SETL) ; D.E Infirmier (I.F.S.I. BLANCARDE - rentrée en septembre, DE-INF) ; D.E Audioprothésiste (UFR des Sciences Médicales et Paramédicales site Nord Université Aix Marseille, DE-AudioP) ; D.E Infirmier (IFSI CHU Nîmes - Site : ville d'Uzès - rentrée de Septembre, DE-INF) ; Licence - Sciences de la vie - Licence de Biologie (Université de Toulon, L1-SV) — entrent D.E Infirmier (IFSI Croix Rouge Française Moulins - rentrée en septembre, DE-INF) ; D.E Infirmier (IFSI Bastia - rentrée en septembre, DE-INF) ; Licence - Sciences de la vie -  Biologie-environnement -  Accès Santé (LAS) (Nîmes Université, L1-SV) ; D.E Ergothérapeute (Institut de formation public Var prof de santé IF Toulon, DE-Erg) ; Licence - Sciences sanitaires et sociales - Portail Louis Pasteur (Aix-Marseille Université - Site de Marseille Saint Charles, L1-SSS).
- **indecis** : sortent Licence - Economie (Université Jean Monnet - Saint Etienne, L1-Economie) ; Licence - Langues, enseignement, médiation en milieu amazonien (Université de Guyane, L1-LEMMA) — entrent Licence - Langues, littératures et civilisations étrangères et régionales - Parcours Asie du Sud et Himalaya - Tamoul -  Accès Santé (LAS) (INALCO, L1-LLCER) ; BPJEPS - Spécialité Educateur sportif - Mention Activités aquatiques et de la natation (CREPS de Strasbourg - Antenne de Mulhouse, BPJEPS-AAN).
- **fragile** : sortent Licence - Langues étrangères appliquées - Parcours Anglais - Espagnol (Université Côte d'Azur, L1-LEA) ; Sciences des organisations – campus de Londres (grade de licence) (Université Paris-Dauphine – PSL, fiche éditoriale) — entrent Licence Philosophie (Université Côte d'Azur, L1-Philosophie) ; Licence - Gestion - Parcours Commerce Vente et Marketing (ECM / CNAM Dijon, L1-Gestion).
- **international-langues** : sortent Licence - Sciences du langage -  Accès Santé (LAS) (Université Paris 8, L1-SL) ; Double diplôme  Sciences Po Lyon (Grade Master) - Licence d’Economie (Université Jean Monnet/ Saint-Étienne School of Economics) (Sciences Po Lyon - Institut d'Etudes Politiques - campus de Saint-Etienne, ScPo) ; Licence - Administration et Echanges internationaux - Parcours Europe (Université Paris- Est-Créteil Val de Marne - UPEC (Paris 12), L1-AEI) ; Licence - Etudes européennes et internationales - Parcours Etudes européennes et internationales franco-espagnoles (Université Clermont Auvergne, L1-EEI) — entrent Licence - Langues, littératures et civilisations étrangères et régionales - Parcours LLCER : Anglais Europe (Nantes Université, L1-LLCER) ; Licence - Musicologie - Parcours Jazz et Musiques Actuelles (JMA) (Université de Tours, L1-Musicologie) ; Licence - Portail Licence 1 LLCER Anglais mineure Portugais (non débutants) (Université Sorbonne Nouvelle Paris 3, L1-LLCER) ; Bachelor du Collège universitaire (Sciences Po, fiche éditoriale).
- **premiere-arts** : sortent Licence - Musicologie (Université Evry Paris-Saclay, L1-Musicologie) ; Licence - Histoire de l'art et archéologie - Parcours Histoire de l'Art - Histoire (Institut Catholique de Paris (ICP)- Campus de Paris, L1-HAA) ; Licence - Musicologie - Parcours Musicologie - Musique (Université Lumière - Lyon 2, L1-Musicologie) ; DNA – Diplôme national d'art (École nationale supérieure des beaux-arts de Lyon, DNA) ; Licence - Sciences du langage - Expertise linguistique -  Accès Santé (LAS) (Université Paris Cité, L1-SL) ; Licence - Arts plastiques - Entièrement en distanciel (Université Paris 1 Panthéon Sorbonne, L1-AP) — entrent Licence - Arts - Parcours Arts et Design (Université de Corte, L1-Arts) ; Licence - Arts plastiques (Facultés libres de l'Ouest - UCO ANGERS, L1-AP) ; Licence Histoire de l'art et archéologie (Université Paris 1 Panthéon-Sorbonne, L1-HAA) ; Licence - Arts - Parcours Médiation culturelle (Université Sorbonne Nouvelle Paris 3, L1-Arts) ; Formation des écoles supérieures d'art Bac + 3 - Dessinateur praticien (ECOLE EMILE COHL, FESA-B3) ; DN MADE mention Matériaux (Lycée La Martinière-Diderot, DNM-Matériaux).

**Table « complète » (l'entrée déduite remplace tout, y compris `valide`)** : 31 vœux changent sur 100, dont 23 changements de filière (les autres : même filière, autre établissement) ; profils qui gardent exactement les mêmes 10 formations : 1 sur 10.

| Profil | Vœux tirés des familles (vraie table) | Vœux remplacés | dont filière changée | Vœux déplacés | Catégorie changée | Top 40 en commun | Étranger identique |
|---|---|---|---|---|---|---|---|
| vide | 9 | 0 | 0 | 0 | 0 | 40/40 | oui |
| eco-excellent-decide | 7 | 2 | 1 | 2 | 0 | 13/40 | non |
| eco-moyen | 6 | 4 | 2 | 6 | 0 | 2/40 | oui |
| sciences-ingenieur | 8 | 5 | 4 | 0 | 0 | 38/40 | non |
| droit-sciencespo | 6 | 2 | 1 | 0 | 0 | 40/40 | oui |
| sante-svt | 6 | 6 | 3 | 3 | 0 | 4/40 | oui |
| indecis | 3 | 2 | 2 | 1 | 0 | 12/40 | non |
| fragile | 5 | 3 | 3 | 2 | 0 | 28/40 | oui |
| international-langues | 6 | 4 | 4 | 0 | 0 | 13/40 | oui |
| premiere-arts | 9 | 3 | 3 | 1 | 0 | 17/40 | non |

- **eco-excellent-decide** : sortent Diplôme de Comptabilité et de Gestion (Lycée Turgot, DCG-DPECF) ; Licence - Mathématiques - Mathématiques fondamentales et appliquées - Campus Grands Moulins (Université Paris Cité, L1-Math) — entrent Diplôme de Comptabilité et de Gestion (Lycée Ozenne, DCG-DPECF) ; Formation des écoles de commerce et de management Bac + 5 (IPAG Business School - Programme Grande Ecole - Main track - Campus de Paris, FECM-B5).
- **eco-moyen** : sortent Diplôme de Comptabilité et de Gestion (Lycée Bonaparte, DCG-DPECF) ; Licence - Administration économique et sociale - Parcours Données et sociétés (Avignon Université, L1-AES) ; Formation des écoles de commerce et de management Bac + 4 - Global Business Track (100% English) (INSEEC International BBA - Campus de Bordeaux, FECM-B4) ; Licence - Administration publique - Parcours Management Public (Aix-Marseille Université - Site d'Aix-en-Provence (Centre Ville), L1-AP) — entrent Licence - Administration économique et sociale - Parcours AES (Université Savoie Mont Blanc - Chambéry, L1-AES) ; Formation des écoles de commerce et de management Bac + 4 (KEDGE Business School - International BBA - Campus de Marseille, FECM-B4) ; Licence - Economie et gestion - Economie et Gestion - Valence (Université Grenoble Alpes - Antenne de Valence, L1-EG) ; Formation des écoles de commerce et de management Bac + 5 - Programme Grande école (Excelia Business School – campus de Paris-Cachan, FECM-B5).
- **sciences-ingenieur** : sortent Licence - Informatique (Université Paris 8, L1-Info) ; Formation d'ingénieur post-bac (bac général) (INSA Centre-Val de Loire, FI-BAC5) ; Double licence Mathématiques / Informatique (Le Mans Université, L1-Math) ; Licence - Physique - Parcours Enseigner la Physique-Chimie (Université Paris Cité, L1-Physique) ; CPGE - MPSI (Lycée F Philibert Dessaignes, CPGE-MPSI) — entrent Cycle préparatoire intégré CapECL (ingénieur) (Centrale Lyon – ENISE, fiche éditoriale) ; Licence Mathématiques – parcours DEFI (Université de Rennes, L1-Math) ; Licence - Mathématiques et informatique appliquées aux sciences humaines et sociales -  Accès Santé (LAS) (Université Paris Cité, L1-MIASHS) ; Licence - Sciences pour l'ingénieur (Université Paris- Est-Créteil Val de Marne - UPEC (Paris 12), L1-SPI) ; DN MADE - Numérique - Spécialité : design d'interaction : web, applications, interface des objets connectés (Lycée Jean Monnet, DNM-Numérique).
- **droit-sciencespo** : sortent Licence - Science politique - Science Politique - Martinique -  Accès Santé (LAS) (Université des Antilles - Pôle Martinique, L1-SCIPO) ; Double diplôme  Sciences Po Lyon (Grade Master) - Licence d’Economie (Université Jean Monnet/ Saint-Étienne School of Economics) (Sciences Po Lyon - Institut d'Etudes Politiques - campus de Saint-Etienne, ScPo) — entrent Licence Science politique (UCO – Facultés libres de l'Ouest (Brest), L1-SCIPO) ; Bachelor du Collège universitaire (Sciences Po, fiche éditoriale).
- **sante-svt** : sortent DEUST - Santé environnement : Techniques de laboratoire (Université de Lille, DEUST-SETL) ; Licence - Sciences de la vie -  Biologie-environnement (Nîmes Université, L1-SV) ; D.E Infirmier (I.F.S.I. BLANCARDE - rentrée en septembre, DE-INF) ; D.E Audioprothésiste (UFR des Sciences Médicales et Paramédicales site Nord Université Aix Marseille, DE-AudioP) ; D.E Infirmier (IFSI CHU Nîmes - Site : ville d'Uzès - rentrée de Septembre, DE-INF) ; Licence - Sciences de la vie - Licence de Biologie (Université de Toulon, L1-SV) — entrent Licence - Sciences de la vie et de la terre (Avignon Université, L1-SVT) ; D.E Infirmier (IFSI du CH Nord Deux-Sèvres Thouars - rentrée en septembre, DE-INF) ; D.E Infirmier (IFSI du centre hospitalier Princesse Grace - rentrée en septembre, DE-INF) ; Licence - Sciences de la vie - Portail Louis Pasteur (Aix-Marseille Université - Site d'Aix-en-Provence (Montperrin), L1-SV) ; Licence - Sciences sanitaires et sociales - Portail Louis Pasteur (Aix-Marseille Université - Site de Marseille Saint Charles, L1-SSS) ; D.E Ergothérapeute (Institut de formation public Var prof de santé IF Toulon, DE-Erg).
- **indecis** : sortent Licence - Economie (Université Jean Monnet - Saint Etienne, L1-Economie) ; Licence - Langues, enseignement, médiation en milieu amazonien (Université de Guyane, L1-LEMMA) — entrent Licence - Langues, littératures et civilisations étrangères et régionales - Parcours Asie du Sud et Himalaya - Tamoul -  Accès Santé (LAS) (INALCO, L1-LLCER) ; BPJEPS - Spécialité Educateur sportif - Mention Activités aquatiques et de la natation (CREPS de Strasbourg - Antenne de Mulhouse, BPJEPS-AAN).
- **fragile** : sortent Licence Lettres (Université Côte d'Azur, L1-Lettres) ; Licence - Langues étrangères appliquées - Parcours Anglais - Espagnol (Université Côte d'Azur, L1-LEA) ; Sciences des organisations – campus de Londres (grade de licence) (Université Paris-Dauphine – PSL, fiche éditoriale) — entrent Licence Philosophie (Université Côte d'Azur, L1-Philosophie) ; Licence - Langues, littératures et civilisations étrangères et régionales - Parcours Italien (Université Côte d'Azur, L1-LLCER) ; Licence - Gestion - Parcours Commerce Vente et Marketing (ECM / CNAM Dijon, L1-Gestion).
- **international-langues** : sortent Licence - Sciences du langage -  Accès Santé (LAS) (Université Paris 8, L1-SL) ; Double diplôme  Sciences Po Lyon (Grade Master) - Licence d’Economie (Université Jean Monnet/ Saint-Étienne School of Economics) (Sciences Po Lyon - Institut d'Etudes Politiques - campus de Saint-Etienne, ScPo) ; Licence - Administration et Echanges internationaux - Parcours Europe (Université Paris- Est-Créteil Val de Marne - UPEC (Paris 12), L1-AEI) ; Licence - Etudes européennes et internationales - Parcours Etudes européennes et internationales franco-espagnoles (Université Clermont Auvergne, L1-EEI) — entrent Licence - Langues, littératures et civilisations étrangères et régionales - Parcours LLCER : Anglais Europe (Nantes Université, L1-LLCER) ; Bachelor du Collège universitaire (Sciences Po, fiche éditoriale) ; Licence - Portail Licence 1 LLCER Anglais mineure Portugais (non débutants) (Université Sorbonne Nouvelle Paris 3, L1-LLCER) ; Double licence Droit-Science politique (Université Paris 1 Panthéon-Sorbonne, L1-Droit).
- **premiere-arts** : sortent Licence - Musicologie (Université Evry Paris-Saclay, L1-Musicologie) ; Licence - Musicologie - Parcours Musicologie - Musique (Université Lumière - Lyon 2, L1-Musicologie) ; Licence - Sciences du langage - Expertise linguistique -  Accès Santé (LAS) (Université Paris Cité, L1-SL) — entrent Licence - Arts - Parcours Arts et Design (Université de Corte, L1-Arts) ; Licence - Arts - Parcours Médiation culturelle (Université Sorbonne Nouvelle Paris 3, L1-Arts) ; DSP - Design et métiers du bois (de la forêt au salon) (CY Cergy Paris Université - site de Versailles, DSP-DMB).

### 3. Échantillon à relire

30 filières tirées parmi les 448 déduites qui passent par les règles d'intitulé (460 déduites, moins 12 variantes en apprentissage qui recopient une famille écrite à la main : DE-ASS-App, DE-EJE-App, DE-ES-App, DE-MEM-App, DNM-Animation-App, DNM-Graphisme-App, DNM-Matériaux-App, DNM-Numérique-App, DNM-Objet-App, EI-BAC3-App, FECM-B3-App, L1-Gestion-App). Graine `20261019`, répartition proportionnelle aux catégories Parcoursup (plus forts restes) : `docs/relecture-filieres.csv`.

| Catégorie Parcoursup | Filières déduites | Tirées |
|---|---|---|
| C.M.I - Cursus Master en Ingénierie | 17 | 1 |
| CPGE | 11 | 1 |
| Certificats de spécialisation et FCIL | 84 | 6 |
| DCG | 2 | 0 |
| DEUST | 18 | 1 |
| Diplômes d'université ou d'établissement | 18 | 1 |
| Etudes de santé | 9 | 1 |
| Formations aux métiers de l'hôtellerie restauration | 2 | 0 |
| Formations aux métiers du sport | 33 | 2 |
| Formations d'architecture, du paysage et du patrimoine | 6 | 0 |
| Formations d'art, de design et du spectacle vivant | 12 | 1 |
| Formations des écoles d'ingénieurs | 1 | 0 |
| Formations des écoles de commerce et de management | 1 | 0 |
| Formations des écoles vétérinaires | 1 | 0 |
| Formations diplômantes du travail social | 4 | 0 |
| Formations professionnelles | 130 | 9 |
| Formations préparatoires à l'enseignement supérieur | 12 | 1 |
| Licence | 29 | 2 |
| Licence professionnelle | 4 | 0 |
| Licence sélective | 53 | 4 |
| Sciences Po - Instituts d'études politiques | 1 | 0 |

### 4. Seuils proposés, appliqués à cette mesure

| Critère | Seuil proposé | Mesuré | Atteint |
|---|---|---|---|
| premier domaine correct | ≥ 90 % | 79 % | non |
| type de formation correct | ≥ 90 % | 64 % | non |
| profil maths à ±1 | ≥ 85 % | 99 % | oui |
| profil écrit à ±1 | ≥ 85 % | 95 % | oui |
| aucune spécialité obligatoire inventée | 0 | 0 | oui |
| vœux inchangés (table « attributs ») | ≥ 80 % | 69 % | non |
<!-- fin resultats -->

## Lecture des résultats

### Les désaccords graves

- **Type.** 31 désaccords. 28 sont structurels : les gabarits de `construire-filieres.py` n'ont pas de type
  `dn_made` (14 DN MADE deviennent `ecole_art`), `prepa_ecg` (4 ECG), `prepa_litteraire`, `prepa_bl` (deviennent
  `prepa_scientifique`), `double_licence` (6, deviennent `licence` ou `ecole_specialisee`), `bachelor_france` ni
  `iep` (`ScPo` devient `college_universitaire`). `FI-BAC5` et `FECM-B5` viennent de `genre()` (voir plus bas).
  Reste `FP-MHI-App` (`ecole_specialisee` à la main, `formation_pro` déduit), discutable des deux côtés.
  Le moteur se sert du type pour le filtre « type de formation choisi » du questionnaire, le poids du dossier des
  prépas, les voies et la diversité de la liste : ces erreurs comptent.
- **Premier domaine.** 18 désaccords, de quatre sortes :
  - intitulé sans mot-clé reconnu (`CPGE - MPSI`, `PCSI`, `BCPST`, `DN MADE - Instrument`) : aucun domaine déduit.
    Dans la vraie construction, ces filières feraient échouer le contrôle final du script ; c'est pour cela que des
    CPGE déduites sont aujourd'hui corrigées à la main dans `filieres-corrections.json` ;
  - le premier mot-clé de l'intitulé l'emporte même quand il n'est pas le cœur de la filière : « Mathématiques »
    pour les 4 ECG (référence : économie), « informati » dans « Information et communication » (`L1-IC`),
    « numérique » pour `DNM-Numérique`, « livre » et « patrimoine » pour des DN MADE ;
  - la règle de repli « sciences » donne `ingenierie_tech, maths` à `L1 - Sciences du langage` ;
  - des cas discutables où la référence elle-même peut être contestée (`L1-LPE` Professorat des écoles : la
    référence dit `maths` d'abord, avec un profil maths de 3 ; `L1-HAA` : ordre arts / sciences humaines inversé).
- **Spécialités obligatoires.** 0 inventée, 5 oubliées (les 4 ECG et `FVGL` exigent les maths). C'est
  voulu par le script (« jamais obligatoires » pour une filière déduite, faute d'avoir pu lire le cadrage national
  des attendus), mais cela veut dire que le moteur ne bloque jamais une filière déduite pour une spécialité manquante.
- **Profil maths / écrit.** Seulement 5 écarts de 2 ou plus : `FI-BAC5` (écrit 3 au lieu de 1, gabarit Sciences Po
  par erreur), `CPGE-AL` (écrit 1 au lieu de 3, gabarit des prépas scientifiques), `L1-LPE` (maths 1 au lieu de 3).

### Effet sur les vœux

- Les changements touchent surtout les profils dont les vœux viennent des familles les plus touchées : DN MADE et
  licences d'arts (`premiere-arts`), CPGE MPSI et écoles d'ingénieurs (`sciences-ingenieur`), santé (`sante-svt`),
  commerce (`eco-moyen`).
- Une partie des vœux remplacés sont la même filière dans un autre établissement (DCG, D.E Infirmier, écoles de
  commerce) : changement réel pour l'élève (ville, taux d'accès), mais sans erreur d'orientation. La colonne « dont
  filière changée » les sépare.
- Des vœux qui ne viennent pas des familles changent aussi (DCG, écoles de commerce Bac + 4, `L1-AEI`…) : la liste
  est construite en équilibrant catégories et filières, donc un changement sur une famille déplace d'autres vœux.
- Les deux variantes (« attributs » et « complète ») donnent le même nombre de vœux changés (31), avec 23
  changements de filière au lieu de 21 pour la table « complète » : la perte de `valide` pour les familles en
  confiance basse (14 sur 86) joue peu sur ces 10 profils.

### Règles qui produisent le plus de désaccords graves (signalées, non corrigées)

1. **`GABARITS` / `genre()` : types manquants.** Aucun genre ne produit `dn_made`, `prepa_ecg`, `prepa_litteraire`,
   `prepa_bl`, `double_licence` ni `bachelor_france` (23 types faux). Les DN MADE tombent dans le gabarit « art »,
   toutes les CPGE dans « cpge » (prépa scientifique, écrit 1), y compris lettres et ECG.
2. **`genre()` teste les catégories de toutes les formations de la filière, dans un ordre fixe.** Il suffit d'une
   formation minoritaire dans une autre catégorie pour changer le genre de toute la filière : `FI-BAC5` (620
   formations en « écoles d'ingénieurs », 2 aussi en « Sciences Po ») devient `college_universitaire` avec le profil
   Sciences Po ; `FECM-B5` (58 formations en commerce, 1 aussi en Sciences Po) aussi ; `FECM-B3` (174 formations en
   commerce, 1 aussi en ingénieurs) devient `ecole_ingenieur`. `FI-BAC5` et `FECM-B3` sont les deux familles les plus
   fréquentes (626 et 175 formations).
3. **`REGLES[36]` « mathemat » → maths** : prend le dessus sur l'économie pour les ECG (4 premiers domaines faux).
4. **`domaines_generiques()` quand l'intitulé n'a pas de mot-clé** (MPSI, PCSI, BCPST, Instrument, `EI-BAC3`,
   `FVGL`, `DNM-Evènement`) : aucun domaine, ou des domaines tirés d'intitulés de formations trop variés.
5. **`REPLI[1]` « sciences » → ingenierie_tech, maths** : faux pour « Sciences du langage » (et à surveiller pour
   tout intitulé « Sciences de… » non couvert par une règle).
6. **`REGLES[35]` « informati / numérique »** : « Information et communication » et « DN MADE Numérique » deviennent
   d'abord de l'informatique.
7. **`deduire()` : `obligatoires` toujours vide** (5 oublis, tous sur les maths).

Les numéros `REGLES[i]` / `REPLI[i]` sont les positions (à partir de 0) dans les listes du script au commit mesuré.

## Limites de la mesure

- **La référence peut être fausse elle-même.** Les 87 familles sont la valeur la plus fréquente parmi des fiches
  Mon Plan Sup écrites à la main, pas une vérité officielle (voir l'issue
  [aaronborens100-cloud/mon-plan-sup#5](https://github.com/aaronborens100-cloud/mon-plan-sup/issues/5)). Certains
  « désaccords » sont peut-être des erreurs de la référence (`L1-LPE` à dominante maths, par exemple). La mesure
  dit « accord avec la saisie à la main », pas « exactitude ».
- **Les familles sont les filières les plus courantes et les plus nettes** (licences générales, CPGE, D.E de santé,
  DN MADE, écoles d'ingénieurs et de commerce). Les 460 filières déduites sont surtout des formations
  professionnelles, certificats de spécialisation, DEUST, diplômes d'établissement, aux intitulés plus variés : le
  résultat sur elles sera **probablement moins bon**. À l'inverse, certains défauts trouvés ici (types `dn_made`,
  `prepa_ecg`…) concernent surtout les familles et peu les 460.
- **Les gabarits ont été calés sur les familles** (« valeurs alignées sur les familles existantes du même type »,
  dit le script) : le profil est en partie appris de la référence, ce qui flatte les taux d'accord sur le profil.
- **10 profils seulement** pour la partie 2, et des profils pensés pour les tests, pas un échantillon d'élèves.
  Le chiffre « 31 vœux sur 100 » donne un ordre de grandeur, pas une probabilité.
- **La partie 2 ne mesure que les 86 familles remplacées.** L'effet des erreurs des 460 filières déduites sur les
  vœux n'est pas mesurable sans référence ; la relecture de l'échantillon servira à l'estimer.
- Le classement des « 10 désaccords graves les plus importants » se fait par nombre de formations Parcoursup de la
  filière. Une partie de ces formations a aussi une fiche éditoriale (`data/formations.json`) qui prend le pas sur la
  table : le poids réel dans le moteur peut être plus faible.

## Seuils proposés pour juger la table acceptable

À décider par le responsable du projet. Proposition, sur le test à l'aveugle (et, plus tard, sur la relecture) :

| Critère | Seuil proposé | Pourquoi |
|---|---|---|
| Premier domaine correct | ≥ 90 % | c'est le domaine qui pèse le plus dans l'intérêt |
| Type de formation correct | ≥ 90 % | filtre « type choisi », voies, diversité de la liste |
| Profil maths et écrit à ±1 | ≥ 85 % chacun | ce sont les deux dimensions du profil qui pèsent dans la faisabilité |
| Spécialité obligatoire inventée | 0 | une obligatoire inventée bloque à tort un élève |
| Spécialité obligatoire oubliée | à décider (aujourd'hui 5 sur 5) | une obligatoire oubliée laisse passer un élève sans les maths exigées |
| Vœux inchangés (table « attributs », 10 profils) | ≥ 80 % | mesure directe de l'effet pour l'élève |
| Relecture humaine : filières jugées « correctes » | ≥ 80 % des 30 | seule mesure qui porte sur les 460 filières déduites |

La partie 4 des résultats applique les seuils mesurables aujourd'hui.

## Partie 3 : échantillon à relire

`docs/relecture-filieres.csv` (séparateur virgule, UTF-8). Une ligne par filière tirée : code nmc, intitulé
officiel, catégorie Parcoursup, lien vers la fiche Parcoursup d'une formation de la filière (tirée au hasard), puis
les attributs déduits tels qu'ils sont dans `data/filieres.json` (corrections à la main comprises : c'est ce que le
site utilise), puis trois colonnes vides : « correct (oui/non) », « champ faux », « commentaire ».
Colonnes d'aide : `confiance` et `valide` (une filière `valide = non` n'entre pas dans les listes de vœux),
`autres_intitules_du_code` (le code couvre aussi d'autres intitulés, avec leurs propres attributs) et
`attributs_repris_de` (variante en apprentissage qui recopie une filière déduite).

Le script ne réécrit pas ce fichier s'il existe déjà, pour ne pas effacer la relecture
(`--echantillon` pour le refaire, même graine donc même tirage tant que la table ne change pas).
La relecture n'a pas été faite par l'auteur des règles, qui n'est pas neutre : elle revient au responsable du projet.
