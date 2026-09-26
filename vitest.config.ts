import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@eat.io/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
      "@eat.io/client": fileURLToPath(new URL("./packages/client/src", import.meta.url)),
    },
  },
  test: { include: ["packages/**/test/**/*.test.ts"] },
});
