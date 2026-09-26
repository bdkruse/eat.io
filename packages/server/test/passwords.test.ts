import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "../src/accounts/passwords.js";

describe("passwords", () => {
  test("a password round-trips through hash and verify", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  test("a wrong password fails verification", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password entirely", stored)).toBe(false);
  });

  test("two hashes of the same password differ", () => {
    const firstHash = hashPassword("same password value");
    const secondHash = hashPassword("same password value");
    expect(firstHash).not.toBe(secondHash);
  });

  test("a malformed stored value returns false rather than throwing", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "scrypt$16384$8$1$onlyfiveparts")).toBe(false);
    expect(verifyPassword("anything", "bcrypt$10$salt$hash$extra$fields")).toBe(false);
  });
});
