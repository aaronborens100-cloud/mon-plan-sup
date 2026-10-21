# Mon Plan Sup

Outil d'aide à l'orientation post-bac pour les élèves de première et de terminale.
L'élève remplit son profil (notes, spécialités, bulletins PDF) et un questionnaire ;
le site lui propose une liste équilibrée de 10 vœux Parcoursup (ambitieux, réalistes, sécurité),
des pistes à l'étranger et un plan (calendrier, engagement extrascolaire).

Tout fonctionne dans le navigateur : aucune donnée personnelle n'est envoyée sur un serveur.

## Organisation

```
index.html            squelette de la page (en-tête, FAQ, pied de page)
css/styles.css        styles
js/store.js           CapStore : enregistrement local (localStorage, clé « capsup.v1 »)
js/bulletin.js        CapBulletin : lecture des bulletins PDF dans le navigateur
js/moteur.js          CapEngine : repères d'admission et catégories, liste de vœux, étranger
js/app.js             navigation et vues (accueil, profil, questionnaire, ma liste, fiche, catalogue, plan, données)
data/                 jeux de données (JSON), chargés à la demande (voir « Chargement des données »)
vendor/               pdf.js 6.2.108 (Mozilla, licence Apache-2.0, voir vendor/README.md), chargé au premier import de bulletin
scripts/              outils (version tout-en-un, construction de la table des filières)
tests/                tests de non-régression du moteur (npm test)
```

Les scripts de `js/` sont des scripts classiques, chargés dans cet ordre ; chacun expose son module
sur `window` (`CapStore`, `CapBulletin`, `CapEngine`), utilisé par `app.js`.

### Données

| Fichier | Contenu | Source |
|---|---|---|
| `formations.json` | fiches détaillées (France et étranger) | relevés éditoriaux, sources citées dans chaque fiche |
| `parcoursup.json` | cartographie des formations 2026 (format compact : chaînes indexées dans `s`) | open data MESR |
| `stats.json` | vœux, admis, mentions, types de bac (session 2025) | open data MESR (fr-esr-parcoursup) |
| `statuts-stats.json` | statut des formations du périmètre sans statistiques 2025 : `nouvelle_2026` ou `sans_stats`, avec sa certitude (et, si retrouvées, les statistiques d'une session antérieure) | calculé par `scripts/construire-statuts-stats.py` (code gta, sessions antérieures fr-esr-parcoursup) |
| `stats-manuelles.json` | statistiques d'admission relevées à la main pour des formations sans statistiques 2025 (taux, places, vœux, admis, session, source, date de consultation) | relevés manuels, source citée dans chaque entrée |
| `fusion.json` | correspondances entre `formations.json` et Parcoursup, périmètre affiché | calculé |
| `filieres.json` | une entrée par filière Parcoursup (code `nmc`) du périmètre : profil, domaines, spécialités, métiers… utilisés pour noter toutes les formations Parcoursup | éditorial, construit par `scripts/construire-filieres.py` (familles de `generees.json` + déductions à partir des intitulés officiels, corrections dans `scripts/filieres-corrections.json`) |
| `generees.json` | familles par filière tirées des fiches Mon Plan Sup (plus chargé par le site : source des familles reprises dans `filieres.json`) | calculé |
| `ajustements.json` | taux officiels retenus, fiches remplacées | corrections manuelles |
| `lieux.json` | lycées et communes avec coordonnées | annuaire de l'Éducation nationale, Parcoursup |
| `questionnaire.json` | les 31 questions et leurs poids par domaine | éditorial |
| `metiers.json`, `poursuites.json`, `extrascolaire.json` | métiers, poursuites d'études, engagements | sources citées |

### Chargement des données

Pour que la page s'ouvre vite sur téléphone, `js/app.js` ne charge pas tout au démarrage :

- au démarrage : `questionnaire.json`, `metiers.json`, `poursuites.json`, `extrascolaire.json` (≈ 90 Ko) ;
- quand l'élève cherche son lycée : `lieux.json` ;
- pour les pages qui affichent des formations (Ma liste, Mon plan, Catalogue, fiches, résumé du profil,
  Mes données) : `formations.json`, `parcoursup.json`, `stats.json`, `statuts-stats.json`, `stats-manuelles.json`,
  `fusion.json`, `filieres.json`, `ajustements.json` et `lieux.json`. L'accueil lance aussi ce chargement en arrière-plan pour afficher
  ses chiffres.

Si l'attente dépasse une seconde, un message « Chargement des formations… » s'affiche.

## Lancer le site en local

Les données sont chargées avec `fetch`, ce qui ne fonctionne pas en ouvrant `index.html`
directement depuis le disque. Lancer un petit serveur à la racine du dépôt :

```
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000.

## Version tout-en-un

Pour publier le site en un seul fichier (artefact Claude, ou fichier à ouvrir sans serveur) :

```
python3 scripts/build-standalone.py
```

Le fichier `dist/index.html` (≈ 14,4 Mo) intègre le CSS, les scripts, les données et pdf.js.
Le dossier `dist/` n'est pas versionné.

## Table des filières

Chaque formation Parcoursup du périmètre (hors fiches déjà fusionnées avec `formations.json`) reçoit une
fiche que le moteur peut noter : chiffres officiels de la formation (`stats.json`, session 2025) et attributs
éditoriaux de sa filière (`filieres.json`). Pour reconstruire la table :

```
python3 scripts/construire-filieres.py
```

Ne pas modifier `data/filieres.json` à la main : les corrections vont dans `scripts/filieres-corrections.json`.

Toutes ces formations sont notées, mais la liste de 10 vœux (et les ancres des propositions à l'étranger)
n'en retient que les plus sûres (`reglesHorsListe` dans `js/moteur.js`) : il faut un taux d'accès 2025 publié
(ou un relevé manuel sourcé ; cas des nouvelles formations 2026 : voir plus bas),
une filière marquée `valide` dans `filieres.json` (faux par défaut en confiance « basse », à passer à vrai dans
`scripts/filieres-corrections.json` après relecture), et une formation qui accueille des bacheliers généraux
(au moins `SEUIL_BAC_GENERAL` = 20 % des admis 2025, hors certificats de spécialisation et FCIL).
Les formations écartées restent dans le catalogue et sur leur fiche.

## Formations sans statistiques 2025

Les formations du périmètre absentes de `stats.json` ont un statut (`data/statuts-stats.json`) :

- `nouvelle_2026` : formation qui n'a jamais eu de session Parcoursup. Mention « Nouvelle formation à la rentrée
  2026 : pas encore de statistiques d'admission ». Pas de catégorie ni de repère d'admission. Jamais dans la
  liste de 10 vœux (`wishlist`) : `CapEngine.nouvelles(resultats, it, n)` en propose au plus `MAX_NOUVELLES` = 3
  dans une section à part, « Nouvelles à la rentrée 2026 », sous la liste. Tri par intérêt seulement (sans
  chiffres, la faisabilité est artificiellement haute), section vide sans réponse au questionnaire. Seules les
  catégories Parcoursup de `CATEGORIES_NOUVELLES` (licences, CPGE, ingénieurs, commerce, santé, IEP, CMI, DEUST,
  arts) sont proposées : sans statistiques, le filtre sur la part de bacheliers généraux ne peut pas jouer ;
- `sans_stats` : formation qui existait, statistiques non publiées, non retrouvées, ou antérieures à 2024.
  Mention « Statistiques d'admission non publiées : aucun repère d'admission » (aucune estimation).
  Hors des listes de vœux tant qu'il n'y a pas de chiffres sourcés.

Des statistiques officielles de la session 2024 (retrouvées par le script avec `--historique`) rendent la
formation éligible, comme des statistiques 2025 : statut `avec_stats`, fiche « statistiques de la session 2024 »
avec source et date. Plus anciennes, elles sont seulement affichées pour information.

Un relevé ajouté dans `data/stats-manuelles.json` (taux, places, vœux, admis, session, source, date de
consultation, `"statut": "releve_manuel"`) est traité comme une statistique normale, avec sa source sur la fiche :
la formation passe en `avec_stats` et peut entrer dans les listes. Après chaque ajout :

```
python3 scripts/construire-statuts-stats.py
```

Le script refuse toute entrée sans source, sans date ou mal formée, puis régénère `data/statuts-stats.json`
et `docs/formations-sans-stats.csv` (formations `sans_stats` encore à relever, séparateur « ; », triées par
priorité : 1 licences, santé, ingénieurs, commerce, IEP, CPGE ; 2 travail social, DCG, DEUST, arts ;
3 le reste ; avec le lien vers la fiche Parcoursup et des colonnes vides au format de `stats-manuelles.json`).

Sans accès aux sessions antérieures, le statut est déduit du code gta (certitude `probable`) : un code plus
grand que le plus grand code de `stats.json` désigne très probablement une formation créée pour 2026.
Pour vérifier dans les fichiers officiels, télécharger les exports CSV de fr-esr-parcoursup de chaque session
dans un dossier, puis lancer `python3 scripts/construire-statuts-stats.py --historique DOSSIER --consulte-le AAAA-MM-JJ`
(le script compare aussi `stats.json` au fichier 2025 complet).

## Moyennes du profil

`CapEngine.statsProfil(profil)` (détails : `docs/modele-chances.md`, « Comment on calcule ta moyenne ») :
moyenne générale = moyenne simple des moyennes générales des bulletins de première et de terminale, chaque
période avec le même poids (`POIDS_PERIODE`), sans coefficient. Une période sans moyenne générale n'est pas
comptée ni reconstituée (`periodesSansMoyenne`, message `MESSAGE_SANS_MOYENNE`) ; l'import PDF suit la même règle.
La moyenne du dernier bulletin est gardée à part (`dernierBulletin`) et ne sert à aucun calcul. Maths
(`maths`, ou maths complémentaires sans la spécialité : `mathsMatiere`) et maths expertes (`expertes`) sont deux
moyennes séparées, chacune avec ses périodes. Une case vide ou faite d'espaces est absente (jamais 0) ; une note hors
de [`NOTE_MIN` ; `NOTE_MAX`] (0 à 20) n'est pas comptée et le profil la signale (`MESSAGE_NOTE_IMPOSSIBLE`). Les maths
complémentaires ne sont jamais comparées au repère de maths d'une formation, donné pour la spécialité
(`MESSAGE_MATHS_COMPL`). Critère « spécialités » des formations qui demandent l'option maths
expertes : note sous `SEUIL_EXPERTES_FAIBLE` (10) → « à renforcer », à partir de `SEUIL_EXPERTES_FORT` (14) →
« atout fort » (seuils éditoriaux). Aucune prédiction : seule `MARGE_BULLETIN` corrige la moyenne, dans `repere()`.

## Catégories ambitieux / réaliste / sécurité

Le modèle est décrit dans `docs/modele-chances.md`. Le site n'affiche aucun pourcentage de chances : aucune
donnée publique ne le permet (les statistiques décrivent les admis, pas les refusés). `CapEngine.repere(f, s)`
renvoie le taux d'accès officiel de la formation (session, source) et la position de l'élève parmi les admis 2025
(`percentileAdmis` sur la moyenne moins `MARGE_BULLETIN` = 0,5 point ; « au-dessus » à partir de 60 %, « en
dessous » sous 30 %). La catégorie vient de la table `REGLES_CATEGORIE` (première règle vérifiée) : sécurité =
taux ≥ 50 % et position « au-dessus », ou taux ≥ `SEUIL_TAUX_TRES_OUVERT` (85 %) et position « moyenne » ou
« au-dessus », sans point bloquant ; ambitieux = taux < 20 %, position « en dessous » (sauf taux ≥ 85 % : réaliste)
ou point bloquant ; réaliste = le reste. Moyenne sous 10 : message sur le bac en tête de Ma liste (`alerteBac`),
sans effet sur les catégories. Sans notes, jamais « sécurité » (taux ≥ 50 % → réaliste, sinon ambitieux).

## Académie, distance et départage

Détails et sources : `docs/modele-chances.md`, section 8. L'académie du lycée et de chaque formation vient du
département (`data/lieux.json`, `data/parcoursup.json`, table `ACADEMIES` sourcée sur education.gouv.fr). La note
garde ses décimales ; à note égale, `departage()` classe : académie de l'élève, distance, taux d'accès, part de
bacheliers généraux, places, code Parcoursup (jamais l'ordre du catalogue). La distance donne une pénalité continue
(`PENALITE_DISTANCE`) selon la mobilité choisie ; Corse et outre-mer comptent comme loin pour un élève du continent ;
les campus à l'étranger enregistrés « France » sont traités comme étrangers. Au-delà de la distance acceptée
(`DISTANCE_ACCEPTEE_KM` : 45 km, 250 km, aucune limite), un vœu n'est jamais « sécurité » ; pour « domicile », une
formation à plus de 45 km est exclue. Licences non sélectives du secteur de l'élève : règle `licence_secteur`.
Corse, outre-mer et continent : en dehors de la zone de son lycée, seules les zones cochées dans « Si tu partais,
où ? » (question « pays ») peuvent être « sécurité » (`REGLE_HORS_TERRITOIRE`, docs/modele-chances.md 8.5). Sans lycée, les règles de distance et d'académie ne s'appliquent pas et
Ma liste affiche `MESSAGE_SANS_LYCEE`.

## Protection de la liste de vœux

Le site n'affiche aucune probabilité globale d'admission pour la liste : les vœux ne sont pas indépendants
(les formations lisent le même dossier). `wishlist()` renvoie `protection = { nbSecurite, niveau, message }`
(`CapEngine.protection(liste)`, aussi appelé sur les vœux retenus par l'élève). Avec la table des catégories, un
vœu « sécurité » est solide par construction : on compte les vœux « sécurité ». `niveau` vaut `sans_notes`
(élève sans notes), `aucun` (0 vœu « sécurité »), `insuffisant` (1), `minimum` (2) ou `bon` (3 ou plus). Ma liste
affiche le message, suivi de `PROTECTION_REPERE` (« Aucun site ne peut calculer tes chances exactes d'admission… »).

## Tests

```
npm test
```

Les tests chargent le vrai site dans Node (sans navigateur ni dépendance) et vérifient que,
pour 14 élèves fictifs (`tests/profils.js`), le moteur produit exactement les mêmes
recommandations, la même liste de 10 vœux et les mêmes propositions à l'étranger que les
références de `tests/reference/`. Si un changement de résultats est voulu, régénérer les
références avec `node tests/generer-reference.js` et expliquer le changement dans la PR.
`tests/moyennes.test.js` vérifie le calcul des moyennes du profil (moyenne simple des périodes, aucune
reconstitution ni coefficient, maths et maths expertes séparées, seuils 10 et 14) et que l'import d'un
bulletin PDF donne la même moyenne que la saisie manuelle.

## Avertissement

Mon Plan Sup ne garantit aucune admission. Les chiffres sont indicatifs : vérifier toujours sur
Parcoursup et sur les sites officiels des formations.
