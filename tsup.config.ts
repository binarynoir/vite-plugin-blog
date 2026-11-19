import { defineConfig } from "tsup";

export default defineConfig([
  // The Vite plugin, for Node.
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
  },
  // Browser code: the framework-free runtime and the Vue components. ESM only,
  // for bundlers; `vue` stays a peer dependency.
  {
    entry: { runtime: "src/runtime.ts", vue: "src/vue.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2022",
    platform: "browser",
    external: ["vue"],
  },
]);
