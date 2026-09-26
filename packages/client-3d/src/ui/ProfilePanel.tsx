import { useEffect, useState } from "react";
import { isValidPassword, ROLE_LABELS } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { useLocalState } from "../state/LocalState.js";

/** Docked left, fades like the other panels. Shows the account's stats, lets you change
 *  your password, and log out (§11). */
export function ProfilePanel() {
  const { state, requestProfile, changePassword, logout } = useGame();
  const { setProfileOpen } = useLocalState();
  const account = state.account;

  useEffect(() => {
    requestProfile();
    // Runs once, when the panel mounts (i.e. each time it opens) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  // The panel keeps fading out for a moment after logging out, while account is already
  // null — nothing left worth showing.
  if (!account) return null;

  const winRate = account.gamesPlayed > 0 ? Math.round((account.gamesWon / account.gamesPlayed) * 100) : 0;
  const pointsPerGame = (account.gamesPlayed > 0 ? account.pointsScored / account.gamesPlayed : 0).toFixed(1);

  const newPasswordValid = isValidPassword(newPassword);
  const passwordsMatch = newPassword === repeatPassword;
  const canSubmit = currentPassword.length > 0 && newPasswordValid && passwordsMatch;

  const submitChangePassword = () => {
    changePassword(currentPassword, newPassword);
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
  };

  return (
    <section className="panel panel--profile">
      <div className="profile__header">
        <h2 className="panel__title">{account.username}</h2>
        <span className={`role-badge role-badge--${account.role}`}>{ROLE_LABELS[account.role]}</span>
      </div>

      <dl className="profile__stats">
        <div className="profile__stat">
          <dt>Member since</dt>
          <dd>{new Date(account.createdAt).toLocaleDateString()}</dd>
        </div>
        <div className="profile__stat">
          <dt>Last login</dt>
          <dd>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "never"}</dd>
        </div>
        <div className="profile__stat">
          <dt>Games played</dt>
          <dd>{account.gamesPlayed}</dd>
        </div>
        <div className="profile__stat">
          <dt>Games won</dt>
          <dd>{account.gamesWon}</dd>
        </div>
        <div className="profile__stat">
          <dt>Win rate</dt>
          <dd>{winRate}%</dd>
        </div>
        <div className="profile__stat">
          <dt>Points scored</dt>
          <dd>{account.pointsScored}</dd>
        </div>
        <div className="profile__stat">
          <dt>Points per game</dt>
          <dd>{pointsPerGame}</dd>
        </div>
      </dl>

      <h3 className="profile__section-title">Change password</h3>
      <label className="field">
        <span className="field__label">Current password</span>
        <input
          className="field__input"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">New password</span>
        <input
          className="field__input"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">New password again</span>
        <input
          className="field__input"
          type="password"
          autoComplete="new-password"
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
        />
      </label>
      <p className="account-form__rules">At least 8 characters</p>
      <button className="button button--primary" disabled={!canSubmit} onClick={submitChangePassword}>
        Change password
      </button>

      {state.accountNotice && <p className="panel__note">{state.accountNotice.text}</p>}
      {state.accountError && <p className="panel__error">{state.accountError.message}</p>}

      <div className="panel__actions panel__actions--row">
        <button className="button button--secondary" onClick={logout}>
          Log out
        </button>
        <button className="button button--secondary" onClick={() => setProfileOpen(false)}>
          Close
        </button>
      </div>
    </section>
  );
}
