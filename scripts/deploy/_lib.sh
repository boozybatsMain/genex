#!/usr/bin/env bash
# Shared helpers for deploy scripts. Source this from each script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.deploy.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy] missing $ENV_FILE — copy from .deploy.env.example or ask the human for tokens" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[deploy] $name is not set in $ENV_FILE" >&2
    exit 1
  fi
}

# Quiet-mask the secrets in any logs (best effort — bash can't perfectly
# scrub child output, but we at least avoid `echo`ing them ourselves).
mask() { sed -E 's/(npm_|vcp_)[A-Za-z0-9_-]+/\1***REDACTED***/g'; }
