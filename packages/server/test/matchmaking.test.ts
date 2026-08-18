import { expect, test } from "vitest";
import { Matchmaker } from "../src/lobby/matchmaking.js";

test("public queue pairs the second arrival with the first", () => {
  const mm = new Matchmaker(() => "CODE");
  expect(mm.joinPublic("p1")).toEqual({ paired: false });
  expect(mm.joinPublic("p2")).toEqual({ paired: true, opponent: "p1" });
  // queue now empty — a third waits again
  expect(mm.joinPublic("p3")).toEqual({ paired: false });
});

test("cancel removes a waiting player", () => {
  const mm = new Matchmaker(() => "CODE");
  mm.joinPublic("p1");
  mm.cancelPublic("p1");
  expect(mm.joinPublic("p2")).toEqual({ paired: false });
});

test("private room joins by code and rejects unknown or self", () => {
  const mm = new Matchmaker(() => "ABCD");
  const code = mm.createPrivate("host");
  expect(code).toBe("ABCD");
  expect(mm.joinPrivate("host", "ABCD")).toEqual({ ok: false, reason: "cannot join your own room" });
  expect(mm.joinPrivate("guest", "ZZZZ")).toEqual({ ok: false, reason: "no such room" });
  expect(mm.joinPrivate("guest", "ABCD")).toEqual({ ok: true, host: "host" });
  // code consumed
  expect(mm.joinPrivate("late", "ABCD")).toEqual({ ok: false, reason: "no such room" });
});
