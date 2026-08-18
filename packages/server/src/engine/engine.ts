import type { RejectionCode } from "@eat.io/protocol";
import type { GameState, PlayerId, Submission } from "./state.js";

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: RejectionCode; message: string };

function reject(code: RejectionCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

export function validateAction(
  state: GameState,
  playerId: PlayerId,
  action: Submission,
): ValidationResult {
  const player = state.players[playerId];
  if (!player) return reject("NOT_IN_ROOM", "You are not seated in this room.");
  if (state.phase !== "in-progress") return reject("NOT_YOUR_TURN", "The game is not accepting moves right now.");
  if (player.submission) return reject("ALREADY_SUBMITTED", "You have already submitted this round.");

  const card = player.hand.find((c) => c.id === action.cardId);
  if (!card) return reject("CARD_NOT_HELD", "You do not hold that card.");
  if (action.targetTrayIds.length !== card.targets) {
    return reject("WRONG_TARGET_COUNT", `That card needs ${card.targets} target(s).`);
  }
  if (new Set(action.targetTrayIds).size !== action.targetTrayIds.length) {
    return reject("BAD_TARGET", "A tray was targeted more than once.");
  }
  const ownTrayIds = new Set(player.table.map((t) => t.id));
  for (const id of action.targetTrayIds) {
    if (!ownTrayIds.has(id)) return reject("BAD_TARGET", "You can only target trays on your own table.");
  }
  return { ok: true };
}
