# Fiches maison suspectes

Ce rapport est généré par `node scripts/fiches-suspectes.js`. Il ne change rien au site : il repère seulement les fiches Mon Plan Sup (fusionnées avec Parcoursup, en France) dont les estimations maison contredisent les données officielles. Un signal n'est pas une preuve d'erreur : c'est un endroit où regarder en premier.

## Les trois signaux

1. **Type** : Le type de formation de la fiche n'est pas celui indiqué par Parcoursup.
2. **Spécialités** : Les spécialités de la fiche ne correspondent pas aux attendus officiels (une spécialité obligatoire ou recommandée de la fiche n'est pas conseillée par l'État, ou une spécialité conseillée par l'État manque). Seules les formations dont les attendus nationaux sont connus sont contrôlées.
3. **Moyenne** : La moyenne visée est très éloignée de celle des admis d'après Parcoursup (écart d'au moins 1,5 points, estimation tirée des mentions des admis).

## Totaux

809 fiches contrôlées.

| Signal | Fiches concernées |
|---|---|
| Type différent de Parcoursup | 4 |
| Spécialités contraires aux attendus officiels | 487 |
| Moyenne visée éloignée de celle des admis | 116 |

| Score (nombre de signaux) | Fiches |
|---|---|
| 0 | 261 |
| 1 | 490 |
| 2 | 57 |
| 3 | 1 |

## Les 20 fiches les plus suspectes

| Rang | Identifiant | Nom | Établissement | Signaux | Parcoursup |
|---|---|---|---|---|---|
| 1 | double-diplome-licence-physique-chimie-universite-paris-saclay-orsay | Double diplôme Licence Physique, chimie | Université Paris-Saclay | type « double_licence » sur la fiche, « licence » d'après Parcoursup ; spécialités conseillées par l'État absentes de la fiche : physique_chimie ; moyenne visée 14.5 sur la fiche, 16 chez les admis (écart de 1,5 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=28888&typeBac=0&originePc=0) |
| 2 | u-paris-est-creteil-informatique | Licence Informatique | Université Paris-Est Créteil | spécialités de la fiche que l'État ne conseille pas : NSI ; moyenne visée 16.5 sur la fiche, 12.4 chez les admis (écart de 4,1 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=23855&typeBac=0&originePc=0) |
| 3 | double-diplome-licence-droit-licence-informatique-universite-paris-saclay-evry-courcouronnes | Double diplôme Licence Droit / Licence Informatique | Université Paris-Saclay | type « double_licence » sur la fiche, « licence » d'après Parcoursup ; moyenne visée 16.5 sur la fiche, 13 chez les admis (écart de 3,5 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=28912&typeBac=0&originePc=0) |
| 4 | double-diplome-licence-informatique-licence-sciences-de-la-vie-universite-paris-saclay-evry-courcouronnes | Double diplôme Licence Informatique / Licence Sciences de la vie | Université Paris-Saclay | type « double_licence » sur la fiche, « licence » d'après Parcoursup ; moyenne visée 15.5 sur la fiche, 12.2 chez les admis (écart de 3,3 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=28930&typeBac=0&originePc=0) |
| 5 | u-sorbonne-paris-nord-informatique | Licence Informatique | Université Sorbonne Paris Nord | spécialités de la fiche que l'État ne conseille pas : NSI ; moyenne visée 15.5 sur la fiche, 12.4 chez les admis (écart de 3,1 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11251&typeBac=0&originePc=0) |
| 6 | u-paris-est-creteil-creteil-licence-droit-parcours-carrieres-publiques | Licence Droit – parcours Carrières publiques | Université Paris-Est Créteil | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 16.5 sur la fiche, 13.7 chez les admis (écart de 2,8 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11489&typeBac=0&originePc=0) |
| 7 | u-sorbonne-paris-nord-psychologie | Licence Psychologie | Université Sorbonne Paris Nord | spécialités conseillées par l'État absentes de la fiche : physique_chimie, LLCER_anglais, LLCER_autre ; moyenne visée 15.5 sur la fiche, 12.7 chez les admis (écart de 2,8 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11256&typeBac=0&originePc=0) |
| 8 | u-de-lorraine-metz-double-licence-droit-gestion | Double licence Droit / Gestion | Université de Lorraine | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 15.5 sur la fiche, 12.8 chez les admis (écart de 2,7 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=42964&typeBac=0&originePc=0) |
| 9 | u-paris-1-pantheon-sorbonne-paris-licence-droit-parcours-droits-francais-et-allemand | Licence Droit – parcours Droits français et allemand | Université Paris 1 Panthéon-Sorbonne | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 13.5 sur la fiche, 16.2 chez les admis (écart de 2,7 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=9202&typeBac=0&originePc=0) |
| 10 | u-sorbonne-paris-nord-villetaneuse-double-licence-droit-economie-et-gestion | Double licence Droit / Économie et gestion | Université Sorbonne Paris Nord | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 16.5 sur la fiche, 13.8 chez les admis (écart de 2,7 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=28365&typeBac=0&originePc=0) |
| 11 | u-sorbonne-paris-nord-economie-et-gestion | Licence Économie et gestion | Université Sorbonne Paris Nord | spécialités de la fiche que l'État ne conseille pas : SES ; moyenne visée 14.5 sur la fiche, 12 chez les admis (écart de 2,5 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11244&typeBac=0&originePc=0) |
| 12 | u-evry-paris-saclay-aes | Licence Administration économique et sociale (AES) | Université Évry Paris-Saclay | spécialités de la fiche que l'État ne conseille pas : SES, HGGSP ; spécialités conseillées par l'État absentes de la fiche : maths ; moyenne visée 14.5 sur la fiche, 12.2 chez les admis (écart de 2,3 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=10944&typeBac=0&originePc=0) |
| 13 | u-sorbonne-paris-nord-aes | Licence Administration économique et sociale (AES) | Université Sorbonne Paris Nord | spécialités de la fiche que l'État ne conseille pas : SES, HGGSP ; spécialités conseillées par l'État absentes de la fiche : maths ; moyenne visée 14.5 sur la fiche, 12.2 chez les admis (écart de 2,3 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11245&typeBac=0&originePc=0) |
| 14 | ices-institut-catholique-de-vendee-la-roche-sur-yon-double-licence-science-politique-llcer | Double licence Science politique / LLCER anglais | ICES – Institut catholique de Vendée | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 12.5 sur la fiche, 14.7 chez les admis (écart de 2,2 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=19378&typeBac=0&originePc=0) |
| 15 | u-paris-1-pantheon-sorbonne-paris-double-licence-droit-histoire-de-l-art-et-archeologie | Double licence Droit / Histoire de l'art et archéologie | Université Paris 1 Panthéon-Sorbonne | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 14.5 sur la fiche, 16.7 chez les admis (écart de 2,2 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=9199&typeBac=0&originePc=0) |
| 16 | u-paris-nanterre-sociologie | Licence Sociologie | Université Paris Nanterre | spécialités de la fiche que l'État ne conseille pas : SES, HGGSP ; spécialités conseillées par l'État absentes de la fiche : LLCER_anglais, LLCER_autre ; moyenne visée 14.5 sur la fiche, 12.3 chez les admis (écart de 2,2 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11088&typeBac=0&originePc=0) |
| 17 | u-sorbonne-paris-nord-staps | Licence STAPS | Université Sorbonne Paris Nord | spécialités de la fiche que l'État ne conseille pas : SVT, EPPCS ; moyenne visée 14.5 sur la fiche, 12.3 chez les admis (écart de 2,2 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11267&typeBac=0&originePc=0) |
| 18 | double-licence-histoire-gestion-universite-paris-1-pantheon-sorbonne-paris | Double licence Histoire / Gestion | Université Paris 1 Panthéon-Sorbonne | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; spécialités conseillées par l'État absentes de la fiche : LLCER_anglais, LLCER_autre ; moyenne visée 16.5 sur la fiche, 14.4 chez les admis (écart de 2,1 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=48192&typeBac=0&originePc=0) |
| 19 | u-de-strasbourg-strasbourg-licence-droit-parcours-droits-europeens | Licence Droit – parcours Droits européens | Université de Strasbourg | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 13.5 sur la fiche, 15.6 chez les admis (écart de 2,1 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=21547&typeBac=0&originePc=0) |
| 20 | u-sorbonne-paris-nord-villetaneuse-licence-droit | Licence Droit | Université Sorbonne Paris Nord | spécialités de la fiche que l'État ne conseille pas : HGGSP, SES, HLP ; moyenne visée 14.5 sur la fiche, 12.4 chez les admis (écart de 2,1 points) | [fiche](https://dossierappel.parcoursup.fr/Candidats/public/fiches/afficherFicheFormation?g_ta_cod=11247&typeBac=0&originePc=0) |

