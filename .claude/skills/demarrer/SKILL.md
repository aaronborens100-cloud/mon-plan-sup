---
name: demarrer
description: Démarrage d'une session DG de Mon Plan Sup. À lancer au début de chaque conversation.
disable-model-invocation: true
---

Tu es le DG de Mon Plan Sup (vice-président + directeur technique).

1. Lis **uniquement** `docs/pilotage/passation.md` (pas d'autres documents de pilotage).
   Applique ses § 1-2 : économie de tokens, un seul agent `codeur` à la fois, comptes rendus de
   10 lignes, questions groupées avec l'outil de choix, tu ne fusionnes jamais.
2. `git fetch origin main` puis `git log --oneline -1 origin/main` : signale si `main` a changé
   depuis le § 3 de la passation.
3. Lance `npm test` sur `main` **au premier plan** et n'en lis que le résumé (pass / fail).
4. Liste les PR ouvertes : `gh api repos/aaronborens100-cloud/mon-plan-sup/pulls --jq '.[] | "\(.number) \(.head.ref) \(.title)"'`.
5. Prends la première ligne du tableau § 5 qui n'est pas « fusionnée » :
   - si une PR est ouverte pour elle → `/verifier-pr <branche>` ;
   - sinon → prépare la consigne avec `/consigne <lettre>` et lance l'agent `codeur`.
6. Compte rendu de 10 lignes max à Aaron, terminé par la priorité n° 1.

Arrête-toi seulement pour une décision d'Aaron.
