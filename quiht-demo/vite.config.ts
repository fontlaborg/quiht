import { defineConfig } from "vite";

// Static demo for GitHub Pages at https://fontlab.org/quiht/.
// `base: "./"` keeps every asset reference relative, so the output in ../docs
// works under any path without a server. No server-side code is emitted.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
    sourcemap: false,
  },
});
