// Bundles the game server into one plain-JavaScript file with no dependencies to install.
// Hosts with small disks (Bonto's free plan has 256 MB) cannot hold the monorepo's
// node_modules, and the server needs none of the client's packages anyway.
//
//   node scripts/build-server.mjs     ->  dist/server/server.mjs + package.json
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = `${repoRoot}dist/server`;

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [`${repoRoot}packages/server/src/index.ts`],
  outfile: `${outputDirectory}/server.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  alias: { "@eat.io/protocol": `${repoRoot}packages/protocol/src/index.ts` },
  // ws loads these native speed-ups only if present; the bundle runs fine without them.
  external: ["bufferutil", "utf-8-validate"],
  // ws is CommonJS and requires Node built-ins; give the ESM bundle a real `require`.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  logLevel: "warning",
});

const packageManifest = {
  name: "eatio-server",
  private: true,
  type: "module",
  description: "Bundled eat.io game server. Built by scripts/build-server.mjs; do not edit.",
  scripts: { start: "node server.mjs" },
  engines: { node: ">=22" },
};
await writeFile(`${outputDirectory}/package.json`, `${JSON.stringify(packageManifest, null, 2)}\n`);
console.log(`Built ${outputDirectory}/server.mjs`);
