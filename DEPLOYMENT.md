# Deployment

This monorepo ships as three artefacts:

| Artefact          | Where it lives        | Where it's hosted     | Cost          |
|-------------------|-----------------------|-----------------------|---------------|
| Editor (Vite SPA) | `apps/editor`         | **Vercel** (free)     | $0 forever    |
| Server (Express + WebSocket) | `apps/server` | **Render** (free web service)     | $0 (sleeps after 15min idle) |
| CLI               | `apps/cli`            | **npm** as `@boozybats/genex` | $0    |

State is in-memory (no DB). If the server restarts, projects vanish — for
this PoC that's fine; users can re-run `genex create`. Swap `apps/server/src/store.ts`
for a Redis-backed implementation later if you need persistence.

> **Why not host the server on Vercel too?** Vercel's free tier is
> serverless-only — no persistent WebSocket connections and no shared in-memory
> state across function invocations. The Genex server needs both.

---

## 1. Push the repo to GitHub

Render and Vercel both deploy from GitHub. Create a public or private repo
under your account and push.

```bash
git init
git remote add origin git@github.com:boozybats/genex.git
git add .
git commit -m "Initial Genex deployment-ready monorepo"
git push -u origin main
```

---

## 2. Deploy the server to Render

> **Heads-up on free-tier caveat**: Render's free Web Service spins down after
> 15 minutes of inactivity. First request after a sleep takes ~30s. That's
> fine for a PoC; if it's annoying upgrade to `Starter` ($7/mo, always-on).

1. Sign up at https://dashboard.render.com (GitHub OAuth, no card needed).
2. **New → Web Service** → connect the GitHub repo `boozybats/genex`.
3. Settings:
   - **Name**: `genex-server`
   - **Region**: closest to your users
   - **Branch**: `main`
   - **Root Directory**: leave blank (Dockerfile uses repo root context)
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `apps/server/Dockerfile`
   - **Instance Type**: `Free`
   - **Health Check Path**: `/healthz`
4. **Environment** tab:
   - `GENEX_CORS_ORIGIN` = `https://<your-vercel-domain>.vercel.app`
     (set this once you know the editor's URL).
   - `NODE_ENV` = `production`
5. **Create Web Service**. ~3 min later Render gives you a URL like
   `https://genex-server.onrender.com`. Test it:

```bash
curl https://genex-server.onrender.com/healthz
# → {"ok":true,"ts":1779...}
```

Note that URL — call it `<SERVER_URL>` below.

---

## 3. Deploy the editor to Vercel

1. Sign up / log in at https://vercel.com.
2. **Add New → Project** → import the same GitHub repo.
3. Vercel will read `vercel.json` from the repo root and figure out the build
   automatically. If it asks anyway:
   - **Framework preset**: Other
   - **Build command**: `npm --workspace apps/editor run build`
   - **Install command**: `npm install --include-workspace-root`
   - **Output directory**: `apps/editor/dist`
4. **Environment variables** (under Project → Settings → Environment Variables):
   - `VITE_GENEX_SERVER` = `<SERVER_URL>` (the Koyeb URL from step 2, no
     trailing slash, with `https://`).
   - `VITE_GENEX_WS` = same URL but with `wss://` scheme, e.g.
     `wss://genex-server-<hash>.koyeb.app`.
5. **Deploy**. Vercel gives you `https://<project>.vercel.app`. Open it — it
   should connect to your Koyeb server.

Now go back to Render and set `GENEX_CORS_ORIGIN` to the Vercel URL, then
redeploy that service.

---

## 4. Publish the CLI to npm

Update the public defaults in the CLI to point at your hosted server/editor:

`apps/cli/src/index.ts`:

```ts
const DEFAULT_SERVER = "https://<your-render-domain>.onrender.com";
const DEFAULT_EDITOR = "https://<your-vercel-domain>.vercel.app";
```

Then:

```bash
# 1. Make sure you're logged in as boozybats.
npm whoami       # → boozybats
# (if not: npm login)

# 2. Bump the version if you've already published once.
npm version patch --workspace apps/cli

# 3. Publish. The `prepublishOnly` hook copies skills + bundles via tsup.
#    `publishConfig.access: public` makes a scoped package public.
npm publish --workspace apps/cli
```

Verify:

```bash
npx --yes @boozybats/genex@latest --help
```

---

## 5. Give the command to other people

```bash
npx @boozybats/genex create ./my-game
```

That's it. They:

- get a starter project in `./my-game` (with example scene + script),
- watch the folder for changes,
- have the editor open in their browser pointing at *your* hosted server,
- collaborate live with anyone else on the same `projectId` URL.

---

## Local development (unchanged)

The deployment changes don't affect `npm run dev`:

```bash
npm install
npm run dev      # editor + server, both on localhost
```

Then in a third terminal, point a CLI at local services:

```bash
GENEX_SERVER=http://localhost:5174 \
GENEX_EDITOR=http://localhost:5173 \
node apps/cli/dist/index.js create ./tmp-game
```

---

## Adding Redis later (when you need persistence)

1. Create an [Upstash Redis](https://upstash.com) free database. Grab the
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
2. `npm install @upstash/redis --workspace apps/server`.
3. Rewrite `apps/server/src/store.ts` to use the Redis client instead of
   the in-memory `Map`. Each `ProjectState` becomes a few Redis keys
   (`project:<id>:summary`, `project:<id>:definition`,
   `project:<id>:scripts:<sid>` → JSON).
4. Set the two `UPSTASH_*` env vars on Render.

Until then the in-memory store is fine — a server restart just means users
re-run `genex create`.

---

## Troubleshooting

**CORS error in the browser console.**
The `GENEX_CORS_ORIGIN` env var on Render must match the Vercel URL **exactly**
(scheme + host, no trailing slash). Redeploy the server after changing it.

**WebSocket fails with `wss://` but HTTP works.**
Render handles `wss://` automatically when the service is reachable over HTTPS.
Make sure `VITE_GENEX_WS` is set to `wss://` (not `ws://`) for the production
build.

**CLI can't reach the server (first request hangs ~30s).**
Free Render services sleep after 15 min idle. First request wakes them up.
This is expected; subsequent requests are fast. Upgrade to Starter ($7/mo) to
keep it always-on.

**CLI can't reach the server (error).**
Test it manually: `curl https://<your-server>/healthz`. If that works, the CLI
will too. If not — Render dashboard → Service → Logs.

**`npm publish` fails with `403 Forbidden`.**
You need to claim the `@boozybats` scope on npm — log in once via
`npm login` and the scope is created on first publish. Make sure
`publishConfig.access` is `public` (already set in `apps/cli/package.json`).
