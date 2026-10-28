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
(MPSI/PCSI/PTSI/MP2I : exclues sans maths ; point bloquant avec maths complémentaires seules).
`main` = 11ccd83 : 411/411 tests (vérifié le 28/10).
Contrôles sur main (avant #62) : seule violation restante connue = `dix_voeux` (28 profils
« domicile » à moins de 10 vœux, #58).

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

## 5. Feuille de route (dans l'ordre)
| | PR | Issue | Fichiers principaux | État |
|---|---|---|---|---|
| A | Corrections du relevé des frais + année + phrase tarifs | #49 | scripts/construire-frais-prives.py, data/frais-prives.json, js/app.js | **PR #63 ouverte, NON vérifiée par le DG** (418/418 selon l'agent). À vérifier : `/verifier-pr claude/frais-releve-fraicheur`. Points à creuser : 6 références changent par le hash « calculs » (cause non isolée) ; date « octobre 2026 » en dur ? ; 17 montants « selon les revenus » encore lus comme minimum par le moteur, contrairement à la décision du 22/10 (→ PR moteur à ajouter) ; points 5 et 7 de #49 non traités. |
| B | Jamais « sécurité » sans lycée pour domicile / proche ; « Indique ton lycée » mis en avant | #43 | moteur, app | à faire |
| C | Licence de secteur pour l'élève faible + règle 100 % + secteur francilien | #45 | moteur | à faire (mesure du plancher d'abord) |
| D | PASS / LAS de l'académie pour un projet médecine | #42 | moteur | à faire |
| E | LAS derrière la licence simple sans intérêt santé | (créer l'issue) | moteur | à faire |
| F | Message liste raccourcie par la distance | #58 | app (+ moteur si besoin) | à faire, texte à valider par Aaron |
| G | Textes obsolètes « % de chances » | #54 | app, index.html | à faire (petite) |
| H | Retrait des ~813 fiches maison sans lien Parcoursup | — (§ 7.2) | data, app, moteur | à faire ; **règle probablement #47 (SKEMA, IÉSEG non liés) : proposer à Aaron de sauter #47** |
| I | Retrait des ~811 fiches fusionnées | — | idem | après H |
| J | Lieux et données diverses | #15 #24 #29 #31 #32 #33 #39 | data | à faire |
| K | Séparation calcul / affichage, puis rangement du moteur | — | moteur, app | avant la refonte |
| — | Statistiques manquantes | #5 #6 | data | **bloquée** : CSV fr-esr-parcoursup à fournir par Aaron |

À trier selon les testeurs : #19, #20, #23, #27, #35, #37, #44, #52, #55.

Calendrier : refonte de l'affichage par Aaron dès la fin de K (visé mi-novembre), tests camarades +
professeur / psy-EN fin novembre, mise en ligne début janvier 2027 si les critères sont remplis
(feuille de route : https://claude.ai/artifact/VQGZFt7b5t6mshczTLovnN, critères inchangés).

## 6. Ce qui dépend d'Aaron
Fusionner ; décisions ci-dessus ; CSV du ministère ; professeur principal ou psy-EN à contacter ;
mode de test des camarades sans mise en ligne ; ce qu'il veut changer dans l'affichage ;
protection de la branche `main` sur GitHub (voir `docs/pilotage/claude-code.md`).
