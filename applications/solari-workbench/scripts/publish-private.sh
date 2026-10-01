#!/usr/bin/env bash
set -euo pipefail
# Explicitly invoked publication helper; never runs during tests or builds.
repo_name="${1:-solari-workbench}"
if [[ ! "$repo_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo 'Use a repository name in your authenticated personal account.' >&2
  exit 1
fi
gh auth status >/dev/null 2>&1 || { echo 'Authenticate first with gh auth login. Do not put tokens in repository files.' >&2; exit 1; }
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit the reviewed source before publishing.' >&2
  exit 1
fi
npm run privacy:check -- --history
owner="$(gh api user --jq .login)"
account_id="$(gh api user --jq .id)"
expected_identity="$owner <$account_id+$owner@users.noreply.github.com>"
git log --format='%an <%ae>%n%cn <%ce>' | while IFS= read -r author; do
  if [[ "$author" != "$expected_identity" ]]; then
    echo 'Commit identity needs privacy review before publication.' >&2
    exit 1
  fi
done
full_name="$owner/$repo_name"
if gh repo view "$full_name" --json isPrivate --jq .isPrivate > /dev/null 2>&1; then
  echo 'Repository already exists; refusing to push into an unreviewed destination.' >&2
  exit 1
fi
gh repo create "$full_name" --private --description 'Recoverable debugging handoffs for agents in SSH workspaces'
if [[ "$(gh repo view "$full_name" --json isPrivate --jq .isPrivate)" != 'true' ]]; then
  echo 'Private visibility could not be confirmed. Nothing was pushed.' >&2
  exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo 'An origin already exists. Inspect it before pushing.' >&2
  exit 1
fi
git remote add origin "https://github.com/$full_name.git"
git -c credential.helper= -c 'credential.https://github.com.helper=!gh auth git-credential' push --set-upstream origin main
gh repo view "$full_name" --json url,isPrivate
