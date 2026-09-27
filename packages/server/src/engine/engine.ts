import type { OpponentView, RejectionCode, Result, RoomStateMessage, Seat, TrayView, YouView } from "@eat.io/protocol";
import type { GameState, PlayerId, Submission } from "./state.js";
import { pick } from "../util/rng.js";
import type { Rng } from "../util/rng.js";
import type { Rules } from "./rules/index.js";
import type { Card, CardDefinition, PlayerState, Tray } from "./state.js";

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

  const card = player.hand.find((c) => c.instanceId === action.cardInstanceId);
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

export function applyAction(state: GameState, playerId: PlayerId, action: Submission): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  const submission: Submission = {
    cardInstanceId: action.cardInstanceId,
    targetTrayIds: [...action.targetTrayIds],
  };
  return { ...state, players: { ...state.players, [playerId]: { ...player, submission } } };
}

export function autoMove(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (!player || player.submission || player.hand.length === 0) return state;
  const [card, rng] = pick(state.rng, player.hand);
  const submission: Submission = { cardInstanceId: card.instanceId, targetTrayIds: [], discard: true };
  return { ...state, rng, players: { ...state.players, [playerId]: { ...player, submission } } };
}

export function everyoneSubmitted(state: GameState): boolean {
  const players = Object.values(state.players);
  return players.length > 0 && players.every((p) => p.submission !== null);
}

export type GameEvent =
  | { type: "trayEaten"; playerId: PlayerId; trayId: string; value: number }
  | { type: "roundResolved"; roundIndex: number };

function drawCard(
  deck: Card[],
  rng: Rng,
  rules: Rules,
  nextCardId: number,
): [Card, Card[], Rng, number] {
  if (deck.length > 0) return [deck[0]!, deck.slice(1), rng, nextCardId];

  // Deck exhausted: mint a fresh one, stamping instance ids as we go.
  const [definitions, afterShuffle] = rules.buildDeck(rng);
  let minted = nextCardId;
  const fresh: Card[] = definitions.map((definition: CardDefinition) => ({
    ...definition,
    instanceId: String(minted++),
  }));
  return [fresh[0]!, fresh.slice(1), afterShuffle, minted];
}

export function resolveRound(state: GameState, rules: Rules): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let rng = state.rng;
  let nextTrayId = state.nextTrayId;
  let nextCardId = state.nextCardId;
  const players: Record<PlayerId, PlayerState> = {};

  // Deterministic order so a seeded game is fully reproducible.
  const ordered = Object.values(state.players).sort((a, b) => a.seat.localeCompare(b.seat));

  for (const p of ordered) {
    let { hand, deck, table, score, extraServings } = p;
    const sub = p.submission;

    if (sub) {
      if (!sub.discard) {
        const card = hand.find((c) => c.instanceId === sub.cardInstanceId);
        if (card) {
          // A tray effect changes the chosen trays; a table effect (targets 0) chooses
          // none and changes the table. Each rule leaves the other kind's card alone.
          const targets = new Set(sub.targetTrayIds);
          table = table.map((t) => (targets.has(t.id) ? rules.applyEffect(t, card) : t));
          ({ table, extraServings } = rules.applyTableEffect({ table, extraServings }, card));
        }
      }
      const idx = hand.findIndex((c) => c.instanceId === sub.cardInstanceId);
      if (idx >= 0) {
        hand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
        const [drawn, deckAfter, rngAfter, cardIdAfter] = drawCard(deck, rng, rules, nextCardId);
        deck = deckAfter;
        rng = rngAfter;
        nextCardId = cardIdAfter;
        hand = [...hand, drawn];
      }
    }

    const front = table[0];
    if (front) {
      score += front.value;
      table = table.slice(1);
      events.push({ type: "trayEaten", playerId: p.id, trayId: front.id, value: front.value });
    }

    const [randomValue, rngValue] = rules.freshTrayValue(rng);
    rng = rngValue;
    // The next extra serving rides on the arriving tray, then leaves the list.
    const [servingBonus = 0, ...laterServings] = extraServings;
    extraServings = laterServings;
    const freshTray: Tray = {
      id: String(nextTrayId++),
      value: randomValue + servingBonus,
      ...(servingBonus > 0 ? { bonus: servingBonus } : {}),
    };
    table = [...table, freshTray];

    players[p.id] = { ...p, hand, deck, table, score, extraServings, submission: null };
  }

  const next: GameState = {
    ...state,
    players,
    rng,
    nextTrayId,
    nextCardId,
    roundIndex: state.roundIndex + 1,
  };
  events.push({ type: "roundResolved", roundIndex: next.roundIndex });
  return { state: next, events };
}

export type EndCondition = (state: GameState) => boolean;

/** Default end condition. Reads ONLY the round count — never scores. */
export const roundLimitReached: EndCondition = (state) => state.roundIndex >= state.roundCount;

export function isGameOver(state: GameState, ended: EndCondition = roundLimitReached): boolean {
  return ended(state);
}

export interface RankedResult {
  scores: Record<Seat, number>;
  winner: Seat | null; // null === draw
}

/** Ranks final scores. Never decides WHEN to stop — only who is ahead. */
export function rankResult(state: GameState): RankedResult {
  const scores = {} as Record<Seat, number>;
  let winner: Seat | null = null;
  let best = -Infinity;
  let tied = false;
  for (const p of Object.values(state.players)) {
    scores[p.seat] = p.score;
    if (p.score > best) {
      best = p.score;
      winner = p.seat;
      tied = false;
    } else if (p.score === best) {
      tied = true;
    }
  }
  return { scores, winner: tied ? null : winner };
}

export function resultFor(ranked: RankedResult, seat: Seat): Result {
  const kind = ranked.winner === null ? "draw" : ranked.winner === seat ? "win" : "loss";
  return { kind, scores: ranked.scores };
}

/** The room state as the engine sees it: everything but each player's appearance,
 *  which the room adds from its seats. */
export type GameView = Omit<RoomStateMessage, "you" | "opponent"> & {
  you: Omit<YouView, "appearance">;
  opponent: Omit<OpponentView, "appearance">;
};

/** A tray as sent on the wire; `bonus` only when it arrived boosted. */
function trayView(tray: Tray): TrayView {
  return { id: tray.id, value: tray.value, ...(tray.bonus === undefined ? {} : { bonus: tray.bonus }) };
}

export function viewFor(state: GameState, playerId: PlayerId, deadlineAt: number | null): GameView {
  const you = state.players[playerId];
  if (!you) throw new Error(`viewFor: unknown player ${playerId}`);
  const opponent = Object.values(state.players).find((p) => p.id !== playerId);
  if (!opponent) throw new Error("viewFor: no opponent seated");

  return {
    type: "roomState",
    phase: state.phase,
    roundIndex: state.roundIndex,
    roundCount: state.roundCount,
    deadlineAt,
    you: {
      seat: you.seat,
      name: you.name,
      score: you.score,
      submitted: you.submission !== null,
      table: you.table.map(trayView),
      hand: you.hand.map((c) => ({
        id: c.id,
        instanceId: c.instanceId,
        name: c.name,
        action: c.action,
        amount: c.amount,
        targets: c.targets,
        ...(c.turns === undefined ? {} : { turns: c.turns }),
      })),
      extraServings: [...you.extraServings],
    },
    opponent: {
      seat: opponent.seat,
      name: opponent.name,
      score: opponent.score,
      submitted: opponent.submission !== null,
      handCount: opponent.hand.length,
      table: opponent.table.map(trayView),
      extraServings: [...opponent.extraServings],
    },
  };
}

export function setConnected(state: GameState, playerId: PlayerId, connected: boolean): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, connected } } };
}
