import type { ServerMessage } from "@eat.io/protocol";
import type { ConnectionState } from "../connection/connectionState.js";
import { initialAppState, type AppState } from "./gameState.js";

export type Action =
  | { kind: "server"; msg: ServerMessage }
  | { kind: "connection"; state: ConnectionState }
  | { kind: "nameChanged"; name: string }
  | { kind: "localRejection"; message: string }
  | { kind: "playAgain" }
  | { kind: "backToMenu" }
  | { kind: "dismissRejection" }
  | { kind: "dismissAccountError" }
  | { kind: "accountAttemptStarted" };

/** Everything a new room must not inherit from the previous one (§2.5). */
const CLEARED_FOR_NEW_ROOM = {
  queued: false,
  privateCode: null,
  result: null,
  rejection: null,
  opponentDropped: null,
} as const;

export function gameReducer(state: AppState, action: Action): AppState {
  switch (action.kind) {
    case "server":
      return reduceServerMessage(state, action.msg);
    case "connection":
      return { ...state, connection: action.state };
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
      return { ...initialAppState, connection: state.connection, name: state.name };
    case "dismissRejection":
      return { ...state, rejection: null };
    case "dismissAccountError":
      return { ...state, accountError: null };
    case "accountAttemptStarted":
      return { ...state, accountPending: true };
    default: {
      const never: never = action;
      return never;
    }
  }
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
        ...(isNewRoom ? { result: null, rejection: null, opponentDropped: null } : {}),
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
      return { ...state, account: null, accountPending: false };

    case "accountError":
      return {
        ...state,
        accountError: {
          code: msg.code,
          message: msg.message,
          seq: (state.accountError?.seq ?? 0) + 1,
        },
        accountPending: false,
      };

    case "profile":
      return { ...state, account: msg.profile };

    case "passwordChanged":
      return {
        ...state,
        accountNotice: {
          text: "Password changed.",
          seq: (state.accountNotice?.seq ?? 0) + 1,
        },
      };

    default: {
      const never: never = msg;
      return never;
    }
  }
}
