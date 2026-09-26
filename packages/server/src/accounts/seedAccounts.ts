import { randomBytes } from "node:crypto";
import type { Role } from "@eat.io/protocol";
import type { AccountStore } from "./accountStore.js";

export interface SeedEntry {
  username: string;
  role: Role;
}

/** No passwords live in the repo: a missing account is created with a caller-supplied or generated one. */
export const SEED_ACCOUNTS: readonly SeedEntry[] = [
  { username: "Bain", role: "creator" },
  { username: "Noah", role: "admin" },
  { username: "Ruby", role: "admin" },
  { username: "Mindi", role: "admin" },
  { username: "Clint", role: "admin" },
];

export interface SeedOutcome {
  username: string;
  role: Role;
  created: boolean;
  generatedPassword: string | null;
}

const GENERATED_PASSWORD_LENGTH = 16;
const GENERATED_PASSWORD_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function defaultGeneratePassword(): string {
  const randomIndexBytes = randomBytes(GENERATED_PASSWORD_LENGTH);
  let password = "";
  for (let characterIndex = 0; characterIndex < GENERATED_PASSWORD_LENGTH; characterIndex++) {
    const alphabetIndex = randomIndexBytes[characterIndex]! % GENERATED_PASSWORD_ALPHABET.length;
    password += GENERATED_PASSWORD_ALPHABET[alphabetIndex];
  }
  return password;
}

/** 16 characters from [A-Za-z0-9], drawn from crypto-random bytes. */
export const generatePassword: () => string = defaultGeneratePassword;

/**
 * Applies each seed entry: an existing account only gets its role set (when it
 * differs); a missing one is created with the password `choosePassword` supplies,
 * or a generated password when it returns null.
 */
export async function seedAccounts(
  store: AccountStore,
  entries: readonly SeedEntry[],
  choosePassword: (username: string) => Promise<string | null>,
  generatePassword: () => string = defaultGeneratePassword,
): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = [];

  for (const entry of entries) {
    const existingAccount = store.findByUsername(entry.username);
    if (existingAccount) {
      if (existingAccount.role !== entry.role) store.setRole(existingAccount.id, entry.role);
      outcomes.push({ username: entry.username, role: entry.role, created: false, generatedPassword: null });
      continue;
    }

    const chosenPassword = await choosePassword(entry.username);
    const generatedPassword = chosenPassword === null ? generatePassword() : null;
    const password = chosenPassword ?? generatedPassword;
    if (password === null) throw new Error(`seedAccounts: no password available for ${entry.username}`);

    const result = store.register(entry.username, password, entry.role);
    if (!result.ok) {
      throw new Error(`seedAccounts: could not create ${entry.username}: ${result.code}`);
    }
    outcomes.push({ username: entry.username, role: entry.role, created: true, generatedPassword });
  }

  return outcomes;
}
