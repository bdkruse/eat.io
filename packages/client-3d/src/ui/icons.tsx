/** The Lunch Money coin (§13.1): the palette's gold, rimmed in the multiply amber. */
export function CoinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="coin-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="var(--gold)" stroke="var(--multiply)" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="4" fill="none" stroke="var(--multiply)" strokeWidth="1.2" />
    </svg>
  );
}

/** A shop value you have not bought yet (§13.4). Drawn in the current text color. */
export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg className="lock-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="2.5" y="7" width="11" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}
