---
name: consigne
description: Prépare la consigne (25 lignes max) de l'agent codeur pour une PR de la feuille de route, puis lance l'agent. Argument : la lettre de la PR (A, B, C…).
argument-hint: <lettre de la PR>
disable-model-invocation: true
---

PR visée : $ARGUMENTS (ligne correspondante du § 5 de `docs/pilotage/passation.md`).

1. Lis la ligne du § 5 et les décisions du § 4 qui la concernent. Lis l'issue liée en résumé
   (`gh api repos/aaronborens100-cloud/mon-plan-sup/issues/<n> --jq .body`), pas le code.
2. Si une décision d'Aaron manque pour écrire la consigne : pose toutes les questions **en une
   fois** avec l'outil de choix, puis arrête-toi.
3. Rédige la consigne, **25 lignes max**, dans cet ordre :
   - nom de branche (`claude/<sujet-court>`) et issue à lire ;
   - fichiers autorisés, exacts ;
   - décisions d'Aaron à respecter, recopiées mot pour mot quand c'est un texte affiché ;
   - mesures à rapporter (chiffres avant / après, exemples vérifiables) ;
   - tests à ajouter ;
   - titre de la PR et « Closes #<n> ».
   L'en-tête Vercel et les règles fixes sont déjà dans l'agent `codeur` : ne les répète pas.
4. Lance l'agent `codeur` avec cette consigne (en arrière-plan). Un seul à la fois : vérifie
   qu'aucun autre codeur ne tourne.
5. Pendant qu'il travaille, ne lis pas sa transcription. Attends sa réponse, puis `/verifier-pr`.
