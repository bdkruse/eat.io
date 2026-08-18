import { expect, test, vi } from "vitest";
import type { ServerMessage } from "@eat.io/protocol";
import { Session } from "../src/session/session.js";

const pong: ServerMessage = { type: "pong" };

test("send delivers while connected and no-ops while detached", () => {
  const sink = vi.fn();
  const s = new Session({ id: "p1", name: "Riley", token: "tok", send: sink });
  s.send(pong);
  s.detach();
  s.send(pong);
  expect(sink).toHaveBeenCalledTimes(1);
  expect(s.connected).toBe(false);
});

test("attach swaps the socket and marks connected again", () => {
  const first = vi.fn();
  const second = vi.fn();
  const s = new Session({ id: "p1", name: "Riley", token: "tok", send: first });
  s.detach();
  s.attach(second);
  s.send(pong);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(s.connected).toBe(true);
});
