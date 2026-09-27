import type { AccountErrorCode, AdminErrorCode, ServerMessage } from "@eat.io/protocol";
import type { ConnectionState } from "../connection/connectionState.js";
import { initialAppState, type AdminSubject, type AppState, type PendingShopReply } from "./gameState.js";

export type Action =
  | { kind: "server"; msg: ServerMessage }
  | { kind: "connection"; state: ConnectionState }
  | { kind: "nameChanged"; name: string }
  | { kind: "localRejection"; message: string }
  | { kind: "playAgain" }
  | { kind: "backToMenu" }
  | { kind: "backToConnectedMenu" }
  | { kind: "dismissRejection" }
  | { kind: "dismissAccountError" }
  | { kind: "accountAttemptStarted" }
  | { kind: "settingsRequested" }
  | { kind: "deckRequested" }
  | { kind: "settingsSaveStarted" }
  | { kind: "deckSaveStarted" }
  | { kind: "shopRequested" }
  | { kind: "shopBuyStarted"; itemId: string }
  | { kind: "shopConfigRequested" }
  | { kind: "shopConfigSaveStarted" };

/** The `accountError` codes that refuse a `shopBuy` (§13.6). */
const BUY_REFUSAL_CODES: readonly AccountErrorCode[] = ["NOT_AVAILABLE", "ALREADY_OWNED", "NOT_ENOUGH"];

/** Opening an admin panel or starting a save starts with nothing said yet (fix round 1). */
const CLEARED_ADMIN_MESSAGES = { adminNotice: null, adminError: null } as const;

/** Everything a new room must not inherit from the previous one (§2.5). */
const CLEARED_FOR_NEW_ROOM = {
  queued: false,
  privateCode: null,
  result: null,
  rejection: null,
  opponentDropped: null,
  lunchMoneyAtGameStart: null,
  lunchMoneyEarned: null,
} as const;

export function gameReducer(state: AppState, action: Action): AppState {
  switch (action.kind) {
    case "server":
      return reduceServerMessage(state, action.msg);
    case "connection":
      // Answers lost with the connection never come, and a lost buy must not leave Buy
      // disabled.
      return {
        ...state,
        connection: action.state,
        pendingShopReplies: action.state.phase === "connected" ? state.pendingShopReplies : [],
      };
    case "nameChanged":
      return { ...state, name: action.name };
    case "localRejection":
      // The UI's own complaint, surfaced through the same toast as a server rejection.
      return {
        ...state,
        rejection: {
          code: "LOCAL",
          message: action.message,
          seq: (state.rejection?.seq ?? 0) + 1,
        },
      };
    case "playAgain":
      return { ...state, room: null, ...CLEARED_FOR_NEW_ROOM };
    case "backToMenu":
      return backToPreConnectMenu(state);
    case "backToConnectedMenu":
      // A logged-in player leaves the finished game but keeps the connection, the
      // session, and the account — only the room and its leftovers go (final review, item 2).
      return { ...state, room: null, ...CLEARED_FOR_NEW_ROOM };
    case "dismissRejection":
      return { ...state, rejection: null };
    case "dismissAccountError":
      return { ...state, accountError: null };
    case "accountAttemptStarted":
      return { ...state, accountPending: true };
    case "settingsRequested":
      // Opening the admin panel: drop the cached settings so the panel seeds from this
      // request's reply, and drop anything said about an earlier visit (fix round 1).
      return { ...state, ...CLEARED_ADMIN_MESSAGES, adminSettings: null, lastAdminSubject: "settings" };
    case "deckRequested":
      return { ...state, ...CLEARED_ADMIN_MESSAGES, adminDeck: null, lastAdminSubject: "deck" };
    case "settingsSaveStarted":
      return { ...state, ...CLEARED_ADMIN_MESSAGES, savingSettings: true, lastAdminSubject: "settings" };
    case "deckSaveStarted":
      return { ...state, ...CLEARED_ADMIN_MESSAGES, savingDeck: true, lastAdminSubject: "deck" };
    case "shopRequested":
      // Opening the shop: an account error left from another panel is not about it.
      return { ...state, accountError: null, pendingShopReplies: withPendingShopReply(state, { kind: "request" }) };
    case "shopBuyStarted":
      return {
        ...state,
        accountError: null,
        pendingShopReplies: withPendingShopReply(state, { kind: "buy", itemId: action.itemId }),
      };
    case "shopConfigRequested":
      return { ...state, ...CLEARED_ADMIN_MESSAGES, adminShopConfig: null, lastAdminSubject: "shopConfig" };
    case "shopConfigSaveStarted":
      return { ...state, ...CLEARED_ADMIN_MESSAGES, savingShopConfig: true, lastAdminSubject: "shopConfig" };
    default: {
      const never: never = action;
      return never;
    }
  }
}

/**
 * The menu as it looks before connecting — the three tabs — keeping only what the player
 * typed into the name field. The connection itself is reset by the disconnect that goes
 * with this.
 */
function backToPreConnectMenu(state: AppState): AppState {
  return { ...initialAppState, connection: state.connection, name: state.name };
}

/**
 * The ONE place a server message becomes state. A single exhaustive switch, so adding a
 * message type to the protocol is a compile error here rather than a silent no-op (§2.4).
 */
function reduceServerMessage(state: AppState, msg: ServerMessage): AppState {
  switch (msg.type) {
    case "welcome":
      return {
        ...state,
        identity: { playerId: msg.playerId, sessionToken: msg.sessionToken },
      };

    case "error": {
      const fatal = msg.code === "PROTOCOL_MISMATCH";
      return {
        ...state,
        identity: fatal ? null : state.identity,
        connection: { ...state.connection, error: `${msg.code}: ${msg.message}` },
      };
    }

    case "queueWaiting":
      return { ...state, queued: true };

    case "queueCancelled":
      // Cancels both kinds of waiting, so the private code goes too.
      return { ...state, queued: false, privateCode: null };

    case "roomJoinedPrivate":
      return { ...state, privateCode: msg.code };

    case "roomState": {
      // Full views, not deltas — replace rather than merge, and drop anything that
      // belonged to a previous room the moment a new one starts.
      const isNewRoom = state.room === null;
      return {
        ...state,
        room: msg,
        queued: false,
        privateCode: null,
        ...(isNewRoom
          ? {
              result: null,
              rejection: null,
              opponentDropped: null,
              // The baseline the game-over screen's "+N Lunch Money" is measured from.
              lunchMoneyAtGameStart: state.account?.lunchMoney ?? null,
              lunchMoneyEarned: null,
            }
          : {}),
      };
    }

    case "actionAccepted":
      return { ...state, rejection: null };

    case "actionRejected":
      return {
        ...state,
        rejection: {
          code: msg.code,
          message: msg.message,
          seq: (state.rejection?.seq ?? 0) + 1,
        },
      };

    case "gameOver":
      return { ...state, result: msg.result };

    case "opponentDisconnected":
      return { ...state, opponentDropped: { graceEndsAt: msg.graceEndsAt } };

    case "opponentReconnected":
      return { ...state, opponentDropped: null };

    case "roomLeft":
      return { ...state, room: null, ...CLEARED_FOR_NEW_ROOM };

    case "pong":
      return state; // liveness only; handled so the switch stays exhaustive

    case "accountLoggedIn":
      // A fresh login or a token resume — either way, any earlier account error is moot,
      // and whatever attempt was pending has now resolved.
      return { ...state, account: msg.profile, accountError: null, accountPending: false };

    case "accountLoggedOut":
      // Requested or an expired resume, the player goes back to the usual pre-connect menu
      // rather than staying on as a nameless connected guest (final review, item 3). The
      // provider disconnects alongside this.
      return backToPreConnectMenu(state);

    case "accountError":
      return {
        ...state,
        accountError: {
          code: msg.code,
          message: msg.message,
          seq: (state.accountError?.seq ?? 0) + 1,
        },
        accountPending: false,
        pendingShopReplies: pendingShopRepliesAfterAccountError(state.pendingShopReplies, msg.code),
      };

    case "profile":
      return { ...state, account: msg.profile, lunchMoneyEarned: lunchMoneyEarnedAfter(state, msg.profile.lunchMoney) };

    case "passwordChanged":
      return {
        ...state,
        accountNotice: {
          text: "Password changed.",
          seq: (state.accountNotice?.seq ?? 0) + 1,
        },
      };

    case "settings": {
      // A `settings` message answers both a plain `settingsRequest` (opening the panel)
      // and a `settingsSave` — only the latter should raise a notice (§9).
      const withSettings: AppState = {
        ...state,
        adminSettings: { settings: msg.settings, updatedAt: msg.updatedAt, updatedBy: msg.updatedBy },
        savingSettings: false,
      };
      return state.savingSettings ? withAdminNotice(withSettings, "settings", "Settings saved.") : withSettings;
    }

    case "deck": {
      // Same reasoning as `settings`, above.
      const withDeck: AppState = {
        ...state,
        adminDeck: { cards: msg.cards, total: msg.total, updatedAt: msg.updatedAt, updatedBy: msg.updatedBy },
        savingDeck: false,
      };
      return state.savingDeck ? withAdminNotice(withDeck, "deck", "Deck saved.") : withDeck;
    }

    case "shop": {
      // A `shop` message answers both a plain `shopRequest` and a successful `shopBuy` —
      // only the latter is a purchase. The oldest unanswered one says which it is.
      const [answeredReply, ...stillPending] = state.pendingShopReplies;
      const withShop: AppState = {
        ...state,
        shop: { items: msg.items, balance: msg.balance },
        pendingShopReplies: stillPending,
      };
      if (answeredReply?.kind !== "buy") return withShop;
      return {
        ...withShop,
        shopPurchase: { itemId: answeredReply.itemId, seq: (state.shopPurchase?.seq ?? 0) + 1 },
      };
    }

    case "shopConfig": {
      // Same reasoning as `settings`, below.
      const withShopConfig: AppState = {
        ...state,
        adminShopConfig: { items: msg.items, updatedAt: msg.updatedAt, updatedBy: msg.updatedBy },
        savingShopConfig: false,
      };
      return state.savingShopConfig ? withAdminNotice(withShopConfig, "shopConfig", "Shop saved.") : withShopConfig;
    }

    case "adminError": {
      const subject = adminErrorSubject(state, msg.code);
      const adminMessageSeq = state.adminMessageSeq + 1;
      return {
        ...state,
        // Only the failed subject's save is over; a save of the other subject still waits.
        savingSettings: subject === "settings" ? false : state.savingSettings,
        savingDeck: subject === "deck" ? false : state.savingDeck,
        savingShopConfig: subject === "shopConfig" ? false : state.savingShopConfig,
        adminMessageSeq,
        adminNotice: null,
        adminError: { subject, code: msg.code, message: msg.message, seq: adminMessageSeq },
      };
    }

    default: {
      const never: never = msg;
      return never;
    }
  }
}

/** A save succeeded: say so for that subject, and drop any error the notice supersedes. */
function withAdminNotice(state: AppState, subject: AdminSubject, text: string): AppState {
  const adminMessageSeq = state.adminMessageSeq + 1;
  return {
    ...state,
    adminMessageSeq,
    adminError: null,
    adminNotice: { subject, text, seq: adminMessageSeq },
  };
}

/**
 * Which panel an `adminError` belongs to. INVALID_SETTINGS, INVALID_DECK, and INVALID_SHOP
 * name it outright. FORBIDDEN does not, so it goes to the one save in flight, or else to
 * the subject last requested or saved.
 */
function adminErrorSubject(state: AppState, code: AdminErrorCode): AdminSubject {
  if (code === "INVALID_SETTINGS") return "settings";
  if (code === "INVALID_DECK") return "deck";
  if (code === "INVALID_SHOP") return "shopConfig";
  const savesInFlight: AdminSubject[] = [];
  if (state.savingSettings) savesInFlight.push("settings");
  if (state.savingDeck) savesInFlight.push("deck");
  if (state.savingShopConfig) savesInFlight.push("shopConfig");
  const [onlySaveInFlight] = savesInFlight;
  if (savesInFlight.length === 1 && onlySaveInFlight) return onlySaveInFlight;
  return state.lastAdminSubject ?? "settings";
}

/** The queue with one more expected answer — unless the socket is not open, in which case
 *  the message is dropped unsent and no answer will ever come. */
function withPendingShopReply(state: AppState, pendingReply: PendingShopReply): PendingShopReply[] {
  if (state.connection.phase !== "connected") return state.pendingShopReplies;
  return [...state.pendingShopReplies, pendingReply];
}

/**
 * What is still waiting after an `accountError`. A buy refusal answers the oldest pending
 * buy. NOT_LOGGED_IN answers everything (nothing more will come). Any other code is about
 * something else, such as `appearanceSet`, and leaves the queue alone.
 */
function pendingShopRepliesAfterAccountError(
  pendingShopReplies: PendingShopReply[],
  code: AccountErrorCode,
): PendingShopReply[] {
  if (code === "NOT_LOGGED_IN") return [];
  if (!BUY_REFUSAL_CODES.includes(code)) return pendingShopReplies;
  const refusedBuyIndex = pendingShopReplies.findIndex((pendingReply) => pendingReply.kind === "buy");
  if (refusedBuyIndex === -1) return pendingShopReplies;
  return pendingShopReplies.filter((_, replyIndex) => replyIndex !== refusedBuyIndex);
}

/**
 * The finished game's earnings: the first profile after `gameOver` (the server pushes it
 * right behind the result) against the balance when the room started. Set once, so a
 * later profile — a buy on the game-over screen — never changes it, and never negative.
 */
function lunchMoneyEarnedAfter(state: AppState, lunchMoney: number): number | null {
  if (state.lunchMoneyEarned !== null) return state.lunchMoneyEarned;
  if (state.result === null || state.lunchMoneyAtGameStart === null) return null;
  const earned = lunchMoney - state.lunchMoneyAtGameStart;
  return earned >= 0 ? earned : null;
}
