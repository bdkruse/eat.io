import { useState } from "react";
import { isValidPassword, isValidUsername } from "@eat.io/protocol";

export interface AccountFormProps {
  mode: "login" | "register";
  /** Disabled while an account attempt is in flight, or the connection is mid-connect,
   *  so a second attempt cannot start before the first resolves. */
  disabled: boolean;
  submitLabel: string;
  onSubmit: (username: string, password: string) => void;
}

/**
 * The shared shape of the Log in and Create account tabs — a username, a password, and,
 * for Create account, that password again. Submit stays disabled until both rules pass
 * and, for Create account, the two passwords match (§11).
 */
export function AccountForm({ mode, disabled, submitLabel, onSubmit }: AccountFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const validUsername = isValidUsername(username);
  const validPassword = isValidPassword(password);
  const passwordsMatch = mode === "login" || password === confirmPassword;
  const ready = validUsername && validPassword && passwordsMatch;

  return (
    <div className="account-form">
      <label className="field">
        <span className="field__label">Username</span>
        <input
          className="field__input"
          value={username}
          maxLength={14}
          autoComplete="username"
          disabled={disabled}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input
          className="field__input"
          type="password"
          value={password}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          disabled={disabled}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {mode === "register" && (
        <label className="field">
          <span className="field__label">Password again</span>
          <input
            className="field__input"
            type="password"
            value={confirmPassword}
            autoComplete="new-password"
            disabled={disabled}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
      )}
      <p className="account-form__rules">
        3–14 letters, numbers, _ or -
        <br />
        At least 8 characters
      </p>
      <button
        className="button button--primary"
        disabled={disabled || !ready}
        onClick={() => onSubmit(username, password)}
      >
        {submitLabel}
      </button>
    </div>
  );
}
