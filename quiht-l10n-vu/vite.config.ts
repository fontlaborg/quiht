import { defineConfig } from "vite";

// SPA build. Relative base so the built app works under any sub-path
// (e.g. https://fontlab.org/quiht/l10n-vu/) and from the file system.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
