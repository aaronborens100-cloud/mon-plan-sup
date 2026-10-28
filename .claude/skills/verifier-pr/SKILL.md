---
name: verifier-pr
description: Vérification d'une PR du codeur par le DG, par scripts et résumés, puis compte rendu de 10 lignes à Aaron. Argument : la branche de la PR.
argument-hint: <branche> [--controles] [--sans-tests]
disable-model-invocation: true
---

Branche à vérifier : $ARGUMENTS

1. Lance au premier plan : `bash scripts/verifier-pr.sh $ARGUMENTS` (≈ 15 min avec les tests).
   Ajoute `--controles` si la PR change une règle du moteur.
2. Contrôle, sans lire de gros fichiers :
   - branche à jour avec main, sinon demande au codeur de rebaser ;
   - tests : tout passe ; dans `tests/`, seulement des ajouts (A). Un M ou D sur un test existant
     doit être justifié par une décision d'Aaron (§ 4 de la passation), sinon refus ;
   - `tests/reference/*.json` modifiés : la PR doit montrer les exemples avant / après ;
   - `js/moteur.js` : lis le fichier de diff indiqué **en entier** (c'est le seul diff à lire) ;
   - comparaison sur 300 profils : le nombre de profils changés est-il cohérent avec la PR ?
     Un changement hors du sujet de la PR = régression jusqu'à preuve du contraire.
   - texte affiché : comparé mot pour mot à la décision d'Aaron (`git diff origin/main origin/<branche> -- js/app.js | grep '^+' | grep -i '<mot clé>'`).
3. Si un défaut est réparable : renvoie le codeur sur sa branche avec une consigne de 10 lignes.
4. Compte rendu à Aaron, **10 lignes max** : verdict (prête à fusionner / à corriger / à refuser),
   chiffres clés, faiblesses d'abord, décisions qu'il doit prendre, priorité n° 1.
   Tu ne fusionnes pas.
