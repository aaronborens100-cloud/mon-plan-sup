---
name: nuit
description: Mode nuit du DG de Mon Plan Sup. Enchaîne seul les PR décidées (A2, B à G), empilées, une à la fois, avec vérification, et laisse un bilan au réveil.
---

Aaron dort. Tu es le DG, seul jusqu'au matin. Lis `docs/pilotage/passation.md` (§ 1, 2, 4, 5).

**Chaîne de la nuit, dans l'ordre, PR empilées** (chaque branche part de la précédente ; la PR vise
`main` et dit dans son corps « À fusionner après #<précédente> ») :
1. A2 — part de `claude/frais-releve-fraicheur` (PR #63). Fichiers : js/moteur.js, js/app.js, tests/.
   (a) Les fiches `selon_revenus` sont des frais inconnus pour le budget, jamais un minimum
   d'exclusion (décision du 22/10). (b) La date « octobre 2026 » de la phrase tarifs est lue dans
   les métadonnées du relevé (`FRAIS_PRIVES_META`), plus écrite en dur ; texte affiché inchangé.
2. B (#43) · 3. C (#45, plancher 50, mesure rapportée) · 4. D (#42) · 5. E (créer l'issue d'abord,
   règle du § 4) · 6. F (#58, texte du § 4 mot pour mot) · 7. G (#54).

Pour chaque PR :
- Vérifie d'abord la PR précédente avec `bash scripts/verifier-pr.sh <branche>` (pour #63, la
  vérifier avant A2). Si elle échoue et n'est pas réparable en un aller-retour avec le codeur :
  **arrête la chaîne** (ne construis rien sur une base fausse).
- `/consigne <lettre>` puis l'agent `codeur`, un seul à la fois.
- Une décision manque ou une PR changerait des résultats hors de son sujet : **ne décide pas à la
  place d'Aaron**. Note la question, saute à la PR suivante seulement si elle ne dépend pas de
  celle-ci, sinon arrête.

**Au réveil** (fin de chaîne ou arrêt) :
- Ouvre une PR `claude/passation-<date>` qui met à jour le § 5 (état de chaque PR, ordre de fusion).
- Dernier message de la session, 10 lignes max : PR dans l'ordre de fusion avec verdict, mesure de C,
  questions pour Aaron, priorité n° 1. Rien n'est fusionné.
