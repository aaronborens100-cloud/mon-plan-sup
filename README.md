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
  Mes données) : `formations.json`, `parcoursup.json`, `stats.json`, `fusion.json`, `filieres.json`,
  `ajustements.json` et `lieux.json`. L'accueil lance aussi ce chargement en arrière-plan pour afficher
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

Le fichier `dist/index.html` (≈ 14,3 Mo) intègre le CSS, les scripts, les données et pdf.js.
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
n'en retient que les plus sûres (`reglesHorsListe` dans `js/moteur.js`) : il faut un taux d'accès 2025 publié,
une filière marquée `valide` dans `filieres.json` (faux par défaut en confiance « basse », à passer à vrai dans
`scripts/filieres-corrections.json` après relecture), et une formation qui accueille des bacheliers généraux
(au moins `SEUIL_BAC_GENERAL` = 20 % des admis 2025, hors certificats de spécialisation et FCIL).
Les formations écartées restent dans le catalogue et sur leur fiche.

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
