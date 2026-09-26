import readline from "node:readline";
import { loadConfig } from "../src/config.js";
import { openAccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { SEED_ACCOUNTS, generatePassword, seedAccounts, type SeedOutcome } from "../src/accounts/seedAccounts.js";
import { systemClock } from "../src/lobby/timers.js";

/**
 * Creates or promotes the seed accounts (`SEED_ACCOUNTS`) against the configured
 * database. Run with `npm run accounts:seed`. A missing account is created with a
 * password typed at a hidden prompt, or a generated one when the prompt is left
 * empty; an existing account only has its role brought in line. No password is ever
 * printed for a typed answer, and none is ever written to a file.
 */

class NonInteractiveStdinError extends Error {}

/** Raised when the person at the hidden prompt presses Ctrl-C. */
class PasswordPromptCancelledError extends Error {}

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
 *
 * While this prompt is on screen, readline puts the terminal in raw mode (no echo, no
 * line canonicalization, no signal generation), so a Ctrl-C keystroke arrives as a
 * plain `\x03` byte instead of a real `SIGINT` — the operating system never sees it as
 * a signal at all. Node's readline turns that byte back into a `"SIGINT"` event on the
 * interface itself, but only once something is listening for it; with no listener the
 * event is dropped and the process just sits there, terminal still raw. The listener
 * below closes the interface, puts the terminal back in its normal (cooked) mode, and
 * rejects so the caller can exit cleanly instead of hanging.
 */
function promptHiddenPassword(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
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

    readlineInterface.on("SIGINT", () => {
      readlineInterface.close();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write("\n");
      reject(new PasswordPromptCancelledError("accounts:seed: cancelled at the password prompt"));
    });

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
    // Not created by this run: an account with this name already existed, and it may
    // belong to someone other than the person the seed list means (final review, item 6).
    console.log(`updated ${outcome.username} → ${outcome.role} (existing account — check it is really theirs)`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const databasePath = parseDatabasePathArgument(process.argv.slice(2)) ?? config.databasePath;

  const database = openAccountsDatabase(databasePath);
  try {
    const store = new AccountStore(database, systemClock);
    await seedAccounts(store, SEED_ACCOUNTS, choosePassword, generatePassword, printOutcome);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof NonInteractiveStdinError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  if (error instanceof PasswordPromptCancelledError) {
    process.exitCode = 130;
    return;
  }
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
