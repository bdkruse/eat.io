import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { MIGRATIONS, openAccountsDatabase } from "../src/accounts/database.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/openDatabaseOnce.ts", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function openInChildProcess(databasePath: string): Promise<{ exitCode: number | null; errorOutput: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", fixturePath, databasePath], { cwd: repositoryRoot });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => (errorOutput += String(chunk)));
    child.on("close", (exitCode) => resolve({ exitCode, errorOutput }));
  });
}

// Bonto was seen starting two copies of the server a few milliseconds apart on a fresh
// disk; both ran migration 1 and the second died with "table accounts already exists".
test("several processes opening a fresh database file at once all succeed", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eatio-migrate-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "eatio.sqlite");

  const results = await Promise.all(Array.from({ length: 6 }, () => openInChildProcess(databasePath)));

  for (const result of results) expect(result.errorOutput, result.errorOutput).not.toContain("Error");
  for (const result of results) expect(result.exitCode).toBe(0);
  const database = openAccountsDatabase(databasePath);
  expect(database.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
  database.close();
}, 60_000);
