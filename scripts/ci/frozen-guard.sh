#!/usr/bin/env bash
# Fails if this branch changes a protected path that main's ci/phase-allow.txt does not allow.
# Both lists are always read from origin/main, so a branch cannot weaken them.
set -euo pipefail
# Supervisor branches (supervisor/*) may change protected paths; tests, lint, build and smoke still run on them.
# Only maintainer branches may use this prefix.
branch="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}"
case "$branch" in
  supervisor/*) echo "Supervisor branch ($branch): protected-path check skipped."; exit 0 ;;
esac
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  echo "On main: nothing to check."
  exit 0
fi
readlist() { git show "origin/main:$1" 2>/dev/null | sed 's/#.*//' | sed '/^[[:space:]]*$/d' || true; }
protected=$(readlist ci/protected-paths.txt)
allowed=$(readlist ci/phase-allow.txt)
changed=$(git diff --name-only origin/main...HEAD)
bad=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  for p in $protected; do
    case "$f" in
      "$p"*)
        ok=0
        for a in $allowed; do case "$f" in "$a"*) ok=1 ;; esac; done
        if [ $ok -eq 0 ]; then echo "PROTECTED FILE CHANGED: $f"; bad=1; fi
        ;;
    esac
  done
done <<< "$changed"
if [ $bad -eq 1 ]; then
  echo "Frozen-file guard FAILED."
  exit 1
fi
echo "Frozen-file guard passed ($(echo "$changed" | sed '/^$/d' | wc -l | tr -d ' ') changed files)."
