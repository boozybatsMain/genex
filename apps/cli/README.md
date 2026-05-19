# @boozybats/genex

CLI for the [Genex](https://genex.vercel.app) game-engine editor. Scaffolds a
project folder, syncs your local TypeScript scripts to a shared server, and
opens the editor in your browser.

## Quick start

```bash
npx @boozybats/genex create ./my-game
```

That command:

1. Creates a project on the hosted Genex server.
2. Writes `gameDefinition.json`, `scripts/`, `engine-types.d.ts`, `tsconfig.json`
   and a starter `.claude/skills/` reference dump into `./my-game`.
3. Opens the editor at `https://genex-pi.vercel.app/?projectId=...`.
4. Watches the folder — every save in your IDE hot-reloads in the editor; every
   edit in the editor is mirrored back to disk.

Press `Ctrl+C` to stop watching. Re-run the same command in the same folder to
re-attach.

## Install globally (optional)

```bash
npm install -g @boozybats/genex
genex create ./my-game
```

## Self-hosting

If you run your own Genex server + editor, point the CLI at them:

```bash
genex create ./my-game \
  --server https://my-server.example.com \
  --editor https://my-editor.example.com
```

Or via env vars:

```bash
export GENEX_SERVER=https://my-server.example.com
export GENEX_EDITOR=https://my-editor.example.com
genex create ./my-game
```

## Requirements

- Node.js ≥ 18.17
- A modern browser

## License

MIT
