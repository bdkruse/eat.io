import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; local development stays at the root.
  base: process.env["BASE_PATH"] ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      // Point at protocol SOURCE so dev needs no build step, mirroring vitest.config.ts.
      "@eat.io/protocol": fileURLToPath(new URL("../protocol/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5174 },
});
