# Passation + feuille de route — Mon Plan Sup

**Source unique de pilotage.** Remplace `claude/passation-2026-10-27.md` du Projet claude.ai
(dernière version tenue là-bas : 27/10/2026). Ce fichier se met à jour **par PR**, comme le code.
Pour la PR « fiches maison » (H), le § 7.2 de `passation-moteur-2026-10-22-soir.md` (Projet claude.ai)
reste la référence : Aaron le colle dans la consigne si besoin.

## 1. Règle n° 1 : économie de tokens (décision d'Aaron)
- Session principale (DG) en **Sonnet** (`.claude/settings.json`). `/model opus` seulement pour une
  vérification délicate, puis retour à Sonnet.
- **Un seul agent à la fois** : l'agent `codeur` (`.claude/agents/codeur.md`, Sonnet, worktree isolé).
- Consigne d'agent ≤ 25 lignes, préparée avec `/consigne <lettre>` : fichiers autorisés exacts,
  décisions à respecter, mesures, « réponse finale 10 lignes max ». L'agent lit l'issue et seulement
  les passages utiles du code.
- Vérification avec `/verifier-pr <branche>` (script `scripts/verifier-pr.sh`) : jamais de lecture
  de gros fichiers, seulement des résumés.
- Ne jamais lire les transcriptions des agents. Comptes rendus ≤ 10 lignes. Questions à Aaron
  groupées, avec l'outil de choix.
- Limite d'usage atteinte : relancer l'agent après la réinitialisation ; s'il a du travail non
  poussé, le committer sur sa branche (« travail en cours ») et pousser.
- `/compact` entre deux PR ; `/clear` + `/demarrer` si la conversation devient longue.

## 2. Rôles
Aaron décide de tout et **fusionne seul**. Claude = DG (vice-président + directeur technique) :
challenge (faiblesses d'abord, question dérangeante, alternative concrète, priorité n° 1 en fin
de réponse), consignes, vérification, comptes rendus, feuille de route. Claude ne fusionne jamais
(règles `deny` dans `.claude/settings.json`), ne code pas lui-même le site, ne touche ni Vercel ni
GitHub Pages. En-tête obligatoire de chaque consigne : « Le déploiement Vercel est volontairement
bloqué : ne le signale pas et ne t'en occupe pas. Vérifie le rendu en local (python3 -m http.server)
uniquement. »

## 3. Fait depuis le 22/10
Fusionnées : #59 (outil de comparaison + `npm run controles` sur 300 profils fictifs, graine fixe),
#56 (« Faisabilité : pas de chiffres officiels » au taux inconnu ; « NaN % » corrigé), #53 + #61
(formation sans coordonnées exclue pour « domicile » et « proche » avec lycée), #62
(MPSI/PCSI/PTSI/MP2I : exclues sans maths ; point bloquant avec maths complémentaires seules),
#63 (A, relevé des frais), #66 (A2, « selon les revenus »), #67 (B, sans lycée), puis le 28/10
la chaîne #68 (C), #70 (D), #71 (E), #72 (F), #73 (G) (#74 « Chaîne complète », même tête).
`main` = 7ca7f2f : 452/452 tests. Contrôles (300 profils) : seule violation = `dix_voeux`
(28 profils « domicile » à moins de 10 vœux : conséquence voulue de « jamais de vœu hors rayon »,
désormais expliquée par le message de F ; contrôle à adapter, voir § 5).
Le 28/10 (soir) : #76 (H), #77 (I1), #78 (K). Diagnostic de I2 : aucun écart de traitement dans le code
(fiches complètes remises : 1 liste / 114 changée) ; les listes changent à cause du contenu éditorial
(notes / admission / profil / spécialités : 85 ; coût, charge, dossier : 47 ; type : 41 ; intitulé, matières : 18).
Le 29/10 : #79 (doc), #80 (I2a : type et option ECG lus dans Parcoursup, sans les doubles licences), #81 + #83
(attendus nationaux de l'État appliqués tel quel), #82 (L, mémoire de comparer-versions.js). `main` = 031cb99 : 481/481.
I2 abandonnée : #84 (100 % Parcoursup) + R (profil ajusté par les statistiques, branche
`claude/magical-thompson-7gac3h-r`, sans PR) ne rétablissent pas la qualité (cohérence spécialités 56,2 % → 54,2 % ;
INSA Toulouse, MPSI Jean-Perrin, INSA CVL toujours hors de la liste de sciences-ingenieur). #84 fermée.
Ouvertes le 29/10 : #86 (règle 2 reformulée dans CLAUDE.md), #87 (détection des fiches maison suspectes :
809 fiches ; signaux type 4, spécialités 487, moyenne 116 ; rapport `docs/fiches-suspectes.md`).

## 4. Décisions d'Aaron à respecter (en plus du journal du 22/10)
- Phrase tarifs (PR A, mot pour mot) : « Ces frais viennent de la fiche Parcoursup de la formation
  (relevée en octobre 2026)[ et datent de l'année AAAA-AAAA]. Ils ne correspondent pas forcément à
  ta rentrée : les écoles privées les revoient souvent chaque année. Vérifie le montant sur le site
  de l'école avant de t'engager. » (crochets : seulement si l'année est connue).
- « 100 % d'accès » (PR C) : licence non sélective à 100 % d'accès 2025 et **≥ 50 candidats** peut
  être « sécurité » même sous la moyenne des admis, sous réserve des autres règles. Mesurer d'abord
  combien de licences le plancher élimine.
- #58 : message honnête quand le rayon laisse < 10 vœux ; jamais de vœu ajouté hors rayon ;
  liste vide ≠ « Complète ton profil ».
- #57 : PCSI bloquée aussi avec maths complémentaires (malgré l'attendu officiel : choix de
  prudence). BCPST, TSI, TB, TPC inchangées.
- #60 (faisabilité sur repère estimé) : décision à la refonte, ne rien faire avant.
- A2 : les 17 fiches « selon les revenus » restent proposées, affichées « jusqu'à X € (selon les
  revenus) » ; pour le budget, frais inconnus, jamais minimum d'exclusion.
- B (#43) : jamais « sécurité » sans lycée pour domicile / proche ; « Indique ton lycée » mis en avant.
- C (#45) : licence de secteur pour l'élève faible + règle 100 % ci-dessus + secteur francilien ;
  plancher de 50 candidats maintenu (il élimine 68 des 1 028 licences à 100 %).
- D (#42) : PASS / LAS de l'académie pour un projet médecine, jamais « sécurité ».
- E (#69) : sans intérêt santé, licence simple avant la LAS de la même discipline ; LAS jamais supprimée.
- F (#58), mot pour mot : « Dans ta zone de mobilité, seules N formations correspondent à ton
  profil. Pour avoir 10 vœux, élargis ta zone. »
- I2 (29/10) : on garde les 811 fiches fusionnées ; règle 2 = « chiffres officiels uniquement ; profil, métiers,
  charge = estimations Mon Plan Sup affichées comme telles ». Attendus de l'État appliqués tel quel.
- #47 (SKEMA, IÉSEG non liés à Parcoursup) : sautée. #5 #6 : bloquées (CSV du ministère).

## 5. Feuille de route (dans l'ordre)
| | PR | Issue | Fichiers principaux | État |
|---|---|---|---|---|
| A | Corrections du relevé des frais + année + phrase tarifs | #49 | scripts/construire-frais-prives.py, data/frais-prives.json, js/app.js | **fusionnée (#63, puis A2 #66)** |
| B | Jamais « sécurité » sans lycée pour domicile / proche ; « Indique ton lycée » mis en avant | #43 | moteur, app | **fusionnée (#67)** |
| C | Licence de secteur pour l'élève faible + règle 100 % + secteur francilien | #45 | moteur | **fusionnée (#68)** ; secteur IDF non relu à la source |
| D | PASS / LAS de l'académie pour un projet médecine | #42 | moteur | **fusionnée (#70)** |
| E | LAS derrière la licence simple sans intérêt santé | #69 | moteur | **fusionnée (#71)** |
| F | Message liste raccourcie par la distance | #58 | app, moteur | **fusionnée (#72)** ; phrase N = 0 à valider |
| G | Textes obsolètes « % de chances » | #54 | app, index.html | **fusionnée (#73)** |
| H | Retrait des ~813 fiches maison sans lien Parcoursup | — (§ 7.2) | data, app | **fusionnée (#76)** ; 6 listes / 114 changées |
| I1 | Préparation : `fusion.json` → `anciennes-fiches.json`, `filieres.json` figé | — | data, app, scripts | **fusionnée (#77)** ; 0 différence |
| I2 | Retrait des 811 fiches fusionnées (+ 15 modèles ECG) | — | data, app | **abandonnée** (#84 fermée, R sans effet suffisant) ; remplacée par #86 + #87 |
| J | Lieux et données diverses | #15 #24 #29 #31 #32 #33 #39 | data | à faire |
| K | Séparation calcul / affichage (`js/catalogue.js`) | — | app | **fusionnée (#78)** ; 0 différence ; rangement du moteur non fait |
| L | Réparer le manque de mémoire de `scripts/comparer-versions.js` (plante dès qu'il y a beaucoup de différences) | — | scripts | **fusionnée (#82)** |
| M | Corriger les fiches suspectes de `docs/fiches-suspectes.md` (type, moyenne d'abord) | — | data | après #87 |
| — | En attente d'accord : doubles licences (177), ECT / MP2I dans filieres.json, « langue anglaise » → LLCER, liste trop peu ambitieuse (eco-excellent-decide), URL des 2 PDF d'attendus, attendus CPGE récents | — | — | à décider |
| — | Statistiques manquantes | #5 #6 | data | **bloquée** : CSV fr-esr-parcoursup à fournir par Aaron |

À trier selon les testeurs : #19, #20, #23, #27, #35, #37, #44, #52, #55.

Calendrier : refonte de l'affichage par Aaron dès la fin de K (visé mi-novembre), tests camarades +
professeur / psy-EN fin novembre, mise en ligne début janvier 2027 si les critères sont remplis
(feuille de route : https://claude.ai/artifact/VQGZFt7b5t6mshczTLovnN, critères inchangés).

## 6. Ce qui dépend d'Aaron
Fusionner ; décisions ci-dessus ; CSV du ministère ; professeur principal ou psy-EN à contacter ;
mode de test des camarades sans mise en ligne ; ce qu'il veut changer dans l'affichage ;
protection de la branche `main` sur GitHub (voir `docs/pilotage/claude-code.md`).
