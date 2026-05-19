#!/usr/bin/env bash
# Publishes apps/cli to npm as @boozybats/genex.
#
# Usage:
#   scripts/deploy/publish-cli.sh           # publishes current version
#   scripts/deploy/publish-cli.sh patch     # bumps patch then publishes (0.1.0 → 0.1.1)
#   scripts/deploy/publish-cli.sh minor
#   scripts/deploy/publish-cli.sh major
#
# Reads NPM_TOKEN from .deploy.env. Idempotent: if you publish twice without
# bumping, npm returns 403 and the script exits with a clear message.

# shellcheck source=./_lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_var NPM_TOKEN

BUMP="${1:-}"
cd "$REPO_ROOT"

if [[ -n "$BUMP" ]]; then
  if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
    echo "[publish] invalid bump '$BUMP' — use patch | minor | major" >&2
    exit 1
  fi
  echo "[publish] bumping $BUMP version…"
  npm version "$BUMP" --workspace apps/cli --no-git-tag-version
  # Mirror the version into src/index.ts so `genex --version` matches.
  NEW_VER=$(node -p "require('./apps/cli/package.json').version")
  sed -i.bak -E "s/\.version\(\"[^\"]+\"\);/.version(\"$NEW_VER\");/" apps/cli/src/index.ts
  rm -f apps/cli/src/index.ts.bak
  echo "[publish] new version: $NEW_VER"
fi

NPMRC=$(mktemp)
trap 'rm -f "$NPMRC"' EXIT
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > "$NPMRC"

echo "[publish] running npm publish…"
NPM_CONFIG_USERCONFIG="$NPMRC" npm publish --workspace apps/cli

echo ""
echo "[publish] ✓ done. View at https://www.npmjs.com/package/@boozybats/genex"
