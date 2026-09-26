import readline from "node:readline";
import { loadConfig } from "../src/config.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { SEED_ACCOUNTS, seedAccounts, type SeedOutcome } from "../src/accounts/seedAccounts.js";
import { systemClock } from "../src/lobby/timers.js";

/**
 * Creates or promotes the seed accounts (`SEED_ACCOUNTS`) against the configured
 * database. Run with `npm run accounts:seed`. A missing account is created with a
 * password typed at a hidden prompt, or a generated one when the prompt is left
 * empty; an existing account only has its role brought in line. No password is ever
 * printed for a typed answer, and none is ever written to a file.
 */

class NonInteractiveStdinError extends Error {}

function parseDatabasePathArgument(argv: readonly string[]): string | null {
  const flagIndex = argv.indexOf("--database");
  if (flagIndex === -1) return null;
  const databasePath = argv[flagIndex + 1];
  if (!databasePath) throw new Error("--database requires a path argument");
  return databasePath;
}

/**
 * Prompts on `promptText` with the typed characters hidden: readline still needs to
 * echo the prompt itself, so the override lets that first write through and swallows
 * every write after it, which is where the keystroke echoes land.
 */
function promptHiddenPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const readlineInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const mutedInterface = readlineInterface as unknown as {
      _writeToOutput: (stringToWrite: string) => void;
    };
    let promptWritten = false;
    mutedInterface._writeToOutput = (stringToWrite: string) => {
      if (promptWritten) return;
      process.stdout.write(stringToWrite);
      promptWritten = true;
    };
    readlineInterface.question(promptText, (typedAnswer) => {
      readlineInterface.close();
      process.stdout.write("\n");
      resolve(typedAnswer);
    });
  });
}

async function choosePassword(username: string): Promise<string | null> {
  if (!process.stdin.isTTY) {
    throw new NonInteractiveStdinError(
      `accounts:seed: stdin is not a terminal; cannot prompt for a password for ${username}`,
    );
  }
  const typedPassword = await promptHiddenPassword(`Password for ${username} (Enter to generate one): `);
  return typedPassword.length === 0 ? null : typedPassword;
}

function printOutcome(outcome: SeedOutcome): void {
  if (outcome.created && outcome.generatedPassword !== null) {
    console.log(`created ${outcome.username} (${outcome.role}), password: ${outcome.generatedPassword}`);
  } else if (outcome.created) {
    console.log(`created ${outcome.username} (${outcome.role})`);
  } else {
    console.log(`updated ${outcome.username} → ${outcome.role}`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const databasePath = parseDatabasePathArgument(process.argv.slice(2)) ?? config.databasePath;

  const database = openAccountsDatabase(databasePath);
  try {
    const store = new AccountStore(database, systemClock);
    const outcomes = await seedAccounts(store, SEED_ACCOUNTS, choosePassword);
    for (const outcome of outcomes) printOutcome(outcome);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof NonInteractiveStdinError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  }
  process.exitCode = 1;
});
