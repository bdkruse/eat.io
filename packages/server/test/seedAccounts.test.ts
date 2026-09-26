import { describe, expect, test } from "vitest";
import { manualTime } from "../src/lobby/timers.js";
import { openAccountsDatabase, type AccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { generatePassword, SEED_ACCOUNTS, seedAccounts, type SeedOutcome } from "../src/accounts/seedAccounts.js";

function makeStore(): { database: AccountsDatabase; store: AccountStore } {
  const database = openAccountsDatabase(":memory:");
  const { clock } = manualTime();
  const store = new AccountStore(database, clock);
  return { database, store };
}

describe("generatePassword", () => {
  test("produces a 16-character alphanumeric password", () => {
    const password = generatePassword();
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[A-Za-z0-9]{16}$/);
  });
});

describe("seedAccounts", () => {
  test("a first run creates all five seed accounts with the right roles and reports generated passwords", async () => {
    const { store } = makeStore();
    const outcomes = await seedAccounts(store, SEED_ACCOUNTS, async () => null);

    expect(outcomes).toHaveLength(5);
    for (const outcome of outcomes) {
      expect(outcome.created).toBe(true);
      expect(outcome.generatedPassword).not.toBeNull();
      expect(outcome.generatedPassword).toHaveLength(16);
    }

    expect(store.findByUsername("Bain")?.role).toBe("creator");
    expect(store.findByUsername("Noah")?.role).toBe("admin");
    expect(store.findByUsername("Ruby")?.role).toBe("admin");
    expect(store.findByUsername("Mindi")?.role).toBe("admin");
    expect(store.findByUsername("Clint")?.role).toBe("admin");
  });

  test("a second run creates nothing and leaves password hashes unchanged", async () => {
    const { store, database } = makeStore();
    await seedAccounts(store, SEED_ACCOUNTS, async () => null);
    const before = database.prepare("SELECT password_hash FROM accounts WHERE username = ?").get("Bain") as {
      password_hash: string;
    };

    const outcomes = await seedAccounts(store, SEED_ACCOUNTS, async () => null);

    expect(outcomes.every((outcome) => outcome.created === false)).toBe(true);
    expect(outcomes.every((outcome) => outcome.generatedPassword === null)).toBe(true);

    const after = database.prepare("SELECT password_hash FROM accounts WHERE username = ?").get("Bain") as {
      password_hash: string;
    };
    expect(after.password_hash).toBe(before.password_hash);
  });

  test("an existing player account named noah is promoted to admin", async () => {
    const { store } = makeStore();
    const registered = store.register("noah", "correct horse battery staple", "player");
    if (!registered.ok) throw new Error("setup failed");

    await seedAccounts(store, SEED_ACCOUNTS, async () => null);

    expect(store.findByUsername("Noah")?.role).toBe("admin");
  });

  test("choosePassword's returned password is used instead of a generated one", async () => {
    const { store } = makeStore();
    const outcomes = await seedAccounts(store, SEED_ACCOUNTS, async (username) =>
      username === "Bain" ? "a chosen password for bain" : null,
    );

    const bainOutcome = outcomes.find((outcome) => outcome.username === "Bain");
    expect(bainOutcome?.generatedPassword).toBeNull();
    expect(store.verifyLogin("Bain", "a chosen password for bain")).not.toBeNull();
  });

  test("onOutcome receives an earlier account's outcome, including its generated password, before a later failure propagates", async () => {
    const { store } = makeStore();
    const receivedOutcomes: SeedOutcome[] = [];
    const choosePassword = async (username: string): Promise<string | null> => {
      if (username === "Bain") return null;
      throw new Error("choosePassword failed for a later account");
    };

    await expect(
      seedAccounts(store, SEED_ACCOUNTS, choosePassword, generatePassword, (outcome) =>
        receivedOutcomes.push(outcome),
      ),
    ).rejects.toThrow("choosePassword failed for a later account");

    expect(receivedOutcomes).toHaveLength(1);
    expect(receivedOutcomes[0]?.username).toBe("Bain");
    expect(receivedOutcomes[0]?.created).toBe(true);
    expect(receivedOutcomes[0]?.generatedPassword).not.toBeNull();
  });
});
