import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point at protocol SOURCE so dev needs no build step, mirroring vitest.config.ts.
      "@eat.io/protocol": fileURLToPath(new URL("../protocol/src/index.ts", import.meta.url)),
      // The classic client's state, connection, and selection logic, reused as-is.
      "@eat.io/client": fileURLToPath(new URL("../client/src", import.meta.url)),
    },
    // The reused provider must share this package's React, or hooks break across the seam.
    dedupe: ["react", "react-dom", "three"],
  },
  server: { port: 5174 },
});
