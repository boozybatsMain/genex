import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  shims: false,
  banner: { js: "#!/usr/bin/env node" },
  // Bundle workspace types (@poc/shared) into the output so the published
  // package has no workspace dependencies. Keep runtime deps external.
  noExternal: ["@poc/shared"],
  external: ["chokidar", "commander", "ws"],
});
