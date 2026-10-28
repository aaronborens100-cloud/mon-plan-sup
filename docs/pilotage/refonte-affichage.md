# Refonte de l'affichage — cahier des charges (demandes d'Aaron du 28/10/2026)

**À lancer après la chaîne A2→G et la PR K (séparation calcul / affichage).** Pas avant : ces demandes
touchent `js/app.js` et `index.html`, que les PR B, F et G modifient aussi, et les tests de référence
comparent le rendu des pages (conflits et références à régénérer).

## Demandes, triées
**Lot 1 — style (CSS + logo), peu risqué**
- Esthétique sobre, fond blanc, site clair, peu d'informations par écran, visuel et rassurant.
- Palette : blanc + jaune orangé (logo et accents). Définir des variables CSS (`:root`) d'abord.
- Nouveau logo : plus rassurant, visuel, aux couleurs du site. Original (SVG dessiné pour le projet).

**Lot 2 — structure (app.js, index.html)**
- Version ordinateur : bandeau de navigation en haut. Quatre vues : Profil · Catalogue · Ma liste · Mon plan.
- Création du profil : regrouper dans un seul bloc les options Terminale, Maths Expertes,
  Maths Complémentaires, Droit et grands enjeux du monde contemporain, DNL.
- Valoriser « ta liste en 5 minutes » (accueil + profil).
- Compteurs : ne plus citer « 8 000 / 10 000 / 11 000 fiches ». Afficher seulement **10 198 formations**
  dont **519 à l'étranger** — chiffres **calculés depuis les données**, jamais écrits en dur (règle 2),
  et à recompter avant la mise en ligne.

**Lot 3 — contenu (à valider par Aaron, exactitude à vérifier)**
- Principe (Aaron, 28/10) : en 10 secondes, l'élève voit **les prérequis**, **où il en est par rapport à eux** (ce qui lui manque, à combler) et **les débouchés**. Les trois blocs ci-dessous servent cette phrase ; « Ton profil » = écart personnalisé élève / prérequis (s'appuie sur les points bloquants déjà calculés par le moteur), pas une description générale.
- Fiche formation en 3 blocs courts : 1 Prérequis · 2 Ton profil · 3 Poursuite d'études et métiers.
  Poursuite d'études sélective : ex. prépa ECG → quelques écoles représentatives, pas tous les PGE.
  Sources possibles déjà dans le dépôt : `data/poursuites.json`, `data/metiers.json` (à auditer :
  exactitude, date, source de chaque ligne).
- FAQ réécrite, plus claire, informations à jour (chaque réponse factuelle avec sa source).

## Inspiration
Aaron cite prepral.com comme modèle. Le site refuse l'accès aux robots : le DG ne l'a pas lu. Aaron
décrit en quelques lignes ce qu'il aime (organisation, ton, éléments) ; on s'inspire de l'organisation,
on ne reprend ni textes, ni images, ni identité visuelle.

## Ordre proposé
K → Lot 1 (un seul PR) → Lot 2 (profil, puis bandeau + vues) → Lot 3 (fiche, puis FAQ), une PR par
sujet, validation visuelle d'Aaron à chaque étape (captures d'écran fournies avec la PR).
