import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { deckTotal, type DeckEntry, type GameSettings } from "@eat.io/protocol";
import { manualTime } from "../src/lobby/timers.js";
import { MIGRATIONS, openAccountsDatabase, type AccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";
import { STARTING_DECK } from "../src/engine/rules/content.js";
import { GameConfigStore } from "../src/gameConfig/gameConfigStore.js";

const DEFAULT_SETTINGS: GameSettings = { roundCount: 20, turnSeconds: 20, handSize: 5 };

function makeStore(): {
  database: AccountsDatabase;
  store: GameConfigStore;
  accountStore: AccountStore;
  advance: (ms: number) => void;
} {
  const database = openAccountsDatabase(":memory:");
  const { clock, advance } = manualTime();
  const store = new GameConfigStore(database, clock);
  const accountStore = new AccountStore(database, clock);
  return { database, store, accountStore, advance };
}

function sortByCardId(entries: readonly DeckEntry[]): DeckEntry[] {
  return [...entries].sort((a, b) => a.cardId.localeCompare(b.cardId));
}

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("migration 2", () => {
  test("a version 1 database with an account upgrades to version 2 and the account is intact", () => {
    const directory = mkdtempSync(join(tmpdir(), "eatio-gameconfig-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "eatio.sqlite");

    // Simulate a production database that has only ever run migration 1.
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(MIGRATIONS[0]!);
    legacyDatabase.pragma("user_version = 1");
    legacyDatabase
      .prepare(
        "INSERT INTO accounts (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(1, "Bain", "a-real-password-hash", "creator", 0);
    legacyDatabase.close();

    const upgraded = openAccountsDatabase(databasePath);
    expect(upgraded.pragma("user_version", { simple: true })).toBe(2);

    const account = upgraded.prepare("SELECT * FROM accounts WHERE username = ?").get("Bain") as {
      username: string;
      password_hash: string;
      role: string;
    };
    expect(account.username).toBe("Bain");
    expect(account.password_hash).toBe("a-real-password-hash");
    expect(account.role).toBe("creator");

    // The new tables exist and start empty; ensureDefaults, not the migration, seeds them.
    const settingsCount = upgraded.prepare("SELECT COUNT(*) as count FROM game_settings").get() as {
      count: number;
    };
    const deckCount = upgraded.prepare("SELECT COUNT(*) as count FROM default_deck").get() as {
      count: number;
    };
    expect(settingsCount.count).toBe(0);
    expect(deckCount.count).toBe(0);

    upgraded.close();
  });
});

describe("GameConfigStore", () => {
  test("ensureDefaults fills empty tables and never overwrites saved values", () => {
    const { store } = makeStore();
    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);

    expect(store.getSettings().settings).toEqual(DEFAULT_SETTINGS);
    expect(sortByCardId(store.getDeck().entries)).toEqual(sortByCardId(STARTING_DECK));

    // A second call with different values fills nothing further: every row is already there.
    store.ensureDefaults({ roundCount: 1, turnSeconds: 5, handSize: 3 }, [{ cardId: "add1x1", copies: 99 }]);

    expect(store.getSettings().settings).toEqual(DEFAULT_SETTINGS);
    expect(sortByCardId(store.getDeck().entries)).toEqual(sortByCardId(STARTING_DECK));
  });

  test("ensureDefaults never overwrites values already saved by an admin or creator", () => {
    const { store, accountStore } = makeStore();
    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);
    const registered = accountStore.register("gooduser", "correct horse battery staple", "admin");
    if (!registered.ok) throw new Error("setup failed");

    const savedSettings: GameSettings = { roundCount: 15, turnSeconds: 45, handSize: 6 };
    store.saveSettings(savedSettings, registered.account.id);

    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);

    expect(store.getSettings().settings).toEqual(savedSettings);
  });

  test("saveSettings then getSettings round trips with updatedAt from the clock and updatedBy the account's username", () => {
    const { store, accountStore, advance } = makeStore();
    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);
    const registered = accountStore.register("gooduser", "correct horse battery staple", "admin");
    if (!registered.ok) throw new Error("setup failed");

    advance(5000);
    const newSettings: GameSettings = { roundCount: 10, turnSeconds: 30, handSize: 4 };
    store.saveSettings(newSettings, registered.account.id);

    const found = store.getSettings();
    expect(found.settings).toEqual(newSettings);
    expect(found.updatedAt).toBe(5000);
    expect(found.updatedBy).toBe("gooduser");
  });

  test("getSettings reports null updatedAt and updatedBy before any save", () => {
    const { store } = makeStore();
    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);

    const found = store.getSettings();
    expect(found.updatedAt).toBeNull();
    expect(found.updatedBy).toBeNull();
  });

  test("updatedBy reads back null once the account behind a save is gone", () => {
    const { store, database, accountStore } = makeStore();
    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);
    const registered = accountStore.register("gooduser", "correct horse battery staple", "admin");
    if (!registered.ok) throw new Error("setup failed");
    store.saveSettings({ roundCount: 12, turnSeconds: 60, handSize: 7 }, registered.account.id);

    database.pragma("foreign_keys = OFF");
    database.prepare("DELETE FROM accounts WHERE id = ?").run(registered.account.id);
    database.pragma("foreign_keys = ON");

    expect(store.getSettings().updatedBy).toBeNull();
  });

  test("saveDeck then getDeck round trips with updatedAt and updatedBy, and replaces removed cards", () => {
    const { store, accountStore, advance } = makeStore();
    store.ensureDefaults(DEFAULT_SETTINGS, STARTING_DECK);
    const registered = accountStore.register("thecreator", "correct horse battery staple", "creator");
    if (!registered.ok) throw new Error("setup failed");

    advance(9000);
    const newDeck: DeckEntry[] = [
      { cardId: "add1x1", copies: 12 },
      { cardId: "mul3x1", copies: 8 },
    ];
    store.saveDeck(newDeck, registered.account.id);

    const found = store.getDeck();
    expect(sortByCardId(found.entries)).toEqual(sortByCardId(newDeck));
    expect(found.updatedAt).toBe(9000);
    expect(found.updatedBy).toBe("thecreator");

    // A card present before the save but absent from the new list is gone, not zeroed.
    expect(found.entries.some((entry) => entry.cardId === "add1x2")).toBe(false);
  });

  test("inserting copies outside 0-40 directly is rejected by the check constraint", () => {
    const { database } = makeStore();
    expect(() =>
      database.prepare("INSERT INTO default_deck (card_id, copies) VALUES (?, ?)").run("add1x1", 41),
    ).toThrow();
    expect(() =>
      database.prepare("INSERT INTO default_deck (card_id, copies) VALUES (?, ?)").run("add1x2", -1),
    ).toThrow();
  });

  test("the starting deck totals 40", () => {
    expect(deckTotal([...STARTING_DECK])).toBe(40);
  });
});
