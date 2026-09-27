import { useEffect, useRef, useState } from "react";
import { DECK_LIMITS } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectAdminMessages } from "../state/gameState.js";
import { useLocalState } from "../state/LocalState.js";
import { cardGlyph } from "./cardGlyph.js";
import { replySinceMount } from "./replySinceMount.js";
import {
  createDeckDraft,
  deckDraftCopiesText,
  deckDraftProblem,
  deckDraftToEntries,
  deckDraftTotal,
  setDeckCardCopies,
  stepDeckCardCopies,
  type DeckCopiesDraft,
} from "./deckEditor.js";

/** The creator panel's own tabs. Deck is the only one today; a later task adds Shop
 *  alongside it, which is why this is a strip rather than a single fixed view (§9/§13). */
type CreatorTab = "deck";
const CREATOR_TABS: CreatorTab[] = ["deck"];
const CREATOR_TAB_LABELS: Record<CreatorTab, string> = { deck: "Deck" };

/** Docked left, like the other panels. Only a profile with `deck.edit` ever sees this
 *  (the top bar hides the Creator button otherwise), but it guards on that too (§9). */
export function CreatorPanel() {
  const { state, requestDeck, saveDeck } = useGame();
  const { setCreatorOpen } = useLocalState();
  const account = state.account;
  const [activeTab, setActiveTab] = useState<CreatorTab>("deck");
  // Whatever the last visit left in AppState. It is never used: the draft seeds only from
  // the reply to this mount's own request (fix round 1).
  const [deckAtMount] = useState(state.adminDeck);

  useEffect(() => {
    requestDeck();
    // Runs once, when the panel mounts (i.e. each time it opens) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adminDeck = replySinceMount(state.adminDeck, deckAtMount);
  const { notice: adminNotice, error: adminError } = selectAdminMessages(state, "deck");
  const [draft, setDraft] = useState<DeckCopiesDraft>({});
  // Seeds the working draft once, the first time this mount sees a fresh reply — never
  // again, so it cannot stomp on a count the Creator is mid-editing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (adminDeck && !seededRef.current) {
      seededRef.current = true;
      setDraft(createDeckDraft(adminDeck.cards));
    }
  }, [adminDeck]);

  if (!account || !account.permissions.includes("deck.edit")) return null;

  // Before the first `deck` message answers `requestDeck`, there are no rows yet — do not
  // flash a total-out-of-range complaint about a deck that has not loaded.
  const loaded = adminDeck !== null;
  const cards = adminDeck?.cards ?? [];
  const total = deckDraftTotal(cards, draft);
  const problem = loaded ? deckDraftProblem(cards, draft) : null;
  const canSave = loaded && problem === null && !state.savingDeck;

  return (
    <section className="panel panel--creator">
      <h2 className="panel__title">Creator</h2>

      <div className="chips" role="tablist" aria-label="Creator tools">
        {CREATOR_TABS.map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? "chip chip--picked" : "chip"}
            role="tab"
            aria-selected={tab === activeTab}
            onClick={() => setActiveTab(tab)}
          >
            {CREATOR_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === "deck" && (
        <>
          <div className="deck-editor">
            {cards.map((card) => {
              const copiesText = deckDraftCopiesText(draft, card.id);
              return (
                <div className="deck-row" key={card.id}>
                  <span className="deck-row__glyph">{cardGlyph(card)}</span>
                  <span className="deck-row__name">{card.name}</span>
                  <span className="deck-row__targets">
                    {card.targets === 0 ? "no trays" : `${card.targets} ${card.targets === 1 ? "tray" : "trays"}`}
                  </span>
                  <div className="deck-row__quantity">
                    <button
                      className="stepper-button"
                      type="button"
                      aria-label={`Fewer copies of ${card.name}`}
                      onClick={() => setDraft((current) => stepDeckCardCopies(current, card.id, -1))}
                    >
                      −
                    </button>
                    <input
                      className="deck-row__input"
                      type="number"
                      value={copiesText}
                      aria-label={`Copies of ${card.name}`}
                      onChange={(event) =>
                        setDraft((current) => setDeckCardCopies(current, card.id, event.target.value))
                      }
                    />
                    <button
                      className="stepper-button"
                      type="button"
                      aria-label={`More copies of ${card.name}`}
                      onClick={() => setDraft((current) => stepDeckCardCopies(current, card.id, 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {loaded && (
            <p className={problem ? "deck-editor__total deck-editor__total--problem" : "deck-editor__total"}>
              Total: {total ?? "—"} ({DECK_LIMITS.total.min}–{DECK_LIMITS.total.max})
            </p>
          )}

          {!loaded && <p className="panel__note">Loading…</p>}
          {problem && <p className="panel__error">{problem}</p>}
          {adminNotice && <p className="panel__note">{adminNotice.text}</p>}
          {adminError && <p className="panel__error">{adminError.message}</p>}

          {adminDeck?.updatedBy && adminDeck.updatedAt !== null && (
            <p className="panel__note">
              Last changed by {adminDeck.updatedBy}, {new Date(adminDeck.updatedAt).toLocaleString()}
            </p>
          )}

          <div className="panel__actions panel__actions--row">
            <button
              className="button button--primary"
              disabled={!canSave}
              onClick={() => saveDeck(deckDraftToEntries(cards, draft))}
            >
              Save
            </button>
            <button className="button button--secondary" onClick={() => setCreatorOpen(false)}>
              Close
            </button>
          </div>
        </>
      )}
    </section>
  );
}
