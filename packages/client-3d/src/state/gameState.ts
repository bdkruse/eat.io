import type {
  AccountErrorCode,
  AdminErrorCode,
  CardView,
  DeckCard,
  GameSettings,
  Profile,
  RejectionCode,
  Result,
  RoomStateMessage,
  ShopItemView,
} from "@eat.io/protocol";
import { initialConnectionState, type ConnectionState } from "../connection/connectionState.js";

export interface Rejection {
  /** "LOCAL" marks a client-side complaint (e.g. a tray clicked with no card chosen),
   *  so it is never mistaken for a code the server actually sent. */
  code: RejectionCode | "LOCAL";
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
  seq: number;
}

export interface AccountErrorState {
  code: AccountErrorCode;
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
  seq: number;
}

export interface AccountNotice {
  text: string;
  /** Monotonic, so a repeat of the same notice can re-trigger without a clock. */
  seq: number;
}

/** The admin panel's own view of the three game settings, stored verbatim from the
 *  server's `settings` message (§9). */
export interface AdminSettingsState {
  settings: GameSettings;
  updatedAt: number | null;
  updatedBy: string | null;
}

/** The creator panel's own view of the default deck, stored verbatim from the server's
 *  `deck` message — every catalog card with its copies (§9). */
export interface AdminDeckState {
  cards: DeckCard[];
  total: number;
  updatedAt: number | null;
  updatedBy: string | null;
}

/** The shop as the server last sent it: the available items with the Creator's prices,
 *  whether this player owns each, and the balance (§13.4). The balance is kept as sent but
 *  never shown: a finished game refreshes the profile, not this, so the UI reads Lunch
 *  Money from the profile alone (`selectLunchMoney`). */
export interface ShopState {
  items: ShopItemView[];
  balance: number;
}

/** The creator's shop tool: every catalog item, turned-off ones included (§13.4). */
export interface AdminShopConfigState {
  items: ShopItemView[];
  updatedAt: number | null;
  updatedBy: string | null;
}

/** A `shop` message the client is waiting for, in the order it asked. The server answers
 *  in that order, but it may not answer at all (a handler that throws sends nothing), so a
 *  `shop` message is matched by what it shows: it answers a pending buy only when it shows
 *  that item owned, and otherwise the oldest pending request (fix round 1). */
export type PendingShopReply = { kind: "request" } | { kind: "buy"; itemId: string };

/** A buy the server confirmed. A new object (and seq) for each, so the look can be
 *  equipped exactly once per purchase. */
export interface ShopPurchase {
  itemId: string;
  seq: number;
}

/** What an admin notice or error is about, so each panel shows only its own: "settings"
 *  belongs to the admin panel, "deck" to the creator panel's deck tab (fix round 1), and
 *  "shopConfig" to its shop tab. */
export type AdminSubject = "settings" | "deck" | "shopConfig";

export interface AdminErrorState {
  subject: AdminSubject;
  code: AdminErrorCode;
  message: string;
  /** Monotonic, so the toast can re-trigger on a repeat of the same code without a clock. */
  seq: number;
}

export interface AdminNotice {
  subject: AdminSubject;
  text: string;
  /** Monotonic, so a repeat of the same notice can re-trigger without a clock. */
  seq: number;
}

export interface AppState {
  connection: ConnectionState;
  /** What the player typed. Survives "Back to menu" so the field is prefilled. */
  name: string;
  identity: { playerId: string; sessionToken: string } | null;
  queued: boolean;
  /** The server's full view, stored verbatim — every update replaces it (§2.5). */
  room: RoomStateMessage | null;
  privateCode: string | null;
  result: Result | null;
  rejection: Rejection | null;
  opponentDropped: { graceEndsAt: number } | null;
  /** The logged-in player's profile, or null for a guest. Survives reconnects (§11). */
  account: Profile | null;
  accountError: AccountErrorState | null;
  accountNotice: AccountNotice | null;
  /**
   * True from the moment a login or registration attempt is sent until it resolves
   * (accountLoggedIn, accountLoggedOut, or accountError), or until backToMenu. While true,
   * this connection cannot yet be assumed to belong to a guest (fix round 1: `welcome` and
   * `accountLoggedIn`/`accountError` are separate messages, so there is always a gap where
   * identity is set but account is still null even for a login or a token resume).
   */
  accountPending: boolean;
  /** The admin panel's settings, or null until a `settings` message answers the latest
   *  `settingsRequest` — each request drops the cached copy so a reopened panel never
   *  seeds from stale values (fix round 1). */
  adminSettings: AdminSettingsState | null;
  /** The creator panel's deck, with the same reset-on-request rule as `adminSettings`. */
  adminDeck: AdminDeckState | null;
  /** At most one of `adminError` and `adminNotice` is set: each clears the other, and
   *  opening a panel or starting a save clears both. Read them through
   *  `selectAdminMessages` so a panel sees only its own subject. */
  adminError: AdminErrorState | null;
  adminNotice: AdminNotice | null;
  /** Shared by `adminError` and `adminNotice`, so their `seq` keeps climbing after a clear. */
  adminMessageSeq: number;
  /** The subject last requested or saved: what a FORBIDDEN `adminError`, which names no
   *  subject of its own, is blamed on when no save is in flight. */
  lastAdminSubject: AdminSubject | null;
  /** True from `saveSettings` until the answering `settings` or `adminError` arrives —
   *  the same shape as `accountPending` above, and for the same reason: it is what tells
   *  the reducer a `settings` message is a save's answer rather than the response to a
   *  plain `settingsRequest`, so only a save raises `adminNotice`. */
  savingSettings: boolean;
  /** Same reasoning as `savingSettings`, for `saveDeck` and the `deck` message. */
  savingDeck: boolean;
  /** The creator's shop tool, with the same reset-on-request rule as `adminSettings`. */
  adminShopConfig: AdminShopConfigState | null;
  /** Same reasoning as `savingSettings`, for `saveShopConfig` and the `shopConfig` message. */
  savingShopConfig: boolean;
  /** The last `shop` message, or null before the first. */
  shop: ShopState | null;
  /** Every `shopRequest` and `shopBuy` not yet answered, oldest first. Without it, the
   *  answer to a request still in flight when Buy is pressed would pass for the purchase.
   *  A buy leaves it on its `shop` answer (bought), its `accountError` (refused), a later
   *  request's answer or a timeout (never answered); the whole queue goes when the
   *  connection drops. */
  pendingShopReplies: PendingShopReply[];
  /** The latest confirmed buy. */
  shopPurchase: ShopPurchase | null;
  /** The item of the last buy that got no answer (the server sent nothing for it), so the
   *  shop can say so. Cleared by the next buy, the next shop request, or a purchase. */
  unansweredBuyItemId: string | null;
}

export const initialAppState: AppState = {
  connection: initialConnectionState,
  name: "",
  identity: null,
  queued: false,
  room: null,
  privateCode: null,
  result: null,
  rejection: null,
  opponentDropped: null,
  account: null,
  accountError: null,
  accountNotice: null,
  accountPending: false,
  adminSettings: null,
  adminDeck: null,
  adminError: null,
  adminNotice: null,
  adminMessageSeq: 0,
  lastAdminSubject: null,
  savingSettings: false,
  savingDeck: false,
  adminShopConfig: null,
  savingShopConfig: false,
  shop: null,
  pendingShopReplies: [],
  shopPurchase: null,
  unansweredBuyItemId: null,
};

/** How long a buy may wait for its answer before Buy is released again. The server answers
 *  in milliseconds; this only matters when it sends nothing at all. */
export const BUY_ANSWER_TIMEOUT_MS = 15_000;

export type Screen = "connect" | "queue" | "game" | "gameOver";

/** Derived, never stored (§2.4). Order matters: a finished game outranks its board. */
export function selectScreen(state: AppState): Screen {
  if (!state.identity) return "connect";
  if (state.result) return "gameOver";
  if (state.room) return "game";
  // Holding a private code means waiting for someone to type it — same screen as the queue.
  if (state.queued || state.privateCode) return "queue";
  return "connect";
}

/**
 * "Back to menu" after a game keeps a logged-in player connected (their identity is the
 * account, and it must not look logged out). A guest disconnects and starts over at the
 * pre-connect menu, as before (final review, item 2).
 */
export function selectBackToMenuStaysConnected(state: AppState): boolean {
  return state.account !== null;
}

/** The notice and error one panel may show: only those about its own subject, so a
 *  "Settings saved." never appears in the creator panel, nor a deck error in the admin
 *  panel (fix round 1). */
export function selectAdminMessages(
  state: AppState,
  subject: AdminSubject,
): { notice: AdminNotice | null; error: AdminErrorState | null } {
  return {
    notice: state.adminNotice?.subject === subject ? state.adminNotice : null,
    error: state.adminError?.subject === subject ? state.adminError : null,
  };
}

/** The item a buy is waiting on, or null: Buy is disabled while it is set. */
export function selectBuyingItemId(state: AppState): string | null {
  for (const pendingReply of state.pendingShopReplies) {
    if (pendingReply.kind === "buy") return pendingReply.itemId;
  }
  return null;
}

/** The logged-in player's Lunch Money, or null for a guest. The one balance every panel
 *  shows, so the shop and the top bar never disagree (fix round 1). */
export function selectLunchMoney(state: AppState): number | null {
  return state.account?.lunchMoney ?? null;
}

/**
 * The Lunch Money a finished game earned: your own final score, which is exactly what the
 * server credits a logged-in player (§13.6). Null for a guest and before the game is over.
 * Taken from the result rather than from balance changes, so a buy landing mid-game or a
 * post-game profile lost to a reconnect cannot skew it (fix round 1).
 */
export function lunchMoneyEarnedIn(
  account: Profile | null,
  result: Result | null,
  room: RoomStateMessage | null,
): number | null {
  if (account === null || result === null || room === null) return null;
  return result.scores[room.you.seat] ?? null;
}

export function selectLunchMoneyEarned(state: AppState): number | null {
  return lunchMoneyEarnedIn(state.account, state.result, state.room);
}

/** Explicit from the server's submitted flags — never inferred from a turn index (§2.8.10). */
export function selectAwaitingYou(state: AppState): boolean {
  const room = state.room;
  if (!room || room.phase !== "in-progress") return false;
  return !room.you.submitted;
}

/** A board that is not connected must be visibly dead and non-interactive (§2.8.9). */
export function selectBoardFrozen(state: AppState): boolean {
  return state.connection.phase !== "connected";
}

export function selectYourCard(
  state: AppState,
  cardInstanceId: string | null,
): CardView | undefined {
  if (!cardInstanceId || !state.room) return undefined;
  return state.room.you.hand.find((card) => card.instanceId === cardInstanceId);
}

/**
 * Whether this connection should share its local look with the server as a guest's.
 * True only once identity is established, no account is attached, AND no login or
 * registration attempt is in flight — a login and a token resume both leave a window
 * where identity is set but account is still null, and that window must not be mistaken
 * for "definitely a guest" (fix round 1, §11).
 */
export function shouldShareGuestLook(input: {
  identitySet: boolean;
  account: Profile | null;
  accountPending: boolean;
}): boolean {
  return input.identitySet && input.account === null && !input.accountPending;
}
