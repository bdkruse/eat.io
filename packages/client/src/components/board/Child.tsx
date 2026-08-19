/**
 * §2.8.6 — placeholder geometry for real illustration. Whatever replaces this MUST keep
 * the mouth as its own element so the chomp can animate independently.
 */
interface ChildProps {
  accent: "you" | "opponent";
  size?: "large" | "small";
  biting?: boolean;
}

export function Child({ accent, size = "large", biting = false }: ChildProps) {
  const large = size === "large";
  const width = large ? 112 : 96;
  const height = large ? 116 : 92;
  const shirt = accent === "you" ? "var(--you)" : "var(--opponent)";

  return (
    <svg
      className="child"
      width={width}
      height={height}
      viewBox="0 0 112 116"
      role="img"
      aria-label={accent === "you" ? "you, eating" : "your opponent, eating"}
    >
      <rect x="26" y="84" width="60" height="32" rx="14" fill={shirt} />
      <circle cx="56" cy="52" r="34" fill="#f2d3b3" />
      <path d="M22 46a34 34 0 0 1 68 0z" fill="#4a3a2c" />
      <circle cx="44" cy="50" r="4.5" fill="var(--ink)" />
      <circle cx="68" cy="50" r="4.5" fill="var(--ink)" />
      {/* The mouth: a thin closed line at rest, a rounded opening on a chomp. */}
      <ellipse
        className={biting ? "child__mouth child__mouth--open" : "child__mouth"}
        cx="56"
        cy="68"
        rx="11"
        ry={biting ? 9 : 1.4}
        fill="var(--reject)"
      />
    </svg>
  );
}
