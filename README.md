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
data/                 jeux de données (JSON), chargés au démarrage
vendor/               pdf.js 6.2.108 (Mozilla, licence Apache-2.0), chargé au premier import de bulletin
scripts/              outils (construction de la version tout-en-un)
tests/                tests (à venir)
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
| `generees.json` | fiches complétées par filière pour les formations Parcoursup | calculé |
| `ajustements.json` | taux officiels retenus, fiches remplacées | corrections manuelles |
| `lieux.json` | lycées et communes avec coordonnées | annuaire de l'Éducation nationale, Parcoursup |
| `questionnaire.json` | les 31 questions et leurs poids par domaine | éditorial |
| `metiers.json`, `poursuites.json`, `extrascolaire.json` | métiers, poursuites d'études, engagements | sources citées |

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

Le fichier `dist/index.html` (≈ 13,6 Mo) intègre le CSS, les scripts, les données et pdf.js.
Le dossier `dist/` n'est pas versionné.

## Avertissement

Mon Plan Sup ne garantit aucune admission. Les chiffres sont indicatifs : vérifier toujours sur
Parcoursup et sur les sites officiels des formations.
