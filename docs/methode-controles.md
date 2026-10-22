# Contrôles permanents et comparaison de versions : méthode

Deux outils de vérification, qui ne changent rien au site :

- `npm run controles` (`scripts/controles.js`) : vérifie, sur 300 élèves fictifs tirés au hasard, que les règles
  écrites du moteur et des pages sont respectées ;
- `npm run comparer -- <dossierA> <dossierB>` (`scripts/comparer-versions.js`) : vérifie que deux versions du site
  donnent exactement les mêmes résultats et les mêmes pages (règle 5 de `CLAUDE.md`).

Ni l'un ni l'autre n'est lancé par `npm test` (plusieurs minutes). Durées mesurées le 22/10/2026 (machine à
2 cœurs partagée avec d'autres tâches) : `npm run controles` ≈ 6 min pour 300 profils ; comparaison de deux copies
≈ 17 min pour 314 profils (14 types + 300 aléatoires).

## Les profils aléatoires (`tests/profils-aleatoires.js`)

Graine fixe (20261022) : les mêmes 300 profils à chaque lancement. Sur 20 profils : 1 vide (rien, quelques réponses
sans notes, ou seulement un lycée), 3 partiels (bulletins sans moyenne générale, avec une virgule, une case
d'espaces ou une note impossible ; questionnaire à moitié rempli ; parfois aucun bulletin), 2 contradictoires
(ingénieur + « le moins de maths possible », médecine sans SVT et études courtes, budget gratuit + écoles de
commerce sélectives, « domicile » + Île-de-France et Lyon seulement…), 14 complets.

- Première et terminale ; moyenne visée de 6 à 19 ; 24 triplettes de spécialités, avec et sans maths ; maths
  expertes (seulement avec la spécialité maths) ou complémentaires (seulement sans).
- Lycées réels de `data/lieux.json`, un département après l'autre : les 105 départements (toutes les académies,
  Corse, outre-mer, Nouvelle-Calédonie, Polynésie, Saint-Martin, Saint-Pierre-et-Miquelon) ; environ 6 % de communes
  à la place d'un lycée ; environ 12 % sans lycée.
- Questionnaire : chaque valeur de chaque question (échelles 1 à 5, choix uniques, choix multiples, budgets,
  mobilités, pays et territoires, « Rien d'autre que ce que j'ai coché ») tirée en tourniquet, plus « je ne sais
  pas » (`nsp`). `node tests/profils-aleatoires.js` affiche la couverture.

Ce sont des profils **plausibles**, pas des élèves réels : leur répartition ne représente pas la population des
lycéens.

## Ce que vérifient les contrôles

Chaque règle est recalculée à partir des données (distance au lycée, zone, taux d'accès, part de bacheliers
généraux…), sans relire les drapeaux que le moteur pose lui-même (`horsDistance`, `horsTerritoire`…) : une erreur
du moteur ne peut pas se cacher derrière son propre drapeau. Sources des règles : `js/moteur.js`
(`REGLES_CATEGORIE`, `reglesHorsListe`, `evaluer`, `wishlist`, `protection`) et `docs/modele-chances.md`.

| Règle | Ce qui est vérifié |
|---|---|
| `voeu_sans_statistiques` | aucun vœu sans taux d'accès publié |
| `voeu_bac_pro` | aucun vœu à moins de 20 % de bacheliers généraux admis, ni de la catégorie « Certificats de spécialisation et FCIL » |
| `securite_sous_50` | aucune formation « sécurité » sous 50 % de taux d'accès (ou sans taux) |
| `securite_hors_distance` | aucune formation « sécurité » au-delà de 45 km (« domicile ») ou 250 km (« proche »), de l'autre côté de la mer, ou à l'étranger |
| `securite_distance_inconnue` | aucune formation « sécurité » sans coordonnées pour « domicile » ou « proche » |
| `securite_hors_territoire` | aucune formation « sécurité » hors de la zone du lycée et des zones cochées dans « pays » |
| `domicile_au_dela_45_km` | élève « domicile » avec lycée : aucun vœu à plus de 45 km (traversée comprise) |
| `dix_voeux` | la liste proposée compte 10 vœux |
| `alerte_moins_de_3_surs` | moins de 3 vœux « sécurité » ⇒ alerte « Pas assez de vœux vraiment sûrs » sur la page |
| `protection_coherente` | le message de protection correspond au nombre de vœux « sécurité » et est affiché |
| `message_moyenne_sous_10` | moyenne sous 10 ⇔ message sur le bac en tête de Ma liste (profil « fragile ») |
| `message_sans_notes` | sans moyenne : « Renseigne tes bulletins », aucune formation « sécurité » (profil « vide ») |
| `message_sans_lycee` | sans lycée ⇔ message « Indique ton lycée… » |
| `pourcentage_personnel` | aucun « tes chances … X % », « X % de chances », fourchette « X–Y % », « probabilité … X % » dans les pages |
| `prepa_scientifique_sans_maths` | aucune prépa scientifique (liste, équivalents, nouvelle formation) sans la spécialité maths |
| `prepa_scientifique_sans_maths_recommandees` | même règle, pour les 10 recommandations affichées |
| `html_nan_undefined_null` | aucun « NaN », « undefined », « null », « [object Object] » dans le texte visible |
| `html_element_vide` | aucun élément de texte visible vide (`p`, `li`, titres, cellules, liens, boutons…) |

Pages lues pour chaque profil : accueil, profil, Ma liste (recommandées), proposition de vœux, Mes vœux après
« Générer une liste équilibrée de 10 vœux », Mon plan, catalogue, Mes données, et la fiche de chacun des vœux retenus.

### Interprétations retenues (la plus stricte à chaque fois)

- **« Sécurité »** est contrôlée sur **toutes** les formations notées (elles affichent leur catégorie sur leur fiche
  et dans le catalogue), pas seulement sur les 10 vœux.
- **Vœu** = liste de 10 **et** formations équivalentes proposées sous chaque vœu (l'élève peut les choisir à la place).
- **Prépa scientifique sans maths** : les maths complémentaires ne comptent pas comme « maths en spécialité ». Le
  moteur, lui, ne bloque une formation que si sa fiche déclare la spécialité maths **obligatoire** : la plupart des
  fiches de CPGE scientifiques Parcoursup la déclarent seulement « conseillée ».
- **Distance inconnue** : seulement pour « domicile » et « proche » avec un lycée (comme `REGLE_DISTANCE_INCONNUE`).
- **10 vœux** : vérifié pour tous les profils, y compris « domicile ». `docs/modele-chances.md` (8.3) assume qu'un élève
  « domicile » peut en avoir moins : le rapport le signale dans le détail (« conséquence assumée ») mais compte la
  violation, pour que le chiffre reste visible.
- **Pourcentage personnel** : un taux d'accès de la formation (« 66 % d'accès ») ou une position (« au-dessus
  d'environ 70 % des admis ») n'est pas un pourcentage personnel ; seuls les motifs du tableau le sont.
- **Élément vide** : un élément qui ne contient qu'une icône, une image ou un champ, ou qui porte `aria-label` ou
  `title`, n'est pas vide.

## Ce que les contrôles NE jugent PAS

- **La pertinence des vœux** : qu'un élève qui aime la biologie reçoive une licence de droit n'est une violation
  d'aucune règle. Seule une relecture humaine (ou des profils types avec des attentes écrites) peut le dire.
- L'exactitude des données (taux, frais, coordonnées) : les contrôles font confiance à `data/`.
- Le rendu visuel (CSS, téléphone), l'accessibilité au-delà des éléments vides, et le code exécuté seulement dans
  un vrai navigateur (lecture des bulletins PDF, copie, impression).
- Les pages ne sont lues qu'avec l'état d'un profil importé (pas toutes les étapes de saisie du profil).

## Date figée

`scripts/verification-site.js` remplace `Date` dans le contexte du site (pas dans Node) : `new Date()` et
`Date.now()` renvoient le 01/10/2026 à midi (la date de `tests/instantane.js`). Les jours restants, le calendrier de
Mon plan, les propositions à l'étranger « bientôt » et la date d'enregistrement ne dépendent donc pas du jour du
lancement. Preuve : comparer `main` à `main` donne 0 différence.

## Comparer deux versions

```
git worktree add --detach ../avant main   # copie de référence (dossier distinct)
node scripts/comparer-versions.js ../avant . --n 300
git worktree remove ../avant
```

Sorties comparées en égalité stricte : `recommander` (chaque formation notée, en entier), `wishlist`, `etranger`,
`nouvelles`, `equivalentsListe`, `protection`, `statsProfil`, et le HTML des pages (accueil, profil, liste,
proposition, liste après génération, plan, catalogue, données, fiche du 1er vœu). Chaque copie est chargée avec son
propre `tests/charger-site.js`, dans son propre fil d'exécution.
