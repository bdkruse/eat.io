import { expect, test } from "vitest";
import { createGame } from "../src/engine/deal.js";
import { defaultRules } from "../src/engine/rules/index.js";
import { validateAction } from "../src/engine/engine.js";

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

test("rejects a player not in the room", () => {
  const r = validateAction(game(), "ghost", { cardInstanceId: "x", targetTrayIds: [] });
  expect(r).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
});

test("rejects a card the player does not hold", () => {
  const r = validateAction(game(), "p1", { cardInstanceId: "not-a-real-card", targetTrayIds: ["0"] });
  expect(r).toMatchObject({ ok: false, code: "CARD_NOT_HELD" });
});

test("rejects the wrong number of targets for the card", () => {
  const g = game();
  const oneTarget = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const r = validateAction(g, "p1", { cardInstanceId: oneTarget.instanceId, targetTrayIds: [] });
  expect(r).toMatchObject({ ok: false, code: "WRONG_TARGET_COUNT" });
});

test("rejects targeting a tray that is not on your own table", () => {
  const g = game();
  const oneTarget = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const opponentTrayId = g.players["p2"]!.table[0]!.id;
  const r = validateAction(g, "p1", { cardInstanceId: oneTarget.instanceId, targetTrayIds: [opponentTrayId] });
  expect(r).toMatchObject({ ok: false, code: "BAD_TARGET" });
});

test("accepts a legal move and rejects a second submission", () => {
  const g = game();
  const oneTarget = g.players["p1"]!.hand.find((c) => c.targets === 1)!;
  const ownTrayId = g.players["p1"]!.table[0]!.id;
  expect(
    validateAction(g, "p1", { cardInstanceId: oneTarget.instanceId, targetTrayIds: [ownTrayId] }),
  ).toEqual({ ok: true });
  g.players["p1"]!.submission = { cardInstanceId: oneTarget.instanceId, targetTrayIds: [ownTrayId] };
  expect(
    validateAction(g, "p1", { cardInstanceId: oneTarget.instanceId, targetTrayIds: [ownTrayId] }),
  ).toMatchObject({
    ok: false,
    code: "ALREADY_SUBMITTED",
  });
});
