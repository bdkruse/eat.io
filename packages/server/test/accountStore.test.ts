import { describe, expect, test } from "vitest";
import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type Appearance,
} from "@eat.io/protocol";
import { manualTime } from "../src/lobby/timers.js";
import { openAccountsDatabase, type AccountsDatabase } from "../src/accounts/database.js";
import { AccountStore } from "../src/accounts/accountStore.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const SAMPLE_APPEARANCE: Appearance = {
  skinTone: SKIN_TONES[0],
  hairStyle: HAIR_STYLES[0],
  hairColor: HAIR_COLORS[0],
  shirtColor: SHIRT_COLORS[0],
  pantsColor: PANTS_COLORS[0],
  accessory: ACCESSORIES[0],
};

function makeStore(): {
  database: AccountsDatabase;
  store: AccountStore;
  advance: (ms: number) => void;
} {
  const database = openAccountsDatabase(":memory:");
  const { clock, advance } = manualTime();
  const store = new AccountStore(database, clock);
  return { database, store, advance };
}

describe("AccountStore", () => {
  test("register then find by username is case-insensitive", () => {
    const { store } = makeStore();
    const result = store.register("Bain", "correct horse battery staple");
    expect(result.ok).toBe(true);

    const found = store.findByUsername("BAIN");
    expect(found?.username).toBe("Bain");
  });

  test("a duplicate username in other capitals is rejected", () => {
    const { store } = makeStore();
    store.register("Bain", "correct horse battery staple");
    const duplicate = store.register("bAIN", "another good password");
    expect(duplicate).toEqual({ ok: false, code: "USERNAME_TAKEN" });
  });

  test("a bad username is rejected", () => {
    const { store } = makeStore();
    const result = store.register("no", "correct horse battery staple");
    expect(result).toEqual({ ok: false, code: "INVALID_USERNAME" });
  });

  test("a bad password is rejected", () => {
    const { store } = makeStore();
    const result = store.register("gooduser", "short");
    expect(result).toEqual({ ok: false, code: "INVALID_PASSWORD" });
  });

  test("verifyLogin accepts the right password and rejects the wrong one", () => {
    const { store } = makeStore();
    store.register("gooduser", "correct horse battery staple");
    expect(store.verifyLogin("gooduser", "correct horse battery staple")?.username).toBe("gooduser");
    expect(store.verifyLogin("gooduser", "wrong password entirely")).toBeNull();
  });

  test("recordLogin sets lastLoginAt to the clock", () => {
    const { store, advance } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    advance(5000);
    const updated = store.recordLogin(registered.account.id);
    expect(updated.lastLoginAt).toBe(5000);
  });

  test("a login token resumes to its account, then expires after 30 days and the row is gone", () => {
    const { store, database, advance } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    const token = store.createLoginToken(registered.account.id);
    expect(store.resumeLoginToken(token)?.id).toBe(registered.account.id);

    advance(THIRTY_DAYS_MS);
    expect(store.resumeLoginToken(token)).toBeNull();

    const remaining = database.prepare("SELECT COUNT(*) as count FROM login_tokens").get() as {
      count: number;
    };
    expect(remaining.count).toBe(0);
  });

  test("deleteOtherLoginTokens keeps only the named token", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    const keepToken = store.createLoginToken(registered.account.id);
    const otherToken1 = store.createLoginToken(registered.account.id);
    const otherToken2 = store.createLoginToken(registered.account.id);

    store.deleteOtherLoginTokens(registered.account.id, keepToken);

    expect(store.resumeLoginToken(keepToken)?.id).toBe(registered.account.id);
    expect(store.resumeLoginToken(otherToken1)).toBeNull();
    expect(store.resumeLoginToken(otherToken2)).toBeNull();
  });

  test("changePassword succeeds, rejects the wrong current password, and rejects a bad new password", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");
    const accountId = registered.account.id;

    expect(store.changePassword(accountId, "wrong password entirely", "new good password")).toBe(
      "WRONG_PASSWORD",
    );
    expect(store.changePassword(accountId, "correct horse battery staple", "short")).toBe(
      "INVALID_PASSWORD",
    );
    expect(store.changePassword(accountId, "correct horse battery staple", "new good password")).toBe("ok");
    expect(store.verifyLogin("gooduser", "new good password")).not.toBeNull();
  });

  test("saveAppearance round-trips", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    store.saveAppearance(registered.account.id, SAMPLE_APPEARANCE);
    const found = store.get(registered.account.id);
    expect(found?.appearance).toEqual(SAMPLE_APPEARANCE);
  });

  test("a stored appearance that fails schema validation reads back as null", () => {
    const { store, database } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");

    database
      .prepare("UPDATE accounts SET appearance = ? WHERE id = ?")
      .run("{\"skinTone\":\"#not-a-real-color\"}", registered.account.id);

    const found = store.get(registered.account.id);
    expect(found?.appearance).toBeNull();
  });

  test("recordGames updates points, games played, and games won across a win, a loss, and a draw", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple");
    if (!registered.ok) throw new Error("setup failed");
    const accountId = registered.account.id;

    store.recordGames([
      { accountId, score: 12, won: true },
      { accountId, score: 0, won: false },
      { accountId, score: 6, won: false },
    ]);

    const found = store.get(accountId);
    expect(found?.pointsScored).toBe(18);
    expect(found?.gamesPlayed).toBe(3);
    expect(found?.gamesWon).toBe(1);
  });

  test("inserting an unknown role directly is rejected by the check constraint", () => {
    const { database } = makeStore();
    expect(() =>
      database
        .prepare("INSERT INTO accounts (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)")
        .run("intruder", "irrelevant", "boss", 0),
    ).toThrow();
  });

  test("profileOf a creator lists admin.open among its permissions", () => {
    const { store } = makeStore();
    const registered = store.register("gooduser", "correct horse battery staple", "creator");
    if (!registered.ok) throw new Error("setup failed");

    const profile = store.profileOf(registered.account);
    expect(profile.permissions).toContain("admin.open");
  });
});
