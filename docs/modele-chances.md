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
`MESSAGE_SANS_MOYENNE`, `SEUIL_EXPERTES_FAIBLE`, `SEUIL_EXPERTES_FORT`). La « moyenne des bulletins »
utilisée par la position (3.2) et par le critère « notes » est calculée ainsi :

- **Moyenne générale** = moyenne simple des moyennes générales écrites sur les bulletins de
  première et de terminale. Chaque période (trimestre ou semestre) compte pour `POIDS_PERIODE = 1`,
  sans coefficient. C'est un choix éditorial : Parcoursup transmet tous les bulletins de première et
  de terminale aux formations, et aucune donnée publique ne dit quel poids chaque jury donne à
  chaque période. Les bulletins de seconde ne comptent que pour un élève qui n'en a pas d'autre.
- **Période sans moyenne générale** : elle n'est pas comptée. On ne la reconstitue pas à partir des
  matières (les coefficients du lycée, les options et les matières non saisies rendraient le
  résultat différent du bulletin). Le profil affiche « Moyenne générale non renseignée pour T2 :
  ajoute-la depuis ton bulletin. » La même règle s'applique à l'import d'un bulletin PDF
  (`js/bulletin.js`) : si la moyenne générale n'est pas lue, l'import n'en écrit aucune.
- **Coefficients** : les coefficients saisis ou lus dans les bulletins ne servent à aucun calcul.
- **Moyenne du dernier bulletin** : affichée à part (« Dernier bulletin »). Elle ne sert à aucun calcul.
- **Maths** = moyenne simple de la spécialité maths sur toutes les périodes. Sans la spécialité,
  ce sont les maths complémentaires (affichées comme telles). Avant cette version, les maths
  retenues étaient `(maths × 2 + maths expertes) / 3`, une pondération sans source : elle est supprimée.
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
  maths, utilisé pour le Bachelor du Collège universitaire de Sciences Po seulement. Pondération
  publiée par Sciences Po (page « Admission française en Bachelor »,
  https://www.sciencespo.fr/admissions/fr/bachelor/bacheliers-lycees-francais/, relevée le
  19/10/2026 par un moteur de recherche, la page n'ayant pas pu être ouverte directement).

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
| **Avec notes** : tout le reste (y compris position inconnue, ou taux non publié) | réaliste |
| **Sans notes** : taux d'accès ≥ 50 % | réaliste |
| **Sans notes** : taux d'accès < 50 % ou non publié | ambitieux |

Les règles sont lues dans l'ordre (`REGLES_CATEGORIE`) : nouvelle formation, point bloquant, sans
notes et taux non publié passent avant les règles des formations très ouvertes.

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
  et position « au-dessus », soit taux ≥ 85 % et position « dans la moyenne » ou « au-dessus » ;
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
