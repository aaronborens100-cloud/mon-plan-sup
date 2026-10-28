#!/usr/bin/env bash
# Vérification d'une PR par le DG, en résumés seulement (économie de tokens).
# Usage : bash scripts/verifier-pr.sh <branche> [--controles] [--sans-tests]
#   --controles  : lance aussi `npm run controles` sur la branche (si une règle du moteur change)
#   --sans-tests : saute `npm test` (≈ 6 min) si l'agent vient de le lancer et l'a rapporté
# Sortie : uniquement des résumés. Le diff complet de js/moteur.js est écrit dans un fichier
# temporaire dont le chemin est affiché (le lire seulement si besoin).
set -euo pipefail

BRANCHE="${1:?Usage : bash scripts/verifier-pr.sh <branche> [--controles] [--sans-tests]}"
shift
CONTROLES=0; TESTS=1
for a in "$@"; do
  case "$a" in
    --controles) CONTROLES=1 ;;
    --sans-tests) TESTS=0 ;;
  esac
done

RACINE="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/verif-pr.XXXXXX")"
nettoyer() {
  git -C "$RACINE" worktree remove --force "$TMP/main" >/dev/null 2>&1 || true
  git -C "$RACINE" worktree remove --force "$TMP/branche" >/dev/null 2>&1 || true
}
trap nettoyer EXIT

echo "== Récupération de main et de $BRANCHE"
git -C "$RACINE" fetch -q origin "+refs/heads/main:refs/remotes/origin/main" "+refs/heads/$BRANCHE:refs/remotes/origin/$BRANCHE"
MAIN="$(git -C "$RACINE" rev-parse origin/main)"
BR="$(git -C "$RACINE" rev-parse "origin/$BRANCHE")"
echo "main = ${MAIN:0:7} · branche = ${BR:0:7}"
if git -C "$RACINE" merge-base --is-ancestor "$MAIN" "$BR"; then
  echo "Branche à jour avec main : oui"
else
  echo "Branche à jour avec main : NON (rebase nécessaire)"
fi

echo
echo "== Fichiers modifiés"
git -C "$RACINE" diff --stat "$MAIN" "$BR" | tail -25

echo
echo "== Tests existants touchés (A = ajout ; M/D = à justifier)"
git -C "$RACINE" diff --name-status "$MAIN" "$BR" -- tests/ || true

echo
echo "== js/moteur.js"
DIFF_MOTEUR="$TMP/diff-moteur.txt"
git -C "$RACINE" diff "$MAIN" "$BR" -- js/moteur.js > "$DIFF_MOTEUR"
if [ -s "$DIFF_MOTEUR" ]; then
  GARDE="${TMPDIR:-/tmp}/diff-moteur-${BRANCHE//\//-}.txt"
  cp "$DIFF_MOTEUR" "$GARDE"
  echo "$(grep -c '^[+-][^+-]' "$DIFF_MOTEUR" || true) lignes changées → $GARDE (à lire en entier : c'est le cœur de la vérification)"
else
  echo "inchangé"
fi

git -C "$RACINE" worktree add -q --detach "$TMP/main" "$MAIN"
git -C "$RACINE" worktree add -q --detach "$TMP/branche" "$BR"

if [ "$TESTS" = 1 ]; then
  echo
  echo "== npm test sur la branche (≈ 6 min)"
  (cd "$TMP/branche" && npm test 2>&1 | grep -E '^# (pass|fail)|^not ok' | head -20) || true
fi

echo
echo "== Comparaison main / branche sur 300 profils"
node "$RACINE/scripts/comparer-versions.js" "$TMP/main" "$TMP/branche" --n 300 --details 0 2>&1 | tail -15

if [ "$CONTROLES" = 1 ]; then
  echo
  echo "== Contrôles sur la branche"
  (cd "$TMP/branche" && npm run -s controles 2>&1 | tail -15)
fi
