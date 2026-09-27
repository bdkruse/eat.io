import { expect, test } from "vitest";
import { selectShot } from "../src/scene/cameraShots.js";

test("the menu shot shows the cafeteria", () => {
  expect(selectShot("connect", false)).toBe("menu");
});

test("showing your kid moves the camera to them from the menu or the queue", () => {
  expect(selectShot("connect", true)).toBe("customize");
  expect(selectShot("queue", true)).toBe("customize");
});

test("the profile panel shows your kid the same way as customizing does, from the menu or the queue", () => {
  // selectShot only sees one boolean — the caller ORs "customizing" and "profile open"
  // together before calling it (§11) — so the profile case is exercised the same as
  // customizing here.
  expect(selectShot("connect", true)).toBe("customize");
  expect(selectShot("queue", true)).toBe("customize");
});

test("a game outranks showing your kid, so a match found mid-edit or mid-profile goes to the table", () => {
  expect(selectShot("game", true)).toBe("game");
  expect(selectShot("gameOver", true)).toBe("gameOver");
});

test("a tall, narrow window turns the table for the game but not for the menus", () => {
  expect(selectShot("game", false, true)).toBe("gamePortrait");
  expect(selectShot("connect", false, true)).toBe("menu");
  expect(selectShot("gameOver", false, true)).toBe("gameOver");
});

test("each remaining screen has its own shot", () => {
  expect(selectShot("queue", false)).toBe("queue");
  expect(selectShot("game", false)).toBe("game");
  expect(selectShot("gameOver", false)).toBe("gameOver");
});

test("the admin or creator panel forces the menu shot, from the queue or the game-over screen", () => {
  expect(selectShot("queue", false, false, true)).toBe("menu");
  expect(selectShot("gameOver", false, false, true)).toBe("menu");
  expect(selectShot("connect", false, true, true)).toBe("menu");
});

test("with neither panel open, the fourth argument defaults to not forcing the menu shot", () => {
  expect(selectShot("queue", false)).toBe("queue");
});
