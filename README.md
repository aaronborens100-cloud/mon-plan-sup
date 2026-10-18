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
js/moteur.js          CapEngine : chances d'admission, liste de vœux, propositions à l'étranger
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
  2026 : pas encore de statistiques d'admission ». Pas de catégorie ni de fourchette de chances. Jamais dans la
  liste de 10 vœux (`wishlist`) : `CapEngine.nouvelles(resultats, it, n)` en propose au plus `MAX_NOUVELLES` = 3
  dans une section à part, « Nouvelles à la rentrée 2026 », sous la liste. Tri par intérêt seulement (sans
  chiffres, la faisabilité est artificiellement haute), section vide sans réponse au questionnaire. Seules les
  catégories Parcoursup de `CATEGORIES_NOUVELLES` (licences, CPGE, ingénieurs, commerce, santé, IEP, CMI, DEUST,
  arts) sont proposées : sans statistiques, le filtre sur la part de bacheliers généraux ne peut pas jouer ;
- `sans_stats` : formation qui existait, statistiques non publiées, non retrouvées, ou antérieures à 2024.
  Mention « Statistiques d'admission non publiées : chances impossibles à estimer » (aucune estimation).
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

## Protection de la liste de vœux

Le site n'affiche aucune probabilité globale d'admission pour la liste : les vœux ne sont pas indépendants
(les formations lisent le même dossier) et les chances par formation restent des estimations.
`wishlist()` renvoie à la place `protection = { nbSurs, niveau, message }` (`CapEngine.protection(liste)`,
aussi appelé sur les vœux retenus par l'élève) : `nbSurs` compte les vœux de catégorie « sécurité », `niveau`
vaut `aucun` (0), `insuffisant` (1), `minimum` (2) ou `bon` (3 ou plus). Ma liste affiche le message, suivi
de `PROTECTION_REPERE` (« Aucun site ne peut calculer tes chances exactes d'admission… »).

## Tests

```
npm test
```

Les tests chargent le vrai site dans Node (sans navigateur ni dépendance) et vérifient que,
pour 10 élèves fictifs (`tests/profils.js`), le moteur produit exactement les mêmes
recommandations, la même liste de 10 vœux et les mêmes propositions à l'étranger que les
références de `tests/reference/`. Si un changement de résultats est voulu, régénérer les
références avec `node tests/generer-reference.js` et expliquer le changement dans la PR.

## Avertissement

Mon Plan Sup ne garantit aucune admission. Les chiffres sont indicatifs : vérifier toujours sur
Parcoursup et sur les sites officiels des formations.
