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
  // Bundle workspace types so the published image has no @poc/* deps.
  noExternal: ["@poc/shared"],
  external: ["express", "cors", "ws", "nanoid"],
});
