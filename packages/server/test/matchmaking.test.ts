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

test("the public queue skips waiting players the predicate rejects", () => {
  const matchmaker = new Matchmaker(() => "CODE");
  matchmaker.joinPublic("p1");
  // p2 may not pair with p1, so p2 waits behind p1 instead.
  expect(matchmaker.joinPublic("p2", (other) => other !== "p1")).toEqual({ paired: false });
  // p3 may pair with anyone and takes the first waiting player.
  expect(matchmaker.joinPublic("p3")).toEqual({ paired: true, opponent: "p1" });
  expect(matchmaker.joinPublic("p4")).toEqual({ paired: true, opponent: "p2" });
});

test("the public queue passes over a rejected player to a later one", () => {
  const matchmaker = new Matchmaker(() => "CODE");
  matchmaker.joinPublic("p1");
  matchmaker.joinPublic("p2", (other) => other !== "p1");
  expect(matchmaker.joinPublic("p3", (other) => other !== "p1")).toEqual({ paired: true, opponent: "p2" });
  expect(matchmaker.isWaiting("p1")).toBe(true);
});

test("a private join the predicate rejects keeps the code open", () => {
  const matchmaker = new Matchmaker(() => "ABCD");
  matchmaker.createPrivate("host");
  expect(matchmaker.joinPrivate("twin", "ABCD", (other) => other !== "host")).toEqual({
    ok: false,
    reason: "cannot join your own room",
  });
  expect(matchmaker.joinPrivate("guest", "ABCD", () => true)).toEqual({ ok: true, host: "host" });
});

test("isWaiting covers the public queue and a held private code", () => {
  const matchmaker = new Matchmaker(() => "ABCD");
  expect(matchmaker.isWaiting("p1")).toBe(false);
  matchmaker.joinPublic("p1");
  expect(matchmaker.isWaiting("p1")).toBe(true);
  matchmaker.cancelPublic("p1");
  expect(matchmaker.isWaiting("p1")).toBe(false);

  matchmaker.createPrivate("host");
  expect(matchmaker.isWaiting("host")).toBe(true);
  matchmaker.joinPrivate("guest", "ABCD");
  expect(matchmaker.isWaiting("host")).toBe(false);
  expect(matchmaker.isWaiting("guest")).toBe(false);

  matchmaker.createPrivate("host");
  matchmaker.remove("host");
  expect(matchmaker.isWaiting("host")).toBe(false);
});
