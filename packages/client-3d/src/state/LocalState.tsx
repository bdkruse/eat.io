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
import { AppearanceSchema } from "@eat.io/protocol";
import { useGame } from "./GameProvider.js";
import { selectYourCard, shouldShareGuestLook, type AppState } from "./gameState.js";
import {
  emptySelection,
  isSubmittable,
  selectCard,
  toggleTray,
  type Selection,
} from "./selection.js";
import {
  DEFAULT_APPEARANCE,
  wearingShopItem,
  withoutLockedItems,
  type Appearance,
} from "../appearance/appearance.js";
import type { DetailLevel } from "../scene/detail.js";

/** Which single panel is docked left, if any. */
export type OpenPanel = "customize" | "profile" | "admin" | "creator" | "shop" | null;

/**
 * State that belongs to this browser tab only and never reaches the server on its own —
 * how your kid looks, which panel (if any) is open, and what you have picked this turn.
 * The look itself IS sent to the server at the moments §11 calls for (connecting, logging
 * in, and pressing Done), but the decision to do so lives here.
 */
export interface LocalStateApi {
  /** Your look as it is saved (or shared, for a guest). */
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  /** What your kid shows right now: `appearance`, with the shop item being previewed worn
   *  on top while the shop is open. The preview is never sent; leaving the shop drops it. */
  shownAppearance: Appearance;
  /** Docked left, mutually exclusive — opening one closes whichever else was open. */
  openPanel: OpenPanel;
  setCustomizing: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  setAdminOpen: (open: boolean) => void;
  setCreatorOpen: (open: boolean) => void;
  /** Opens the shop, optionally with an item already picked (Customize's locked options).
   *  Opened from Customize, closing the shop goes back to Customize. */
  openShop: (selectedItemId?: string) => void;
  closeShop: () => void;
  /** The shop item being previewed on your kid, or null. */
  shopSelectedItemId: string | null;
  selectShopItem: (itemId: string | null) => void;
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

/** Development only: `?look={"top":"catEarHoodie"}` starts as the default look with those
 *  fields changed, so a screenshot can show shop pieces without an account. */
function startingAppearance(): Appearance {
  if (!import.meta.env.DEV) return DEFAULT_APPEARANCE;
  const requestedLook = new URLSearchParams(window.location.search).get("look");
  if (!requestedLook) return DEFAULT_APPEARANCE;
  try {
    const parsedLook = AppearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, ...JSON.parse(requestedLook) });
    return parsedLook.success ? parsedLook.data : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function LocalStateProvider({ children }: { children: ReactNode }) {
  const { state, submitTurn, noteLocalRejection, setAppearance: sendAppearanceToServer } = useGame();
  const [appearance, setAppearance] = useState<Appearance>(startingAppearance);
  // The look the server last stored for this player: what was last sent, or the account's
  // saved look at login. `appearance` can run ahead of it with an unsaved Customize edit.
  // The account's own `appearance` field is not used for this, because nothing refreshes
  // it after a Done.
  const savedAppearanceRef = useRef<Appearance>(DEFAULT_APPEARANCE);
  const saveAppearance = useCallback(
    (look: Appearance) => {
      savedAppearanceRef.current = look;
      sendAppearanceToServer(look);
    },
    [sendAppearanceToServer],
  );
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [shopSelectedItemId, setShopSelectedItemId] = useState<string | null>(null);
  // Whether the open shop came from Customize, so closing it returns there rather than
  // leaving an unsaved Customize edit behind.
  const shopReturnsToCustomizeRef = useRef(false);
  const [detail, setDetail] = useState<DetailLevel>("high");
  const [selection, setSelection] = useState<Selection>(emptySelection);

  const connected = state.connection.phase === "connected";

  // Opening any one panel closes whichever else was open — they never show at the
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
      if (!open && connected) saveAppearance(appearance);
    },
    [connected, appearance, saveAppearance, openOnly, closeIfOpen],
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

  const openShop = useCallback(
    (selectedItemId?: string) => {
      shopReturnsToCustomizeRef.current = openPanel === "customize";
      setShopSelectedItemId(selectedItemId ?? null);
      openOnly("shop");
    },
    [openPanel, openOnly],
  );

  const closeShop = useCallback(() => {
    setShopSelectedItemId(null);
    if (shopReturnsToCustomizeRef.current) {
      shopReturnsToCustomizeRef.current = false;
      setOpenPanel((current) => (current === "shop" ? "customize" : current));
      return;
    }
    closeIfOpen("shop");
  }, [closeIfOpen]);

  // A buy the server confirmed: wear the item and save the look (the preview alone never
  // reaches the server). Runs once per purchase, even if the shop has closed since. The
  // item is saved onto the last saved look, so an unsaved Customize edit (the shop can be
  // opened from a locked option there) is not saved with it. The local look wears the item
  // too and keeps that edit, which Done then saves as usual.
  const previousPurchaseRef = useRef(state.shopPurchase);
  useEffect(() => {
    const purchase = state.shopPurchase;
    if (purchase === null || purchase === previousPurchaseRef.current) return;
    previousPurchaseRef.current = purchase;
    setAppearance((current) => wearingShopItem(current, purchase.itemId));
    saveAppearance(wearingShopItem(savedAppearanceRef.current, purchase.itemId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.shopPurchase]);

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
      saveAppearance(appearance);
    }
    previousShouldShareRef.current = shouldShareNow;
    // `appearance` is read at the moment of the transition, not watched, so editing your
    // look afterward must not re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShareNow]);

  // Logging in replaces the local look with the account's saved one. A brand-new account
  // has none yet, so it is seeded with whatever look was already in use instead (§11).
  // Logging out closes the profile, admin, creator, and shop panels: none has anything left
  // to show a guest with no permissions, and while open one would hide the pre-connect menu
  // the logout returns to (final review, item 3). Customize stays open — a guest can still
  // use it. A guest cannot wear shop items, so they come off the local look the same way
  // the server takes them off the session's look, which it does without saying so (§13.4).
  const previousAccountRef = useRef<AppState["account"]>(null);
  useEffect(() => {
    const previousAccount = previousAccountRef.current;
    if (previousAccount !== null && state.account === null) {
      setOpenPanel((current) => (current === "customize" ? current : null));
      setAppearance((current) => withoutLockedItems(current, []));
    }
    if (previousAccount === null && state.account !== null) {
      if (state.account.appearance) {
        savedAppearanceRef.current = state.account.appearance;
        setAppearance(state.account.appearance);
      } else {
        saveAppearance(appearance);
      }
    }
    previousAccountRef.current = state.account;
    // `appearance` is read at the moment of transition, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.account]);

  // Memoized so the kid's look keeps its identity between renders while previewing.
  const shownAppearance = useMemo(
    () =>
      openPanel === "shop" && shopSelectedItemId !== null ? wearingShopItem(appearance, shopSelectedItemId) : appearance,
    [openPanel, shopSelectedItemId, appearance],
  );

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
      shownAppearance,
      openPanel,
      setCustomizing,
      setProfileOpen,
      setAdminOpen,
      setCreatorOpen,
      openShop,
      closeShop,
      shopSelectedItemId,
      selectShopItem: setShopSelectedItemId,
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
      shownAppearance,
      openPanel,
      setCustomizing,
      setProfileOpen,
      setAdminOpen,
      setCreatorOpen,
      openShop,
      closeShop,
      shopSelectedItemId,
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
