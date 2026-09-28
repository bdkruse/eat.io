import type { Appearance, RoomStateMessage, ServerMessage } from "@eat.io/protocol";
import { chooseBotMove, type BotMove } from "../engine/bot.js";
import type { PlayerId } from "../engine/state.js";
import { makeRng, type Rng } from "../util/rng.js";
import type { Cancel, Timers } from "./timers.js";

export const PRACTICE_BOT_NAME = "Sam";

/** How long after a round starts the bot plays its card. */
export const BOT_MOVE_DELAY_MS = 1000;

/** The bot's look: free values only, the same every game. */
export const PRACTICE_BOT_LOOK: Appearance = {
  skinTone: "#c68b5e",
  hairStyle: "curly",
  hairColor: "#3d2a1e",
  shirtColor: "#4a7fa5",
  pantsColor: "#3f5a7a",
  accessory: "cap",
  eyeShape: "round",
  eyeColor: "#6b4226",
  mouthShape: "grin",
  top: "graphicTee",
  bottom: "shorts",
  onePiece: "none",
  graphic: "pizza",
};

export interface PracticeBotDeps {
  playerId: PlayerId;
  timers: Timers;
  seed: number;
  submit: (move: BotMove) => void;
  delayMs: number;
}

/**
 * The opponent in a practice room. It reads only its own roomState, the same payload a
 * human gets, and plays one card a short delay after each round starts. It hangs off its
 * room: the room's send routes the bot's id here, and the room's end calls `stop`.
 */
export class PracticeBot {
  private rng: Rng;
  private latestView: RoomStateMessage | null = null;
  private cancelMove: Cancel | null = null;

  constructor(private readonly deps: PracticeBotDeps) {
    this.rng = makeRng(deps.seed);
  }

  receive(message: ServerMessage): void {
    if (message.type !== "roomState") return;
    this.latestView = message;
    if (message.phase !== "in-progress" || message.you.submitted || this.cancelMove) return;
    this.cancelMove = this.deps.timers.schedule(this.deps.delayMs, () => this.move());
  }

  stop(): void {
    this.cancelMove?.();
    this.cancelMove = null;
  }

  private move(): void {
    // Cleared first: the submit can start the next round, whose roomState schedules again.
    this.cancelMove = null;
    if (!this.latestView) return;
    const [move, nextRng] = chooseBotMove(this.latestView, this.rng);
    this.rng = nextRng;
    if (move) this.deps.submit(move);
  }
}
