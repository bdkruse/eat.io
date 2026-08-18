import { expect, test } from "vitest";
import { parseServerMessage } from "@eat.io/protocol";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import {
  autoMove,
  everyoneSubmitted,
  isGameOver,
  rankResult,
  resolveRound,
  viewFor,
} from "../src/engine/engine.js";

function play(seed: number) {
  let g = createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed,
  });
  let guard = 0;
  while (!isGameOver(g)) {
    g = autoMove(g, "p1");
    g = autoMove(g, "p2");
    expect(everyoneSubmitted(g)).toBe(true);
    ({ state: g } = resolveRound(g, defaultRules));
    if (++guard > 100) throw new Error("game did not terminate");
  }
  return g;
}

test("a full game terminates after roundCount rounds with valid state throughout", () => {
  const g = play(7);
  expect(g.roundIndex).toBe(10);
  for (const p of Object.values(g.players)) {
    expect(p.score).toBeGreaterThan(0);
    expect(p.hand.length).toBe(defaultRules.config.handSize);
    expect(p.table.length).toBe(defaultRules.config.tableLength);
  }
  const ranked = rankResult(g);
  expect(ranked.winner === null || ranked.winner === "a" || ranked.winner === "b").toBe(true);
  expect(() => parseServerMessage(viewFor(g, "p1", null))).not.toThrow();
});

test("same seed produces identical final scores (reproducible)", () => {
  const scores = (seed: number) => Object.values(play(seed).players).map((p) => p.score);
  expect(scores(11)).toEqual(scores(11));
});
