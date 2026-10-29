# Mon Plan Sup : règles du projet

Site d'aide à l'orientation post-bac pour lycéens de première et de terminale.
Voir `README.md` pour l'organisation des fichiers et le lancement en local.

## Règles

1. **Site en français, pour des lycéens.** Tous les textes affichés sont en français, clairs et
   accessibles à un élève de 16-18 ans (tutoiement, comme le reste du site). Le code et ses
   commentaires sont aussi en français.
2. **Données officielles uniquement.** Les formations françaises viennent de la base officielle
   Parcoursup (open data du ministère de l'Enseignement supérieur), sans fusion avec des fiches
   maison ni fiches inventées. Toute donnée ajoutée cite sa source (URL, date de consultation).
   Ne jamais compléter un chiffre manquant par une estimation présentée comme un fait.
3. **Aucune donnée personnelle hors du navigateur.** Profil, notes, bulletins et réponses restent
   dans le navigateur de l'élève (`localStorage`). Pas d'envoi vers un serveur, pas d'analytics,
   pas de service tiers qui reçoit des données de l'élève. Les bulletins PDF sont lus localement
   par pdf.js (`vendor/`).
4. **Une tâche par session.** Chaque session traite une seule tâche, sur sa propre branche et sa
   propre pull request. Ce qui est repéré au passage est signalé, pas corrigé dans la même PR.
5. **Les résultats du questionnaire doivent rester identiques.** Avant de proposer une modification,
   vérifier que les recommandations, la liste de 10 vœux et les propositions à l'étranger
   (`CapEngine.recommander`, `wishlist`, `etranger`) sont identiques avant et après, sur un jeu de
   profils et de réponses fixes. Si un changement de résultats est voulu (nouvelle règle, nouvelles
   données), le dire explicitement dans la PR, avec des exemples avant / après.

## État actuel à connaître

- Calcul et affichage sont séparés : `js/catalogue.js` construit le catalogue (`construireCatalogue`, sans HTML ni
  `document`) ; `js/app.js` ne fait que dessiner.
- La règle 2 n'est qu'en partie appliquée. Les fiches maison françaises sans lien certain avec Parcoursup ont été
  retirées (PR H, #76) ; leurs identifiants restent valides (redirection vers la formation Parcoursup, sinon vœu
  retiré avec un message). Il reste dans `data/formations.json` 1 345 fiches : 826 en France (811 fusionnées avec
  Parcoursup + 15 prépas ECG « modèles » de `data/ajustements.json`) et 519 à l'étranger (non concernées).
  Leur retrait (PR I2) attend une décision d'Aaron : il change 88 listes de 10 vœux sur 114 profils.
- `data/anciennes-fiches.json` (ex-`fusion.json`, renommé dans I1, #77) relie ces fiches à Parcoursup et définit
  le périmètre affiché (BTS et BUT masqués). Ne pas le supprimer sans une tâche dédiée.
- `data/attendus-filieres.json` : attendus nationaux officiels (45 mentions de licence, PACES, 18 CPGE), recopiés mot
  pour mot depuis `docs/releves/`. Texte de l'État appliqué tel quel (décision d'Aaron du 29/10/2026) : au chargement,
  `js/catalogue.js` en tire les spécialités conseillées (jamais obligatoires) des fiches Parcoursup générées des codes nmc couverts (`applique: true`), par la table discipline → spécialité de `meta`.
- Les autres formations Parcoursup du périmètre sont notées grâce à `data/filieres.json` (une entrée
  par code `nmc`), table **figée** (estimation par filière, tirée des anciennes fiches Mon Plan Sup) :
  `scripts/construire-filieres.py` refuse de tourner. `data/generees.json` n'est plus
  chargé par le site mais reste la source des 87 familles reprises dans la table.
- Pour les fiches générées (`psup-*`), le type de formation et l'option ECG (appro / appli) sont lus dans Parcoursup
  (table `TYPES_PS` de `js/catalogue.js`, catégorie + intitulé) ; sans règle, le type de `data/filieres.json` est gardé
  (`__gen.typeSansRegle`).
- La solution de secours de `js/bulletin.js` charge pdf.js 3.11.174 depuis cdnjs si `vendor/` est
  absent, alors que la version fournie est la 6.2.108.

## Vérifier une modification

- Lancer le site : `python3 -m http.server 8000` à la racine, puis http://localhost:8000.
- Version tout-en-un : `python3 scripts/build-standalone.py` (sortie dans `dist/`, non versionné).
  Si un fichier est ajouté ou retiré dans `data/`, mettre à jour la liste `DONNEES` du script.
- Tests de non-régression (règle 5) : `npm test` (Node 20 ou plus, aucune dépendance à installer).
  Ils chargent le vrai site dans Node et comparent, pour 14 profils types (`tests/profils.js`),
  les recommandations, la liste de 10 vœux et les propositions à l'étranger aux références
  enregistrées dans `tests/reference/`. Lancer `npm test` avant et après chaque modification.
- Changement de résultats voulu : `node tests/generer-reference.js <profil>` (ou sans argument
  pour tous), puis montrer les différences avant / après dans la PR (`git diff tests/reference/`).
  Ne jamais régénérer une référence pour faire passer un test qu'on ne comprend pas.

## Pilotage (Claude Code)

- **Personne d'autre qu'Aaron ne fusionne une PR**, ni ne pousse sur `main`.
- Session principale = DG (vice-président + directeur technique) : au démarrage, `/demarrer`
  (lit `docs/pilotage/passation.md`, source unique de pilotage). Le DG ne code pas le site : il
  prépare les consignes (`/consigne`), lance l'agent `codeur`, vérifie (`/verifier-pr`), rend compte.
- Agent `codeur` : suit sa consigne et rien d'autre ; ne lit pas `docs/pilotage/`.
