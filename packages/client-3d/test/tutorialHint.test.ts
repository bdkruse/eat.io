import { expect, test } from "vitest";
import { TUTORIAL_HINT_KEY, markTutorialHintSeen, tutorialHintSeen } from "../src/tutorial/tutorialHint.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const backing = new Map<string, string>();
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
  };
}

const throwingStorage: Pick<Storage, "getItem" | "setItem"> = {
  getItem: () => {
    throw new Error("storage blocked");
  },
  setItem: () => {
    throw new Error("storage blocked");
  },
};

test("the hint key is the one the plan names", () => {
  expect(TUTORIAL_HINT_KEY).toBe("eatio.tutorialHintSeen");
});

test("a first visit has not seen the hint, and marking it seen sticks", () => {
  const storage = memoryStorage();
  expect(tutorialHintSeen(storage)).toBe(false);
  markTutorialHintSeen(storage);
  expect(tutorialHintSeen(storage)).toBe(true);
  expect(storage.getItem(TUTORIAL_HINT_KEY)).not.toBeNull();
});

test("the hint counts as unseen with no storage or with storage that throws", () => {
  expect(tutorialHintSeen(null)).toBe(false);
  expect(tutorialHintSeen(throwingStorage)).toBe(false);
});

test("marking the hint seen never throws", () => {
  expect(() => markTutorialHintSeen(null)).not.toThrow();
  expect(() => markTutorialHintSeen(throwingStorage)).not.toThrow();
});
