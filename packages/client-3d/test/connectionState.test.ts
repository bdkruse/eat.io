import { expect, test } from "vitest";
import {
  backoffMs,
  connectionReducer,
  retryDelayMs,
  initialConnectionState,
  type ConnectionState,
} from "../src/connection/connectionState.js";

const after = (state: ConnectionState, ...events: Parameters<typeof connectionReducer>[1][]) =>
  events.reduce(connectionReducer, state);

test("a successful connection clears errors and resets the attempt counter", () => {
  const state = after(initialConnectionState, { type: "connect" }, { type: "opened" });
  expect(state.phase).toBe("connected");
  expect(state.error).toBeNull();
  expect(state.attempt).toBe(0);
});

test("losing a live session moves to reconnecting and counts attempts", () => {
  let state = after(initialConnectionState, { type: "connect" }, { type: "opened" });
  state = connectionReducer(state, { type: "closed", hadSession: true, withinWakeWindow: false });
  expect(state.phase).toBe("reconnecting");
  expect(state.attempt).toBe(1);
  state = connectionReducer(state, { type: "closed", hadSession: true, withinWakeWindow: false });
  expect(state.attempt).toBe(2);
});

test("closing without a session simply returns to idle", () => {
  const state = after(
    initialConnectionState,
    { type: "connect" },
    { type: "opened" },
    { type: "closed", hadSession: false, withinWakeWindow: false },
  );
  expect(state.phase).toBe("idle");
  expect(state.attempt).toBe(0);
});

test("a failure records the reason and is recoverable by connecting again", () => {
  let state = connectionReducer(initialConnectionState, { type: "failed", error: "nope" });
  expect(state).toMatchObject({ phase: "failed", error: "nope" });
  state = connectionReducer(state, { type: "connect" });
  expect(state.phase).toBe("connecting");
  expect(state.error).toBeNull();
});

test("reset returns to the initial state", () => {
  const live = after(initialConnectionState, { type: "connect" }, { type: "opened" });
  expect(connectionReducer(live, { type: "reset" })).toEqual(initialConnectionState);
});

test("backoff grows then caps, and is never zero", () => {
  expect(backoffMs(1)).toBe(500);
  expect(backoffMs(2)).toBe(1000);
  expect(backoffMs(3)).toBe(2000);
  expect(backoffMs(99)).toBe(8000);
  expect(backoffMs(0)).toBe(500);
});

test("a first connection that closes before opening keeps trying while the server wakes", () => {
  let state = after(initialConnectionState, { type: "connect" }, { type: "failed", error: "Could not reach the server." });
  state = connectionReducer(state, { type: "closed", hadSession: false, withinWakeWindow: true });
  expect(state.phase).toBe("waking");
  expect(state.error).toBeNull();
  expect(state.attempt).toBe(1);
  state = connectionReducer(state, { type: "connect" });
  state = connectionReducer(state, { type: "closed", hadSession: false, withinWakeWindow: true });
  expect(state.phase).toBe("waking");
  expect(state.attempt).toBe(2);
});

test("once the wake window has passed, a first connection that never opened is a failure", () => {
  const state = after(
    initialConnectionState,
    { type: "connect" },
    { type: "failed", error: "Could not reach the server." },
    { type: "closed", hadSession: false, withinWakeWindow: false },
  );
  expect(state.phase).toBe("failed");
  expect(state.error).toBe("Could not reach the server.");
});

test("a server that finishes waking connects normally", () => {
  const state = after(
    initialConnectionState,
    { type: "connect" },
    { type: "closed", hadSession: false, withinWakeWindow: true },
    { type: "connect" },
    { type: "opened" },
  );
  expect(state).toEqual({ phase: "connected", error: null, attempt: 0 });
});

test("retries come quickly while waking, and back off while reconnecting a lost session", () => {
  expect(retryDelayMs({ phase: "waking", error: null, attempt: 7 })).toBe(2000);
  expect(retryDelayMs({ phase: "reconnecting", error: null, attempt: 3 })).toBe(backoffMs(3));
  expect(retryDelayMs({ phase: "failed", error: "x", attempt: 0 })).toBeNull();
  expect(retryDelayMs({ phase: "idle", error: null, attempt: 0 })).toBeNull();
});
