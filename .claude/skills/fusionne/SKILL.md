---
name: fusionne
description: À lancer par Aaron quand il a fusionné une PR. Vérifie main, met à jour la passation et passe à la PR suivante.
argument-hint: [numéro de la PR fusionnée]
disable-model-invocation: true
---

Aaron vient de fusionner la PR $ARGUMENTS.

1. `git fetch origin main` puis, au premier plan, `npm test` sur `origin/main` (worktree détaché
   temporaire) : résumé pass / fail seulement.
2. Une ligne de confirmation à Aaron : `main` = <hash court>, X/X tests.
   Si un test échoue : arrête-toi et rends compte, ne lance rien d'autre.
3. Mets à jour `docs/pilotage/passation.md` : § 3 (PR fusionnée, nouveau hash, nombre de tests) et
   tableau § 5 (état « fusionnée (#n) »). Fais-le sur une branche `claude/passation-<date>` et ouvre
   une PR (titre « Passation : <résumé> ») ; tu ne pousses jamais sur `main`.
   Si une PR de passation est déjà ouverte, ajoute un commit dessus au lieu d'en ouvrir une autre.
4. Enchaîne sur la PR suivante du § 5 : `/consigne <lettre>`.
