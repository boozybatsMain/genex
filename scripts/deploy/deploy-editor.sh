#!/usr/bin/env bash
# Deploys apps/editor to Vercel production.
#
# Use this when you've changed editor code or VITE_GENEX_* env vars and want
# a fresh build live on https://genex-pi.vercel.app.
#
# Note: pushing to GitHub `main` also triggers an auto-deploy via Vercel's
# Git integration. This script is for when you want to deploy without a push
# (e.g. testing a local-only change).

# shellcheck source=./_lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_var VERCEL_TOKEN
require_var VERCEL_SCOPE
require_var VERCEL_PROJECT

cd "$REPO_ROOT"

echo "[vercel] deploying to production…"
npx --yes vercel@latest deploy --prod --yes \
  --token "$VERCEL_TOKEN" \
  --scope "$VERCEL_SCOPE" \
  | tail -20

echo ""
echo "[vercel] ✓ done. https://genex-pi.vercel.app"
