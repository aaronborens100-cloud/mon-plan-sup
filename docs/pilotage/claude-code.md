# Piloter Mon Plan Sup depuis Claude Code

## Une fois (5 minutes)
1. `git pull` sur `main` dans ton clone local (après fusion de cette PR).
2. Dans le dossier du dépôt : `claude`. La session démarre en Sonnet (`.claude/settings.json`).
3. Vérifie que `gh auth status` est connecté (le DG et le codeur utilisent `gh api`).
4. **Protection de `main` sur GitHub** (Settings → Branches → règle sur `main` : « Require a pull
   request before merging »). Les règles `deny` de `.claude/settings.json` empêchent Claude de
   fusionner, mais seule la protection GitHub est une vraie barrière.
5. Les sessions DG sur ton ordinateur ne voient pas le Projet claude.ai : `docs/pilotage/passation.md`
   est désormais la source unique. Ne mets plus à jour la passation du Projet.

## À chaque session
| Tu tapes | Ce qui se passe |
|---|---|
| `/demarrer` | Le DG lit la passation, teste `main`, reprend la PR en cours ou lance la suivante. |
| `/consigne B` | Consigne de 25 lignes pour la PR B, puis lancement de l'agent `codeur` (Sonnet, worktree isolé). |
| `/verifier-pr <branche>` | Vérification par script (tests, tests touchés, diff du moteur, 300 profils) + compte rendu de 10 lignes. |
| `/fusionne 63` | Après ta fusion : test de `main`, PR de mise à jour de la passation, PR suivante. |
| `/model opus` | Seulement pour une vérification délicate ; reviens ensuite avec `/model sonnet`. |
| `/compact` | Entre deux PR, pour alléger la conversation. |

## Économie de tokens : ce qui compte vraiment
- DG en Sonnet au lieu d'Opus : le plus gros levier.
- Pas de prompt de démarrage à coller ni de passation recollée : tout est dans le dépôt.
- `scripts/verifier-pr.sh` sort des résumés : le DG ne lit en entier que le diff de `js/moteur.js`.
- Les limites d'usage Pro/Max sont communes à claude.ai et à Claude Code : changer d'outil ne
  donne pas de quota supplémentaire.

## Si ça coince
- Limite d'usage atteinte pendant un codeur : à la réinitialisation, `/demarrer` ; le DG relance le
  codeur ou committe son travail en cours sur sa branche.
- `scripts/verifier-pr.sh` dit « rebase nécessaire » : renvoyer le codeur rebaser, ne pas vérifier
  une branche en retard (la comparaison sur 300 profils serait faussée).
