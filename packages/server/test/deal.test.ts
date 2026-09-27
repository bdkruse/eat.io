import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { deckTotal } from "@eat.io/protocol";
import { defaultRules } from "../src/engine/rules/index.js";

const opts = () => ({
  roomId: "r1",
  seats: [
    { id: "p1", seat: "a" as const, name: "Riley" },
    { id: "p2", seat: "b" as const, name: "Sam" },
  ],
  rules: defaultRules,
  roundCount: 10,
  seed: 123,
});

test("each player gets exactly handSize cards and tableLength trays", () => {
  const g = createGame(opts());
  for (const p of Object.values(g.players)) {
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
    expect(p.deck.length).toBe(deckTotal([...defaultRules.config.deck]) - defaultRules.config.handSize);
    expect(p.score).toBe(0);
    expect(p.submission).toBeNull();
    expect(p.connected).toBe(true);
  }
});

test("all tray ids in the game are unique", () => {
  const g = createGame(opts());
  const ids = Object.values(g.players).flatMap((p) => p.table.map((t) => t.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test("same seed produces an identical deal", () => {
  const a = createGame(opts());
  const b = createGame(opts());
  expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
});
