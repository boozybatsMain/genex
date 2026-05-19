# syntax=docker/dockerfile:1.6
#
# Genex server image. Built from the monorepo root:
#     docker build -f apps/server/Dockerfile -t genex-server .
#
# Stage 1: install deps + build the bundle. We need the workspace context so
# that `@poc/shared` resolves; tsup inlines it into dist/index.js, after
# which the runtime image only needs `dist/` + a few external npm packages.

FROM node:20-alpine AS builder
WORKDIR /repo

# Copy only manifests first for better layer caching.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

# Install across the workspace so @poc/shared is linked.
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

# Now copy source and build the server bundle.
COPY apps/server apps/server
COPY packages/shared packages/shared
RUN npm run build --workspace apps/server

# ---------------------------------------------------------------------------
# Stage 2: small runtime image with only what dist/index.js needs at runtime.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install just the externalised runtime deps (see apps/server/tsup.config.ts).
# tsup inlined `@poc/shared` into dist/index.js, so we only list the deps that
# stayed external. A standalone runtime manifest (no workspace refs) keeps this
# stage tiny and avoids the original error trying to resolve `@poc/shared` from
# the public registry.
COPY apps/server/docker.runtime.package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Drop in the bundled server.
COPY --from=builder /repo/apps/server/dist ./dist

# Render / Fly / Koyeb all inject $PORT. The server reads it (see src/index.ts).
EXPOSE 5174
ENV PORT=5174

CMD ["node", "dist/index.js"]
