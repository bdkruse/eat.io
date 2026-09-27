import { expect, test } from "vitest";
import {
  isValidUsername,
  isValidPassword,
  permissionsFor,
  PERMISSIONS,
  AppearanceSchema,
} from "../src/index.js";

test("isValidUsername accepts letters, digits, underscore, and hyphen within 3-14 chars", () => {
  expect(isValidUsername("Bain")).toBe(true);
  expect(isValidUsername("a_b-c")).toBe(true);
  expect(isValidUsername("abc")).toBe(true); // 3 chars, the floor
  expect(isValidUsername("abcdefghijklmn")).toBe(true); // 14 chars, the ceiling
});

test("isValidUsername rejects too short, too long, spaces, symbols, and empty", () => {
  expect(isValidUsername("ab")).toBe(false); // 2 chars
  expect(isValidUsername("abcdefghijklmno")).toBe(false); // 15 chars
  expect(isValidUsername("a b")).toBe(false);
  expect(isValidUsername("a@b")).toBe(false);
  expect(isValidUsername("")).toBe(false);
});

test("isValidPassword accepts 8 and 128 characters", () => {
  expect(isValidPassword("a".repeat(8))).toBe(true);
  expect(isValidPassword("a".repeat(128))).toBe(true);
});

test("isValidPassword rejects 7 and 129 characters", () => {
  expect(isValidPassword("a".repeat(7))).toBe(false);
  expect(isValidPassword("a".repeat(129))).toBe(false);
});

test("permissionsFor maps each role to its permissions", () => {
  expect(permissionsFor("creator")).toEqual([...PERMISSIONS]);
  expect(permissionsFor("player")).toEqual([]);
  expect(permissionsFor("admin")).toContain("admin.open");
});

test("admin gets settings.edit but not deck.edit; creator gets all three permissions", () => {
  const adminPermissions = permissionsFor("admin");
  expect(adminPermissions).toContain("admin.open");
  expect(adminPermissions).toContain("settings.edit");
  expect(adminPermissions).not.toContain("deck.edit");

  expect(permissionsFor("creator")).toEqual(["admin.open", "settings.edit", "deck.edit"]);
});

test("AppearanceSchema accepts a valid look and rejects an out-of-palette color", () => {
  const validAppearance = {
    skinTone: "#eec19b",
    hairStyle: "bob",
    hairColor: "#5a3825",
    shirtColor: "#4a7fa5",
    pantsColor: "#3f5a7a",
    accessory: "glasses",
  };
  expect(AppearanceSchema.parse(validAppearance)).toEqual(validAppearance);
  expect(() =>
    AppearanceSchema.parse({ ...validAppearance, skinTone: "#000000" }),
  ).toThrow();
});
