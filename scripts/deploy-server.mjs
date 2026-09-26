// Builds the server bundle and pushes it to the Bonto app, then restarts it.
// Needs the Bonto CLI installed and logged in:
//   npm install -g @sidequestvr/bonto && bonto auth login
//
//   npm run deploy:server              deploys to the app "eatio"
//   BONTO_APP=other npm run deploy:server
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const app = process.env["BONTO_APP"] ?? "eatio";
const bundleDirectory = `${repoRoot}dist/server`;
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: "inherit", ...options });

run("node", [`${repoRoot}scripts/build-server.mjs`]);
run("bonto", ["files", "upload", app, "server.mjs", `${bundleDirectory}/server.mjs`]);
run("bonto", ["files", "upload", app, "package.json", `${bundleDirectory}/package.json`]);
run("bonto", ["restart", app]);
console.log(`Deployed to https://${app}.bonto.run (WebSocket: wss://${app}.bonto.run)`);
