#!/usr/bin/env bash
# One-shot release: bump CLI version, publish to npm, commit + push.
#
# Usage:
#   scripts/deploy/release.sh patch    # 0.1.0 → 0.1.1 (default)
#   scripts/deploy/release.sh minor    # 0.1.0 → 0.2.0
#   scripts/deploy/release.sh major    # 0.1.0 → 1.0.0
#
# What it does:
#   1. Bumps version in apps/cli/package.json AND apps/cli/src/index.ts.
#   2. Publishes the new version to npm.
#   3. Commits + pushes the version bump.
#
# Note: editor and server redeploy automatically when you push (Vercel +
# Render Git integration), so this also indirectly refreshes them if the
# commit touches their code.

# shellcheck source=./_lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

BUMP="${1:-patch}"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[release] working tree dirty — commit your changes before releasing." >&2
  git status --short >&2
  exit 1
fi

"$REPO_ROOT/scripts/deploy/publish-cli.sh" "$BUMP"

NEW_VER=$(node -p "require('./apps/cli/package.json').version")

echo "[release] committing version bump…"
git add apps/cli/package.json apps/cli/src/index.ts
git -c user.email="boozybats@users.noreply.github.com" \
    -c user.name="boozybats" \
    commit -m "chore(cli): release v$NEW_VER"
git push

echo ""
echo "[release] ✓ v$NEW_VER live on npm."
echo "          npx @boozybats/genex@$NEW_VER --version"
