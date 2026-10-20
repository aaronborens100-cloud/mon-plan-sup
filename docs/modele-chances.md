# Catégories ambitieux / réaliste / sécurité : le modèle

Ce document décrit comment Mon Plan Sup classe une formation en « ambitieux », « réaliste » ou
« sécurité » pour un élève, sur quelles données il s'appuie, et ce que ce classement ne sait pas
faire. Il remplace l'ancien calcul de « fourchette de chances » (`chance()` dans `js/moteur.js`).

Code concerné : `js/moteur.js` (`repere`, `categorieDe`, `protection`), affichage dans `js/app.js`.

## 1. Ce qu'on ne peut pas calculer

Aucune donnée publique ne donne la probabilité qu'un élève précis soit admis dans une formation.
Les statistiques Parcoursup décrivent les **admis** (combien, avec quelles mentions au bac, quel
type de bac), pas les **refusés** : on ne sait pas combien d'élèves à 13 de moyenne ont demandé une
formation, ni combien ont été pris. Sans les refusés, on ne peut pas estimer de taux d'admission
personnel.

Le site n'affiche donc plus de pourcentage de chances. Il montre deux mesures vérifiables, et en
déduit une catégorie avec des règles écrites ci-dessous.

## 2. L'ancien modèle (jusqu'à la PR #9 incluse)

`chance(f, s, crit)` calculait une fourchette `bas`–`haut` en pourcentage :

1. point de départ : le taux d'accès `T` de la formation (à défaut, une valeur inventée d'après le
   niveau de sélectivité : 8, 20, 40 ou 70 %) ;
2. position `p` de l'élève parmi les admis 2025 : `percentileAdmis(mentions, moyenne + 0,4)` (le
   « + 0,4 » supposait, sans source, que la note au bac dépasse la moyenne des bulletins) ; à défaut
   de mentions, `p = 0,5 + 0,22 × écart au repère` ;
3. `bas = T × (0,35 + 1,6 p)` et `haut = T × (0,8 + 3,2 p)` ;
4. multiplicateurs : spécialités « à renforcer » × 0,7 / 0,8, appréciations faibles × 0,7 / 0,8,
   appréciations fortes × 1,1, anglais faible × 0,6 / 0,7 ; point bloquant : `bas ≤ 1`, `haut ≤ 5` ;
5. plafonds : 95 % (bas), 97 % (haut), 80 % sans taux publié, 60 % si `T ≤ 12`, 75 % si `T ≤ 30` ;
6. catégorie : « sécurité » si le milieu de la fourchette atteint 55 % (et taux publié > 30 %),
   « réaliste » à partir de 25 %, « ambitieux » en dessous. Sans notes, la catégorie venait de la
   seule sélectivité : une formation « peu sélective » devenait « sécurité ».

Aucun de ces coefficients ne s'appuie sur une donnée ou une étude. Résultats constatés sur `main`
(vérifiés le 18/10/2026) avec les profils de test (`tests/profils.js`) :

- le profil « fragile » (9,5 de moyenne) recevait 3 vœux « sécurité » à 33–80 % et 35–80 %, alors
  que sa moyenne est inférieure à celle de tous les admis de ces formations ;
- beaucoup de fourchettes valaient 95–97 % (exemple : Licence Lettres, Université Côte d'Azur,
  taux d'accès 100 %, pour une moyenne de 12 : `p = 0,62`, `bas = 100 × 1,34`, ramené à 95) ;
- le profil « vide » (aucune note) recevait 3 vœux « sécurité ».

## 3. Les deux mesures du nouveau modèle

### 3.1 Le taux d'accès officiel de la formation

- Source : Parcoursup, session 2025, jeu de données « Parcoursup 2025 – vœux de poursuite d'études
  et réponses des établissements » (`fr-esr-parcoursup`), open data du ministère de l'Enseignement
  supérieur : <https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/>,
  consulté le 08/10/2026 (`data/stats.json`, colonne `taux_acces_ens`).
- À défaut : statistiques de la session 2024 du même jeu de données, ou relevé manuel qui cite sa
  source, sa date de consultation et sa session (`data/stats-manuelles.json`). La session est
  affichée à côté du taux.
- Définition (Parcoursup) : part des candidats de la phase principale qui ont reçu une proposition
  d'admission de la formation. C'est une mesure **pour l'ensemble des candidats**, tous profils
  confondus : elle dit si la formation est très demandée, pas si l'élève sera pris.
- Le taux n'est plus jamais remplacé par une valeur déduite de la sélectivité. Pas de taux publié :
  la formation n'est jamais « sécurité ».

Les fiches éditoriales de `data/formations.json` fusionnées avec Parcoursup citent parfois une
source secondaire (Thotis, OptionMétier) pour leur taux. Vérification faite le 18/10/2026 : pour les
735 fiches concernées qui peuvent entrer dans la liste de vœux, le taux est identique à celui de
`data/stats.json`. La fiche affiche alors la source officielle.

### 3.2 La position de l'élève parmi les admis 2025

On calcule la part des admis 2025 de la formation dont la moyenne au bac est **inférieure** à celle
de l'élève (`percentileAdmis`).

- Donnée : la répartition des admis par mention au bac (sans mention, AB, B, TB, TB avec
  félicitations), même source que le taux d'accès (colonnes `pct_sansmention` à `pct_tbf`).
- Les mentions sont des tranches de 2 points : sans mention [10 ; 12[, AB [12 ; 14[, B [14 ; 16[,
  TB [16 ; 18[, félicitations [18 ; 20]. **Hypothèse 1** : à l'intérieur d'une tranche, les admis
  sont répartis uniformément. On ne connaît pas leur répartition réelle dans la tranche : un admis
  « B » peut avoir 14,0 comme 15,9. La position est donc approchée à quelques points près.
- **Hypothèse 2 (marge de prudence)** : on situe l'élève avec sa moyenne des bulletins **moins**
  `MARGE_BULLETIN = 0,5` point. Raisons :
  - les mentions des admis portent sur la note finale du bac, alors que l'élève saisit la moyenne
    de ses bulletins : ce ne sont pas les mêmes notes, et on ne dispose d'aucune donnée publique
    qui mesure l'écart entre les deux pour un élève donné ;
  - les jurys classent les dossiers sur les bulletins de première et de terminale, notés par des
    lycées différents, pas sur la note du bac ;
  - l'arrondi des tranches (hypothèse 1) peut surestimer la position.
  La marge ne prétend pas mesurer un écart réel : c'est un choix de prudence, pour que l'erreur
  aille dans le sens d'une catégorie moins favorable. L'ancien « + 0,4 », lui, allait dans le sens
  inverse, sans source. La valeur 0,5 correspond au quart d'une tranche de mention : assez pour
  ne pas classer en « sécurité » un élève tout juste au bord d'une tranche, pas assez pour changer
  la position d'un élève nettement au-dessus.
- Le percentile est arrondi au pour cent avant d'appliquer les seuils, pour que la phrase affichée
  (« environ 30 % ») et le niveau ne se contredisent jamais.
- Trois niveaux, seuils en constantes (`SEUIL_AU_DESSUS`, `SEUIL_EN_DESSOUS`) :

  | Position (`percentile`)   | Niveau                                  |
  |---------------------------|-----------------------------------------|
  | ≥ 60 %                    | « au-dessus de la plupart des admis »   |
  | de 30 % à moins de 60 %   | « dans la moyenne des admis »           |
  | < 30 %                    | « en dessous de la plupart des admis »  |

- Sans répartition des mentions publiée, la position est « inconnue ». Il n'y a plus d'estimation
  de secours à partir de l'écart au repère de moyenne.

### 3.3 Comment on calcule ta moyenne

Code : `statsProfil` dans `js/moteur.js` (constantes `POIDS_PERIODE`, `NIVEAUX_BULLETINS`,
`MESSAGE_SANS_MOYENNE`, `NOTE_MIN`, `NOTE_MAX`, `MESSAGE_NOTE_IMPOSSIBLE`, `MESSAGE_MATHS_COMPL`,
`SEUIL_EXPERTES_FAIBLE`, `SEUIL_EXPERTES_FORT`). La « moyenne des bulletins »
utilisée par la position (3.2) et par le critère « notes » est calculée ainsi :

- **Moyenne générale** = moyenne simple des moyennes générales écrites sur les bulletins de
  première et de terminale. Chaque période (trimestre ou semestre) compte pour `POIDS_PERIODE = 1`,
  sans coefficient. C'est un choix éditorial : Parcoursup transmet tous les bulletins de première et
  de terminale aux formations, et aucune donnée publique ne dit quel poids chaque jury donne à
  chaque période. Les bulletins de seconde ne comptent que pour un élève qui n'en a pas d'autre.
- **Période sans moyenne générale** : elle n'est pas comptée. On ne la reconstitue pas à partir des
  matières (les coefficients du lycée, les options et les matières non saisies rendraient le
  résultat différent du bulletin). Le profil affiche « Moyenne générale non renseignée pour Tle T2 :
  ajoute-la depuis ton bulletin. » La même règle s'applique à l'import d'un bulletin PDF
  (`js/bulletin.js`) : si la moyenne générale n'est pas lue, l'import n'en écrit aucune.
- **Valeurs vides ou impossibles** : une case vide ou faite d'espaces est une valeur absente (jamais
  0). Une moyenne générale ou une note de matière hors de [0 ; 20] (`NOTE_MIN`, `NOTE_MAX`) est une
  erreur de saisie : elle n'est pas comptée, comme une valeur absente, et le profil affiche « Moyenne
  de Tle T1 impossible (125) : vérifie-la sur ton bulletin. » (`MESSAGE_NOTE_IMPOSSIBLE`).
- **Coefficients** : les coefficients saisis ou lus dans les bulletins ne servent à aucun calcul.
- **Moyenne du dernier bulletin** : affichée à part (« Dernier bulletin »). Elle ne sert à aucun calcul.
- **Maths** = moyenne simple de la spécialité maths sur toutes les périodes. Sans la spécialité,
  ce sont les maths complémentaires (affichées comme telles). Avant cette version, les maths
  retenues étaient `(maths × 2 + maths expertes) / 3`, une pondération sans source : elle est supprimée.
- **Maths complémentaires et repères de maths** : le repère de maths d'une formation (`maths_cible`)
  vise la spécialité maths. Les maths complémentaires ne lui sont donc jamais comparées : pour un
  élève qui n'a que les maths complémentaires, le critère « notes » compare seulement la moyenne
  générale et ajoute « Repère de maths donné pour la spécialité maths : tes maths complémentaires ne
  sont pas comparées. » (`MESSAGE_MATHS_COMPL`). Si la formation n'a qu'un repère de maths, le critère
  est « donnée manquante ». L'action « Gagner environ … point(s) de moyenne » n'ajoute pas « (surtout en
  maths) » pour cet élève, et l'ajustement des prépas ECG maths appliquées ne regarde que la
  spécialité maths.
- **Spécialité maths abandonnée en fin de première, sans maths complémentaires** : on garde les notes
  de spécialité maths de première comme « Maths » (c'est la seule note de maths de l'élève, et les
  formations voient ces bulletins). Elles sont affichées « Spécialité maths (première) » dans les
  tuiles du profil et dans « Comment on calcule ta moyenne » (`libelleMaths`), pour ne pas laisser
  croire à des notes de terminale. Elles restent comparées au repère de maths des formations.
- **Maths expertes** = moyenne simple à part, sur les périodes où l'option est suivie. Elle compte
  dans la moyenne générale du bulletin comme n'importe quelle matière, puisque c'est le lycée qui
  calcule cette moyenne.
- **Critère « spécialités »** : pour une formation où l'option maths expertes est « indispensable »,
  « fortement conseillée » ou « conseillée », on vérifie que l'élève la suit, puis on regarde sa note :
  sous `SEUIL_EXPERTES_FAIBLE = 10`, « à renforcer » ; à `SEUIL_EXPERTES_FORT = 14` ou plus, « atout
  fort » ; entre les deux, « conforme ». **Ces deux seuils sont des règles éditoriales de Mon Plan
  Sup**, pas des exigences publiées par les formations. Le critère cite la note (« Maths expertes :
  14,5 »). Comme les autres critères, il joue sur la faisabilité et l'ordre des recommandations,
  pas sur la catégorie (seul un point bloquant la change, voir 4).
- **Prépas ECG maths appliquées** : l'ajustement « tes maths te permettent l'option approfondies »
  (−4 points d'intérêt) demande maths ≥ 15 (maths seules, sans les maths expertes) et une note de
  maths expertes qui n'est pas sous `SEUIL_EXPERTES_FAIBLE`.
- **Aucune prédiction** : ni tendance, ni extrapolation, ni bonus de mention du conseil de classe.
  La seule correction est `MARGE_BULLETIN` (−0,5 point), appliquée uniquement dans `repere()`.
- **Score « épreuves anticipées » (Sciences Po)** : 60 % français écrit, 10 % français oral, 30 %
  maths, utilisé pour le Bachelor du Collège universitaire de Sciences Po seulement. Poids
  relevés sur la page Admission de Sciences Po
  (https://www.sciencespo.fr/admissions/fr/bachelor/bacheliers-lycees-francais/), non vérifiés à la
  main au 19/10/2026.

## 4. La table des catégories

« Point bloquant » : un critère de la formation est au niveau « bloquant » (aujourd'hui : une
spécialité obligatoire ou l'option maths expertes indispensable qui manque).

| Cas | Catégorie |
|-----|-----------|
| Nouvelle formation 2026 (aucune statistique) | ambitieux (règle existante, inchangée) |
| Point bloquant | ambitieux |
| **Avec notes** : taux d'accès < 20 % | ambitieux |
| **Avec notes** : taux d'accès ≥ 85 % **et** position « dans la moyenne » ou « au-dessus » | sécurité (formation très ouverte) |
| **Avec notes** : taux d'accès ≥ 85 % **et** position « en dessous » | réaliste (formation très ouverte) |
| **Avec notes** : position « en dessous » | ambitieux |
| **Avec notes** : taux d'accès ≥ 50 % **et** position « au-dessus » | sécurité |
| **Avec notes** : licence non sélective du secteur de l'élève, taux d'accès ≥ 50 % (et < 85 %) **et** position « dans la moyenne » | sécurité (règle proposée, section 8.4) |
| **Avec notes** : tout le reste (y compris position inconnue, ou taux non publié) | réaliste |
| **Sans notes** : taux d'accès ≥ 50 % | réaliste |
| **Sans notes** : taux d'accès < 50 % ou non publié | ambitieux |

Les règles sont lues dans l'ordre (`REGLES_CATEGORIE`) : nouvelle formation, point bloquant, sans
notes et taux non publié passent avant les règles des formations très ouvertes.

Après la table, une formation « sécurité » au-delà de la distance acceptée par l'élève (ou de l'autre côté de la
mer, à l'étranger, ou sans coordonnées) devient « réaliste » (section 8.3).

### Formations très ouvertes (`SEUIL_TAUX_TRES_OUVERT = 85`)

La position parmi les admis compare l'élève aux **admis**, pas aux **refusés**. Quand au moins
85 % des candidats reçoivent une proposition, les refusés sont au plus 15 % des candidats : les
admis ressemblent alors à l'ensemble des candidats, et être en dessous de la plupart d'entre eux ne
veut pas dire être refusé. Sans cette règle, le site classait « ambitieux » des formations où
presque tout le monde reçoit une proposition : licence AES de l'Université de Bourgogne (Dijon,
taux 98 %) pour le profil « fragile », et seulement « réaliste » la licence d'économie de
l'Université de Toulon (taux 90 %) pour « eco-moyen » (position 36 %). L'élève recevait alors le
message « aucun vœu sûr » alors que ces vœux le sont presque pour tous.

- position « dans la moyenne » ou « au-dessus » → **sécurité** : « Formation très ouverte : au
  moins 85 % des candidats ont reçu une proposition en 2025. » ;
- position « en dessous » → **réaliste**, pas « sécurité » : les 15 % au plus qui ne reçoivent pas
  de proposition ont plus de chances d'être parmi les dossiers les plus faibles. Texte : « Formation
  très ouverte, mais ta moyenne est en dessous de celle des admis 2025 : candidate, et renforce tes
  notes. » ;
- position inconnue (mentions non publiées) : la règle ne s'applique pas, la formation reste
  « réaliste » (jamais « sécurité » sans position).

Le seuil de 85 % est un choix, pas une mesure : il laisse au plus un candidat sur sept sans
proposition. Le taux d'accès compte les propositions, pas les admissions finales, et une
proposition suppose que l'élève obtienne son bac (voir ci-dessous).

### Moyenne sous 10

Si la moyenne des bulletins (sans la marge) est inférieure à 10, Ma liste affiche en tête, en plus du
message de protection : « Ta moyenne est sous 10 : toute admission sur Parcoursup dépend de
l'obtention de ton bac. C'est ta priorité n° 1 cette année. » Ce message ne change aucune
catégorie.

### Conséquences

- un vœu « sécurité » a toujours un taux d'accès publié et une position connue : soit taux ≥ 50 %
  et position « au-dessus », soit taux ≥ 85 % et position « dans la moyenne » ou « au-dessus », soit licence non
  sélective du secteur de l'élève, taux ≥ 50 % et position « dans la moyenne » ; et, si l'élève a indiqué son lycée,
  il est à la distance qu'il accepte ;
- aucune formation à au moins 85 % de taux, sans point bloquant, n'est « ambitieux » pour un élève
  qui a renseigné ses notes ;
- sans notes, aucune formation n'est « sécurité » : on ne peut pas savoir où se situe l'élève ;
  la fiche le dit (« Renseigne tes bulletins… ») ;
- à formation égale, une moyenne plus haute ne donne jamais une catégorie moins bonne (le
  percentile croît avec la moyenne ; pour une formation très ouverte, la catégorie passe de
  « réaliste » à « sécurité », pour les autres d'« ambitieux » à « réaliste » puis « sécurité ») ;
- spécialités « à renforcer », langues, appréciations : toujours affichées comme critères sur la
  fiche et dans la note de faisabilité, mais elles ne changent plus la catégorie. Seul un point
  bloquant la change.

## 5. Ce qui est affiché

Sur la fiche, dans les cartes de recommandation et dans Ma liste :

- le taux d'accès officiel, sa session et sa source (« Taux d'accès 2025 : 66 % · Parcoursup ») ;
- la position en une phrase : « Ta moyenne te place au-dessus d'environ 70 % des admis de 2025 » ;
- la catégorie ;
- la limite : « Ce n'est pas une probabilité : les jurys regardent aussi ton dossier complet. »

La protection de la liste de vœux compte les vœux « sécurité » : avec ces règles, un vœu
« sécurité » est solide par construction (taux publié élevé, position connue, aucun point bloquant), il n'y a plus de seuil sur une fourchette. Le message
« Renseigne tes bulletins » reste affiché pour un élève sans notes.

## 6. Exemples chiffrés

Mentions des admis 2025 (Parcoursup 2025), position calculée avec la moyenne des bulletins moins
0,5 point.

**Licence Lettres, Université Côte d'Azur (Nice)** — taux d'accès 100 %, admis : sans mention
56 %, AB 31 %, B 13 %, TB 0 %.

| Moyenne des bulletins | Moyenne retenue | Position | Catégorie | Ancien calcul |
|---|---|---|---|---|
| 9,5 (profil « fragile ») | 9,0 | 0 % → en dessous | réaliste (très ouverte) | sécurité, 35–80 % |
| 12 | 11,5 | 42 % → dans la moyenne | sécurité (très ouverte) | sécurité, 95–97 % |
| 13 | 12,5 | 64 % → au-dessus | sécurité | sécurité |

Calcul pour 12 : moyenne retenue 11,5, dans la tranche « sans mention » [10 ; 12[ ; part des admis
en dessous = 56 % × (11,5 − 10) / 2 = 42 %.

**Licence d'économie et gestion, Université de Toulon** — taux d'accès 90 %, admis : sans
mention 65 %, AB 26 %, B 8 %, TB 1 %. Profil « eco-moyen » (11,6) : moyenne retenue 11,1, position
65 % × 1,1 / 2 = 36 % → dans la moyenne → sécurité (formation très ouverte). Avant la règle :
réaliste.

**Licence Droit, Université Paris 1 Panthéon-Sorbonne** — taux d'accès 11 %, admis : AB 5 %,
B 44 %, TB 48 %, félicitations 3 %.

| Moyenne des bulletins | Position | Catégorie |
|---|---|---|
| 14 | 4 % → en dessous | ambitieux |
| 17 | 61 % → au-dessus | ambitieux (taux d'accès < 20 %) |

Même très au-dessus des admis, une formation où moins d'un candidat sur cinq reçoit une
proposition reste « ambitieux ».

**CPGE MPSI, Lycée du Parc (Lyon)** — taux d'accès 10 %, admis : B 2 %, TB 41 %,
félicitations 58 %. Pour 17 de moyenne : position 12 % → en dessous → ambitieux.

**Profil sans notes** : Licence Physique, Nantes Université (taux d'accès 100 %) → réaliste ;
CPGE ECG du lycée Pierre-Corneille (Rouen, taux 66 %) → réaliste (ancien calcul : sécurité) ;
une formation à 43 % → ambitieux.

## 7. Limites

- La moyenne des bulletins n'est pas la note du bac : la position compare deux notes différentes.
  La marge de 0,5 point réduit le risque de surestimer l'élève, elle ne le supprime pas.
- Les mentions sont regroupées par tranches de 2 points (hypothèse de répartition uniforme).
- Les admis 2025 ne sont pas les admis 2027 : le nombre de places, de candidats et le niveau des
  dossiers changent d'une année à l'autre.
- Le taux d'accès et les mentions mélangent tous les candidats (bacs généraux, technologiques et
  professionnels, candidats en réorientation). Ils ne tiennent pas compte des quotas (boursiers,
  hors académie) qui peuvent jouer pour ou contre un élève.
- Les jurys lisent tout le dossier : appréciations, projet motivé, spécialités, progression,
  lycée d'origine. La catégorie n'en tient compte que pour les points bloquants.
- Une liste peut ne pas trouver 3 vœux « sécurité » : c'est une information pour l'élève (alerte
  « Pas assez de vœux vraiment sûrs »), pas un défaut à corriger en relâchant les règles.

## 8. Académie, distance et départage

Code : `js/moteur.js` (sections « académies, zones, distance » et « départage », `evaluer`, `recommander`).
Rien de cela n'utilise de donnée personnelle hors du navigateur : le lycée reste dans `localStorage`.

### 8.1 Académie du lycée et de chaque formation

- **Formation** : département de la cartographie Parcoursup 2026 (`data/parcoursup.json`, champ `departement`).
  Sans département (fiches éditoriales non rattachées, campus « Non renseigné »), on prend le département du lieu
  français connu le plus proche de ses coordonnées (`data/lieux.json`), à moins de `SEUIL_KM_LIEU_FRANCAIS` = 20 km.
- **Lycée** : département enregistré avec le lycée (`data/lieux.json`), sinon retrouvé par son code UAI, sinon par
  ses coordonnées (même règle).
- **Correspondance département → académie** (`ACADEMIES`, 30 académies, 101 départements). Source : pages
  « Académie de … » du ministère de l'Éducation nationale, rubrique « Directions des services départementaux de
  l'Éducation nationale », consultées le 19/10/2026 :
  liste des académies <https://www.education.gouv.fr/les-regions-academiques-academies-et-services-departementaux-de-l-education-nationale-6557>
  (mise à jour du 11/12/2025) ; Paris <https://www.education.gouv.fr/academie-de-paris-100049> ;
  Créteil (77, 93, 94) <https://www.education.gouv.fr/academie-de-creteil-100052> ;
  Versailles (78, 91, 92, 95) <https://www.education.gouv.fr/academie-de-versailles-100046> ;
  Normandie (14, 27, 50, 61, 76) <https://www.education.gouv.fr/academie-de-normandie-101186> ;
  Corse (2A, 2B) <https://www.education.gouv.fr/academie-de-corse-100109> ;
  Aix-Marseille <https://www.education.gouv.fr/academie-d-aix-marseille-100103> ;
  Amiens <https://www.education.gouv.fr/academie-d-amiens-253> ;
  Besançon <https://www.education.gouv.fr/academie-de-besancon-100076> ;
  Bordeaux <https://www.education.gouv.fr/academie-de-bordeaux-100094> ;
  Clermont-Ferrand <https://www.education.gouv.fr/academie-de-clermont-ferrand-100085> ;
  Dijon <https://www.education.gouv.fr/academie-de-dijon-100073> ;
  Grenoble <https://www.education.gouv.fr/academie-de-grenoble-100082> ;
  Lille <https://www.education.gouv.fr/academie-de-lille-100043> ;
  Limoges <https://www.education.gouv.fr/academie-de-limoges-100088> ;
  Lyon <https://www.education.gouv.fr/academie-de-lyon-100079> ;
  Montpellier <https://www.education.gouv.fr/academie-de-montpellier-100100> ;
  Nancy-Metz <https://www.education.gouv.fr/academie-de-nancy-metz-100058> ;
  Nantes <https://www.education.gouv.fr/academie-de-nantes-100067> ;
  Nice <https://www.education.gouv.fr/academie-de-nice-100106> ;
  Orléans-Tours <https://www.education.gouv.fr/academie-d-orleans-tours-100070> ;
  Poitiers <https://www.education.gouv.fr/academie-de-poitiers-100091> ;
  Reims <https://www.education.gouv.fr/academie-de-reims-100055> ;
  Rennes <https://www.education.gouv.fr/academie-de-rennes-100064> ;
  Strasbourg <https://www.education.gouv.fr/academie-de-strasbourg-100061> ;
  Toulouse <https://www.education.gouv.fr/academie-de-toulouse-100097> ;
  Guadeloupe <https://www.education.gouv.fr/academie-de-guadeloupe-100115> et La Réunion
  <https://www.education.gouv.fr/academie-de-la-reunion-100118> (« la région académique … comprend uniquement
  l'académie de … ») ; Martinique, Guyane et Mayotte : une académie chacune (liste des 30 académies ci-dessus).
  Saint-Martin et Saint-Barthélemy : rattachés à l'académie de la Guadeloupe (compétences « exercées par le recteur de
  l'académie de la Guadeloupe », article D. 271-1 du code de l'éducation, décret du 18/12/2008, BO n° 2 du 8 janvier
  2009 : <https://www.education.gouv.fr/bo/2009/2/mene0814102d.htm>, consulté le 19/10/2026). La page de l'académie de
  Guadeloupe ne cite pas ces deux collectivités. Ils forment une zone à part pour la distance (traversée).
  La page de l'académie de Paris ne liste pas de département : Paris (75) est déduit des adresses de ses services.
  Polynésie française, Nouvelle-Calédonie, Saint-Pierre-et-Miquelon, Wallis-et-Futuna : vice-rectorats, pas
  d'académie (aucun départage par l'académie). Le référentiel officiel du MESR (`fr-esr-referentiel-geographique`)
  et Légifrance n'étaient pas accessibles depuis l'environnement de travail (réseau bloqué) : à recouper.
- **Île-de-France** : trois académies (Paris, Créteil, Versailles). Pour le départage « même académie », un élève de
  Créteil et une formation de Paris ne sont **pas** de la même académie.

### 8.2 Départage à note égale

La note (pertinence = 60 % intérêt + 40 % faisabilité, ou faisabilité seule sans questionnaire) n'est plus
arrondie : l'intérêt et la faisabilité gardent leurs décimales, seul l'affichage arrondit (note sur 5). À note
exactement égale, `departage()` applique, dans cet ordre :

1. formation de l'académie de l'élève d'abord (`memeAcademie`) ;
2. la plus proche (`distTri`, la même distance équivalente que pour la pénalité : distance + `SURCOUT_TRAVERSEE_KM`
   = 100 km en cas de traversée, section 8.3 ; distance inconnue en dernier). Un ancien décalage de 20 000 km
   faisait passer une formation à Nice derrière Lille pour un élève d'Ajaccio : supprimé ;
3. taux d'accès le plus élevé ;
4. part de bacheliers généraux parmi les admis 2025 la plus élevée (`pct_bg`) ;
5. nombre de places le plus élevé (`capa_fin`) ;
6. code Parcoursup (`gta`) croissant, puis identifiant de la fiche : ordre totalement déterministe.

Jamais l'ordre du catalogue : `recommander()` et la liste de 10 vœux sont identiques si on mélange le catalogue
(test). Une note non numérique (NaN, aujourd'hui 4 formations canadiennes) est classée en dernier ; sa cause fait
l'objet d'une issue. L'académie ne sert qu'à départager : elle ne change la catégorie d'aucune formation sélective.

### 8.3 Distance continue

Distance à vol d'oiseau entre le lycée et la formation. Plus de paliers 45 / 120 / 250 km ni de bonus de
proximité : une pénalité d'intérêt continue (`penaliteDistance`), qui dépend de la réponse à la question
« mobilite » :

| Mobilité | Distance acceptée (`DISTANCE_ACCEPTEE_KM`) | Pénalité par 100 km, jusqu'à la distance acceptée | au-delà | plafond |
|---|---|---|---|---|
| domicile (0) | 45 km | 10 | 30 | 40 |
| proche (1) | 250 km | 2 | 10 | 30 |
| partout (2) | aucune limite | 0,5 | — | 6 |

Exemples : domicile, 30 km → −3 ; 120 km → −27 ; 200 km → −40. Proche, 150 km → −3 ; 400 km → −20 ; 600 km → −30.
Partout, Nice → Paris (≈ 690 km) → −3,5. Les distances acceptées sont celles annoncées dans la question
(décision du fondateur). Les coefficients sont des **choix éditoriaux** : aucune donnée publique ne mesure l'effet
de la distance. Ils sont gradués pour que, à distance acceptée, la pénalité reste faible (elle départage deux
formations proches de note), et qu'au-delà elle écarte vite la formation du haut du classement, sans exclusion.

- **Corse et outre-mer** (`zoneDe`) : continent, Corse et chaque territoire d'outre-mer sont des zones distinctes.
  Changer de zone (traversée) compte comme au-delà de la distance acceptée, quelle que soit la distance à vol
  d'oiseau (Nice → Corte ≈ 218 km) : jamais « sécurité » pour « domicile » et « proche ». La pénalité, elle, reste
  **progressive** : on l'applique à la distance allongée de `SURCOUT_TRAVERSEE_KM` = 100 km (`distanceEquivalente`),
  avec le plafond habituel. Élève d'Ajaccio, mobilité « proche » : Nice (233 km → 333 km équivalents) −13,3, Marseille
  (315 km → 415) −21,5, Lille (1 060 km) −30 (plafond). Une traversée vers l'outre-mer dépasse toujours 1 000 km :
  plafond, puis le départage met la plus proche devant (La Réunion : Mayotte avant la métropole). Les 100 km sont un
  choix éditorial (ordre de grandeur d'un trajet supplémentaire en bateau ou en avion), pas une mesure.
- **Campus à l'étranger enregistrés « France »** (Dauphine Londres, Madrid ; ESSEC Singapour, Rabat ; EM
  Normandie Oxford, Dublin… ; 25 fiches) : repérés par leur ville (`VILLES_ETRANGERES`) ou par des coordonnées à
  plus de 20 km de tout lieu français connu. Ils sont traités comme à l'étranger pour la distance (exclus pour
  « domicile », −12 d'intérêt pour « proche »), mais restent dans le catalogue et dans les listes Parcoursup.
- **Jamais « sécurité » au-delà de la distance acceptée** (`REGLE_HORS_DISTANCE`, après la table des
  catégories) : formation plus loin que 45 km (domicile) ou 250 km (proche), de l'autre côté de la mer, ou à
  l'étranger → « réaliste » au mieux. Même chose si la formation n'a pas de coordonnées (`REGLE_DISTANCE_INCONNUE`) :
  on ne peut pas vérifier la distance. `protection()` ne compte donc que des vœux à distance acceptée.
- **Règle « domicile »** (décision du fondateur, 20/10/2026) : pour un élève qui a indiqué son lycée et répondu
  « Non, je veux rester chez mes parents » (mobilite 0), une formation à plus de `DISTANCE_ACCEPTEE_KM[0]` = 45 km
  est **exclue**, par le même mécanisme (`exclu`) que l'étranger : elle n'entre ni dans la liste de 10 vœux, ni dans
  les recommandations, et sa fiche affiche « Tu as indiqué vouloir rester chez tes parents : cette formation est à
  X km de ton lycée. » (X = distance à vol d'oiseau, arrondie). La traversée compte : on compare la distance
  équivalente (distance + `SURCOUT_TRAVERSEE_KM`), donc la Corse est toujours exclue pour un élève de Nice. Une
  formation sans coordonnées n'est pas exclue (on ne peut pas mesurer) : elle reste soumise à
  `REGLE_DISTANCE_INCONNUE`. Sans lycée, rien ne change. Conséquence assumée : la liste d'un élève « domicile » peut
  compter moins de 10 vœux, et on ne la complète pas avec des formations lointaines.
- **Sans lycée** : aucune distance, aucune pénalité, aucune académie, et la règle ci-dessus ne s'applique pas.
  Ma liste affiche `MESSAGE_SANS_LYCEE` : « Indique ton lycée : sans lui, on ne peut pas tenir compte de ton
  académie ni de la distance. »

### 8.4 Licences non sélectives du secteur de l'élève (règle validée le 20/10/2026)

Source : FAQ Parcoursup « Prise en compte du secteur géographique »,
<https://www.parcoursup.gouv.fr/faq/thematiques/autres-sujets/prise-en-compte-du-secteur-geographique>, consultée le
19/10/2026 (page sans date ; elle cite les dates de la session 2026). Elle dit : quand une licence est très demandée,
« une priorité d'attribution des places est définie par le recteur au bénéfice des candidats du secteur » et « un
pourcentage maximum de candidats hors secteur géographique sera fixé par le recteur de région académique » ; le
secteur dépend de l'adresse du domicile et correspond en général à l'académie ; les candidats des académies de
Créteil, Paris et Versailles « appartiennent au même secteur géographique ». Même règle dans la réponse du ministère
à la question écrite n° 9332 (JO du 4 novembre 2025, p. 8976, article L. 612-3, V du code de l'éducation) :
<https://questions.assemblee-nationale.fr/q17/17-9332QE.htm>.

Traduction dans la table (`licence_secteur`, juste avant `tres_ouverte`) : licence non sélective
(`select_form` = « formation non sélective » et catégorie Parcoursup « Licence »), du secteur de l'élève
(son académie, l'Île-de-France comptant pour un seul secteur), taux d'accès d'au moins 50 % et moins de 85 %, position
« dans la moyenne des admis » → **sécurité** (au lieu de « réaliste »). Sans changement : position « en dessous »
(ambitieux), position inconnue (réaliste), taux sous 50 %, et toutes les formations sélectives.

Limites : on suppose que l'adresse du domicile est dans l'académie du lycée (pas toujours vrai) ; on ne connaît ni
le pourcentage hors secteur de chaque licence, ni la part des admis 2025 venus du secteur (`pct_aca_orig` existe
dans `stats.json` mais ne mesure que l'académie d'origine des admis). La règle reste soumise à la règle de
distance (8.3).

Texte affiché (fiche, liste ; décision du fondateur du 20/10/2026, construit par `texteLicenceSecteur()` qui cite
`SOURCE_SECTEUR`) : on n'écrit jamais que la licence est « sûre » à cause du secteur, on explique la priorité.

| Réponse à « mobilite » | Texte |
|---|---|
| domicile ou proche (ou pas de réponse) | « Licence de ton secteur : les candidats de ton académie y sont prioritaires (règle Parcoursup). » |
| partout | la même phrase, puis « Même si tu veux partir, garder ce vœu te protège. » |

### 8.5 Territoires : Corse et outre-mer (question « pays »)

Décision du fondateur du 20/10/2026. La question « Où aimerais-tu étudier en France ? » (« lieu ») reste celle de
main : idf, lyon, regions, « Peu importe » (`partout` = toute la France), même aide, même maximum, et cocher
« Peu importe » décoche les autres. `lieuDe(f)` est aussi celui de main : la Corse et l'outre-mer comptent dans
`regions`.

La Corse et l'outre-mer se cochent dans « Si tu partais, où ? (plusieurs choix) » (« pays »), après « Canada » et
avant « Rien d'autre que ce que j'ai coché » (`aucun`) : Corse (`corse`), Outre-mer (Guadeloupe, Martinique, Guyane,
La Réunion, Mayotte…) (`outremer`), La France continentale (si tu vis en Corse ou outre-mer) (`continent`). `max` = 13 :
toutes les cases.

**« Rien d'autre que ce que j'ai coché »** (décision du fondateur du 20/10/2026 ; ancien libellé « Aucun », value
`aucun` gardée pour les réponses déjà enregistrées). Elle veut dire « aucun autre endroit que ce que j'ai coché » et se
combine avec toutes les cases de « pays » (js/app.js : cocher l'une ne décoche plus l'autre ; « Peu importe » de
« lieu » reste exclusif). Aide affichée : « Coche « Rien d'autre que ce que j'ai coché » pour exclure tout le reste. »
- seule ou avec seulement des territoires : toutes les formations à l'étranger sont exclues (« Tu as indiqué vouloir
  rester en France. ») et `etranger()` renvoie le mode « non », comme avant ;
- avec des pays : les formations d'un pays non coché sont exclues (« Tu as indiqué ne vouloir aucun autre pays que
  ceux que tu as cochés. », `MESSAGE_AUCUN_AUTRE_PAYS`), les pays cochés gardent le comportement habituel, et
  `etranger()` ne propose que ces pays (`paysCoche`) ;
- non cochée : pays non choisi = malus « pays non choisi », comme avant. Les territoires suivent la règle ci-dessous
  dans tous les cas.

- `territoireDe(f)` : `corse` ou `outremer` d'après `zoneDe` (outre-mer = toute zone hors continent et Corse, y
  compris Polynésie, Nouvelle-Calédonie, Saint-Martin…), sinon `continent` (zone inconnue comprise).
- **Zones acceptées** = la zone du lycée de l'élève (toujours ; sans lycée, le continent) + les zones cochées dans
  « pays » (`TERRITOIRES` : corse, outremer, continent). Pour un élève du continent, le continent est toujours
  accepté. Pour un élève d'outre-mer, seul son territoire est compris d'office (élève de La Réunion : Mayotte
  seulement avec « outremer »). Un élève de Corse ou d'outre-mer qui n'a pas coché « continent » n'a jamais de vœu
  « sécurité » sur le continent (décision confirmée). Sans aucune réponse à « pays » : aucune restriction
  (comportement de main). `aucun` seul est une réponse : seule la zone du lycée est alors acceptée.
- **Hors des zones acceptées** : malus « ville hors de tes choix » (−12 d'intérêt, appliqué une seule fois même si
  la ville est aussi hors des choix de « lieu »).
- **Jamais « sécurité »** (`REGLE_HORS_TERRITOIRE`, clé `hors_territoire`, appliquée après la table et la règle de
  distance), même avec la mobilité « partout » et « Peu importe » → « réaliste » au mieux, dans la liste comme dans
  `protection()`. Texte : « Tu n'as pas coché la Corse dans « Si tu partais, où ? » : ce vœu ne compte pas comme
  sûr. » (ou « l'outre-mer », « la France continentale »). Si la règle de distance s'applique déjà, c'est son texte
  qui est affiché.
- **Pas des pays étrangers** : corse, outremer et continent sont ignorés par le malus « pays non choisi » des
  formations à l'étranger (`evaluer()`) et par `etranger()`. Un élève qui coche seulement « Corse » a les mêmes
  formations étrangères et les mêmes propositions à l'étranger que s'il n'avait pas répondu à « pays ».
- Pourquoi : un élève de Nice qui répond « peu importe » pense à la métropole ; une licence de Pointe-à-Pitre à
  7 000 km ne doit pas être présentée comme son vœu de sécurité. La règle ne dit rien des chances d'admission : elle
  vient des choix de l'élève, pas d'une donnée officielle.
- Limites connues : la question est dans le thème « International » : un élève de Corse ou
  d'outre-mer qui ne veut pas partir à l'étranger peut ne pas penser à y cocher « continent ».
