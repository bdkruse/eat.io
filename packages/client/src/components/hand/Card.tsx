import type { CardView } from "@eat.io/protocol";

/** Everything shown comes from server data — no switch over card ids (§0.9). */
export function Card({
  card,
  selected,
  onClick,
}: {
  card: CardView;
  selected: boolean;
  onClick: () => void;
}) {
  const glyph = card.action === "add" ? `+${card.amount}` : `×${card.amount}`;

  return (
    <button
      className={selected ? "card card--selected" : "card"}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className={`card__strip card__strip--${card.action}`}>{glyph}</span>
      <span className="card__name">{card.name}</span>
      <span className="card__footer">
        {card.targets} {card.targets === 1 ? "tray" : "trays"}
        {Array.from({ length: card.targets }, (_, index) => (
          <span key={index} className="card__pip" />
        ))}
      </span>
    </button>
  );
}
