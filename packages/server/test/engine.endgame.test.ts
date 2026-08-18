import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { isGameOver, rankResult, resultFor } from "../src/engine/engine.js";

function game() {
  return createGame({
    roomId: "r1",
    seats: [
      { id: "p1", seat: "a", name: "Riley" },
      { id: "p2", seat: "b", name: "Sam" },
    ],
    rules: defaultRules,
    roundCount: 10,
    seed: 5,
  });
}

test("isGameOver reads the round, never the score", () => {
  const g = game();
  g.players["p1"]!.score = 9999; // huge score must NOT end the game
  expect(isGameOver({ ...g, roundIndex: 0 })).toBe(false);
  expect(isGameOver({ ...g, roundIndex: 10 })).toBe(true);
});

test("rankResult picks the higher score and represents a draw as winner null", () => {
  const g = game();
  g.players["p1"]!.score = 20;
  g.players["p2"]!.score = 14;
  expect(rankResult(g)).toEqual({ scores: { a: 20, b: 14 }, winner: "a" });
  g.players["p2"]!.score = 20;
  expect(rankResult(g)).toEqual({ scores: { a: 20, b: 20 }, winner: null });
});

test("resultFor is relative to the viewer", () => {
  const ranked = { scores: { a: 20, b: 14 } as Record<"a" | "b", number>, winner: "a" as const };
  expect(resultFor(ranked, "a").kind).toBe("win");
  expect(resultFor(ranked, "b").kind).toBe("loss");
  expect(resultFor({ scores: { a: 5, b: 5 }, winner: null }, "a").kind).toBe("draw");
});
