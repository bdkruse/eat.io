import { ROLE_LABELS } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectScreen } from "../state/gameState.js";
import type { DetailLevel } from "../scene/detail.js";
import { useLocalState } from "../state/LocalState.js";
import { CoinIcon } from "./icons.js";

const DETAIL_OPTIONS: { level: DetailLevel; label: string }[] = [
  { level: "high", label: "High" },
  { level: "low", label: "Low" },
];

export function TopBar({
  showWordmark,
  onRequestLogin,
}: {
  showWordmark: boolean;
  /** Guest's profile button: opens the menu's Log in tab (§11). */
  onRequestLogin: () => void;
}) {
  const { state } = useGame();
  const { detail, setDetail, setProfileOpen, setAdminOpen, setCreatorOpen, openShop } = useLocalState();
  const live = state.connection.phase === "connected";
  const phase = state.connection.phase;
  const label = live
    ? "Connected"
    : phase === "reconnecting"
      ? "Reconnecting"
      : phase === "waking"
        ? "Waking server"
        : phase === "connecting"
          ? "Connecting"
          : "Offline";
  // Hidden during a game — there is no room for it, and nothing to do with it there. The
  // Admin, Creator, and Shop buttons and the balance follow the same rule (§9, §13.7). A
  // guest earns nothing and cannot buy, so a guest sees neither the balance nor the Shop.
  const showProfileButton = selectScreen(state) !== "game";
  const account = state.account;
  const canOpenAdmin = account?.permissions.includes("settings.edit") ?? false;
  const canOpenCreator = account?.permissions.includes("deck.edit") ?? false;

  return (
    <header className="topbar">
      <div className={showWordmark ? "topbar__wordmark" : "topbar__wordmark topbar__wordmark--small"}>
        eat<span>.io</span>
      </div>
      <div className="topbar__right">
        {showProfileButton && canOpenAdmin && (
          <button className="profile-button" onClick={() => setAdminOpen(true)}>
            Admin
          </button>
        )}
        {showProfileButton && canOpenCreator && (
          <button className="profile-button" onClick={() => setCreatorOpen(true)}>
            Creator
          </button>
        )}
        {showProfileButton && account && (
          <button className="profile-button" onClick={() => openShop()}>
            Shop
          </button>
        )}
        {showProfileButton && account && (
          <span className="profile-button profile-button--static" title="Lunch Money" aria-label={`${account.lunchMoney} Lunch Money`}>
            <CoinIcon />
            {account.lunchMoney}
          </span>
        )}
        {showProfileButton &&
          (account ? (
            <button className="profile-button" onClick={() => setProfileOpen(true)}>
              <span className={`dot dot--role-${account.role}`} title={ROLE_LABELS[account.role]} />
              {account.username}
            </button>
          ) : (
            <button className="profile-button" onClick={onRequestLogin}>
              Log in
            </button>
          ))}
        <div className="detail-toggle" role="radiogroup" aria-label="Detail">
          <span className="detail-toggle__label">Detail</span>
          {DETAIL_OPTIONS.map((option) => (
            <button
              key={option.level}
              className={option.level === detail ? "detail-toggle__option detail-toggle__option--picked" : "detail-toggle__option"}
              role="radio"
              aria-checked={option.level === detail}
              onClick={() => setDetail(option.level)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="topbar__status">
          <span className={live ? "dot" : "dot dot--down"} />
          <span className="topbar__status-text">{label}</span>
        </div>
      </div>
    </header>
  );
}
