import { expect, test } from "vitest";
import { createPendingAccountMessageHolder } from "../src/state/pendingAccountMessage.js";

test("an empty holder has nothing to take", () => {
  const holder = createPendingAccountMessageHolder();
  expect(holder.take()).toBeNull();
});

test("set then take returns the message and clears it", () => {
  const holder = createPendingAccountMessageHolder();
  const message = { type: "accountLogin", username: "Riley", password: "hunter2222" } as const;
  holder.set(message);
  expect(holder.take()).toEqual(message);
  expect(holder.take()).toBeNull();
});

test("clear drops a held message without returning it", () => {
  const holder = createPendingAccountMessageHolder();
  holder.set({ type: "accountRegister", username: "Riley", password: "hunter2222" });
  holder.clear();
  expect(holder.take()).toBeNull();
});

test("a disconnect clears a message that never got its welcome, so it cannot leak into a later connection", () => {
  const holder = createPendingAccountMessageHolder();
  // connectAndLogin sets this, then the player backs out before `welcome` arrives.
  holder.set({ type: "accountLogin", username: "Riley", password: "hunter2222" });
  // leaveToMenu/disconnect calls this on its way out.
  holder.clear();
  // A later, unrelated connection (e.g. "Play as guest") must not inherit it.
  expect(holder.take()).toBeNull();
});

test("set replaces whatever was already held", () => {
  const holder = createPendingAccountMessageHolder();
  holder.set({ type: "accountRegister", username: "Riley", password: "hunter2222" });
  holder.set({ type: "accountLogin", username: "Sam", password: "hunter2222" });
  expect(holder.take()).toEqual({ type: "accountLogin", username: "Sam", password: "hunter2222" });
});
