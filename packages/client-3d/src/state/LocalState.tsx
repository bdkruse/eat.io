import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGame } from "./GameProvider.js";
import { selectYourCard, shouldShareGuestLook, type AppState } from "./gameState.js";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
  type Selection,
} from "./selection.js";
import { DEFAULT_APPEARANCE, type Appearance } from "../appearance/appearance.js";
import type { DetailLevel } from "../scene/detail.js";

/** Which single panel is docked left, if any. A later task adds "shop" here alongside its
 *  own Shop tab inside the creator panel (§9/§13) — this union is the one place that
 *  extension touches. */
export type OpenPanel = "customize" | "profile" | "admin" | "creator" | null;

/**
 * State that belongs to this browser tab only and never reaches the server on its own —
 * how your kid looks, which panel (if any) is open, and what you have picked this turn.
 * The look itself IS sent to the server at the moments §11 calls for (connecting, logging
 * in, and pressing Done), but the decision to do so lives here.
 */
export interface LocalStateApi {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  /** Docked left, mutually exclusive — opening one closes whichever else was open. */
  openPanel: OpenPanel;
  setCustomizing: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  setAdminOpen: (open: boolean) => void;
  setCreatorOpen: (open: boolean) => void;
  /** How much of the room to draw; low trades crowd and shadows for frame rate. */
  detail: DetailLevel;
  setDetail: (next: DetailLevel) => void;
  selection: Selection;
  /** How many trays the chosen card takes; 0 with no card chosen. */
  targetCount: number;
  ready: boolean;
  chooseCard: (cardInstanceId: string) => void;
  clickTray: (trayId: string) => void;
  clearSelection: () => void;
  endTurn: () => void;
}

const LocalStateContext = createContext<LocalStateApi | null>(null);

export function LocalStateProvider({ children }: { children: ReactNode }) {
  const { state, submitTurn, noteLocalRejection, setAppearance: sendAppearanceToServer } = useGame();
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [detail, setDetail] = useState<DetailLevel>("high");
  const [selection, setSelection] = useState<Selection>(emptySelection);

  const connected = state.connection.phase === "connected";

  // Opening any one of the four closes whichever else was open — they never show at the
  // same time (§9 ruling).
  const openOnly = useCallback((panel: Exclude<OpenPanel, null>) => setOpenPanel(panel), []);
  // Closing checks it is actually the panel showing, so a stray "close" call from a panel
  // that is not the current one (should not happen, but costs nothing to guard) can never
  // clobber a different one that opened in the meantime.
  const closeIfOpen = useCallback(
    (panel: Exclude<OpenPanel, null>) => setOpenPanel((current) => (current === panel ? null : current)),
    [],
  );

  const setCustomizing = useCallback(
    (open: boolean) => {
      if (open) openOnly("customize");
      else closeIfOpen("customize");
      // Done, while connected: a guest's look is shared, a logged-in player's is saved (§11).
      if (!open && connected) sendAppearanceToServer(appearance);
    },
    [connected, appearance, sendAppearanceToServer, openOnly, closeIfOpen],
  );

  const setProfileOpen = useCallback(
    (open: boolean) => (open ? openOnly("profile") : closeIfOpen("profile")),
    [openOnly, closeIfOpen],
  );

  const setAdminOpen = useCallback(
    (open: boolean) => (open ? openOnly("admin") : closeIfOpen("admin")),
    [openOnly, closeIfOpen],
  );

  const setCreatorOpen = useCallback(
    (open: boolean) => (open ? openOnly("creator") : closeIfOpen("creator")),
    [openOnly, closeIfOpen],
  );

  // A match found mid-edit takes you to the table; no panel may reappear once seated. This
  // is not "Done", so it sends nothing of its own.
  const inRoom = state.room !== null;
  useEffect(() => {
    if (inRoom) setOpenPanel(null);
  }, [inRoom]);

  const roundIndex = state.room?.roundIndex ?? null;
  // A resolved round replaces the hand, and a new room starts clean — never carry a pick over.
  useEffect(() => {
    setSelection(emptySelection);
  }, [roundIndex]);

  // A guest connection shares its local look, so the opponent sees it too. This must NOT
  // fire while a login or registration attempt is still in flight: `welcome` (which sets
  // identity) and `accountLoggedIn`/`accountError` (which resolve the attempt) are always
  // separate messages, so there is a real gap where identity is set but account is still
  // null even for a login or a token resume — shouldShareGuestLook accounts for that gap
  // via accountPending (fix round 1). It fires again once that gap closes without an
  // account: a failed login leaves a guest whose look has never been shared. (A logout or
  // an expired resume disconnects instead, so neither leaves a connected guest behind.)
  const shouldShareNow = shouldShareGuestLook({
    identitySet: state.identity !== null,
    account: state.account,
    accountPending: state.accountPending,
  });
  const previousShouldShareRef = useRef(false);
  useEffect(() => {
    if (!previousShouldShareRef.current && shouldShareNow) {
      sendAppearanceToServer(appearance);
    }
    previousShouldShareRef.current = shouldShareNow;
    // `appearance` is read at the moment of the transition, not watched, so editing your
    // look afterward must not re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShareNow]);

  // Logging in replaces the local look with the account's saved one. A brand-new account
  // has none yet, so it is seeded with whatever look was already in use instead (§11).
  // Logging out closes the profile, admin, and creator panels: none has anything left to
  // show a guest with no permissions, and while open one would hide the pre-connect menu
  // the logout returns to (final review, item 3). Customize stays open — a guest can still
  // use it.
  const previousAccountRef = useRef<AppState["account"]>(null);
  useEffect(() => {
    const previousAccount = previousAccountRef.current;
    if (previousAccount !== null && state.account === null) {
      setOpenPanel((current) => (current === "customize" ? current : null));
    }
    if (previousAccount === null && state.account !== null) {
      if (state.account.appearance) {
        setAppearance(state.account.appearance);
      } else {
        sendAppearanceToServer(appearance);
      }
    }
    previousAccountRef.current = state.account;
    // `appearance` is read at the moment of transition, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.account]);

  const targetCount = selectYourCard(state, selection.cardInstanceId)?.targets ?? 0;
  const ready = isSubmittable(selection, targetCount);

  const chooseCard = useCallback((cardInstanceId: string) => {
    setSelection((current) => selectCard(current, cardInstanceId));
  }, []);

  const clickTray = useCallback(
    (trayId: string) => {
      const result = toggleTray(selection, trayId, targetCount);
      if (result.needsCardFirst) {
        noteLocalRejection("Pick a card first — the card decides how many trays you may target.");
        return;
      }
      setSelection(result.selection);
    },
    [selection, targetCount, noteLocalRejection],
  );

  const endTurn = useCallback(() => {
    if (!ready || !selection.cardInstanceId) return;
    submitTurn(selection.cardInstanceId, selection.targetTrayIds);
    setSelection(emptySelection);
  }, [ready, selection, submitTurn]);

  const api = useMemo<LocalStateApi>(
    () => ({
      appearance,
      setAppearance,
      openPanel,
      setCustomizing,
      setProfileOpen,
      setAdminOpen,
      setCreatorOpen,
      detail,
      setDetail,
      selection,
      targetCount,
      ready,
      chooseCard,
      clickTray,
      clearSelection: () => setSelection(emptySelection),
      endTurn,
    }),
    [
      appearance,
      openPanel,
      setCustomizing,
      setProfileOpen,
      setAdminOpen,
      setCreatorOpen,
      detail,
      selection,
      targetCount,
      ready,
      chooseCard,
      clickTray,
      endTurn,
    ],
  );

  return <LocalStateContext.Provider value={api}>{children}</LocalStateContext.Provider>;
}

export function useLocalState(): LocalStateApi {
  const api = useContext(LocalStateContext);
  if (!api) throw new Error("useLocalState must be used inside <LocalStateProvider>");
  return api;
}
