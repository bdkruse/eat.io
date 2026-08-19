import type { CardView } from "@eat.io/protocol";
import { Card } from "./Card.js";

export function Hand({
  cards,
  selectedId,
  onSelect,
}: {
  cards: CardView[];
  selectedId: string | null;
  onSelect: (cardId: string) => void;
}) {
  return (
    <div className="hand">
      {cards.map((card, index) => (
        // Card ids repeat across a hand (the deck holds duplicates), so the key pairs
        // the id with its slot.
        <Card
          key={`${card.id}:${index}`}
          card={card}
          selected={selectedId === card.id}
          onClick={() => onSelect(card.id)}
        />
      ))}
    </div>
  );
}
