// Bundles the game server into one plain-JavaScript file with a single dependency to
// install. Hosts with small disks (Bonto's free plan has 256 MB) cannot hold the
// monorepo's node_modules, and the server needs none of the client's packages anyway.
// better-sqlite3 is native code (a compiled .node addon) and cannot be bundled by esbuild,
// so it is left external and listed in the written package.json for `npm install` on the
// host to fetch and build.
//
//   node scripts/build-server.mjs     ->  dist/server/server.mjs + package.json
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = `${repoRoot}dist/server`;

const serverPackageManifest = JSON.parse(
  await readFile(`${repoRoot}packages/server/package.json`, "utf8"),
);
const betterSqlite3Version = serverPackageManifest.dependencies["better-sqlite3"];
if (!betterSqlite3Version) {
  throw new Error("build-server: better-sqlite3 is missing from packages/server/package.json dependencies");
}

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
  // better-sqlite3 is native code — esbuild cannot bundle it — so the host installs it
  // from the dependency listed below instead.
  external: ["bufferutil", "utf-8-validate", "better-sqlite3"],
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
  dependencies: { "better-sqlite3": betterSqlite3Version },
};
await writeFile(`${outputDirectory}/package.json`, `${JSON.stringify(packageManifest, null, 2)}\n`);
console.log(`Built ${outputDirectory}/server.mjs`);
