#!/usr/bin/env bash
# Triggers a Render redeploy of genex-server.
#
# Render's free tier doesn't expose a public deploy-hook API key in our
# render.yaml flow — instead, every push to GitHub `main` triggers an auto
# deploy because `autoDeploy: true` is set in render.yaml.
#
# So: the supported way to redeploy the server is to make a commit and push.
# This script does an empty commit + push for you, which Render picks up.
#
# If you want to redeploy without changing code, that's exactly what this
# does. For real changes, just `git push` after committing them.

# shellcheck source=./_lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cd "$REPO_ROOT"

# Sanity check we're on main and clean.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "[render] you're on '$BRANCH', not 'main'. Render only auto-deploys from main." >&2
  echo "[render] either switch branches or push manually." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[render] working tree has uncommitted changes — commit them first." >&2
  git status --short >&2
  exit 1
fi

echo "[render] pushing an empty commit to trigger autoDeploy…"
git -c user.email="boozybats@users.noreply.github.com" \
    -c user.name="boozybats" \
    commit --allow-empty -m "chore(server): trigger Render redeploy"
git push

echo ""
echo "[render] ✓ pushed. Watch the deploy at:"
echo "          https://dashboard.render.com/web/srv-d869vtekdjcs73e0ejpg"
echo "[render] healthcheck: curl https://genex-server.onrender.com/healthz"
