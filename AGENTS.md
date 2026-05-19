# Agent operations guide

Deployment credentials and one-line shortcuts for publishing the CLI and
redeploying the editor / server. **Use these scripts instead of running raw
`npm publish`, `vercel deploy`, etc. by hand.**

## Credentials

All tokens live in `.deploy.env` (gitignored). See `.deploy.env.example` for
the schema. Never paste tokens into chat, source files, or commit messages —
the scripts load them from the env file automatically.

## Common tasks

### Publish a new CLI version (most common)

```bash
scripts/deploy/release.sh patch     # 0.1.0 → 0.1.1
scripts/deploy/release.sh minor     # 0.1.0 → 0.2.0
scripts/deploy/release.sh major     # 0.1.0 → 1.0.0
```

Bumps version in both `apps/cli/package.json` and `apps/cli/src/index.ts`,
publishes to npm under `@boozybats/genex`, commits the bump, and pushes.

### Publish without bumping (only useful right after a failed publish)

```bash
scripts/deploy/publish-cli.sh
```

### Redeploy the editor

Normally not needed — `git push origin main` triggers a Vercel auto-deploy.
For a manual deploy:

```bash
scripts/deploy/deploy-editor.sh
```

### Redeploy the server

Render auto-deploys on every push to `main`. If you need to force a
redeploy without code changes:

```bash
scripts/deploy/deploy-server.sh   # pushes an empty commit
```

### Update Vercel env vars

The editor reads `VITE_GENEX_SERVER` and `VITE_GENEX_WS` at build time.
To change them:

```bash
source .deploy.env
npx vercel@latest env rm VITE_GENEX_SERVER production --yes --token "$VERCEL_TOKEN" --scope "$VERCEL_SCOPE"
echo "https://new-server.example.com" | \
  npx vercel@latest env add VITE_GENEX_SERVER production --token "$VERCEL_TOKEN" --scope "$VERCEL_SCOPE"
scripts/deploy/deploy-editor.sh
```

### Update Render env vars (e.g. CORS allowlist)

Edit `render.yaml` → commit → push. Render picks up the new value on next
deploy. Or change it in the Render dashboard for an immediate effect.

## Pre-flight checks before publishing

The scripts assume:
- You're on `main` and the working tree is clean (for `release.sh` /
  `deploy-server.sh`).
- `npm` is installed and reachable.
- `.deploy.env` exists with valid tokens.

If a token is expired you'll get a 401/403 from the relevant provider. Get
a fresh token from the dashboards listed in `.deploy.env.example` and
overwrite the value in `.deploy.env`.

## What's hosted where

| Component | Host    | URL                                  |
|-----------|---------|--------------------------------------|
| Editor    | Vercel  | https://genex-pi.vercel.app          |
| Server    | Render  | https://genex-server.onrender.com    |
| CLI       | npm     | https://www.npmjs.com/package/@boozybats/genex |
| Repo      | GitHub  | https://github.com/boozybatsMain/genex |

See `DEPLOYMENT.md` for the full deploy-from-scratch playbook.
